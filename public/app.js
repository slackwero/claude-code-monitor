(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    sessions: [],
    events: [],
    remoteMode: false,
    usage: null,
    approvalQueue: [],
    activeApproval: null,
  };

  // ---------------------------------------------------------------- reloj
  function tickClock() {
    const d = new Date();
    $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  setInterval(tickClock, 5000);
  tickClock();

  // ---------------------------------------------------------------- sesiones
  const STATUS_TEXT = { working: 'TRABAJANDO', waiting: 'ESPERANDO', idle: 'LISTO', ended: 'CERRADA' };

  function renderSessions() {
    const list = $('sessions-list');
    const visible = state.sessions.filter((s) => s.status !== 'ended' || Date.now() - s.lastSeen < 5 * 60000);
    $('sessions-empty').hidden = visible.length > 0;
    list.innerHTML = '';
    for (const s of visible.slice(0, 8)) {
      const card = document.createElement('div');
      card.className = 'session-card';
      card.dataset.status = s.status;
      card.innerHTML = `<div class="led"></div>
        <div class="session-name">${esc(s.project)}</div>
        <div class="session-status">${STATUS_TEXT[s.status] || s.status}</div>`;
      list.appendChild(card);
    }
    updateMascot();
  }

  function updateMascot() {
    if (state.activeApproval) return window.mascot.setState('alert');
    const st = state.sessions.map((s) => s.status);
    if (st.includes('waiting')) window.mascot.setState('waiting');
    else if (st.includes('working')) window.mascot.setState('working');
    else window.mascot.setState('sleep');
  }

  // ---------------------------------------------------------------- eventos
  const EVT_ICON = {
    SessionStart: '&#9654;', SessionEnd: '&#9632;', Stop: '&#10003;', SubagentStop: '&#9720;',
    Notification: '&#9888;', PreCompact: '&#9851;', UserPromptSubmit: '&#9998;',
  };

  function renderEvents() {
    const list = $('events-list');
    list.innerHTML = '';
    for (const e of state.events.slice(-24)) {
      const d = new Date(e.ts);
      const row = document.createElement('div');
      row.className = 'evt';
      row.dataset.type = e.error ? 'error' : e.type;
      row.innerHTML = `<span class="evt-time">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
        <span class="evt-icon">${EVT_ICON[e.type] || '&#9679;'}</span>
        <span class="evt-project">${esc(e.project)}</span>
        <span class="evt-detail">${esc(e.detail)}</span>`;
      list.prepend(row);
    }
  }

  // ---------------------------------------------------------------- consumos
  const MODEL_NAMES = [
    [/fable/i, 'FABLE 5'], [/opus/i, 'OPUS'], [/sonnet/i, 'SONNET'], [/haiku/i, 'HAIKU'],
  ];
  function modelLabel(name) {
    for (const [re, label] of MODEL_NAMES) if (re.test(name)) return label;
    return name.replace(/^claude-/, '').toUpperCase().slice(0, 10);
  }
  function fmtTokens(n) {
    if (n == null) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  }
  function fmtCost(n) { return n == null ? '--' : '$' + n.toFixed(n >= 100 ? 0 : 1); }
  function todayPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderUsage() {
    const u = state.usage;
    if (!u || !u.data) return;
    $('usage-stale').hidden = !u.stale;

    // bloque 5h: barra segmentada por tiempo transcurrido
    const block = u.data.blocks?.blocks?.find((b) => b.isActive);
    const bar = $('block-bar');
    bar.innerHTML = '';
    const SEGS = 20;
    let pct = 0;
    if (block) {
      const start = Date.parse(block.startTime);
      const end = Date.parse(block.endTime);
      pct = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
      const resetAt = new Date(end);
      $('block-reset').textContent = `RESET ${String(resetAt.getHours()).padStart(2, '0')}:${String(resetAt.getMinutes()).padStart(2, '0')}`;
      $('block-info').innerHTML = `<b>${fmtTokens(block.totalTokens)}</b> tok · <b>${fmtCost(block.costUSD)}</b>` +
        (block.projection ? ` · proy ${fmtCost(block.projection.totalCost)}` : '');
    } else {
      $('block-reset').textContent = 'SIN BLOQUE';
      $('block-info').textContent = 'sin actividad en el bloque actual';
    }
    for (let i = 0; i < SEGS; i++) {
      const seg = document.createElement('div');
      seg.className = 'block-seg';
      if (block && i < Math.round(pct * SEGS)) {
        seg.classList.add('on');
        if (pct > 0.8) seg.classList.add('hot');
      }
      bar.appendChild(seg);
    }

    // hoy / semana / por modelo
    const today = u.data.daily?.daily?.find((d) => d.period === todayPeriod());
    $('today-cost').textContent = fmtCost(today?.totalCost);
    $('today-tokens').textContent = today ? fmtTokens(today.totalTokens) + ' tok' : 'sin datos hoy';

    const weeks = u.data.weekly?.weekly;
    const week = weeks && weeks[weeks.length - 1];
    $('week-cost').textContent = fmtCost(week?.totalCost);
    $('week-tokens').textContent = week ? fmtTokens(week.totalTokens) + ' tok' : '';

    const breakdowns = today?.modelBreakdowns || [];
    const fable = breakdowns.find((m) => /fable/i.test(m.modelName));
    $('fable-cost').textContent = fmtCost(fable?.cost);
    $('fable-tokens').textContent = fable
      ? fmtTokens(fable.cacheCreationTokens + fable.cacheReadTokens + fable.inputTokens + fable.outputTokens) + ' tok'
      : 'sin uso hoy';

    const others = breakdowns.filter((m) => !/fable/i.test(m.modelName));
    $('models-list').innerHTML = others.length
      ? others.map((m) => `${modelLabel(m.modelName)} <b>${fmtCost(m.cost)}</b>`).join('<br>')
      : 'solo Fable hoy';
  }

  // ---------------------------------------------------------------- aprobaciones
  function showNextApproval() {
    if (state.activeApproval || !state.approvalQueue.length) return;
    const a = state.approvalQueue.shift();
    state.activeApproval = a;
    $('approval-project').textContent = a.project || '';
    $('approval-tool').textContent = a.tool;
    $('approval-input').textContent = (a.input || '').slice(0, 400);
    $('approval-overlay').hidden = false;
    updateMascot();
    window.chip.play('approval');

    const fill = $('approval-countdown-fill');
    const started = Date.now();
    fill.style.width = '100%';
    a._timer = setInterval(() => {
      const left = 1 - (Date.now() - started) / (a.timeoutMs || 28000);
      if (left <= 0) return dismissApproval(a.id);
      fill.style.width = Math.max(0, left * 100) + '%';
    }, 250);
  }

  function dismissApproval(id) {
    if (state.activeApproval?.id === id) {
      clearInterval(state.activeApproval._timer);
      state.activeApproval = null;
      $('approval-overlay').hidden = true;
      updateMascot();
      showNextApproval();
    } else {
      state.approvalQueue = state.approvalQueue.filter((a) => a.id !== id);
    }
  }

  function decide(decision) {
    const a = state.activeApproval;
    if (!a) return;
    fetch('/approval/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, decision }),
    }).catch(() => {});
    dismissApproval(a.id);
  }
  $('btn-allow').addEventListener('click', () => decide('allow'));
  $('btn-deny').addEventListener('click', () => decide('deny'));

  // ---------------------------------------------------------------- modo remoto
  function renderMode() {
    const t = $('mode-toggle');
    t.dataset.on = String(state.remoteMode);
    t.innerHTML = `REMOTO <b>${state.remoteMode ? 'ON' : 'OFF'}</b>`;
  }
  $('mode-toggle').addEventListener('click', () => {
    fetch('/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteMode: !state.remoteMode }),
    }).catch(() => {});
    window.chip.play('toggle');
  });

  // ---------------------------------------------------------------- SSE
  const SOUND_BY_EVENT = {
    SessionStart: 'start', SessionEnd: 'end', Stop: 'done', SubagentStop: 'subagent',
    Notification: 'notify', PreCompact: 'compact',
  };

  let es = null;
  let retryMs = 1000;

  function connect() {
    es = new EventSource('/events');

    es.addEventListener('snapshot', (m) => {
      retryMs = 1000;
      const snap = JSON.parse(m.data);
      state.sessions = snap.sessions;
      state.events = snap.events;
      state.remoteMode = snap.remoteMode;
      state.usage = snap.usage;
      state.approvalQueue = snap.approvals || [];
      renderSessions(); renderEvents(); renderUsage(); renderMode(); showNextApproval();
    });

    es.addEventListener('hook', (m) => {
      const data = JSON.parse(m.data);
      if (data.sessions) state.sessions = data.sessions;
      if (data.event) {
        state.events.push(data.event);
        if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
        window.chip.play(data.event.error ? 'error' : SOUND_BY_EVENT[data.event.type]);
      }
      renderSessions(); renderEvents();
    });

    es.addEventListener('approval', (m) => {
      const data = JSON.parse(m.data);
      if (data.request) { state.approvalQueue.push(data.request); showNextApproval(); }
      if (data.removed) dismissApproval(data.removed);
    });

    es.addEventListener('usage', (m) => { state.usage = JSON.parse(m.data); renderUsage(); });
    es.addEventListener('mode', (m) => { state.remoteMode = JSON.parse(m.data).remoteMode; renderMode(); });

    es.onerror = () => {
      es.close();
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 15000);
    };
  }
  connect();

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
