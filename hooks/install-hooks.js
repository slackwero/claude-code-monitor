#!/usr/bin/env node
// Instala (o desinstala con --uninstall) los hooks del dashboard en
// ~/.claude/settings.json con merge ADITIVO: nunca toca hooks ajenos.
// Override para pruebas: CLAUDE_SETTINGS=/ruta/a/settings.json
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const HOOKS_DIR = __dirname;
const FORWARD = path.join(HOOKS_DIR, 'forward-event.sh');
const GATE = path.join(HOOKS_DIR, 'approval-gate.sh');
const UNINSTALL = process.argv.includes('--uninstall');

const FORWARD_EVENTS = ['SessionStart', 'SessionEnd', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'UserPromptSubmit'];
const GATE_MATCHER = 'Bash|Write|Edit|MultiEdit|NotebookEdit';

function isOurs(hook) {
  return hook.type === 'command' && (hook.command === FORWARD || hook.command === GATE);
}

function main() {
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  const settings = JSON.parse(raw);
  settings.hooks = settings.hooks || {};

  // backup con timestamp antes de tocar nada
  const backup = `${SETTINGS}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(SETTINGS, backup);

  let changes = 0;

  // limpiar nuestras entradas (para uninstall y para idempotencia del install)
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
  console.log(`${UNINSTALL ? 'Desinstalado' : 'Instalado'} en ${SETTINGS}`);
  console.log(`Backup: ${backup}`);
  console.log('Los hooks aplican a sesiones de Claude Code NUEVAS (las abiertas no los recargan).');
}

try {
  main();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
