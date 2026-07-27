// Mascota pixel de Claude: refleja el estado global del dashboard.
// Estados: working (bob + parpadeo), waiting (rebote alarmado), sleep (zZz), alert (temblor)
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
  const CELL = 4; // 16 cols * 4px = 64px

  const canvas = document.getElementById('mascot');
  const ctx = canvas.getContext('2d');
  let state = 'sleep';
  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bobY = state === 'working' ? (frame % 8 < 4 ? 0 : 1)
               : state === 'waiting' ? (frame % 4 < 2 ? 0 : -3)
               : 0;
    const shakeX = state === 'alert' ? ((frame % 2) * 2 - 1) : 0;
    const blink = state === 'working' && frame % 24 >= 22; // parpadeo ocasional
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
        ctx.fillRect(c * CELL + shakeX, r * CELL + bobY + 4, CELL, CELL);
      }
    }

    // zZz cuando duerme
    if (state === 'sleep' && frame % 16 < 12) {
      ctx.fillStyle = '#a08469';
      const zs = [[58, 8], [54, 14], [50, 20]];
      const n = 1 + Math.floor((frame % 16) / 4);
      ctx.font = '8px monospace';
      for (let i = 0; i < Math.min(n, 3); i++) ctx.fillRect(zs[i][0], zs[i][1], 3, 3);
    }
  }

  setInterval(() => { frame++; draw(); }, 125); // 8 fps, cadencia retro

  window.mascot = {
    setState(s) { if (['working', 'waiting', 'sleep', 'alert'].includes(s)) state = s; },
  };
})();
