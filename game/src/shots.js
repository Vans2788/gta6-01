// The screenshot scenes behind ?shot=cover|street|drive|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a scripted driver, so the frame is what a short game
// really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';
import { ACTION_SHOOT } from './input.js';

const STEPS_STREET = 260;
const STEPS_MISSION = 240;

/** A scripted stand-in for the keyboard and mouse. */
function scriptedInput(world, plan) {
  return {
    move() {
      return plan.move || { x: 0, y: 0 };
    },
    drive() {
      return plan.drive ? plan.drive(world.time) : { steer: 0, throttle: 0 };
    },
    running() {
      return false;
    },
    mouse() {
      if (plan.aimAtEnemy) {
        const e = world.enemies.find((item) => item.health > 0);
        if (e) {
          return {
            x: e.x - world.camera.x + 640,
            y: e.y - world.camera.y + 400,
            down: false,
          };
        }
      }
      return { x: 640, y: 360, down: false };
    },
  };
}

/** Put the player in the nearest car, as if they had just stolen it. When
 * `at` is given, the player and the car start there, on the nearest road,
 * facing north — so a staged drive begins in the middle of the city and
 * the camera never has to clamp to the world's edge. */
function forceEnterCar(world, at) {
  const p = world.player;
  if (at) {
    const road = world.city.nearestRoad(at.x, at.y);
    if (road.axis === 'v') {
      p.x = road.line;
      p.y = at.y;
    } else {
      p.x = at.x;
      p.y = road.line;
    }
    p.angle = -Math.PI / 2;
  }
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return;
  best.x = p.x + 26;
  best.y = p.y;
  best.angle = p.angle;
  // The player's ride reads at a glance: bright paint, white outline.
  best.color = '#ff5e3a';
  p.x = best.x;
  p.y = best.y;
  p.car = best;
  best.kind = 'player';
  best.speed = 120;
  p.angle = best.angle;
}

function runSteps(world, input, steps, shootEvery) {
  for (let i = 0; i < steps; i += 1) {
    const actions = shootEvery && i % shootEvery === 0 ? ACTION_SHOOT : 0;
    world.step(STEP, input, actions);
    if (world.over) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the cash figure to show. Unknown names stage the street scene.
 */
export function stageShot(name, world) {
  world.reset(null);
  if (name === 'cover') {
    // The getaway: three stars, cop cars closing in, the player flooring it
    // north from the harbor road toward the middle of the city.
    world.startMission(4);
    forceEnterCar(world, { x: 1800, y: 2475 });
    const input = scriptedInput(world, {
      drive: (t) => ({ steer: Math.sin(t * 1.1) * 0.3, throttle: 1 }),
    });
    runSteps(world, input, 170, 0);
    return { screen: SCREEN_PLAY, best: world.player.cash };
  }
  if (name === 'drive') {
    // A fast run up the avenue: mission marker ahead, skid marks behind.
    world.startMission(0);
    forceEnterCar(world, { x: 1800, y: 2475 });
    const input = scriptedInput(world, {
      drive: (t) => ({ steer: Math.sin(t * 1.4) * 0.55, throttle: 1 }),
    });
    runSteps(world, input, 170, 0);
    return { screen: SCREEN_PLAY, best: world.player.cash };
  }
  if (name === 'mission') {
    // The Meridian shootout: gunmen in the plaza, the player returning fire.
    world.startMission(3);
    const plaza = world.mission.steps[0].at;
    // Inside the goto radius, so the first step completes and the gunmen spawn.
    world.player.x = plaza.x - 30;
    world.player.y = plaza.y + 30;
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
    world.player.ammo = 60;
    const input = scriptedInput(world, { aimAtEnemy: true });
    runSteps(world, input, STEPS_MISSION, 14);
    return { screen: SCREEN_PLAY, best: world.player.cash };
  }
  // Street: on foot in the city, traffic and pedestrians, a job waiting.
  world.startMission(0);
  const input = scriptedInput(world, { move: { x: 0.6, y: 0.8 } });
  runSteps(world, input, STEPS_STREET, 0);
  return { screen: SCREEN_PLAY, best: world.player.cash };
}
