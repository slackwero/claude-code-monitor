// Chiptunes 8-bit generados con WebAudio: un jingle distinto por tipo de evento.
// El chip del header es un toggle permanente: TOCA P/SONIDO (bloqueado por
// autoplay) -> SONIDO ON <-> SONIDO OFF (preferencia guardada en localStorage).
(function () {
  'use strict';

  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('nm-muted') === '1'; } catch (_) {}

  // Melodías: [frecuencia Hz, duración s, tipo de onda opcional]
  const TUNES = {
    start:    [[523, .09], [659, .09], [784, .09], [1047, .18]],             // arpegio ascendente C-E-G-C
    done:     [[1319, .12], [1568, .12], [2637, .12], [2093, .12], [2349, .12], [3136, .22]], // 1-UP estilo Mario
    end:      [[659, .12], [523, .12], [392, .2]],                           // despedida descendente
    notify:   [[988, .09], [0, .05], [988, .12]],                            // doble bip ámbar
    subagent: [[740, .08], [880, .12]],                                      // subagente termina: sube
    subagentStart: [[880, .08], [740, .12]],                                 // subagente arranca: baja
    prompt:   [[1047, .07], [1319, .1]],                                     // nueva solicitud: blip alegre
    compact:  [[300, .04], [400, .04], [500, .04], [600, .04], [700, .08]],  // barrido
    error:    [[330, .15], [247, .15], [175, .3]],                           // descendente grave
    approval: [[880, .12], [0, .06], [880, .12], [0, .06], [1175, .3]],      // alerta insistente
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
        // envolvente corta estilo chip: ataque instantáneo, caída rápida
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
    chip.innerHTML = state === 'locked' ? '&#128264; TOCA P/SONIDO'
                   : state === 'muted' ? '&#128263; SONIDO OFF'
                   : '&#128266; SONIDO ON';
  }

  if (chip) {
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // que no dispare también el unlock global
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

  // desbloqueo de autoplay: primer toque en cualquier parte reanuda el contexto
  function unlock() {
    if (muted) return;
    const ac = ensureCtx();
    ac.resume().then(updateChip);
  }
  document.addEventListener('touchstart', unlock, { once: false, passive: true });
  document.addEventListener('click', unlock, { once: false, passive: true });

  // al cargar: probar si el autoplay está permitido (en DashCast normalmente sí)
  window.addEventListener('load', () => {
    if (!muted) {
      const ac = ensureCtx();
      ac.resume().then(updateChip).catch(updateChip);
      setTimeout(updateChip, 500);
    }
    updateChip();
  });

  // test de los jingles: mantener presionado el logo ~1s
  let pressTimer = null;
  const mascot = document.getElementById('mascot');
  if (mascot) {
    const startPress = () => {
      pressTimer = setTimeout(() => {
        const names = ['start', 'prompt', 'done', 'notify', 'subagentStart', 'subagent', 'compact', 'error', 'approval', 'end'];
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
