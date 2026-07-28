// 8-bit chiptunes generated with WebAudio: a distinct jingle per event type.
// The header chip is a permanent toggle: TAP FOR SOUND (blocked by
// autoplay) -> SOUND ON <-> SOUND OFF (preference saved in localStorage).
(function () {
  'use strict';

  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('nm-muted') === '1'; } catch (_) {}

  // Melodies: [frequency Hz, duration s, optional wave type]
  const TUNES = {
    start:    [[523, .09], [659, .09], [784, .09], [1047, .18]],             // ascending arpeggio C-E-G-C
    done:     [[1319, .12], [1568, .12], [2637, .12], [2093, .12], [2349, .12], [3136, .22]], // Mario-style 1-UP
    end:      [[659, .12], [523, .12], [392, .2]],                           // descending farewell
    notify:   [[988, .09], [0, .05], [988, .12]],                            // double amber beep
    subagent: [[988, .08], [1319, .38]],                                     // Mario-style coin: B5 -> E6
    subagentStart: [[880, .08], [740, .12]],                                 // subagent start: descending
    prompt:   [[1047, .07], [1319, .1]],                                     // new request: cheerful blip
    compact:  [[300, .04], [400, .04], [500, .04], [600, .04], [700, .08]],  // sweep
    error:    [[330, .15], [247, .15], [175, .3]],                           // low descending
    approval: [[880, .12], [0, .06], [880, .12], [0, .06], [1175, .3]],      // insistent alert
    pipe:     [[784, .05], [698, .05], [622, .05], [554, .05], [494, .05], [440, .05], [392, .05], [349, .09]], // Mario-style warp pipe: stepped descent
    toggle:   [[1319, .06]],                                                 // click
  };

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function play(name) {
    if (muted) return;
    const tune = TUNES[name];
    if (!tune) return;
    const ac = ensureCtx();
    if (ac.state === 'suspended') {
      ac.resume().then(() => { if (ac.state === 'running') schedule(ac, tune); updateChip(); });
      updateChip();
      return;
    }
    schedule(ac, tune);
  }

  function schedule(ac, tune) {
    let t = ac.currentTime + 0.02;
    for (const [freq, dur, wave] of tune) {
      if (freq > 0) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = wave || 'square';
        osc.frequency.value = freq;
        // short chip-style envelope: instant attack, fast decay
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.003, t + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.01);
      }
      t += dur + 0.015;
    }
  }

  const chip = document.getElementById('sound-chip');

  function updateChip() {
    if (!chip) return;
    chip.hidden = false;
    const locked = !muted && (!ctx || ctx.state !== 'running');
    const state = locked ? 'locked' : muted ? 'muted' : 'on';
    chip.dataset.state = state;
    chip.innerHTML = state === 'locked' ? '&#128264; TAP FOR SOUND'
                   : state === 'muted' ? '&#128263; SOUND OFF'
                   : '&#128266; SOUND ON';
  }

  if (chip) {
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // avoid also triggering the global unlock
      const ac = ensureCtx();
      if (!muted && ac.state !== 'running') {
        ac.resume().then(updateChip);
        updateChip();
        return;
      }
      muted = !muted;
      try { localStorage.setItem('nm-muted', muted ? '1' : '0'); } catch (_) {}
      updateChip();
      if (!muted) {
        const ac2 = ensureCtx();
        (ac2.state === 'running' ? Promise.resolve() : ac2.resume()).then(() => play('toggle'));
      }
    });
  }

  // autoplay unlock: first tap anywhere resumes the context
  function unlock() {
    if (muted) return;
    const ac = ensureCtx();
    ac.resume().then(updateChip);
  }
  document.addEventListener('touchstart', unlock, { once: false, passive: true });
  document.addEventListener('click', unlock, { once: false, passive: true });

  // on load: test whether autoplay is allowed (usually yes on DashCast)
  window.addEventListener('load', () => {
    if (!muted) {
      const ac = ensureCtx();
      ac.resume().then(updateChip).catch(updateChip);
      setTimeout(updateChip, 500);
    }
    updateChip();
  });

  // jingle test: press and hold the logo ~1s
  let pressTimer = null;
  const mascot = document.getElementById('mascot');
  if (mascot) {
    const startPress = () => {
      pressTimer = setTimeout(() => {
        const names = ['start', 'prompt', 'done', 'notify', 'subagentStart', 'subagent', 'compact', 'error', 'approval', 'pipe', 'end'];
        names.forEach((n, i) => setTimeout(() => play(n), i * 900));
      }, 1000);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    mascot.addEventListener('touchstart', startPress, { passive: true });
    mascot.addEventListener('mousedown', startPress);
    mascot.addEventListener('touchend', cancelPress);
    mascot.addEventListener('mouseup', cancelPress);
  }

  window.chip = { play };
})();
