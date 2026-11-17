// The world renderer: a top-down sun-soaked city painted on one canvas. The
// camera follows the player; the ground, roads, buildings, cars, people and
// effects are drawn in that order, every frame, with a cull so off-screen
// work is skipped.
import { WORLD_W, WORLD_H, ROAD_W, ROAD_AT, GRID_N, BLOCK } from './config.js';
import { districtAt } from './city.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    canvas, ctx,
    draw(state) {
      const cam = state.camera;
      const viewW = canvas.width;
      const viewH = canvas.height;
      cam.viewW = viewW;
      cam.viewH = viewH;
      ctx.save();
      ctx.fillStyle = '#0b0e1a';
      ctx.fillRect(0, 0, viewW, viewH);
      // Camera shake decays a little every frame.
      cam.shake = Math.max(0, cam.shake - 0.5);
      const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
      const sy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
      ctx.translate(viewW / 2 + sx, viewH / 2 + sy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      drawGround(ctx, state, cam);
      drawRoads(ctx, state, cam);
      drawParks(ctx, state, cam);
      drawBuildings(ctx, state, cam);
      drawStashes(ctx, state);
      drawMissionBeacon(ctx, state);
      drawCars(ctx, state);
      drawPeds(ctx, state);
      drawPlayer(ctx, state);
      drawParticles(ctx, state);
      ctx.restore();
    },
  };
}

function visible(cam, x, y, r) {
  const hw = cam.viewW / cam.zoom / 2 + r;
  const hh = cam.viewH / cam.zoom / 2 + r;
  return x > cam.x - hw && x < cam.x + hw && y > cam.y - hh && y < cam.y + hh;
}

function drawGround(ctx, state, cam) {
  // Base grass, then the beach and the sea along the south edge. The sea runs
  // past the world's edge so the camera never shows a flat void past the shore.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(cam.x - 800, cam.y - 600, 1600, 1200);
  ctx.fillStyle = '#e8d49a';
  ctx.fillRect(0, 3480, WORLD_W, 90);
  ctx.fillStyle = '#2a7fa8';
  ctx.fillRect(0, 3570, WORLD_W, 2000);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 24; i++) {
    const wx = ((i * 317) % WORLD_W) + Math.sin(state.time * 0.7 + i) * 12;
    ctx.fillRect(wx, 3570 + (i % 5) * 46, 90, 3);
  }
}

function drawRoads(ctx, state, cam) {
  // Asphalt bands with sidewalk edges, then centre dashes.
  ctx.fillStyle = '#3a3f4a';
  for (let i = 0; i < GRID_N; i++) {
    ctx.fillRect(0, ROAD_AT(i) - ROAD_W / 2, WORLD_W, ROAD_W);
    ctx.fillRect(ROAD_AT(i) - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  }
  ctx.fillStyle = '#4a4f5c';
  for (let i = 0; i < GRID_N; i++) {
    ctx.fillRect(0, ROAD_AT(i) - ROAD_W / 2 + 6, WORLD_W, 5);
    ctx.fillRect(0, ROAD_AT(i) + ROAD_W / 2 - 11, WORLD_W, 5);
    ctx.fillRect(ROAD_AT(i) - ROAD_W / 2 + 6, 0, 5, WORLD_H);
    ctx.fillRect(ROAD_AT(i) + ROAD_W / 2 - 11, 0, 5, WORLD_H);
  }
  // Centre dashes, skipped near intersections. Roads sit at 240 mod 320, so
  // a dash is dropped whenever its position falls within 60 px of a crossing.
  ctx.fillStyle = '#d8c85a';
  for (let i = 0; i < GRID_N; i++) {
    for (let d = 0; d < WORLD_W; d += 64) {
      const nearCross = Math.abs(((d % BLOCK) - 240 + BLOCK) % BLOCK) < 60;
      if (!nearCross) ctx.fillRect(d, ROAD_AT(i) - 2, 34, 4);
      if (!nearCross) ctx.fillRect(ROAD_AT(i) - 2, d, 4, 34);
    }
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240,240,240,0.55)';
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const x = ROAD_AT(i);
      const y = ROAD_AT(j);
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(x - ROAD_W / 2 + 8 + k * 14, y - ROAD_W / 2 - 4, 8, 8);
        ctx.fillRect(x - ROAD_W / 2 + 8 + k * 14, y + ROAD_W / 2 - 4, 8, 8);
      }
    }
  }
}

function drawParks(ctx, state, cam) {
  for (const park of state.city.parks) {
    if (!visible(cam, park.x + park.w / 2, park.y + park.h / 2, 200)) continue;
    ctx.fillStyle = '#5d9a4a';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#c8b88a';
    ctx.fillRect(park.x + park.w / 2 - 6, park.y, 12, park.h);
    ctx.fillRect(park.x, park.y + park.h / 2 - 6, park.w, 12);
  }
  for (const lot of state.city.lots) {
    if (!visible(cam, lot.x + lot.w / 2, lot.y + lot.h / 2, 200)) continue;
    ctx.fillStyle = '#555a66';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(240,240,240,0.5)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.strokeRect(lot.x + 14 + k * 44, lot.y + 16, 36, 60);
    }
  }
  for (const tree of state.city.trees) {
    if (!visible(cam, tree.x, tree.y, 40)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(tree.x + 4, tree.y + 5, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tree.shade;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(tree.x - 3, tree.y - 4, tree.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuildings(ctx, state, cam) {
  for (const b of state.city.buildings) {
    if (!visible(cam, b.x + b.w / 2, b.y + b.h / 2, 160)) continue;
    // Shadow, body, roof rim, windows, sign.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx + cy * 3 + b.windows) % 3 === 0) {
          ctx.fillRect(b.x + 10 + cx * 26, b.y + 10 + cy * 26, 12, 10);
        }
      }
    }
    if (b.sign) {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(b.x + b.w / 2 - 26, b.y - 8, 52, 16);
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y);
    }
  }
}

function drawStashes(ctx, state) {
  for (const stash of state.stashes) {
    if (stash.taken) continue;
    const bob = Math.sin(state.time * 3 + stash.id) * 3;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(stash.x, stash.y + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e7a3a';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', stash.x, stash.y + bob);
  }
}

function drawMissionBeacon(ctx, state) {
  const target = state.mission?.target || state.taxi?.target || state.nextMissionMarker;
  if (!target) return;
  const pulse = 1 + Math.sin(state.time * 4) * 0.15;
  ctx.strokeStyle = target.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = target.color;
  ctx.beginPath();
  ctx.moveTo(target.x, target.y - 46);
  ctx.lineTo(target.x - 10, target.y - 26);
  ctx.lineTo(target.x + 10, target.y - 26);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeText(target.name, target.x, target.y - 56);
  ctx.fillText(target.name, target.x, target.y - 56);
}

function drawCarShape(ctx, car, state) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.length / 2 + 4, -car.width / 2 + 5, car.length, car.width);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 9);
  ctx.fill();
  // Roof and windows.
  ctx.fillStyle = 'rgba(20,26,40,0.85)';
  roundRect(ctx, -car.length / 2 + 12, -car.width / 2 + 7, car.length - 26, car.width - 14, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,190,230,0.5)';
  ctx.fillRect(-car.length / 2 + 16, -car.width / 2 + 9, car.length - 34, 6);
  // Headlights and taillights.
  ctx.fillStyle = '#fff8c8';
  ctx.fillRect(-car.length / 2 + 2, -car.width / 2 + 3, 4, 7);
  ctx.fillRect(-car.length / 2 + 2, car.width / 2 - 10, 4, 7);
  ctx.fillStyle = '#d94040';
  ctx.fillRect(car.length / 2 - 6, -car.width / 2 + 3, 4, 7);
  ctx.fillRect(car.length / 2 - 6, car.width / 2 - 10, 4, 7);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.driver === 'police') {
    // A black-and-white interceptor with a flashing light bar.
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-car.length / 2 + 10, -car.width / 2 + 2, car.length - 20, 8);
    const flash = Math.sin(state.time * 10) > 0;
    ctx.fillStyle = flash ? '#ff3a3a' : '#3a6aff';
    ctx.fillRect(-8, -car.width / 2 - 2, 7, 5);
    ctx.fillStyle = flash ? '#3a6aff' : '#ff3a3a';
    ctx.fillRect(1, -car.width / 2 - 2, 7, 5);
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', 0, 12);
  }
  if (car.driver === 'player') {
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    roundRect(ctx, -car.length / 2 - 3, -car.width / 2 - 3, car.length + 6, car.width + 6, 11);
    ctx.stroke();
  }
  ctx.restore();
  // A wrecked car smokes.
  if (car.hp < 40 && !car.removed) {
    if (state.rng.chance(0.1)) {
      state.particles.push({
        x: car.x + state.rng.range(-10, 10), y: car.y + state.rng.range(-10, 10),
        vx: 0, vy: -30, life: 0.8, maxLife: 0.8,
        color: 'rgba(50,50,55,0.5)', size: 10, kind: 'smoke',
      });
    }
  }
}

function drawCars(ctx, state) {
  for (const car of state.cars) {
    if (car.removed) continue;
    if (!visible(state.camera, car.x, car.y, 90)) continue;
    drawCarShape(ctx, car, state);
  }
}

function drawPerson(ctx, x, y, angle, shirt, pants, skin, walkPhase, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  const bob = Math.sin(walkPhase) * 2;
  // Legs.
  ctx.fillStyle = pants;
  ctx.fillRect(-6 + bob, -4, 5, 12);
  ctx.fillRect(1 - bob, -4, 5, 12);
  // Body.
  ctx.fillStyle = shirt;
  roundRect(ctx, -8, -11, 16, 16, 5);
  ctx.fill();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -15, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = '#2a2118';
  ctx.beginPath();
  ctx.arc(0, -17, 6, Math.PI, 0);
  ctx.fill();
  if (isPlayer) {
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -4, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPeds(ctx, state) {
  for (const ped of state.peds) {
    if (ped.dead) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(0.6);
      ctx.fillStyle = ped.shirt;
      roundRect(ctx, -9, -5, 18, 10, 4);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(11, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (!visible(state.camera, ped.x, ped.y, 40)) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.skin, ped.walkPhase, false);
  }
  for (const cop of state.cops) {
    if (!visible(state.camera, cop.x, cop.y, 40)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#20242e', '#20242e', cop.skin, state.time * 8, false);
    ctx.fillStyle = '#3a6aff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', cop.x, cop.y - 26);
  }
  for (const rival of state.rivals) {
    if (!visible(state.camera, rival.x, rival.y, 40)) continue;
    drawPerson(ctx, rival.x, rival.y, rival.angle, '#7a2a3a', '#2e3440', rival.skin, state.time * 8, false);
    ctx.fillStyle = '#ff6a5a';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KESTREL', rival.x, rival.y - 26);
  }
}

function drawPlayer(ctx, state) {
  const player = state.player;
  if (!player.onFoot) return;
  drawPerson(ctx, player.x, player.y, player.angle, '#e8b64c', '#2e3440', '#c98a5a', player.walkPhase, true);
  if (player.weapon === 'pistol') {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(6, -2, 14, 4);
    ctx.restore();
  }
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'smoke') {
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'blast') {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.4 - alpha * 0.4), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'tracer') {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
