// The HUD: money and health top-left, wanted stars and the minimap top-right,
// the mission tracker bottom-centre, the speedometer bottom-right, a centre
// banner for messages, and the title, pause, wasted, busted and story-complete
// screens that frame the game.
import { drawMinimap } from './minimap.js';
import { MISSION_DEFS, nextMissionDef, nextMissionAvailable } from './missions.js';
import { MAX_WANTED } from './config.js';

const STAR = '★';

export function drawHud(ctx, state) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const player = state.player;

  // --- Top left: money, health, weapon, and the car's health while driving.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(10,14,26,0.72)';
  roundRectFill(ctx, 12, 12, 250, 84, 10);
  ctx.fillStyle = '#7ac86a';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`$${player.money.toLocaleString('en-US')}`, 26, 42);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Jay Cruz  •  ${player.weapon === 'pistol' ? `Pistol ${player.ammo} ammo` : 'Fists'}`, 26, 62);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(26, 68, 200, 12);
  ctx.fillStyle = player.health > 30 ? '#7ac86a' : '#ff6a5a';
  ctx.fillRect(26, 68, 200 * Math.max(0, player.health / 100), 12);
  if (player.car) {
    ctx.fillStyle = '#20242e';
    ctx.fillRect(26, 84, 200, 6);
    ctx.fillStyle = '#5a8fd9';
    ctx.fillRect(26, 84, 200 * Math.max(0, player.car.hp / 100), 6);
  }

  // --- Top right: wanted stars above the minimap.
  const mapSize = 190;
  const mapX = w - mapSize - 18;
  const mapY = 52;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10,14,26,0.72)';
  roundRectFill(ctx, mapX - 8, 12, mapSize + 16, 30, 10);
  let stars = '';
  for (let i = 0; i < MAX_WANTED; i++) stars += i < state.wanted ? STAR : '☆';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = state.wanted > 0 ? '#ffcf3a' : '#5a6278';
  ctx.fillText(stars, w - 26, 36);
  drawMinimap(ctx, state, mapX, mapY, mapSize);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLARA CITY', mapX + mapSize / 2, mapY + mapSize + 16);

  // --- Bottom centre: the mission tracker.
  const objective = currentObjective(state);
  if (objective) {
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, objective, 560);
    const boxH = 34 + lines.length * 18;
    ctx.fillStyle = 'rgba(10,14,26,0.72)';
    roundRectFill(ctx, w / 2 - 300, h - boxH - 16, 600, boxH, 10);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(objectiveTitle(state), w / 2, h - boxH + 4);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h - boxH + 24 + i * 18));
  }

  // --- Bottom left: the controls hint.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(
    player.onFoot
      ? 'WASD move • Shift run • E steal car • F punch / click shoot • P pause'
      : 'WASD drive • Space handbrake • E get out • P pause',
    14, h - 14,
  );

  // --- Speedometer, only while driving.
  if (player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(`${kmh}`, w - 24, h - 44);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('km/h', w - 24, h - 26);
  }

  // --- The mission countdown, red when it gets tight (under 15 seconds).
  if (state.mission && state.mission.timer > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = state.mission.timer < 15 ? '#ff6a5a' : '#fff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(formatTime(state.mission.timer), w / 2, 64);
  }

  // --- Distance to the target, plus an edge arrow when it is off screen.
  const target = state.mission?.target || state.taxi?.target;
  if (target) {
    const dist = Math.hypot(player.x - target.x, player.y - target.y);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${target.name} — ${Math.round(dist)}m`, w / 2, 88);
    drawOffscreenArrow(ctx, state, target);
  }

  // --- Centre message banner.
  if (state.message && state.message.t > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px system-ui, sans-serif';
    const msg = state.message.text;
    const mw = ctx.measureText(msg).width + 36;
    ctx.fillStyle = 'rgba(10,14,26,0.78)';
    roundRectFill(ctx, w / 2 - mw / 2, 108, mw, 34, 10);
    ctx.fillStyle = state.message.color || '#fff';
    ctx.fillText(msg, w / 2, 131);
  }

  // --- Hurt vignette, and the "break free" warning while a bust is near.
  if (player.hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,30,30,${player.hurtFlash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (player.bustedTimer > 0 && state.screen === 'play') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6a5a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('THE COPS HAVE YOU — BREAK FREE!', w / 2, h / 2 - 120);
  }
}

function currentObjective(state) {
  if (state.mission) return state.mission.objective;
  if (state.taxi) return `Taxi fare: take your passenger to ${state.taxi.target.name}`;
  if (nextMissionAvailable(state)) {
    const def = nextMissionDef(state);
    return `Free roam — drive to the M marker to start: ${def.title} ($${def.reward})`;
  }
  return 'Solara City is yours. Free roam — fares, stashes and the open road.';
}

function objectiveTitle(state) {
  if (state.mission) return `MISSION: ${state.mission.def.title.toUpperCase()}`;
  if (state.taxi) return 'TAXI FARE';
  return 'SOLARA CITY';
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawOffscreenArrow(ctx, state, target) {
  const cam = state.camera;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const sx = (target.x - cam.x) * cam.zoom + w / 2;
  const sy = (target.y - cam.y) * cam.zoom + h / 2;
  if (sx > 60 && sx < w - 60 && sy > 60 && sy < h - 60) return;
  const cx = Math.max(40, Math.min(w - 40, sx));
  const cy = Math.max(40, Math.min(h - 40, sy));
  const angle = Math.atan2(sy - h / 2, sx - w / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = target.color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// --- Screens: title, pause, wasted, busted, story complete. ---
export function drawTitleScreen(ctx, state) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const save = state.save;
  // A sunset gradient sky over a dark city silhouette.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2a1a4a');
  grad.addColorStop(0.45, '#c95a4a');
  grad.addColorStop(0.75, '#e8a04c');
  grad.addColorStop(1, '#ffd76a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f0e8d0';
  ctx.beginPath();
  ctx.arc(w * 0.86, h * 0.18, 58, 0, Math.PI * 2);
  ctx.fill();
  // Skyline.
  ctx.fillStyle = '#241a33';
  const skyline = [120, 200, 150, 260, 180, 230, 300, 170, 210, 140, 250, 190, 160, 220, 130];
  let x = 0;
  for (const bh of skyline) {
    ctx.fillRect(x, h - 180 - bh, 86, 180 + bh);
    x += 88;
  }
  ctx.fillStyle = 'rgba(255,215,106,0.85)';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(20 + ((i * 173) % (w - 40)), h - 160 + ((i * 97) % 140), 4, 6);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('SOLARA CITY', w / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText('An open-world story in the sun — drive, steal, run, survive.', w / 2, 192);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  const menuY = 300;
  const items = [
    save ? `CONTINUE — ${nextMissionAvailable(state) ? `Mission ${state.progress.missionIndex + 1} of ${MISSION_DEFS.length}: ${nextMissionDef(state).title}` : 'Story complete — free roam'}` : 'NEW GAME — Jay Cruz takes his first job',
    'FREE ROAM — explore Solara City, fares and stashes',
    'HOW TO PLAY — WASD move/drive • E steal car • F punch • click shoot • Space handbrake • P pause • M mute',
  ];
  items.forEach((item, i) => {
    const selected = state.menuIndex === i;
    ctx.fillStyle = selected ? '#ffd76a' : 'rgba(255,255,255,0.92)';
    ctx.font = selected ? 'bold 19px system-ui, sans-serif' : '17px system-ui, sans-serif';
    ctx.fillText((selected ? '▶ ' : '   ') + item, w / 2, menuY + i * 40);
  });
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Up/Down to choose • Enter to start • Missions, wanted level, police, traffic and a living city await.', w / 2, menuY + 150);
  ctx.fillText('A fully original game. Solara City, Jay Cruz and the Kestrel crew are invented here — nothing borrowed.', w / 2, menuY + 176);
  if (save) {
    ctx.fillText(`Saved: $${(save.money || 0).toLocaleString('en-US')} • ${save.completed?.length || 0} missions done • ${save.stashes?.length || 0}/10 stashes`, w / 2, menuY + 202);
  }
}

export function drawPauseScreen(ctx, state) {
  dimScreen(ctx);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 60);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('Progress is saved automatically after every mission, fare and stash.', w / 2, h / 2 - 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(`Money $${state.player.money.toLocaleString('en-US')}  •  Missions ${state.progress.completed.length}/${MISSION_DEFS.length}  •  Stashes ${state.progress.stashes.length}/10  •  Cars stolen ${state.stats.carsStolen}  •  Fares ${state.stats.fares}`, w / 2, h / 2 + 22);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('P / Esc resume  •  M mute  •  Enter: quit to title', w / 2, h / 2 + 60);
}

export function drawEndScreen(ctx, state, kind) {
  dimScreen(ctx);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#3a6aff' : '#ff6a5a';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', w / 2, h / 2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(
    kind === 'busted'
      ? 'The Solara City PD hauled you in. Marta posts bail — you keep your money, lose the heat.'
      : 'Jay went down hard. The city keeps moving. You keep your money, lose the heat.',
    w / 2, h / 2 + 4,
  );
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`Money $${state.player.money.toLocaleString('en-US')}  •  Missions ${state.progress.completed.length}/${MISSION_DEFS.length}  •  Enter to keep playing`, w / 2, h / 2 + 44);
}

export function drawStoryCompleteScreen(ctx, state) {
  dimScreen(ctx);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('KING OF SOLARA', w / 2, h / 2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Every job done. The Kestrels are gone, Marta runs the city, and Jay Cruz owns the road.', w / 2, h / 2 + 4);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`Final take $${state.player.money.toLocaleString('en-US')}  •  Enter to keep playing in free roam`, w / 2, h / 2 + 44);
}

function dimScreen(ctx) {
  ctx.fillStyle = 'rgba(8,10,20,0.72)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
