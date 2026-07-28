#!/usr/bin/env node
// Interactive setup wizard: checks prerequisites, picks your cast device,
// writes config.json, installs hooks + CLI, and optionally autostart + cast.
// Zero dependencies, idempotent — safe to re-run any time.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const LOCAL_BIN = path.join(os.homedir(), '.local', 'bin');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exit(1); };

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, PATH: `${LOCAL_BIN}:${process.env.PATH}` }, ...opts });
}
const onPath = (cmd) => sh('sh', ['-c', `command -v ${cmd}`]).status === 0;

async function main() {
  console.log('\nclaude-code-monitor setup\n=========================\n');

  // 1. Platform + prerequisites
  if (!['darwin', 'linux'].includes(process.platform)) fail(`Unsupported OS: ${process.platform} (macOS and Linux only)`);
  ok(`OS: ${process.platform === 'darwin' ? 'macOS' : 'Linux'}`);
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) fail(`Node ${process.versions.node} found; Node >= 18 required`);
  ok(`Node ${process.versions.node}`);
  const hasCatt = onPath('catt');
  if (hasCatt) ok('catt found');
  else {
    warn('catt not found — needed to cast to a Nest Hub / Chromecast.');
    warn('Install it with:  pipx install catt   (or: pip install catt)');
    const cont = await ask('Continue without casting (browser-only)? [y/N] ');
    if (!/^y/i.test(cont)) fail('Install catt and re-run: npm run setup');
  }
  if (fs.existsSync(path.join(os.homedir(), '.claude'))) ok('Claude Code detected (~/.claude)');
  else warn('~/.claude not found — install Claude Code first; hooks will do nothing until then.');

  // 2. Cast device
  let device = null;
  const existing = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : null;
  if (existing && existing.device && existing.device !== 'YOUR CHROMECAST DEVICE NAME') {
    const keep = await ask(`Keep current device "${existing.device}"? [Y/n] `);
    if (!/^n/i.test(keep)) device = existing.device;
  }
  if (!device && hasCatt) {
    console.log('\nScanning your network for cast devices (~10s)...');
    const scan = sh('catt', ['scan'], { timeout: 30000 });
    const devices = (scan.stdout || '').split('\n')
      .map((l) => l.split(' - ')[1]).filter(Boolean);
    if (devices.length) {
      devices.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
      console.log('  0. Skip (browser-only, no casting)');
      const n = Number(await ask('Pick a device number: '));
      if (n >= 1 && n <= devices.length) device = devices[n - 1];
    } else {
      warn('No cast devices found (same network? try again later with: npm run setup)');
    }
  }

  // 3. Write config.json
  const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));
  const config = { ...example, ...(existing || {}), device: device || (existing && existing.device) || example.device };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  ok(`config.json written (port ${config.port}, device: ${device || 'none — browser-only'})`);

  // 4. Hooks
  const hooks = await ask('\nInstall Claude Code hooks (required for monitoring)? [Y/n] ');
  if (!/^n/i.test(hooks)) {
    const r = sh('node', [path.join(ROOT, 'hooks', 'install-hooks.js')], { stdio: 'inherit' });
    if (r.status !== 0) fail('Hook installation failed');
  }

  // 5. CLI symlink
  const cliSrc = path.join(ROOT, 'bin', 'claude-monitor');
  const cliDst = path.join(LOCAL_BIN, 'claude-monitor');
  fs.mkdirSync(LOCAL_BIN, { recursive: true });
  try { fs.unlinkSync(cliDst); } catch (_) {}
  fs.symlinkSync(cliSrc, cliDst);
  ok(`CLI installed: ${cliDst}`);
  if (!(process.env.PATH || '').split(':').includes(LOCAL_BIN)) {
    warn(`${LOCAL_BIN} is not on your PATH — add:  export PATH="$HOME/.local/bin:$PATH"`);
  }

  // 6. Autostart + cast
  const auto = await ask('\nStart on login and keep alive (autostart)? [Y/n] ');
  if (!/^n/i.test(auto)) {
    const r = sh('sh', [path.join(ROOT, 'scripts', 'install-autostart.sh')], { stdio: 'inherit' });
    if (r.status !== 0) fail('Autostart installation failed');
  } else {
    console.log('  You can start it manually with: npm start');
  }
  if (device && hasCatt) {
    const cast = await ask('Cast to the device now? [Y/n] ');
    if (!/^n/i.test(cast)) sh('sh', [path.join(ROOT, 'scripts', 'cast.sh')], { stdio: 'inherit' });
  }

  console.log(`\nDone! Useful commands:
  claude-monitor status     server + services + device state
  claude-monitor cast       re-cast the dashboard
  claude-monitor logs       follow logs
  claude-monitor stop       stop everything\n
Dashboard: http://localhost:${config.port} (any 1024×600 screen works)\n`);
  rl.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
