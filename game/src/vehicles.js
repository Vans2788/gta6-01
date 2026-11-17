// Cars: one arcade driving model shared by the player, traffic and police,
// the traffic AI that cruises the road grid, and the parked cars waiting to
// be stolen. A car's footprint is checked as three circles — nose, middle,
// tail — so it can scrape along a wall instead of wedging on a corner.
import {
  CAR_ACCEL, CAR_BRAKE, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN,
  CAR_HEALTH, TRAFFIC_SPEED, WORLD_W, WORLD_H, ROAD_AT, GRID_N,
} from './config.js';

export const CAR_TYPES = {
  sedan: { color: '#c8c8d0', accel: 1.0, top: 1.0, name: 'Sedan' },
  hatch: { color: '#e8b64c', accel: 0.95, top: 0.92, name: 'Hatchback' },
  coupe: { color: '#5a8fd9', accel: 1.1, top: 1.1, name: 'Coupe' },
  sport: { color: '#d94040', accel: 1.45, top: 1.35, name: 'Sportscar' },
  taxi: { color: '#f0c020', accel: 0.9, top: 0.9, name: 'Taxi' },
  van: { color: '#8a94a8', accel: 0.75, top: 0.8, name: 'Van' },
  truck: { color: '#7a6a55', accel: 0.7, top: 0.75, name: 'Truck' },
  police: { color: '#20242e', accel: 1.35, top: 1.28, name: 'Interceptor' },
};
const TRAFFIC_KINDS = ['sedan', 'hatch', 'coupe', 'sedan', 'taxi', 'van', 'truck', 'sedan'];

let nextCarId = 1;

export function makeCar(x, y, angle, type, driver) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: nextCarId++,
    x, y, angle, speed: 0,
    type, color: def.color, name: def.name,
    accelMul: def.accel, topMul: def.top,
    driver, // 'player' | 'traffic' | 'police' | 'parked'
    hp: CAR_HEALTH,
    length: type === 'truck' || type === 'van' ? 72 : 58,
    width: 34,
    route: null, routeIndex: 0, wait: 0, stuck: 0,
    targetSpeed: TRAFFIC_SPEED,
    smoke: 0, skid: 0,
    removed: false,
  };
}

// One arcade physics step. steer is -1..1, throttle -1..1.
export function driveCar(car, steer, throttle, dt, city) {
  const maxSpeed = CAR_MAX_SPEED * car.topMul;
  const accel = CAR_ACCEL * car.accelMul;
  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed -= CAR_BRAKE * dt;
    else car.speed -= accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 240 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = Math.max(-CAR_MAX_REVERSE, Math.min(maxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 220);
  car.angle += steer * CAR_TURN * speedFactor * Math.sign(car.speed || 1) * dt;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const ny = car.y - Math.cos(car.angle) * car.speed * dt;
  // Three circles along the car's spine: nose, centre, tail.
  const hx = Math.sin(car.angle);
  const hy = -Math.cos(car.angle);
  const carBlockedAt = (x, y) =>
    city.isBlocked(x + hx * 24, y + hy * 24, 15)
    || city.isBlocked(x, y, 15)
    || city.isBlocked(x - hx * 24, y - hy * 24, 15);
  if (!carBlockedAt(nx, ny)) {
    car.x = nx;
    car.y = ny;
  } else {
    // Scrape along the wall instead of stopping dead.
    if (!carBlockedAt(nx, car.y)) car.x = nx;
    else if (!carBlockedAt(car.x, ny)) car.y = ny;
    else if (Math.abs(car.speed) > 120) {
      car.hp -= Math.abs(car.speed) * 0.02;
      car.speed *= -0.25;
    } else {
      car.speed *= 0.5;
    }
  }
  car.x = Math.max(30, Math.min(WORLD_W - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD_H - 30, car.y));
}

function randomRoute(rng) {
  // A seven-point wander over the grid: pick a random intersection, then step
  // to a neighbouring one six times. Traffic never plans further than that —
  // it just needs somewhere to be going.
  const route = [];
  let ix = rng.int(0, GRID_N - 1);
  let iy = rng.int(0, GRID_N - 1);
  route.push({ x: ROAD_AT(ix), y: ROAD_AT(iy) });
  for (let i = 0; i < 6; i++) {
    if (rng.chance(0.5)) ix = Math.max(0, Math.min(GRID_N - 1, ix + rng.pick([-1, 1])));
    else iy = Math.max(0, Math.min(GRID_N - 1, iy + rng.pick([-1, 1])));
    route.push({ x: ROAD_AT(ix), y: ROAD_AT(iy) });
  }
  return route;
}

export function spawnTrafficCar(state, rng) {
  // Spawn on a road near the camera, never on top of the player.
  const cam = state.camera;
  for (let tries = 0; tries < 12; tries++) {
    const ix = rng.int(0, GRID_N - 1);
    const iy = rng.int(0, GRID_N - 1);
    const x = ROAD_AT(ix) + rng.range(-8, 8);
    const y = ROAD_AT(iy) + rng.range(-8, 8);
    const dx = x - cam.x;
    const dy = y - cam.y;
    if (dx * dx + dy * dy < 500 * 500) continue;
    if (dx * dx + dy * dy > 1400 * 1400) continue;
    const type = rng.pick(TRAFFIC_KINDS);
    const car = makeCar(x, y, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), type, 'traffic');
    car.route = randomRoute(rng);
    car.routeIndex = 0;
    car.targetSpeed = TRAFFIC_SPEED * rng.range(0.85, 1.1);
    state.cars.push(car);
    return car;
  }
  return null;
}

export function spawnParkedCars(state, rng) {
  // A car in most car parks, and a few kerbside: the ones to steal.
  for (const lot of state.city.lots) {
    if (!rng.chance(0.75)) continue;
    const type = rng.pick(['sedan', 'hatch', 'coupe', 'van', 'sport']);
    const car = makeCar(
      lot.x + lot.w / 2 + rng.range(-40, 40),
      lot.y + lot.h / 2 + rng.range(-30, 30),
      rng.pick([0, Math.PI / 2]),
      type, 'parked',
    );
    state.cars.push(car);
  }
  for (let i = 0; i < 14; i++) {
    const ix = rng.int(0, GRID_N - 1);
    const iy = rng.int(0, GRID_N - 1);
    const along = rng.chance(0.5);
    const x = along ? ROAD_AT(ix) + rng.range(120, 200) : ROAD_AT(ix) + 26;
    const y = along ? ROAD_AT(iy) + 26 : ROAD_AT(iy) + rng.range(120, 200);
    const type = rng.pick(['sedan', 'hatch', 'coupe', 'taxi', 'sport']);
    const car = makeCar(x, y, along ? Math.PI / 2 : 0, type, 'parked');
    state.cars.push(car);
  }
}

function carAhead(state, car, dist) {
  const fx = Math.sin(car.angle);
  const fy = -Math.cos(car.angle);
  let nearest = Infinity;
  for (const other of state.cars) {
    if (other === car || other.removed) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 0 || along > dist) continue;
    const side = Math.abs(dx * fy - dy * fx);
    if (side < 34 && along < nearest) nearest = along;
  }
  return nearest;
}

export function updateTrafficCar(state, car, dt) {
  if (!car.route || car.routeIndex >= car.route.length) {
    car.route = randomRoute(state.rng);
    car.routeIndex = 0;
  }
  const target = car.route[car.routeIndex];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) {
    car.routeIndex += 1;
    return;
  }
  const wantAngle = Math.atan2(dx, -dy);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 1;
  const ahead = carAhead(state, car, 130);
  if (ahead < 90) throttle = 0;
  if (ahead < 55) throttle = -0.6;
  // Ease off for a sharp turn.
  if (Math.abs(diff) > 0.9) throttle = Math.min(throttle, 0.35);
  const prevSpeed = car.speed;
  driveCar(car, steer, throttle, dt, state.city);
  if (Math.abs(car.speed) < 4 && Math.abs(prevSpeed) < 4) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 4) {
    car.route = randomRoute(state.rng);
    car.routeIndex = 0;
    car.stuck = 0;
  }
}

// A soft push between overlapping cars, so traffic jams and police rams feel
// physical instead of letting two cars occupy the same paint.
export function resolveCarCollisions(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.removed) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.removed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 160) {
          a.hp -= impact * 0.02;
          b.hp -= impact * 0.02;
          state.audio.crash(impact / 500);
          spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
        }
        // Blend a little speed along the push.
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.6 + a.speed * 0.4;
        b.speed = avg * 0.6 + b.speed * 0.4;
      }
    }
  }
}

export function spawnSparks(state, x, y, n) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x, y,
      vx: state.rng.range(-120, 120), vy: state.rng.range(-120, 120),
      life: state.rng.range(0.2, 0.5), maxLife: 0.5,
      color: '#ffd76a', size: state.rng.range(2, 4), kind: 'spark',
    });
  }
}

export function spawnSmoke(state, x, y) {
  state.particles.push({
    x, y,
    vx: state.rng.range(-20, 20), vy: state.rng.range(-40, -10),
    life: state.rng.range(0.6, 1.1), maxLife: 1.1,
    color: 'rgba(60,60,70,0.5)', size: state.rng.range(8, 14), kind: 'smoke',
  });
}
