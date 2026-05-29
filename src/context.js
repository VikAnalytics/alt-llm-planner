import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.turbo', '.cache',
  'dist', 'build', 'coverage', '.venv', '__pycache__',
]);

const SKIP_FILE_PATTERNS = [
  /^\.env/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /\.lock$/,
];

const EXTRACT_BASENAMES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json', 'README.md',
]);
const EXTRACT_PATTERNS = [/\.config\.(js|ts|mjs|cjs|json)$/];

const MAX_EXTRACT_CHARS = 1500;
const MAX_DEPTH = 6;
const MAX_TOTAL_SNIPPET_CHARS = 40_000;
const BINARY_SNIFF_BYTES = 512;

function shouldExtract(name) {
  return EXTRACT_BASENAMES.has(name) || EXTRACT_PATTERNS.some(p => p.test(name));
}

function isBinary(buf) {
  const end = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) if (buf[i] === 0) return true;
  return false;
}

function walk(dir, rootDir, depth, lines, snippets, state) {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (SKIP_FILE_PATTERNS.some(p => p.test(entry.name))) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);
    const indent = '  '.repeat(depth);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      lines.push(`${indent}${entry.name}/`);
      walk(fullPath, rootDir, depth + 1, lines, snippets, state);
      continue;
    }

    if (!entry.isFile()) continue;
    lines.push(`${indent}${entry.name}`);

    if (state.size >= MAX_TOTAL_SNIPPET_CHARS) continue;
    if (!shouldExtract(entry.name)) continue;

    try {
      const buf = fs.readFileSync(fullPath);
      if (isBinary(buf)) continue;
      const content = buf.toString('utf8').slice(0, MAX_EXTRACT_CHARS);
      snippets.push(`### ${relPath}\n\`\`\`\n${content}\n\`\`\``);
      state.size += content.length;
    } catch {
      // unreadable — skip
    }
  }
}

export function buildContext(rootDir) {
  const lines = ['## File Tree', `${path.basename(rootDir)}/`];
  const snippets = [];
  walk(rootDir, rootDir, 1, lines, snippets, { size: 0 });

  const parts = [lines.join('\n')];
  if (snippets.length) parts.push('\n## Key Files\n' + snippets.join('\n\n'));
  return parts.join('\n');
}
