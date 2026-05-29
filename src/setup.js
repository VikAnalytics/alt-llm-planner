import readline from 'readline';
import { loadConfig, saveConfig, CONFIG_FILE, DEFAULT_MODEL } from './config.js';

const FREE_MODELS = [
  'gemma-3-27b-it',
  'gemma-3-12b-it',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const PAID_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
];

const PAID_ONLY = new Set(['gemini-2.5-pro']);

function createPrompter(rl) {
  const queue = [];
  const waiters = [];
  let closed = false;

  rl.on('line', line => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()('');
  });

  return question => {
    process.stdout.write(question);
    return new Promise(resolve => {
      if (queue.length) resolve(queue.shift().trim());
      else if (closed) resolve('');
      else waiters.push(line => resolve(line.trim()));
    });
  };
}

const NON_CHAT_RE = /(tts|image|nano-banana|lyria|robotics|computer-use)/i;

async function fetchLiveModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(name => !NON_CHAT_RE.test(name));
  } catch {
    return null;
  }
}

function mergeModels(curated, live, tier) {
  if (!live?.length) return curated;
  const liveSet = new Set(live);
  const preferred = curated.filter(m => liveSet.has(m));
  const extras = live.filter(m => !preferred.includes(m));
  const merged = [...preferred, ...extras];
  return tier === 'free' ? merged.filter(m => !PAID_ONLY.has(m)) : merged;
}

async function selectFromList(ask, label, items, defaultItem) {
  const defaultIdx = Math.max(0, items.indexOf(defaultItem));
  console.log(`\n${label}`);
  items.forEach((item, i) => {
    const marker = i === defaultIdx ? '*' : ' ';
    console.log(` ${marker} ${String(i + 1).padStart(2)}) ${item}`);
  });
  const answer = await ask(`Choose [1-${items.length}] (default ${defaultIdx + 1}): `);
  if (!answer) return items[defaultIdx];
  const idx = Number(answer) - 1;
  if (Number.isInteger(idx) && idx >= 0 && idx < items.length) return items[idx];
  console.log('Invalid selection, using default.');
  return items[defaultIdx];
}

export async function run() {
  const existing = await loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = createPrompter(rl);

  try {
    console.log('Gemini Interactive Planner — setup\n');

    const keyPrompt = existing.apiKey
      ? `Gemini API key (leave blank to keep ***${existing.apiKey.slice(-4)}): `
      : 'Gemini API key: ';
    const keyInput = await ask(keyPrompt);
    const apiKey = keyInput || existing.apiKey;
    if (!apiKey) {
      console.error('API key required.');
      process.exit(1);
    }

    const tierDefault = existing.tier || 'free';
    const tierInput = (await ask(`Tier [free/paid] (default ${tierDefault}): `)).toLowerCase();
    const tier = tierInput === 'paid' ? 'paid' : tierInput === 'free' ? 'free' : tierDefault;

    console.log('\nFetching model list...');
    const live = await fetchLiveModels(apiKey);
    if (!live) console.log('(could not reach API — falling back to curated list)');

    const curated = tier === 'paid' ? PAID_MODELS : FREE_MODELS;
    const models = mergeModels(curated, live, tier);

    const defaultModel = existing.model && models.includes(existing.model) ? existing.model : DEFAULT_MODEL;
    const model = await selectFromList(ask, `Available models (${tier} tier):`, models, defaultModel);

    await saveConfig({ ...existing, apiKey, tier, model });
    console.log(`\nSaved to ${CONFIG_FILE}`);
    console.log(`Tier: ${tier}   Model: ${model}`);
  } finally {
    rl.close();
  }
}
