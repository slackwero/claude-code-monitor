// Claude's pixel mascot: reflects the dashboard's global state.
// States: working (bob + blink), waiting (alarmed bounce), sleep (zZz), alert (shake)
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

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bobY = state === 'working' ? (frame % 8 < 4 ? 0 : S)
               : state === 'waiting' ? (frame % 4 < 2 ? 0 : -3 * S)
               : 0;
    const shakeX = state === 'alert' ? (((frame % 2) * 2 - 1) * S) : 0;
    const blink = state === 'working' && frame % 24 >= 22; // occasional blink
    const eyesClosed = state === 'sleep' || blink;

    for (let r = 0; r < GRID.length; r++) {
      for (let c = 0; c < GRID[r].length; c++) {
        const ch = GRID[r][c];
        if (ch === '.') continue;
        if (ch === 'o') {
          ctx.fillStyle = eyesClosed ? '#D97757' : '#f5e6d0';
        } else {
          ctx.fillStyle = state === 'waiting' && frame % 4 < 2 ? '#f2c14e'
                        : state === 'alert' ? '#e05b4b'
                        : '#D97757';
        }
        ctx.fillRect(c * CELL + shakeX, r * CELL + bobY + offY, CELL, CELL);
      }
    }

    // zZz while sleeping, scaled to canvas size
    if (state === 'sleep' && frame % 16 < 12) {
      ctx.fillStyle = '#a08469';
      const zs = [[58, 8], [54, 14], [50, 20]];
      const n = 1 + Math.floor((frame % 16) / 4);
      for (let i = 0; i < Math.min(n, 3); i++) {
        ctx.fillRect(zs[i][0] * S, zs[i][1] * S, 3 * S, 3 * S);
      }
    }
  }

  setInterval(() => { frame++; draw(); }, 125); // 8 fps, cadencia retro

  window.mascot = {
    setState(s) { if (['working', 'waiting', 'sleep', 'alert'].includes(s)) state = s; },
  };
})();
