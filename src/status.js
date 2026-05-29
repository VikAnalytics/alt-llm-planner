import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadConfig, resolveApiKey, resolveModel, CONFIG_FILE } from './config.js';

const EXT_PREFIX = 'local.alt-llm-planner-';

async function findInstalled(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(e => e.startsWith(EXT_PREFIX));
  } catch {
    return [];
  }
}

export async function run() {
  const config = await loadConfig();
  const apiKey = resolveApiKey(config);

  console.log(`Config file:  ${CONFIG_FILE}`);
  console.log(`API key:      ${apiKey ? '***' + apiKey.slice(-4) : '(not set)'}`);
  console.log(`Tier:         ${config.tier || '(not set)'}`);
  console.log(`Model:        ${resolveModel(config)}`);

  for (const [label, dir] of [
    ['Cursor',  path.join(os.homedir(), '.cursor', 'extensions')],
    ['VS Code', path.join(os.homedir(), '.vscode', 'extensions')],
  ]) {
    const found = await findInstalled(dir);
    console.log(`${label.padEnd(12)} extension: ${found.length ? found.join(', ') : '(not installed)'}`);
  }
}
