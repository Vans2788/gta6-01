// Pedestrians: they amble along the sidewalks, pause at corners, and scatter
// when a gun goes off or a car comes at them too fast. Each one carries a
// shirt, a pace, and a little patience before it picks a new corner to visit.
import { WORLD_H, WORLD_W, ROAD_AT, GRID_N } from './config.js';

const SHIRT_COLORS = ['#e86a6a', '#6aa8e8', '#7ac86a', '#e8c85a', '#c86ae8', '#e8e8e8', '#5ac8c8', '#e89a5a'];
const PANTS_COLORS = ['#2e3440', '#3d4457', '#4a3d55', '#5a4a3d', '#24303e'];

let nextPedId = 1;

export function makePed(x, y, rng) {
  return {
    id: nextPedId++,
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(38, 62),
    target: null,
    shirt: rng.pick(SHIRT_COLORS),
    pants: rng.pick(PANTS_COLORS),
    skin: rng.pick(['#e8b88a', '#c98a5a', '#8a5a3d', '#f0c8a0']),
    wait: rng.range(0, 3),
    flee: 0,
    dead: false,
    walkPhase: rng.range(0, Math.PI * 2),
  };
}

export function spawnPedestrians(state, rng, count) {
  for (let i = 0; i < count; i++) {
    const ix = rng.int(0, GRID_N - 1);
    const iy = rng.int(0, GRID_N - 1);
    // Just off a road, hugging a block edge: the sidewalk. The offset 52 is
    // the road half-width (38) plus a 14-pixel kerb, so peds walk on pavement.
    const x = ROAD_AT(ix) + rng.pick([-52, 52]) + rng.range(-60, 60);
    const y = ROAD_AT(iy) + rng.pick([-52, 52]) + rng.range(-60, 60);
    if (state.city.isBlocked(x, y, 6)) continue;
    state.peds.push(makePed(x, y, rng));
  }
}

function pickTarget(ped, state) {
  const ix = state.city.roadIndex(ped.x);
  const iy = state.city.roadIndex(ped.y);
  const side = state.rng.pick([-52, 52]);
  if (state.rng.chance(0.5)) {
    return { x: ROAD_AT(ix) + side, y: ped.y + state.rng.range(-260, 260) };
  }
  return { x: ped.x + state.rng.range(-260, 260), y: ROAD_AT(iy) + side };
}

export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    const dx = ped.x - x;
    const dy = ped.y - y;
    const d = Math.hypot(dx, dy);
    if (d < radius) {
      ped.flee = state.rng.range(1.5, 3);
      ped.target = { x: ped.x + (dx / (d || 1)) * 260, y: ped.y + (dy / (d || 1)) * 260 };
    }
  }
}

export function updatePedestrians(state, dt) {
  const player = state.player;
  for (const ped of state.peds) {
    if (ped.dead) {
      ped.deadTimer -= dt;
      continue;
    }
    ped.walkPhase += dt * 8;
    if (ped.flee > 0) {
      ped.flee -= dt;
      if (!ped.target) ped.target = pickTarget(ped, state);
    } else if (ped.wait > 0) {
      ped.wait -= dt;
      if (ped.wait <= 0) ped.target = pickTarget(ped, state);
      continue;
    } else if (!ped.target) {
      ped.target = pickTarget(ped, state);
    }
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      ped.target = null;
      ped.wait = state.rng.range(1, 5);
      continue;
    }
    const speed = ped.flee > 0 ? ped.speed * 2.6 : ped.speed;
    ped.angle = Math.atan2(dx, -dy);
    const nx = ped.x + Math.sin(ped.angle) * speed * dt;
    const ny = ped.y - Math.cos(ped.angle) * speed * dt;
    if (!state.city.isBlocked(nx, ny, 6)) {
      ped.x = nx;
      ped.y = ny;
    } else {
      ped.target = pickTarget(ped, state);
    }
    ped.x = Math.max(30, Math.min(WORLD_W - 30, ped.x));
    ped.y = Math.max(30, Math.min(WORLD_H - 30, ped.y));
    // A fast car clipping a pedestrian: the crime that raises the heat.
    for (const car of state.cars) {
      if (car.removed || Math.abs(car.speed) < 90) continue;
      const cdx = ped.x - car.x;
      const cdy = ped.y - car.y;
      if (cdx * cdx + cdy * cdy < 26 * 26) {
        killPed(state, ped, car);
        break;
      }
    }
    // The player on foot just shoulders past; nobody falls over.
    if (player.onFoot) {
      const pdx = ped.x - player.x;
      const pdy = ped.y - player.y;
      if (pdx * pdx + pdy * pdy < 22 * 22) {
        ped.x += (pdx / 22) * 8;
        ped.y += (pdy / 22) * 8;
      }
    }
  }
  state.peds = state.peds.filter((p) => !p.dead || p.deadTimer > 0);
}

export function killPed(state, ped, cause) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadTimer = 6;
  state.stats.pedsHit += 1;
  scarePeds(state, ped.x, ped.y, 320);
  if (cause && cause.driver === 'player') {
    state.wanted = Math.min(5, state.wanted + 1);
    state.wantedTimer = 0;
    state.message = { text: 'Pedestrian hit! The heat is on.', t: 3, color: '#ff6a5a' };
  }
  state.particles.push({
    x: ped.x, y: ped.y, vx: 0, vy: 0,
    life: 0.6, maxLife: 0.6, color: '#c03a3a', size: 10, kind: 'blood',
  });
}
