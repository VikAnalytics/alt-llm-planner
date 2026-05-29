import fs from 'fs/promises';
import os from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const POLL_MS = 250;
const STALE_SESSION_MS = 60 * 60 * 1000;
const SESSION_FILE_RE = /^planner_(session|result)_[0-9a-f-]+\.json$/;

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
}

async function cleanupStaleSessions(tmpDir) {
  let files;
  try {
    files = await fs.readdir(tmpDir);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(
    files
      .filter(f => SESSION_FILE_RE.test(f))
      .map(async f => {
        const p = join(tmpDir, f);
        try {
          const { mtimeMs } = await fs.stat(p);
          if (now - mtimeMs > STALE_SESSION_MS) await fs.unlink(p);
        } catch {
          // ignore
        }
      })
  );
}

function waitForResult(resultFile, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`Planner session timed out after ${Math.round(timeoutMs / 1000)}s.`));
        return;
      }
      let data;
      try {
        data = await fs.readFile(resultFile, 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') {
          clearInterval(timer);
          reject(err);
        }
        return;
      }
      clearInterval(timer);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ status: 'ok', plan: data });
      }
    }, POLL_MS);
  });
}

export async function runPlannerSession({ prompt, context, apiKey, model, timeoutMs }) {
  const tmpDir = os.tmpdir();
  await cleanupStaleSessions(tmpDir);

  const id = randomUUID();
  const sessionFile = join(tmpDir, `planner_session_${id}.json`);
  const resultFile = join(tmpDir, `planner_result_${id}.json`);
  const companionPath = join(__dirname, 'companion.js');

  await writeAtomic(
    sessionFile,
    JSON.stringify({
      version: 1,
      prompt,
      context,
      apiKey,
      model,
      companionPath,
      resultFile,
    })
  );

  let result;
  try {
    result = await waitForResult(resultFile, timeoutMs);
  } finally {
    await Promise.allSettled([fs.unlink(sessionFile), fs.unlink(resultFile)]);
  }

  if (result.status !== 'ok') {
    throw new Error(result.message || 'Planner session failed.');
  }
  return result.plan;
}
