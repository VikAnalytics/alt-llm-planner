import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export const CONFIG_DIR = path.join(os.homedir(), '.gemini-interactive-planner');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const DEFAULT_MODEL = 'gemma-3-27b-it';

export async function loadConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${CONFIG_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, CONFIG_FILE);
}

export function resolveApiKey(config) {
  return process.env.GEMINI_API_KEY || config.apiKey || '';
}

export function resolveModel(config, override) {
  return override || process.env.GEMINI_MODEL || config.model || DEFAULT_MODEL;
}
