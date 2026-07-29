// Claude's mascot canvas: reflects the dashboard's global state.
// States: working (bob + blink), waiting (alarmed bounce), sleep (zZz), alert (shake).
// Each skin picks a renderer: pixel (default), glitch (cyberpunk), reactor (jarvis).
(function () {
  'use strict';

  const GRID = [
    '................',
    '..############..',
    '..############..',
    '..#o########o#..',
    '..#o########o#..',
    '################',
    '################',
    '..############..',
    '..############..',
    '..############..',
    '...#..#..#..#...',
    '...#..#..#..#...',
  ];

  const canvas = document.getElementById('mascot');
  const ctx = canvas.getContext('2d');
  const CELL = Math.floor(canvas.width / GRID[0].length);
  const S = CELL / 4; // scale factor for animation offsets
  const offY = Math.floor((canvas.height - GRID.length * CELL) / 2);
  let state = 'sleep';
  let frame = 0;
  let renderer = 'pixel';

  // Colors come from the active skin's CSS variables; cached because
  // draw() runs at 8 fps and the palette only changes on skin switch.
  let COLORS;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    COLORS = {
      body: v('--accent', '#D97757'),
      eyes: '#141414', // siempre negros, en cualquier skin
      warn: v('--warn', '#f2c14e'),
      bad: v('--bad', '#e05b4b'),
      dim: v('--dim', '#a08469'),
    };
  }
  readColors();

  // ---------------------------------------------------------------- pixel
  function drawGrid(dx, bobY, shakeX, eyesClosed, forced, alpha) {
    ctx.globalAlpha = alpha;
    for (let r = 0; r < GRID.length; r++) {
      for (let c = 0; c < GRID[r].length; c++) {
        const ch = GRID[r][c];
        if (ch === '.') continue;
        if (forced) {
          ctx.fillStyle = forced;
        } else if (ch === 'o') {
          ctx.fillStyle = eyesClosed ? COLORS.body : COLORS.eyes;
        } else {
          ctx.fillStyle = state === 'waiting' && frame % 4 < 2 ? COLORS.warn
                        : state === 'alert' ? COLORS.bad
                        : COLORS.body;
        }
        ctx.fillRect(c * CELL + shakeX + dx, r * CELL + bobY + offY, CELL, CELL);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPixel(withGlitch) {
    const bobY = state === 'working' ? (frame % 8 < 4 ? 0 : S)
               : state === 'waiting' ? (frame % 4 < 2 ? 0 : -3 * S)
               : 0;
    const shakeX = state === 'alert' ? (((frame % 2) * 2 - 1) * S) : 0;
    const blink = state === 'working' && frame % 24 >= 22; // occasional blink
    const eyesClosed = state === 'sleep' || blink;

    // RGB-split ghosts a couple of frames every ~1.5s
    if (withGlitch && frame % 12 < 2) {
      drawGrid(-2 * S, bobY, shakeX, eyesClosed, COLORS.body, .4);
      drawGrid(2 * S, bobY, shakeX, eyesClosed, COLORS.bad, .4);
    }
    drawGrid(0, bobY, shakeX, eyesClosed, null, 1);
    drawZzz();
  }

  // zZz while sleeping, scaled to canvas size
  function drawZzz() {
    if (state !== 'sleep' || frame % 16 >= 12) return;
    ctx.fillStyle = COLORS.dim;
    const zs = [[58, 8], [54, 14], [50, 20]];
    const n = 1 + Math.floor((frame % 16) / 4);
    for (let i = 0; i < Math.min(n, 3); i++) {
      ctx.fillRect(zs[i][0] * S, zs[i][1] * S, 3 * S, 3 * S);
    }
  }

  // ---------------------------------------------------------------- sprites
  // Sprites multicolor por skin (zelda: Link ALttP, pokemon: Pikachu).
  // Paleta propia por sprite; 'E' son ojos (se cierran con pal.closed en
  // sleep/blink) y el flash de daño en alertas usa el --bad del skin.
  const LINK_GRID = [
    '......KKKK......',
    '.....KGGGGK.....',
    '....KGgGGgGK....',
    '....KGGgGgGK....',
    '...KOOOOOOOK....',
    '.KTTKMMMMMMKTTK.',
    'KTTKMMMMMMMMKTTK',
    '.KKWWWKTTKWWWKK.',
    '.KTKWWETTEWWKTK.',
    '.KTKSSESSESSKTK.',
    '..KKSSSSSSSSKK..',
    '..KGLLGGGGGKDK..',
    '.KWWWWKGgGGKDDK.',
    '.KWBbBWKGgGKDDK.',
    '.KWBbBWKGYGKDDK.',
    '.KWBBBWKGgGKDK..',
    '.KWWWWWKGGKYRK..',
    '..KKKKKKGGGGKK..',
    '....KDDK.KDDK...',
    '....KKKK.KKKK...',
  ];
  const LINK_PAL = {
    K: '#1a1a1a', // contorno
    E: '#1a1a1a', // ojos
    closed: '#f0b878', // ojos cerrados = piel
    G: '#58a848', // gorro y túnica
    g: '#2e7a34', // sombra verde
    L: '#9cd47c', // brillo verde del hombro
    O: '#e8862c', // banda naranja del gorro
    M: '#e668a4', // banda rosa
    T: '#b06a34', // orejas, patillas y flequillo
    W: '#f8f8f8', // blancos (mejillas y borde del escudo)
    S: '#f0b878', // piel
    B: '#3050c0', // azul del escudo
    b: '#7c94ec', // brillo azul del escudo
    Y: '#e8d040', // borla dorada del cinturón
    R: '#d02818', // borla roja
    D: '#7a4818', // brazo y botas
  };

  // Pikachu regordete de frente: orejas largas con punta negra, cachetes
  // rojos, bracitos al frente y sombra en las patas.
  const PIKA_GRID = [
    '.KK..........KK.',
    '.KKYK......KYKK.',
    '..KYYK....KYYK..',
    '..KYYYK..KYYYK..',
    '...KYYYKKYYYK...',
    '..KYYYYYYYYYYK..',
    '.KYYYYYYYYYYYYK.',
    '.KYYEwYYYYwEYYK.',
    '.KYYEEYYYYEEYYK.',
    '.KRRYYYKKYYYRRK.',
    '.KYYYYYYYYYYYYK.',
    '..KYYYYYYYYYYK..',
    '..KYYKYYYYKYYK..',
    '.KYYYKYYYYKYYYK.',
    '.KYYYYYYYYYYYYK.',
    '..KYyyYYYYyyYK..',
    '..KKYYKKKKYYKK..',
    '...KKKK..KKKK...',
  ];
  const PIKA_PAL = {
    K: '#1a1a1a', // contorno y puntas de orejas
    E: '#1a1a1a', // ojos
    closed: '#f8d030', // ojos cerrados = amarillo
    w: '#f8f8f8', // brillo del ojo
    Y: '#f8d030', // amarillo Pikachu
    y: '#d8a828', // sombra amarilla
    R: '#e84040', // cachetes
  };

  // Bulbasaur: cuerpo verde azulado, bulbo verde detrás de la cabeza,
  // ojos rojos, manchas y patitas.
  const BULBA_GRID = [
    '.....KKKKKK.....',
    '....KGGgGGGK....',
    '...KGGgGGgGGK...',
    '.KK.KGGGGGGK.KK.',
    '.KAKKAAAAAAKKAK.',
    '.KAAAAAAAAAAAAK.',
    '.KAEwAAAAAAwEAK.',
    '.KAEEAAAAAAEEAK.',
    '.KAAAKKKKKKAAAK.',
    '..KADAAAAAADAK..',
    '..KAAAAAAAAAAK..',
    '..KAAKAAAAKAAK..',
    '..KAAK.AA.KAAK..',
    '..KKKK....KKKK..',
  ];
  const BULBA_PAL = {
    K: '#1a1a1a', // contorno
    E: '#d84048', // ojos rojos
    closed: '#6cc0a0', // ojos cerrados = cuerpo
    w: '#f8f8f8', // brillo del ojo
    A: '#6cc0a0', // cuerpo verde azulado
    G: '#4a9c50', // bulbo
    g: '#2e7a34', // sombra del bulbo
    D: '#3a8878', // manchas
  };

  // Charmander: naranja con panza crema y la llamita de la cola asomando.
  const CHARMA_GRID = [
    '....KKKKK....KK.',
    '...KOOOOOK..KFK.',
    '..KOOOOOOOK.KFK.',
    '..KOEwOOOwEOKRK.',
    '..KOEEOOOEEOKK..',
    '..KOOOKKKOOOK...',
    '..KOOOOOOOOOK...',
    '.KOOCCCCCCCOOK..',
    '.KOKCCCCCCCKOK..',
    '.KOKCCCCCCCKOK..',
    '..KOCCCCCCCOK...',
    '..KOOOOOOOOOK...',
    '..KOOK...KOOK...',
    '..KKKK...KKKK...',
  ];
  const CHARMA_PAL = {
    K: '#1a1a1a', // contorno
    E: '#1a1a1a', // ojos
    closed: '#f08030', // ojos cerrados = naranja
    w: '#f8f8f8', // brillo del ojo
    O: '#f08030', // cuerpo naranja
    C: '#f8e0a0', // panza crema
    F: '#f8d030', // llama exterior
    R: '#e84040', // núcleo de la llama
  };

  // Squirtle: azul con panza crema y sonrisa ancha.
  const SQUIRT_GRID = [
    '.....KKKKKK.....',
    '....KQQQQQQK....',
    '..KQQQQQQQQQQK..',
    '.KQEwQQQQQQwEQK.',
    '.KQEEQQQQQQEEQK.',
    '.KQQQQKKKKQQQQK.',
    '..KQQQQQQQQQQK..',
    '..KQQKQQQQKQQK..',
    '.KQQKCCCCCCKQQK.',
    '.KQQKCCCCCCKQQK.',
    '..KQKCCCCCCKQK..',
    '..KQQKCCCCKQQK..',
    '...KQQK..KQQK...',
    '...KKKK..KKKK...',
  ];
  const SQUIRT_PAL = {
    K: '#1a1a1a', // contorno
    E: '#1a1a1a', // ojos
    closed: '#58a8f0', // ojos cerrados = azul
    w: '#f8f8f8', // brillo del ojo
    Q: '#58a8f0', // cuerpo azul
    C: '#f8e8c0', // panza crema
  };

  const SPRITES = {
    link: { grid: LINK_GRID, pal: LINK_PAL },
    pika: { grid: PIKA_GRID, pal: PIKA_PAL },
    bulba: { grid: BULBA_GRID, pal: BULBA_PAL },
    charma: { grid: CHARMA_GRID, pal: CHARMA_PAL },
    squirt: { grid: SQUIRT_GRID, pal: SQUIRT_PAL },
  };

  function drawSprite(sprite) {
    const { grid, pal } = sprite;
    const cell = Math.floor(canvas.height / grid.length);
    const offX = Math.floor((canvas.width - grid[0].length * cell) / 2);
    const offYs = Math.floor((canvas.height - grid.length * cell) / 2);
    const bobY = state === 'working' ? (frame % 8 < 4 ? 0 : S)
               : state === 'waiting' ? (frame % 4 < 2 ? 0 : -3 * S)
               : 0;
    const shakeX = state === 'alert' ? (((frame % 2) * 2 - 1) * S) : 0;
    const blink = state === 'working' && frame % 24 >= 22;
    const eyesClosed = state === 'sleep' || blink;
    const damageFlash = state === 'alert' && frame % 4 < 2; // parpadeo de daño

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        if (ch === '.') continue;
        let color = pal[ch];
        if ((ch === 'E' || ch === 'w') && eyesClosed) color = pal.closed;
        if (damageFlash) color = COLORS.bad;
        ctx.fillStyle = color;
        ctx.fillRect(c * cell + shakeX + offX, r * cell + bobY + offYs, cell, cell);
      }
    }
    drawZzz();
  }

  // ---------------------------------------------------------------- reactor
  // Jarvis arc reactor: tick ring + rotating arc + core glow. Same state
  // language: spin when working, amber pulse waiting, red flash alert, dim sleep.
  function drawReactor() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const col = state === 'alert' ? COLORS.bad
              : state === 'waiting' ? COLORS.warn
              : state === 'sleep' ? COLORS.dim
              : COLORS.body;
    const speed = state === 'working' ? .14 : state === 'waiting' ? .05 : state === 'alert' ? .3 : .015;
    const rot = frame * speed;
    const base = state === 'sleep' ? .45
               : state === 'alert' && frame % 2 ? .45
               : 1;
    const pulse = state === 'waiting' ? .7 + .3 * (frame % 8 < 4 ? 1 : 0) : 1;

    ctx.save();
    ctx.globalAlpha = base;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;

    // outer thin ring
    ctx.globalAlpha = base * .4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.stroke();

    // tick ring
    ctx.globalAlpha = base * .8;
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + rot * .25;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
      ctx.lineTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
      ctx.stroke();
    }

    // rotating open arc
    ctx.globalAlpha = base;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, -rot, -rot + Math.PI * 1.5);
    ctx.stroke();

    // core glow (layered translucent discs instead of gradients: crisp at 8 fps)
    ctx.globalAlpha = base * .2 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = base * .45 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = base * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------- loop
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (renderer === 'reactor') drawReactor();
    else if (SPRITES[renderer]) drawSprite(SPRITES[renderer]);
    else drawPixel(renderer === 'glitch');
  }

  setInterval(() => { frame++; draw(); }, 125); // 8 fps, cadencia retro

  const RENDERER_BY_SKIN = { jarvis: 'reactor', cyberpunk: 'glitch', zelda: 'link', pokemon: 'pika' };
  // skins con más de un personaje: un tap corto en la mascota los cicla
  // (la elección vive en el server y llega por SSE, igual que el skin)
  const VARIANTS_BY_SKIN = { pokemon: ['pika', 'bulba', 'charma', 'squirt'] };
  let currentSkin = 'claude';

  window.mascot = {
    setState(s) { if (['working', 'waiting', 'sleep', 'alert'].includes(s)) state = s; },
    setSkin(skin) {
      currentSkin = skin;
      renderer = RENDERER_BY_SKIN[skin] || 'pixel';
      readColors();
    },
    setVariant(v) {
      if ((VARIANTS_BY_SKIN[currentSkin] || []).includes(v)) renderer = v;
    },
    nextVariant() {
      const variants = VARIANTS_BY_SKIN[currentSkin];
      if (!variants) return null;
      return variants[(variants.indexOf(renderer) + 1) % variants.length];
    },
    refreshColors: readColors,
  };
})();
