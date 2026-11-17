// The heat: the wanted level, the police interceptors that chase the player,
// and the officers on foot who try to make an arrest. The Kestrel crew's
// street muscle lives here too — the mission's rivals are officers of a
// different kind, and they share the same gunfight brain.
import {
  POLICE_SPEED, MAX_WANTED, WANTED_DECAY_SECONDS, POLICE_PER_STAR,
  PISTOL_RANGE,
} from './config.js';
import { makeCar, driveCar, spawnSparks } from './vehicles.js';
import { hurtPlayer } from './player.js';

export function setWanted(state, level) {
  state.wanted = Math.max(0, Math.min(MAX_WANTED, level));
  state.wantedTimer = 0;
}

export function addWanted(state, amount) {
  setWanted(state, state.wanted + amount);
}

export function updateWanted(state, dt) {
  // The heat only cools while no cop can see the player.
  const nearestCop = nearestCopDistance(state);
  if (state.wanted > 0 && nearestCop > 700) {
    state.wantedTimer += dt;
    if (state.wantedTimer > WANTED_DECAY_SECONDS) {
      state.wanted -= 1;
      state.wantedTimer = 0;
      state.message = { text: state.wanted === 0 ? 'You lost them.' : 'Heat dropping…', t: 2, color: '#7ac86a' };
    }
  } else {
    state.wantedTimer = 0;
  }
  // Keep the street stocked with the wanted level's share of interceptors.
  const want = POLICE_PER_STAR[state.wanted] || 0;
  const have = state.cars.filter((c) => c.driver === 'police' && !c.removed).length;
  state.policeSpawnTimer -= dt;
  if (have < want && state.policeSpawnTimer <= 0) {
    spawnPoliceCar(state);
    state.policeSpawnTimer = 1.2;
  }
  // Officers on foot once the heat hits 2 stars and the player is walking.
  const wantOfficers = state.wanted >= 2 && state.player.onFoot ? Math.min(3, state.wanted) : 0;
  if (state.cops.length < wantOfficers && state.policeSpawnTimer <= 0) {
    spawnOfficer(state);
    state.policeSpawnTimer = 2;
  }
  // When the heat is gone, far-away units quietly leave the map.
  if (state.wanted === 0) {
    for (const car of state.cars) {
      if (car.driver === 'police' && nearestCopDistance(state) > 1600) car.removed = true;
    }
    if (state.cops.length > 0 && nearestCopDistance(state) > 1200) state.cops = [];
  }
  state.audio.setSiren(state.wanted > 0, state.time);
}

function nearestCopDistance(state) {
  const p = state.player;
  let best = Infinity;
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.removed) continue;
    best = Math.min(best, Math.hypot(car.x - p.x, car.y - p.y));
  }
  for (const cop of state.cops) best = Math.min(best, Math.hypot(cop.x - p.x, cop.y - p.y));
  return best;
}

function spawnPoliceCar(state) {
  const p = state.player;
  // Appear on a road somewhere ahead of the player's direction of travel.
  const angle = state.rng.range(0, Math.PI * 2);
  const dist = state.rng.range(700, 1000);
  let x = p.x + Math.sin(angle) * dist;
  let y = p.y - Math.cos(angle) * dist;
  x = state.city.nearestRoadCoord(x);
  y = state.city.nearestRoadCoord(y);
  const car = makeCar(x, y, state.rng.range(0, Math.PI * 2), 'police', 'police');
  car.targetSpeed = POLICE_SPEED;
  state.cars.push(car);
  return car;
}

function spawnOfficer(state) {
  const p = state.player;
  const angle = state.rng.range(0, Math.PI * 2);
  const x = p.x + Math.sin(angle) * 420;
  const y = p.y - Math.cos(angle) * 420;
  if (state.city.isBlocked(x, y, 10)) return;
  state.cops.push({
    x, y, angle, hp: 60, speed: 240,
    arrest: 0, shootCooldown: state.rng.range(0.5, 1.5),
    shirt: '#20242e', pants: '#20242e', skin: '#c98a5a',
  });
}

export function updatePoliceCars(state, dt) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.removed) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const dist = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dx, -dy);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.6));
    // Ram the player; ease off only when right on top of them, so the
    // interceptor does not overshoot and spin past its target every pass.
    let throttle = 1;
    if (dist < 60) throttle = 0.4;
    if (Math.abs(diff) > 1.2) throttle = 0.5;
    const prevSpeed = car.speed;
    driveCar(car, steer, throttle, dt, state.city);
    if (car.hp <= 0) {
      car.removed = true;
      state.stats.copsDown = (state.stats.copsDown || 0) + 1;
      spawnSparks(state, car.x, car.y, 14);
      state.particles.push({
        x: car.x, y: car.y, vx: 0, vy: 0,
        life: 0.8, maxLife: 0.8, color: '#ff8a3a', size: 46, kind: 'blast',
      });
      addWanted(state, 1);
      continue;
    }
    // A ram is one hit, not a per-frame grind: each interceptor has a
    // cooldown between hits on the player's car.
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    if (p.car === car) continue;
    if (p.car && car.ramCooldown <= 0 && Math.hypot(car.x - p.car.x, car.y - p.car.y) < 52 && Math.abs(prevSpeed) > 200) {
      car.ramCooldown = 1.0;
      hurtPlayer(state, 4, 'ram');
      state.camera.shake = Math.max(state.camera.shake, 5);
      state.audio.crash(0.4);
    }
  }
}

export function updateOfficers(state, dt) {
  const p = state.player;
  for (const cop of state.cops) {
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dx, -dy);
    if (dist < 30) {
      // Hands on the player: hold still and the bust timer runs.
      cop.arrest += dt;
      p.bustedTimer += dt;
      if (p.bustedTimer > 1.6) {
        state.screen = 'busted';
        state.audio.busted();
      }
    } else {
      cop.arrest = 0;
      const speed = cop.speed * (dist > 300 ? 1.15 : 1);
      const nx = cop.x + Math.sin(cop.angle) * speed * dt;
      const ny = cop.y - Math.cos(cop.angle) * speed * dt;
      if (!state.city.isBlocked(nx, ny, 10)) {
        cop.x = nx;
        cop.y = ny;
      }
    }
    // Officers fire when the player is armed and at range.
    cop.shootCooldown -= dt;
    if (cop.shootCooldown <= 0 && dist < PISTOL_RANGE * 0.8 && dist > 90 && p.onFoot) {
      cop.shootCooldown = state.rng.range(1.2, 2.2);
      state.audio.gunshot();
      state.particles.push({
        x: cop.x, y: cop.y, vx: 0, vy: 0,
        life: 0.1, maxLife: 0.1, color: '#ffd76a', size: 6, kind: 'muzzle',
      });
      if (state.rng.chance(0.45)) hurtPlayer(state, 8, 'shot');
    }
  }
  if (p.onFoot) {
    let near = false;
    for (const cop of state.cops) {
      if (Math.hypot(cop.x - p.x, cop.y - p.y) < 40) { near = true; break; }
    }
    if (!near) p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
  } else {
    p.bustedTimer = 0;
  }
}

// --- Rivals: the Kestrel crew's street muscle, the Payback mission's muscle. ---
export function spawnRival(state, x, y) {
  const rival = {
    x, y, angle: state.rng.range(0, Math.PI * 2),
    hp: 70, speed: 150,
    shootCooldown: state.rng.range(0.5, 1.5),
    shirt: '#7a2a3a', pants: '#2e3440', skin: state.rng.pick(['#e8b88a', '#c98a5a', '#8a5a3d']),
    strafe: state.rng.range(0, Math.PI * 2),
  };
  state.rivals.push(rival);
  return rival;
}

export function updateRivals(state, dt) {
  const p = state.player;
  for (const rival of state.rivals) {
    const dx = p.x - rival.x;
    const dy = p.y - rival.y;
    const dist = Math.hypot(dx, dy);
    rival.angle = Math.atan2(dx, -dy);
    rival.strafe += dt;
    // Hold a gunfight's distance and strafe sideways while shooting.
    const want = 260;
    const move = dist > want + 40 ? 1 : dist < want - 40 ? -1 : 0;
    const strafeDir = Math.sin(rival.strafe) > 0 ? 1 : -1;
    const mx = Math.sin(rival.angle) * move + Math.cos(rival.angle) * strafeDir * 0.5;
    const my = -Math.cos(rival.angle) * move + Math.sin(rival.angle) * strafeDir * 0.5;
    const len = Math.hypot(mx, my) || 1;
    const nx = rival.x + (mx / len) * rival.speed * dt;
    const ny = rival.y + (my / len) * rival.speed * dt;
    if (!state.city.isBlocked(nx, ny, 10)) {
      rival.x = nx;
      rival.y = ny;
    }
    rival.shootCooldown -= dt;
    if (rival.shootCooldown <= 0 && dist < PISTOL_RANGE) {
      rival.shootCooldown = state.rng.range(1.0, 2.0);
      state.audio.gunshot();
      state.particles.push({
        x: rival.x, y: rival.y, vx: 0, vy: 0,
        life: 0.1, maxLife: 0.1, color: '#ffd76a', size: 6, kind: 'muzzle',
      });
      if (state.rng.chance(0.35)) hurtPlayer(state, 7, 'shot');
    }
  }
}
