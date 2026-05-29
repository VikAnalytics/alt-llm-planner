import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_SRC = path.join(__dirname, '..', 'cursor-extension');

const TARGETS = [
  { label: 'Cursor',  dir: path.join(os.homedir(), '.cursor', 'extensions') },
  { label: 'VS Code', dir: path.join(os.homedir(), '.vscode', 'extensions') },
];

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else if (entry.isFile()) await fs.copyFile(s, d);
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function run() {
  const manifest = JSON.parse(await fs.readFile(path.join(EXT_SRC, 'package.json'), 'utf8'));
  const folderName = `${manifest.publisher}.${manifest.name}-${manifest.version}`;
  const prefix = `${manifest.publisher}.${manifest.name}-`;

  let installed = 0;
  for (const target of TARGETS) {
    if (!(await exists(target.dir))) {
      console.log(`[${target.label}] ${target.dir} not found — skipping.`);
      continue;
    }

    const entries = await fs.readdir(target.dir);
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry !== folderName) {
        await fs.rm(path.join(target.dir, entry), { recursive: true, force: true });
        console.log(`[${target.label}] removed stale ${entry}`);
      }
    }

    const dest = path.join(target.dir, folderName);
    await fs.rm(dest, { recursive: true, force: true });
    await copyDir(EXT_SRC, dest);
    console.log(`[${target.label}] installed at ${dest}`);
    installed++;
  }

  if (!installed) {
    console.error('No IDE extension directory found. Install Cursor or VS Code first.');
    process.exit(1);
  }
  console.log('\nReload the IDE window to activate.');
}
