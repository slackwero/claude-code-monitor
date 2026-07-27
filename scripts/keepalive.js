#!/usr/bin/env node
// Keep-alive del cast: si el Hub no está mostrando DashCast (app_id 84912283),
// re-castea el dashboard. En Node (no sh) para funcionar bajo launchd aunque el
// repo viva en ~/Documents (TCC bloquea a /bin/sh pero node tiene acceso).
'use strict';

const { execFile } = require('child_process');
const http = require('http');
const path = require('path');

const CONFIG = require(path.join(__dirname, '..', 'config.json'));
const DEVICE = process.env.CATT_DEVICE || CONFIG.device;
const PORT = process.env.PORT || CONFIG.port || 8787;
const DASHCAST_APP_ID = '84912283';
const EXTRA_PATH = `${process.env.HOME}/.local/bin`; // catt instalado con uv/pipx
process.env.PATH = `${EXTRA_PATH}:${process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'}`;

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

function run(cmd, args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function lanIp() {
  return (await run('ipconfig', ['getifaddr', 'en0'])) || (await run('ipconfig', ['getifaddr', 'en1']));
}

async function cast() {
  const ip = await lanIp();
  if (!ip) return log('sin IP LAN; reintento luego');
  await run('catt', ['-d', DEVICE, 'stop']);
  await new Promise((r) => setTimeout(r, 2000));
  const url = `http://${ip}:${PORT}/?v=${Date.now()}`;
  log(`casteando ${url} a "${DEVICE}"`);
  const out = await run('catt', ['-d', DEVICE, 'cast_site', url], 60000);
  if (out === null) log('catt cast_site falló; reintento en el próximo ciclo');
}

async function tick() {
  if (!(await serverUp())) return; // sin servidor no tiene sentido castear
  const info = await run('catt', ['-d', DEVICE, 'info']);
  const appId = (info || '').match(/^app_id: (.*)$/m)?.[1];
  if (appId !== DASHCAST_APP_ID) {
    log(`Hub en app_id=${appId || '?'}; re-casteando...`);
    await cast();
  }
}

log(`keep-alive para "${DEVICE}" cada 60s`);
tick();
setInterval(tick, 60000);
