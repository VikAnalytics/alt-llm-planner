const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_RE = /^planner_session_[0-9a-f-]+\.json$/;
const POLL_MS = 500;

function activate(context) {
  const tmpDir = os.tmpdir();
  const launched = new Set();

  const tick = () => {
    let files;
    try {
      files = fs.readdirSync(tmpDir);
    } catch {
      return;
    }

    const currentSessions = new Set();
    for (const file of files) {
      if (!SESSION_RE.test(file)) continue;
      currentSessions.add(file);
      if (launched.has(file)) continue;

      const sessionPath = path.join(tmpDir, file);
      let session;
      try {
        session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      } catch {
        continue;
      }

      const { companionPath } = session;
      if (!companionPath) continue;

      launched.add(file);
      const terminal = vscode.window.createTerminal({
        name: 'Gemini Planner',
        isTransient: true,
      });
      terminal.show();
      terminal.sendText(`node ${JSON.stringify(companionPath)} ${JSON.stringify(sessionPath)}`);
    }

    for (const file of launched) {
      if (!currentSessions.has(file)) launched.delete(file);
    }
  };

  const interval = setInterval(tick, POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function deactivate() {}

module.exports = { activate, deactivate };
