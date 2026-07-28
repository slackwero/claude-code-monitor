#!/usr/bin/env node
// Installs (or uninstalls with --uninstall) the dashboard hooks into
// ~/.claude/settings.json with an ADDITIVE merge: never touches other tools' hooks.
// Override for testing: CLAUDE_SETTINGS=/path/to/settings.json
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const HOOKS_DIR = __dirname;
const FORWARD = path.join(HOOKS_DIR, 'forward-event.sh');
const GATE = path.join(HOOKS_DIR, 'approval-gate.sh');
const UNINSTALL = process.argv.includes('--uninstall');

const FORWARD_EVENTS = ['SessionStart', 'SessionEnd', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'UserPromptSubmit', 'PermissionRequest', 'SubagentStart'];
const GATE_MATCHER = 'Bash|Write|Edit|MultiEdit|NotebookEdit';

function isOurs(hook) {
  return hook.type === 'command' && (hook.command === FORWARD || hook.command === GATE);
}

function main() {
  let existed = true;
  let raw = '{}';
  try {
    raw = fs.readFileSync(SETTINGS, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    existed = false;
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  }
  const settings = JSON.parse(raw);
  settings.hooks = settings.hooks || {};

  // timestamped backup before touching anything, only if the file already existed
  let backup;
  if (existed) {
    backup = `${SETTINGS}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(SETTINGS, backup);
  }

  let changes = 0;

  // clear our own entries (for uninstall and for install idempotency)
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      const before = (g.hooks || []).length;
      g.hooks = (g.hooks || []).filter((h) => !isOurs(h));
      changes += before - g.hooks.length;
    }
    settings.hooks[event] = groups.filter((g) => (g.hooks || []).length > 0);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  if (!UNINSTALL) {
    for (const event of FORWARD_EVENTS) {
      settings.hooks[event] = settings.hooks[event] || [];
      settings.hooks[event].push({ hooks: [{ type: 'command', command: FORWARD, timeout: 5 }] });
      changes++;
    }
    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    settings.hooks.PreToolUse.push({
      matcher: GATE_MATCHER,
      hooks: [{ type: 'command', command: GATE, timeout: 40 }],
    });
    changes++;
  }

  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log(`${UNINSTALL ? 'Uninstalled from' : 'Installed into'} ${SETTINGS}`);
  if (existed) console.log(`Backup: ${backup}`);
  console.log('Hooks apply to NEW Claude Code sessions (already-open ones do not reload them).');
}

try {
  main();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
