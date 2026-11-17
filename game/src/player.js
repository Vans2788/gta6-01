// The player: Jay Cruz, on foot and behind the wheel. Walking and running,
// punching and shooting, stealing cars and getting in and out of them —
// everything Jay does with his own hands lives in this file.
import {
  WALK_SPEED, RUN_SPEED, PLAYER_RADIUS, PUNCH_RANGE, PUNCH_DAMAGE,
  PISTOL_DAMAGE, PISTOL_RANGE, CAR_HEALTH,
} from './config.js';
import { driveCar, spawnSparks, spawnSmoke } from './vehicles.js';
import { scarePeds } from './pedestrians.js';
import {
  ACTION_UP, ACTION_DOWN, ACTION_LEFT, ACTION_RIGHT, ACTION_ENTER_CAR,
  ACTION_ATTACK, ACTION_BRAKE, ACTION_RUN,
} from './input.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: 0, speed: 0,
    onFoot: true,
    car: null,
    health: 100,
    money: 0,
    weapon: 'fists', // 'fists' | 'pistol'
    ammo: 0,
    punchCooldown: 0,
    shootCooldown: 0,
    hurtFlash: 0,
    walkPhase: 0,
    bustedTimer: 0,
  };
}

export function hurtPlayer(state, damage, source) {
  const player = state.player;
  if (player.health <= 0) return;
  player.health -= damage;
  player.hurtFlash = 0.5;
  if (player.health <= 0) {
    player.health = 0;
    state.screen = 'over';
    state.audio.missionFail();
  }
}

function nearestStealableCar(state) {
  let best = null;
  let bestD = 70;
  for (const car of state.cars) {
    if (car.removed || car.driver === 'player') continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(state, car) {
  const player = state.player;
  if (car.driver === 'traffic') {
    // Yank the driver out: a crime, and the whole street notices.
    state.wanted = Math.min(5, state.wanted + 1);
    state.wantedTimer = 0;
    state.stats.carsStolen += 1;
    state.message = { text: `Stole a ${car.name}!`, t: 2.5, color: '#ffd76a' };
    state.audio.horn();
    scarePeds(state, car.x, car.y, 240);
  } else if (car.driver === 'parked') {
    // A parked car is fair game — unless somebody is watching.
    state.stats.carsStolen += 1;
    const witness = state.peds.some((p) => !p.dead && Math.hypot(p.x - car.x, p.y - car.y) < 350)
      || state.cops.some((c) => Math.hypot(c.x - car.x, c.y - car.y) < 350);
    if (witness) {
      state.wanted = Math.min(5, state.wanted + 1);
      state.wantedTimer = 0;
      state.message = { text: `Stole a ${car.name} — spotted!`, t: 2.5, color: '#ff6a5a' };
      scarePeds(state, car.x, car.y, 240);
    }
  }
  car.driver = 'player';
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
}

function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  const side = player.angle + Math.PI / 2;
  const px = car.x + Math.sin(side) * 34;
  const py = car.y - Math.cos(side) * 34;
  player.x = state.city.isBlocked(px, py, PLAYER_RADIUS) ? car.x - Math.sin(side) * 34 : px;
  player.y = state.city.isBlocked(px, py, PLAYER_RADIUS) ? car.y + Math.cos(side) * 34 : py;
  player.onFoot = true;
  player.car = null;
}

function punch(state) {
  const player = state.player;
  // A 0.3 s swing keeps fists snappy without letting one tap stun-lock a cop.
  player.punchCooldown = 0.3;
  state.audio.punch();
  const fx = Math.sin(player.angle);
  const fy = -Math.cos(player.angle);
  // A pedestrian, a rival or a cop standing in front of you takes the hit.
  const targets = [
    ...state.peds.filter((p) => !p.dead),
    ...state.rivals,
    ...state.cops,
  ];
  for (const t of targets) {
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < PUNCH_RANGE && (dx * fx + dy * fy) > -10) {
      damageTarget(state, t, PUNCH_DAMAGE, 'punch');
      return;
    }
  }
  // Or smash a parked car's window: the alarm goes off (wanted +1).
  for (const car of state.cars) {
    if (car.removed || car.driver === 'player') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < 46) {
      car.hp -= 8;
      spawnSparks(state, player.x + fx * 24, player.y + fy * 24, 5);
      if (car.hp < CAR_HEALTH - 8 && state.wanted === 0) {
        state.wanted = 1;
        state.wantedTimer = 0;
      }
      return;
    }
  }
}

function shoot(state, input) {
  const player = state.player;
  if (player.ammo <= 0) {
    player.weapon = 'fists';
    state.message = { text: 'Out of ammo — fists it is.', t: 2, color: '#ffd76a' };
    return;
  }
  player.ammo -= 1;
  player.shootCooldown = 0.28;
  state.audio.gunshot();
  // Aim at the mouse: screen space back into world space through the camera.
  const cam = state.camera;
  const wx = cam.x + (input.mouse.x - cam.viewW / 2) / cam.zoom;
  const wy = cam.y + (input.mouse.y - cam.viewH / 2) / cam.zoom;
  const aimAngle = Math.atan2(wx - player.x, -(wy - player.y));
  player.angle = aimAngle;
  const fx = Math.sin(aimAngle);
  const fy = -Math.cos(aimAngle);
  state.particles.push({
    x: player.x + fx * 26, y: player.y + fy * 26,
    vx: fx * 900, vy: fy * 900, life: 0.09, maxLife: 0.09,
    color: '#ffe9a0', size: 3, kind: 'tracer',
  });
  state.particles.push({
    x: player.x + fx * 30, y: player.y + fy * 30,
    vx: 0, vy: 0, life: 0.12, maxLife: 0.12,
    color: '#ffd76a', size: 7, kind: 'muzzle',
  });
  // The first thing the bullet meets inside range takes the hit.
  let best = null;
  let bestD = PISTOL_RANGE;
  const targets = [
    ...state.peds.filter((p) => !p.dead).map((p) => ({ t: p, kind: 'ped' })),
    ...state.rivals.map((r) => ({ t: r, kind: 'rival' })),
    ...state.cops.map((c) => ({ t: c, kind: 'cop' })),
  ];
  for (const { t } of targets) {
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const along = dx * fx + dy * fy;
    if (along < 0 || along > bestD) continue;
    const side = Math.abs(dx * fy - dy * fx);
    if (side < 18) { best = t; bestD = along; }
  }
  if (best) {
    damageTarget(state, best, PISTOL_DAMAGE, 'shot');
    state.particles.push({
      x: best.x, y: best.y, vx: 0, vy: 0,
      life: 0.4, maxLife: 0.4, color: '#c03a3a', size: 8, kind: 'blood',
    });
  } else {
    // A miss sparks where the bullet lands.
    spawnSparks(state, player.x + fx * PISTOL_RANGE, player.y + fy * PISTOL_RANGE, 4);
  }
  if (state.wanted < 2) {
    state.wanted = 2;
    state.wantedTimer = 0;
  }
  scarePeds(state, player.x, player.y, 420);
}

export function damageTarget(state, target, damage, kind) {
  if (target.hp === undefined) target.hp = 50;
  target.hp -= damage;
  if (target.hp <= 0) {
    if (state.rivals.includes(target)) {
      state.stats.kills += 1;
      state.rivals = state.rivals.filter((r) => r !== target);
      state.message = { text: 'Rival down.', t: 1.5, color: '#ffd76a' };
      if (state.mission) state.mission.onRivalDown?.(state);
    } else if (state.cops.includes(target)) {
      state.stats.kills += 1;
      state.cops = state.cops.filter((c) => c !== target);
      state.wanted = Math.min(5, state.wanted + 1);
      state.wantedTimer = 0;
    } else {
      // A pedestrian.
      target.dead = true;
      target.deadTimer = 6;
      state.stats.pedsHit += 1;
      if (kind === 'shot' || kind === 'punch') {
        state.wanted = Math.min(5, state.wanted + 1);
        state.wantedTimer = 0;
      }
    }
  }
}

export function updatePlayer(state, input, dt) {
  const player = state.player;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  player.crashCooldown = Math.max(0, (player.crashCooldown || 0) - dt);

  if (!player.onFoot && player.car) {
    const car = player.car;
    const steer = (input.held(ACTION_LEFT) ? -1 : 0) + (input.held(ACTION_RIGHT) ? 1 : 0);
    let throttle = 0;
    if (input.held(ACTION_UP)) throttle = 1;
    if (input.held(ACTION_DOWN)) throttle = -1;
    if (input.held(ACTION_BRAKE)) {
      if (Math.abs(car.speed) > 30) {
        car.speed -= Math.sign(car.speed) * CAR_BRAKE * dt * 0.5;
      } else {
        car.speed = 0;
      }
      if (Math.abs(car.speed) > 200 && state.rng.chance(0.5)) {
        state.particles.push({
          x: car.x - Math.sin(car.angle) * 20 + state.rng.range(-12, 12),
          y: car.y + Math.cos(car.angle) * 20 + state.rng.range(-12, 12),
          vx: 0, vy: 0, life: 0.5, maxLife: 0.5,
          color: 'rgba(200,200,210,0.35)', size: 6, kind: 'smoke',
        });
      }
    }
    const prevSpeed = car.speed;
    driveCar(car, steer, throttle, dt, state.city);
    if (Math.abs(car.speed - prevSpeed) > 200 && Math.abs(prevSpeed) > 200 && player.crashCooldown <= 0) {
      player.crashCooldown = 0.6;
      state.audio.crash(Math.abs(prevSpeed) / 500);
      state.camera.shake = Math.min(10, Math.abs(prevSpeed) / 60);
      hurtPlayer(state, Math.abs(prevSpeed) * 0.02, 'crash');
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (car.hp <= 0) {
      spawnSmoke(state, car.x, car.y);
      if (state.rng.chance(0.06)) {
        // The car blows: get out before it does.
        state.particles.push({
          x: car.x, y: car.y, vx: 0, vy: 0,
          life: 0.7, maxLife: 0.7, color: '#ff8a3a', size: 40, kind: 'blast',
        });
        hurtPlayer(state, 30, 'explosion');
        car.removed = true;
        exitCar(state);
      }
    }
    if (input.pressed(ACTION_ENTER_CAR)) exitCar(state);
    state.audio.setEngine(Math.abs(car.speed) / 560, true);
    return;
  }

  // On foot.
  let mx = (input.held(ACTION_RIGHT) ? 1 : 0) - (input.held(ACTION_LEFT) ? 1 : 0);
  let my = (input.held(ACTION_DOWN) ? 1 : 0) - (input.held(ACTION_UP) ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    const speed = input.held(ACTION_RUN) ? RUN_SPEED : WALK_SPEED;
    const nx = player.x + mx * speed * dt;
    const ny = player.y + my * speed * dt;
    if (!state.city.isBlocked(nx, player.y, PLAYER_RADIUS)) player.x = nx;
    if (!state.city.isBlocked(player.x, ny, PLAYER_RADIUS)) player.y = ny;
    player.angle = Math.atan2(mx, -my);
    player.walkPhase += dt * speed * 0.05;
  }
  if (input.pressed(ACTION_ENTER_CAR)) {
    const car = nearestStealableCar(state);
    if (car) enterCar(state, car);
  }
  if (input.pressed(ACTION_ATTACK) && player.punchCooldown <= 0) {
    if (player.weapon === 'pistol') {
      if (player.shootCooldown <= 0) shoot(state, input);
    } else {
      punch(state);
    }
  }
  // Weapon swaps happen by picking up ammo (auto-equips the pistol); F with
  // a pistol shoots, with fists it punches. Keep it simple.
  state.audio.setEngine(0, false);
}
