#!/usr/bin/env node
// Keep-alive for cast: if Hub is not showing DashCast (app_id 84912283),
// re-cast the dashboard. In Node (not sh) to work under launchd even if repo
// lives in ~/Documents (TCC blocks /bin/sh but node has access).
'use strict';

const { execFile } = require('child_process');
const http = require('http');
const path = require('path');

function loadConfig() {
  for (const name of ['config.json', 'config.example.json']) {
    try { return require(path.join(__dirname, '..', name)); } catch (_) {}
  }
  return {};
}
const CONFIG = loadConfig();
const lanIp = require('./lan-ip');
const DEVICE = process.env.CATT_DEVICE || CONFIG.device;
const PORT = process.env.PORT || CONFIG.port || 8787;
const DASHCAST_APP_ID = '84912283';
const EXTRA_PATH = `${process.env.HOME}/.local/bin`; // catt installed with uv/pipx
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

async function cast() {
  const ip = lanIp();
  if (!ip) return log('no LAN IP; will retry');
  await run('catt', ['-d', DEVICE, 'stop']);
  await new Promise((r) => setTimeout(r, 2000));
  const url = `http://${ip}:${PORT}/?v=${Date.now()}`;
  log(`casting ${url} to "${DEVICE}"`);
  const out = await run('catt', ['-d', DEVICE, 'cast_site', url], 60000);
  if (out === null) log('catt cast_site failed; retrying next cycle');
}

async function tick() {
  if (!(await serverUp())) return; // without server it makes no sense to cast
  const info = await run('catt', ['-d', DEVICE, 'info']);
  const appId = (info || '').match(/^app_id: (.*)$/m)?.[1];
  if (appId !== DASHCAST_APP_ID) {
    log(`Hub on app_id=${appId || '?'}; re-casting...`);
    await cast();
  }
}

log(`keep-alive for "${DEVICE}" every 60s`);
tick();
setInterval(tick, 60000);
