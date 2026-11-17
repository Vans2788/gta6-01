// The living world: the player on foot and in cars, traffic that drives the
// roads, pedestrians on the sidewalks, police that respond to the wanted
// level, combat, pickups and the mission runner. One fixed step at a time.
//
// Edge-triggered actions (enter a car, punch, shoot) arrive as a bitmask on
// the FIRST fixed step of a frame only and are consumed there — the caller
// passes 0 on every later step of the same frame, so one tap can never fire
// twice. Held keys are read every step.

import {
  WORLD_W, WORLD_H, ROAD_W, WALK_SPEED, RUN_SPEED, PLAYER_RADIUS,
  PLAYER_HEALTH, CAR_TOP_SPEED, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_SPEED,
  CAR_STEER, CAR_LENGTH, CAR_WIDTH, PISTOL_DAMAGE, PISTOL_RANGE,
  PISTOL_AMMO_START, PISTOL_AMMO_MAX, PUNCH_DAMAGE, PUNCH_RANGE,
  PED_HEALTH, COP_HEALTH, WANTED_MAX, EVADE_SECONDS, COP_CAR_SPEED,
  COP_FOOT_SPEED, CASH_START,
} from './config.js';
import { buildCity } from './city.js';
import { updateMission, startMission } from './missions.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_SHOOT } from './input.js';

const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#7f8c8d', '#8e44ad', '#16a085', '#e67e22', '#2c3e50', '#d35400'];
const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];
const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createWorld(rng, audio) {
  const city = buildCity(rng);
  const world = {
    rng,
    city,
    audio,
    time: 0,
    wanted: 0,
    evadeTimer: 0,
    over: null,
    events: [],
    mission: { index: 0, active: false, steps: [], step: 0, timer: 0, marker: null, spawned: false },
    camera: { x: WORLD_W / 2, y: WORLD_H / 2 },
    player: null,
    cars: [],
    peds: [],
    enemies: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    shootCd: 0,
    hurtTimer: 0,
  };

  // --- helpers -------------------------------------------------------------

  world.addEvent = (name) => {
    world.events.push(name);
  };

  world.setWanted = (n) => {
    const next = clamp(n, 0, WANTED_MAX);
    if (next > world.wanted) world.evadeTimer = 0;
    world.wanted = next;
  };

  world.saveProgress = () => {
    try {
      window.localStorage.setItem('solara-city-save-v1', JSON.stringify({
        cash: world.player.cash,
        missionIndex: world.mission.index,
        ammo: world.player.ammo,
      }));
    } catch {
      // Storage can be off: progress then lasts this visit only.
    }
  };

  world.loadProgress = () => {
    try {
      const raw = window.localStorage.getItem('solara-city-save-v1');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  };

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.angle();
      const s = rng.range(speed * 0.3, speed);
      world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.25, 0.6), max: 0.6, color, size: rng.range(2, 4.5) });
    }
  }

  function makeCar(x, y, angle, kind, color) {
    return {
      x, y, angle, speed: 0, color: color || rng.pick(CAR_COLORS),
      kind, // 'traffic' | 'parked' | 'police' | 'mission'
      axis: rng.chance(0.5) ? 'v' : 'h',
      dir: rng.chance(0.5) ? 1 : -1,
      cruise: rng.range(140, 220),
      turnCd: 0,
      missionCar: false,
      ramCd: 0,
    };
  }

  function makePed(x, y, isCop) {
    return {
      x, y, angle: rng.angle(), speed: 0, health: isCop ? COP_HEALTH : PED_HEALTH,
      isCop: !!isCop, state: 'walk', // 'walk' | 'flee' | 'down'
      color: rng.pick(PED_COLORS), r: 10,
      tx: x, ty: y, retarget: 0, fleeX: 0, fleeY: 0, walkSpeed: rng.range(42, 66),
    };
  }

  // --- setup ---------------------------------------------------------------

  world.reset = (save) => {
    world.time = 0;
    world.wanted = 0;
    world.evadeTimer = 0;
    world.over = null;
    world.events = [];
    world.cars = [];
    world.peds = [];
    world.enemies = [];
    world.bullets = [];
    world.particles = [];
    world.skids = [];
    world.pickups = [];
    world.shootCd = 0;
    world.hurtTimer = 0;
    const start = city.randomRoadPoint();
    world.player = {
      x: start.x, y: start.y, angle: -Math.PI / 2, health: PLAYER_HEALTH,
      ammo: save ? save.ammo : PISTOL_AMMO_START,
      cash: save ? save.cash : CASH_START,
      car: null, speed: 0, punchCd: 0, facing: -Math.PI / 2,
    };
    world.mission = {
      index: save ? save.missionIndex : 0,
      active: false, steps: [], step: 0, timer: 0, marker: null, spawned: false,
      title: '', briefing: '',
    };
    world.camera = { x: world.player.x, y: world.player.y };
    for (const spot of city.parking.slice(0, 20)) {
      world.cars.push(makeCar(spot.x, spot.y, spot.angle, 'parked'));
    }
    for (let i = 0; i < 14; i += 1) {
      const p = city.randomRoadPoint();
      const car = makeCar(p.x, p.y, 0, 'traffic');
      car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.speed = car.cruise;
      world.cars.push(car);
    }
    for (let i = 0; i < 26; i += 1) {
      const p = city.randomSidewalkPoint();
      world.peds.push(makePed(p.x, p.y, false));
    }
    // A few pickups scattered around the city.
    for (let i = 0; i < 5; i += 1) {
      const p = city.randomSidewalkPoint();
      world.pickups.push({ x: p.x, y: p.y, kind: i % 3 === 0 ? 'health' : i % 3 === 1 ? 'ammo' : 'cash', amount: i % 3 === 2 ? 40 : i % 3 === 1 ? 12 : 25 });
    }
  };

  world.spawnMissionCar = (at) => {
    const car = makeCar(at.x, at.y, 0, 'parked', '#f1c40f');
    car.missionCar = true;
    world.cars.push(car);
    return car;
  };

  world.spawnEnemies = (at, count) => {
    for (let i = 0; i < count; i += 1) {
      world.enemies.push({
        x: at.x + rng.range(-90, 90), y: at.y + rng.range(-90, 90),
        angle: rng.angle(), health: 60, shootCd: rng.range(0.6, 1.6), speed: 95,
      });
    }
  };

  world.startMission = (index) => {
    startMission(world, index);
  };

  // --- crime and police ----------------------------------------------------

  function nearestCopDistance() {
    let best = Infinity;
    for (const car of world.cars) {
      if (car.kind === 'police') best = Math.min(best, dist(car.x, car.y, world.player.x, world.player.y));
    }
    for (const ped of world.peds) {
      if (ped.isCop && ped.state !== 'down') best = Math.min(best, dist(ped.x, ped.y, world.player.x, world.player.y));
    }
    return best;
  }

  function maintainPolice(dt) {
    const p = world.player;
    if (world.wanted === 0) {
      // Cops give up and drive off when the heat is gone.
      world.cars = world.cars.filter((c) => c.kind !== 'police' || dist(c.x, c.y, p.x, p.y) < 900);
      world.peds = world.peds.filter((pd) => !pd.isCop || dist(pd.x, pd.y, p.x, p.y) < 900);
      return;
    }
    const targetCars = Math.min(world.wanted, 3);
    const targetFoot = Math.min(world.wanted, 2);
    let copCars = 0;
    let footCops = 0;
    for (const c of world.cars) if (c.kind === 'police') copCars += 1;
    for (const pd of world.peds) if (pd.isCop && pd.state !== 'down') footCops += 1;
    if (copCars < targetCars) {
      const spot = city.randomRoadPoint();
      const a = angleTo(spot.x, spot.y, p.x, p.y);
      const x = p.x - Math.cos(a) * rng.range(420, 560);
      const y = p.y - Math.sin(a) * rng.range(420, 560);
      const road = city.nearestRoad(x, y);
      const sx = road.axis === 'v' ? road.line : x;
      const sy = road.axis === 'h' ? road.line : y;
      const car = makeCar(sx, sy, a, 'police', '#1a1a1a');
      car.speed = COP_CAR_SPEED * 0.7;
      world.cars.push(car);
    }
    if (footCops < targetFoot && rng.chance(dt * 0.8)) {
      const a = rng.angle();
      const x = p.x + Math.cos(a) * rng.range(300, 420);
      const y = p.y + Math.sin(a) * rng.range(300, 420);
      world.peds.push(makePed(x, y, true));
    }
  }

  function damagePlayer(amount) {
    const p = world.player;
    p.health -= amount;
    world.hurtTimer = 0;
    if (p.health <= 0) {
      p.health = 0;
      world.over = 'wasted';
      audio.wasted();
      world.addEvent('wasted');
    }
  }

  // --- one fixed step ------------------------------------------------------

  world.step = (dt, input, actions) => {
    const p = world.player;
    world.time += dt;
    world.shootCd = Math.max(0, world.shootCd - dt);
    p.punchCd = Math.max(0, p.punchCd - dt);
    world.hurtTimer += dt;
    if (world.hurtTimer > 8 && p.health > 0 && p.health < PLAYER_HEALTH) {
      p.health = Math.min(PLAYER_HEALTH, p.health + 2 * dt);
    }

    const mouse = input.mouse();
    const vw = world.viewW || 1280;
    const vh = world.viewH || 800;
    const mouseWorld = { x: world.camera.x + mouse.x - vw / 2, y: world.camera.y + mouse.y - vh / 2 };

    // Edge actions: handled here, on the first fixed step of the frame only.
    if (actions & ACTION_ENTER) {
      if (p.car) {
        const car = p.car;
        p.car = null;
        car.speed = 0;
        car.kind = 'parked';
        const a = car.angle + Math.PI / 2;
        p.x = car.x + Math.cos(a) * 30;
        p.y = car.y + Math.sin(a) * 30;
        p.angle = car.angle;
        world.audio.pickup();
      } else {
        let best = null;
        let bestD = 75;
        for (const car of world.cars) {
          const d = dist(p.x, p.y, car.x, car.y);
          if (d < bestD) {
            bestD = d;
            best = car;
          }
        }
        if (best) {
          p.car = best;
          best.kind = 'player';
          p.angle = best.angle;
          if (best.driver) best.driver = null;
          world.setWanted(Math.max(world.wanted, 1));
          world.addEvent('stole-car');
          world.audio.pickup();
        }
      }
    }

    if (actions & ACTION_PUNCH && !p.car && p.punchCd <= 0) {
      p.punchCd = 0.45;
      audio.punch();
      const targets = [...world.peds, ...world.enemies];
      for (const t of targets) {
        if (t.state === 'down' || t.health <= 0) continue;
        const d = dist(p.x, p.y, t.x, t.y);
        const facing = Math.abs(angleDiff(angleTo(p.x, p.y, t.x, t.y), p.facing));
        if (d < PUNCH_RANGE + 12 && facing < 1.1) {
          t.health -= PUNCH_DAMAGE;
          const a = angleTo(p.x, p.y, t.x, t.y);
          t.x += Math.cos(a) * 26;
          t.y += Math.sin(a) * 26;
          spawnParticles(t.x, t.y, '#f5d76e', 6, 140);
          if (t.health <= 0) {
            t.state = 'down';
            world.setWanted(Math.max(world.wanted, 1));
            if (rng.chance(0.5)) world.pickups.push({ x: t.x, y: t.y, kind: 'cash', amount: rng.int(20, 60) });
          } else if (!t.isCop) {
            t.state = 'flee';
            t.fleeX = t.x + (t.x - p.x);
            t.fleeY = t.y + (t.y - p.y);
          }
          break;
        }
      }
    }

    if (actions & ACTION_SHOOT && !p.car && p.ammo > 0 && world.shootCd <= 0) {
      world.shootCd = 0.22;
      p.ammo -= 1;
      const aim = angleTo(p.x, p.y, mouseWorld.x, mouseWorld.y);
      p.facing = aim;
      const mx = p.x + Math.cos(aim) * 20;
      const my = p.y + Math.sin(aim) * 20;
      world.bullets.push({ x: mx, y: my, vx: Math.cos(aim) * 900, vy: Math.sin(aim) * 900, life: PISTOL_RANGE / 900, fromPlayer: true });
      spawnParticles(mx, my, '#ffd94d', 5, 220);
      audio.shot();
      world.setWanted(Math.max(world.wanted, 1));
    }

    // --- player movement ---------------------------------------------------
    if (p.car) {
      const car = p.car;
      const drive = input.drive();
      const forward = drive.throttle;
      if (forward > 0) car.speed += CAR_ACCEL * dt;
      else if (forward < 0) {
        if (car.speed > 30) car.speed -= CAR_BRAKE * dt;
        else car.speed -= CAR_ACCEL * 0.55 * dt;
      } else {
        car.speed -= car.speed * 0.7 * dt;
      }
      car.speed = clamp(car.speed, -CAR_REVERSE_SPEED, CAR_TOP_SPEED);
      const steer = drive.steer * CAR_STEER * clamp(Math.abs(car.speed) / 200, 0, 1) * Math.sign(car.speed || 1);
      car.angle += steer * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const body = { x: nx, y: ny, r: 20 };
      if (city.collideCircle(body)) {
        if (Math.abs(car.speed) > 200) {
          audio.crash();
          spawnParticles(car.x, car.y, '#cccccc', 10, 200);
        }
        car.speed *= 0.4;
        car.x = body.x;
        car.y = body.y;
      } else {
        car.x = nx;
        car.y = ny;
      }
      city.clamp(car, 24);
      if (Math.abs(drive.steer) > 0.5 && Math.abs(car.speed) > 260) {
        const bx = car.x - Math.cos(car.angle) * 20;
        const by = car.y - Math.sin(car.angle) * 20;
        world.skids.push({ x1: bx, y1: by, x2: bx + Math.cos(car.angle) * 6, y2: by + Math.sin(car.angle) * 6, life: 6 });
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      audio.engine(Math.abs(car.speed) / CAR_TOP_SPEED);
    } else {
      const move = input.move();
      const speed = input.running() ? RUN_SPEED : WALK_SPEED;
      const nx = p.x + move.x * speed * dt;
      const ny = p.y + move.y * speed * dt;
      const body = { x: nx, y: ny, r: PLAYER_RADIUS };
      city.collideCircle(body);
      city.clamp(body, PLAYER_RADIUS + 2);
      if (move.x !== 0 || move.y !== 0) p.facing = Math.atan2(move.y, move.x);
      p.x = body.x;
      p.y = body.y;
      p.speed = move.x !== 0 || move.y !== 0 ? speed : 0;
      audio.engine(0);
    }

    // --- traffic -----------------------------------------------------------
    for (const car of world.cars) {
      if (car === p.car || car.kind !== 'traffic') continue;
      car.turnCd -= dt;
      const road = city.nearestRoad(car.x, car.y);
      // Steer onto the lane for this road and direction.
      let targetAngle;
      if (car.axis === 'v') targetAngle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else targetAngle = car.dir > 0 ? 0 : Math.PI;
      const laneOff = ROAD_W / 4;
      let laneX = car.x;
      let laneY = car.y;
      if (car.axis === 'v') {
        const right = car.dir > 0 ? -laneOff : laneOff;
        laneX = road.line + right;
      } else {
        const right = car.dir > 0 ? laneOff : -laneOff;
        laneY = road.line + right;
      }
      const toLane = angleTo(car.x, car.y, laneX, laneY);
      const laneDist = dist(car.x, car.y, laneX, laneY);
      let desired = targetAngle;
      if (laneDist > 4) desired = toLane;
      car.angle += clamp(angleDiff(desired, car.angle), -2.2 * dt, 2.2 * dt);
      // Slow for the car ahead.
      let ahead = Infinity;
      for (const other of world.cars) {
        if (other === car) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        const facing = Math.abs(angleDiff(angleTo(car.x, car.y, other.x, other.y), car.angle));
        if (d < ahead && facing < 0.5) ahead = d;
      }
      const wantSpeed = ahead < 70 ? Math.max(0, (ahead - 40) * 2) : car.cruise;
      car.speed += clamp(wantSpeed - car.speed, -300 * dt, 180 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      city.clamp(car, 24);
      // Turn at an intersection, sometimes.
      const crossing = car.axis === 'v'
        ? city.hRoads.some((ry) => Math.abs(car.y - ry) < 8)
        : city.vRoads.some((rx) => Math.abs(car.x - rx) < 8);
      if (crossing && car.turnCd <= 0 && rng.chance(0.35)) {
        car.turnCd = 3;
        if (rng.chance(0.5)) {
          car.axis = car.axis === 'v' ? 'h' : 'v';
          car.dir = rng.chance(0.5) ? 1 : -1;
        } else {
          car.dir = -car.dir;
        }
      }
    }

    // --- pedestrians ---------------------------------------------------------
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (ped.isCop) {
        // Foot officers run the player down.
        const d = dist(ped.x, ped.y, p.x, p.y);
        if (d < 26 && !p.car && world.over === null) {
          world.over = 'busted';
          audio.busted();
          world.addEvent('busted');
        }
        const a = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = a;
        ped.x += Math.cos(a) * COP_FOOT_SPEED * dt;
        ped.y += Math.sin(a) * COP_FOOT_SPEED * dt;
        city.collideCircle(ped);
        continue;
      }
      ped.retarget -= dt;
      if (ped.state === 'flee') {
        const a = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = a;
        ped.x += Math.cos(a) * 190 * dt;
        ped.y += Math.sin(a) * 190 * dt;
        if (dist(ped.x, ped.y, p.x, p.y) > 420) ped.state = 'walk';
      } else {
        if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.tx, ped.ty) < 12) {
          const t = city.randomSidewalkPoint();
          ped.tx = t.x;
          ped.ty = t.y;
          ped.retarget = rng.range(4, 10);
        }
        const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.walkSpeed * dt;
        ped.y += Math.sin(a) * ped.walkSpeed * dt;
      }
      city.collideCircle(ped);
      city.clamp(ped, 12);
    }

    // --- police cars chase ---------------------------------------------------
    for (const car of world.cars) {
      if (car.kind !== 'police') continue;
      car.ramCd -= dt;
      const a = angleTo(car.x, car.y, p.x, p.y);
      car.angle += clamp(angleDiff(a, car.angle), -2.6 * dt, 2.6 * dt);
      car.speed += clamp(COP_CAR_SPEED - car.speed, -400 * dt, 320 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const body = { x: nx, y: ny, r: 20 };
      if (!city.collideCircle(body)) {
        car.x = nx;
        car.y = ny;
      } else {
        car.speed *= 0.5;
        car.x = body.x;
        car.y = body.y;
      }
      city.clamp(car, 24);
      // Ram the player's car; shove a player on foot.
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < 46 && car.ramCd <= 0) {
        car.ramCd = 0.7;
        audio.crash();
        spawnParticles(p.x, p.y, '#cccccc', 8, 180);
        if (p.car) {
          p.car.speed *= 0.55;
          const push = angleTo(car.x, car.y, p.x, p.y);
          p.car.x += Math.cos(push) * 14;
          p.car.y += Math.sin(push) * 14;
        } else {
          damagePlayer(12);
          const push = angleTo(car.x, car.y, p.x, p.y);
          p.x += Math.cos(push) * 30;
          p.y += Math.sin(push) * 30;
        }
      }
    }

    // --- car vs ped collisions ----------------------------------------------
    for (const car of world.cars) {
      if (Math.abs(car.speed) < 120) continue;
      for (const ped of world.peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 30) {
          ped.state = 'down';
          ped.health = 0;
          spawnParticles(ped.x, ped.y, '#e74c3c', 8, 160);
          if (car === p.car) {
            world.setWanted(world.wanted + 1);
            world.addEvent('hit-ped');
          }
          car.speed *= 0.7;
        }
      }
    }

    // --- enemies (mission gunmen) --------------------------------------------
    for (const e of world.enemies) {
      e.shootCd -= dt;
      const d = dist(e.x, e.y, p.x, p.y);
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.angle = a;
      if (d > 260) {
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
      }
      if (e.shootCd <= 0 && d < 480 && world.over === null) {
        e.shootCd = rng.range(1.0, 1.7);
        const spread = rng.range(-0.12, 0.12);
        world.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a + spread) * 700, vy: Math.sin(a + spread) * 700, life: 0.8, fromPlayer: false });
        spawnParticles(e.x, e.y, '#ffd94d', 4, 180);
        audio.shot();
      }
    }

    // --- bullets ---------------------------------------------------------------
    for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
      const b = world.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      const body = { x: b.x, y: b.y, r: 2 };
      if (city.collideCircle(body)) dead = true;
      if (!dead) {
        if (b.fromPlayer) {
          for (const t of [...world.peds, ...world.enemies]) {
            if (t.state === 'down' || t.health <= 0) continue;
            if (dist(b.x, b.y, t.x, t.y) < 15) {
              t.health -= PISTOL_DAMAGE;
              spawnParticles(b.x, b.y, '#e74c3c', 6, 150);
              if (t.health <= 0) {
                t.state = 'down';
                world.setWanted(world.wanted + 1);
                if (t.isCop) world.addEvent('downed-cop');
                else if (rng.chance(0.5)) world.pickups.push({ x: t.x, y: t.y, kind: 'cash', amount: rng.int(20, 60) });
              } else if (!t.isCop) {
                t.state = 'flee';
                t.fleeX = t.x + (t.x - p.x);
                t.fleeY = t.y + (t.y - p.y);
              }
              dead = true;
              break;
            }
          }
          if (!dead) {
            for (const car of world.cars) {
              if (car === p.car) continue;
              if (dist(b.x, b.y, car.x, car.y) < 24) {
                spawnParticles(b.x, b.y, '#f1c40f', 5, 160);
                dead = true;
                break;
              }
            }
          }
        } else if (dist(b.x, b.y, p.x, p.y) < 14) {
          damagePlayer(8);
          spawnParticles(b.x, b.y, '#e74c3c', 5, 150);
          dead = true;
        }
      }
      if (dead) world.bullets.splice(i, 1);
    }

    // --- pickups ---------------------------------------------------------------
    // The dead are gone: a kill step completes only when no gunman is left.
    if (world.enemies.length > 0) {
      world.enemies = world.enemies.filter((e) => e.health > 0);
    }
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const pk = world.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        if (pk.kind === 'cash') p.cash += pk.amount;
        else if (pk.kind === 'ammo') p.ammo = Math.min(PISTOL_AMMO_MAX, p.ammo + pk.amount);
        else p.health = Math.min(PLAYER_HEALTH, p.health + pk.amount);
        audio.pickup();
        spawnParticles(pk.x, pk.y, '#2ecc71', 8, 120);
        world.pickups.splice(i, 1);
      }
    }

    // --- particles and skid marks ----------------------------------------------
    for (let i = world.particles.length - 1; i >= 0; i -= 1) {
      const pt = world.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) world.particles.splice(i, 1);
    }
    for (let i = world.skids.length - 1; i >= 0; i -= 1) {
      world.skids[i].life -= dt;
      if (world.skids[i].life <= 0) world.skids.splice(i, 1);
    }

    // --- wanted decay ------------------------------------------------------------
    if (world.wanted > 0) {
      const nearest = nearestCopDistance();
      if (nearest > 520) {
        world.evadeTimer += dt;
        if (world.evadeTimer >= EVADE_SECONDS) {
          world.wanted -= 1;
          world.evadeTimer = 0;
          world.addEvent('evaded');
        }
      } else {
        world.evadeTimer = 0;
      }
    }
    audio.siren(world.wanted > 0);
    maintainPolice(dt);

    // --- missions ------------------------------------------------------------------
    if (world.mission.active && world.over === null) {
      updateMission(world, dt);
    }

    // --- camera ----------------------------------------------------------------------
    const tx = clamp(p.x, 640, WORLD_W - 640);
    const ty = clamp(p.y, 400, WORLD_H - 400);
    world.camera.x += (tx - world.camera.x) * Math.min(1, 5 * dt);
    world.camera.y += (ty - world.camera.y) * Math.min(1, 5 * dt);
  };

  world.reset(null);
  return world;
}
