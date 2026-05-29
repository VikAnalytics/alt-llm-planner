#!/usr/bin/env node
import fs from 'fs/promises';
import readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_INSTRUCTION = `You are an Expert Software Architect. The user's project context is provided below.
Ask ONE clarifying question at a time to build a robust architecture plan.
When the user types '!finish', output ONLY a dense structured markdown implementation blueprint with no preamble.`;

const DEFAULT_MODEL = 'gemma-3-27b-it';
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2_000;
const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const [, , sessionFile] = process.argv;
if (!sessionFile) {
  console.error('Usage: companion.js <sessionFile>');
  process.exit(1);
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
}

function errorStatus(err) {
  return err?.status ?? err?.response?.status;
}

async function writeResult(resultFile, payload) {
  try {
    await writeAtomic(resultFile, JSON.stringify(payload));
  } catch (err) {
    console.error(`Failed to write result: ${err?.message || err}`);
  }
}

async function main() {
  const session = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
  const { prompt, context, apiKey, model: modelName, resultFile } = session;

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: modelName || DEFAULT_MODEL });
  const chat = model.startChat();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const lineQueue = [];
  const waiters = [];
  let awaitingInput = false;

  rl.on('line', line => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lineQueue.push(line);
  });

  const ask = () => {
    process.stdout.write('\n> ');
    awaitingInput = true;
    return new Promise(resolve => {
      const done = line => {
        awaitingInput = false;
        resolve(line);
      };
      if (lineQueue.length) done(lineQueue.shift());
      else waiters.push(done);
    });
  };

  let settled = false;
  let finalizing = false;
  const finalize = async (payload, code) => {
    if (settled) return;
    settled = true;
    await writeResult(resultFile, payload);
    rl.close();
    process.exit(code);
  };

  rl.on('close', () => {
    while (waiters.length) waiters.shift()(null);
    if (!settled && !finalizing && awaitingInput) {
      finalize({ status: 'error', message: 'Session terminated unexpectedly.' }, 1);
    }
  });

  async function send(message) {
    let lastErr;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await chat.sendMessage(message);
        return result.response.text();
      } catch (err) {
        lastErr = err;
        const status = errorStatus(err);
        if (!RETRIABLE_STATUSES.has(status)) throw err;
        const delay = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 500);
        process.stdout.write(`\nRate limited (${status}). Retry in ${Math.round(delay / 1000)}s...\n`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  console.log(`\nGemini planning session (${modelName || DEFAULT_MODEL}) — type !finish to commit, !cancel to abort.\n`);

  try {
    let reply = await send(`${SYSTEM_INSTRUCTION}\n\n---\n\n${prompt}\n\n---\n${context}`);

    while (true) {
      console.log(`\nPlanner: ${reply}`);
      const raw = await ask();
      if (raw == null) return;
      const input = raw.trim();

      if (input === '!cancel') {
        finalizing = true;
        console.log('\nCancelled.');
        await finalize({ status: 'error', message: 'User cancelled session.' }, 0);
        return;
      }

      if (input === '!finish') {
        finalizing = true;
        const plan = await send('!finish');
        console.log('\nPlan written.');
        await finalize({ status: 'ok', plan }, 0);
        return;
      }

      if (!input) continue;
      reply = await send(input);
    }
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`\nError: ${message}`);
    await finalize({ status: 'error', message }, 1);
  }
}

main();
