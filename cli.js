#!/usr/bin/env node
const cmd = process.argv[2];

const HELP = `gemini-interactive-planner <command>

Commands:
  serve              Run the MCP stdio server (default)
  setup              Interactive config: API key, tier, model
  install            Install the Cursor/VS Code companion extension
  status             Show current config and extension state
  help               Show this message
`;

switch (cmd) {
  case undefined:
  case 'serve':
    await import('./index.js');
    break;
  case 'setup':
    await (await import('./src/setup.js')).run();
    break;
  case 'install':
  case 'install-extension':
    await (await import('./src/install.js')).run();
    break;
  case 'status':
    await (await import('./src/status.js')).run();
    break;
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(HELP);
    break;
  default:
    process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
    process.exit(1);
}
