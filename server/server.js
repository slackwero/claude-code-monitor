#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
function loadConfig() {
  for (const name of ['config.json', 'config.example.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8')); } catch (_) {}
  }
  return {};
}
const CONFIG = loadConfig();
const PORT = process.env.PORT || CONFIG.port || 8787;
const PUBLIC_DIR = path.join(ROOT, 'public');
const APPROVAL_TIMEOUT_MS = (CONFIG.approvalTimeoutSeconds || 28) * 1000;
const USAGE_REFRESH_MS = (CONFIG.usageRefreshSeconds || 60) * 1000;
const SESSION_ZOMBIE_TTL_MS = 30 * 60 * 1000;
const SESSION_ENDED_PURGE_MS = 5 * 60 * 1000;
const EVENT_LOG_MAX = 50;

// ---------------------------------------------------------------- state
const sessions = new Map();      // session_id -> {cwd, project, status, lastEvent, lastSeen, startedAt}
const eventLog = [];             // ring buffer of normalized events
const pendingApprovals = new Map(); // id -> {payload, res, timer}
const sseClients = new Set();
let remoteMode = false;
let usageCache = { data: null, fetchedAt: null, stale: true, error: null };

// Usage cache persistence: the last good data survives restarts
// and is shown as stale until the first real refresh arrives.
const USAGE_CACHE_FILE = path.join(ROOT, '.usage-cache.json');
try {
  const saved = JSON.parse(fs.readFileSync(USAGE_CACHE_FILE, 'utf8'));
  if (saved && saved.data) usageCache = { ...saved, stale: true, error: null };
} catch (_) { /* no previous cache or corrupted: start from scratch */ }

function persistUsageCache() {
  fs.writeFile(USAGE_CACHE_FILE, JSON.stringify(usageCache), (_) => { /* fail-open */ });
}

// Skin persistence: the chosen skin (and mascot variant) survives restarts.
const SKINS = ['claude', 'zelda', 'pokemon', 'cyberpunk', 'vaporwave', 'jarvis'];
const SKIN_VARIANTS = { pokemon: ['pika', 'bulba', 'charma', 'squirt'] };
const SKIN_FILE = path.join(ROOT, '.skin.json');
let currentSkin = 'claude';
let currentVariant = null; // null = mascota default del skin
try {
  const saved = JSON.parse(fs.readFileSync(SKIN_FILE, 'utf8'));
  if (SKINS.includes(saved?.skin)) currentSkin = saved.skin;
  if ((SKIN_VARIANTS[currentSkin] || []).includes(saved?.variant)) currentVariant = saved.variant;
} catch (_) { /* no previous skin or corrupted: default */ }

// ---------------------------------------------------------------- SSE
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of sseClients) {
    try { sseSend(res, event, data); } catch (_) { sseClients.delete(res); }
  }
}

setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); } catch (_) { sseClients.delete(res); }
  }
}, 15000);

function snapshot() {
  return {
    sessions: [...sessions.entries()].map(([id, s]) => ({ id, ...s })),
    events: eventLog.slice(-EVENT_LOG_MAX),
    remoteMode,
    skin: currentSkin,
    skinVariant: currentVariant,
    usage: usageCache,
    approvals: [...pendingApprovals.entries()].map(([id, a]) => ({ id, ...a.payload })),
  };
}

// ---------------------------------------------------------------- sessions and events
function projectName(cwd) {
  if (!cwd) return '???';
  return path.basename(cwd) || cwd;
}

// Notification covers permissions and idle; only the permission one changes status to waiting
function isPermissionNotification(payload) {
  const msg = (payload.message || '') + (payload.notification_type || '');
  return /permission|approval|waiting for your input|needs your/i.test(msg);
}

function handleHookEvent(payload) {
  const id = payload.session_id || 'unknown';
  const type = payload.hook_event_name || 'Unknown';
  const now = Date.now();

  let s = sessions.get(id);
  if (!s) {
    s = { cwd: payload.cwd || '', project: projectName(payload.cwd), status: 'working', lastEvent: type, lastSeen: now, startedAt: now };
    sessions.set(id, s);
  }
  s.lastSeen = now;
  s.lastEvent = type;
  if (payload.cwd) { s.cwd = payload.cwd; s.project = projectName(payload.cwd); }

  let detail = '';
  switch (type) {
    case 'SessionStart':
      s.status = 'working';
      detail = 'Session started';
      break;
    case 'SessionEnd':
      s.status = 'ended';
      detail = 'Session ended';
      setTimeout(() => { if (sessions.get(id)?.status === 'ended') { sessions.delete(id); broadcast('hook', { sessions: snapshot().sessions }); } }, SESSION_ENDED_PURGE_MS);
      break;
    case 'Notification':
      detail = payload.message || 'Notification';
      if (isPermissionNotification(payload)) s.status = 'waiting';
      break;
    case 'Stop':
      s.status = 'idle';
      detail = 'Task finished';
      break;
    case 'SubagentStop':
      detail = 'Subagent finished';
      break;
    case 'SubagentStart':
      detail = 'Subagent started';
      break;
    case 'PermissionRequest':
      s.status = 'waiting';
      detail = payload.tool_name ? `Permission: ${payload.tool_name}` : 'Waiting for permission';
      break;
    case 'PreCompact':
      detail = 'Compacting context';
      break;
    case 'UserPromptSubmit':
      s.status = 'working';
      detail = 'New prompt';
      break;
    default:
      detail = type;
  }

  const evt = { ts: now, type, sessionId: id, project: s.project, detail, error: !!payload.error };
  eventLog.push(evt);
  if (eventLog.length > EVENT_LOG_MAX * 2) eventLog.splice(0, eventLog.length - EVENT_LOG_MAX);

  broadcast('hook', { event: evt, sessions: snapshot().sessions });
}

// TTL for zombie sessions (crash without SessionEnd)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_ZOMBIE_TTL_MS) { sessions.delete(id); changed = true; }
  }
  if (changed) broadcast('hook', { sessions: snapshot().sessions });
}, 60000);

// ---------------------------------------------------------------- approvals
function requestApproval(payload, res) {
  if (!remoteMode) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"decision":"none"}');
    return;
  }
  const id = crypto.randomUUID();
  const info = {
    id,
    tool: payload.tool_name || '?',
    input: summarizeToolInput(payload),
    project: projectName(payload.cwd),
    sessionId: payload.session_id,
    timeoutMs: APPROVAL_TIMEOUT_MS,
    createdAt: Date.now(),
  };
  const timer = setTimeout(() => {
    pendingApprovals.delete(id);
    try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"decision":"none"}'); } catch (_) {}
    broadcast('approval', { removed: id });
  }, APPROVAL_TIMEOUT_MS);
  pendingApprovals.set(id, { payload: info, res, timer });
  broadcast('approval', { request: info });
}

function summarizeToolInput(payload) {
  const ti = payload.tool_input || {};
  if (ti.command) return ti.command;
  if (ti.file_path) return ti.file_path;
  try { return JSON.stringify(ti).slice(0, 300); } catch (_) { return ''; }
}

function decideApproval(id, decision) {
  const a = pendingApprovals.get(id);
  if (!a) return false;
  clearTimeout(a.timer);
  pendingApprovals.delete(id);
  const body = (decision === 'allow' || decision === 'deny')
    ? JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: decision,
          permissionDecisionReason: decision === 'allow' ? 'Approved from the Hub' : 'Denied from the Hub',
        },
      })
    : '{"decision":"none"}';
  try { a.res.writeHead(200, { 'Content-Type': 'application/json' }); a.res.end(body); } catch (_) {}
  broadcast('approval', { removed: id, decision });
  return true;
}

// ---------------------------------------------------------------- ccusage
function runCcusage(args) {
  return new Promise((resolve) => {
    execFile('npx', ['-y', 'ccusage@latest', ...args, '--json'], { timeout: 45000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch (_) { resolve(null); }
    });
  });
}

// Real plan limits (same percentages /usage shows): OAuth token -> GET /api/oauth/usage.
// macOS stores Claude Code credentials in the Keychain; Linux in a plain JSON file.
// The token lives only in this process's memory and is never logged.
function getOauthToken() {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 10000 }, (err, stdout) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout).claudeAiOauth.accessToken || null); } catch (_) { resolve(null); }
      });
    });
  }
  return new Promise((resolve) => {
    fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8', (err, data) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(data).claudeAiOauth.accessToken || null); } catch (_) { resolve(null); }
    });
  });
}

function fetchPlanUsage() {
  return new Promise(async (resolve) => {
    const token = await getOauthToken();
    if (!token) return resolve(null);
    const req = https.get('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          // error response (e.g. rate_limit_error) or no limits: treat as
          // failure so an empty plan doesn't overwrite the last good plan in the cache
          if (!Array.isArray(j.limits) || !j.limits.length) return resolve(null);
          const limits = j.limits;
          const session = limits.find((l) => l.kind === 'session');
          const weeklyAll = limits.find((l) => l.kind === 'weekly_all');
          const scoped = limits.filter((l) => l.kind === 'weekly_scoped').map((l) => ({
            name: l.scope?.model?.display_name || 'model',
            percent: l.percent,
            resetsAt: l.resets_at,
          }));
          resolve({
            session: session ? { percent: session.percent, resetsAt: session.resets_at } : null,
            weeklyAll: weeklyAll ? { percent: weeklyAll.percent, resetsAt: weeklyAll.resets_at } : null,
            scoped,
          });
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

let usageRunning = false;
async function refreshUsage() {
  if (usageRunning) return;
  usageRunning = true;
  try {
    const [blocks, daily, weekly, plan] = await Promise.all([
      runCcusage(['blocks', '--active', '--token-limit', 'max']),
      runCcusage(['daily', '--breakdown', '--since', sinceDaysAgo(7)]),
      runCcusage(['weekly']),
      fetchPlanUsage(),
    ]);
    if (blocks || daily || weekly || plan) {
      usageCache = {
        data: {
          blocks: blocks || usageCache.data?.blocks || null,
          daily: daily || usageCache.data?.daily || null,
          weekly: weekly || usageCache.data?.weekly || null,
          plan: plan || usageCache.data?.plan || null,
        },
        fetchedAt: Date.now(),
        stale: !(plan && daily),
        error: null,
      };
      persistUsageCache();
    } else {
      usageCache = { ...usageCache, stale: true, error: 'no usage data' };
    }
    broadcast('usage', usageCache);
  } finally {
    usageRunning = false;
  }
}

function sinceDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

setInterval(refreshUsage, USAGE_REFRESH_MS);
refreshUsage();

// ---------------------------------------------------------------- http
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (req.method === 'POST' && p === '/hook') {
    const body = await readBody(req);
    res.writeHead(204).end();
    try { handleHookEvent(JSON.parse(body)); } catch (_) {}
    return;
  }

  if (p === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseSend(res, 'snapshot', snapshot());
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && p === '/approval/request') {
    const body = await readBody(req);
    let payload = {};
    try { payload = JSON.parse(body); } catch (_) {}
    requestApproval(payload, res);
    return;
  }

  if (req.method === 'POST' && p === '/approval/decide') {
    const body = await readBody(req);
    let ok = false;
    try {
      const { id, decision } = JSON.parse(body);
      ok = decideApproval(id, decision);
    } catch (_) {}
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok }));
    return;
  }

  if (p === '/mode') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      try { remoteMode = !!JSON.parse(body).remoteMode; } catch (_) {}
      broadcast('mode', { remoteMode });
      // when turning off remote mode, release pending approvals back to the normal flow
      if (!remoteMode) for (const id of [...pendingApprovals.keys()]) decideApproval(id, 'none');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ remoteMode }));
    return;
  }

  if (p === '/skin') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      try {
        const { skin, variant } = JSON.parse(body);
        // values outside the whitelists are ignored: the server is the authority
        let changed = false;
        if (SKINS.includes(skin) && skin !== currentSkin) {
          currentSkin = skin;
          currentVariant = null; // cambiar de skin vuelve a la mascota default
          changed = true;
        }
        if ((SKIN_VARIANTS[currentSkin] || []).includes(variant)) {
          currentVariant = variant;
          changed = true;
        }
        if (changed) {
          fs.writeFile(SKIN_FILE, JSON.stringify({ skin: currentSkin, variant: currentVariant }), (_) => { /* fail-open */ });
          broadcast('skin', { skin: currentSkin, variant: currentVariant });
        }
      } catch (_) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ skin: currentSkin, variant: currentVariant }));
    return;
  }

  if (p === '/usage') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(usageCache));
    return;
  }

  // static files
  let file = p === '/' ? '/index.html' : p;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`claude-code-monitor listening on http://0.0.0.0:${PORT}`);
});
