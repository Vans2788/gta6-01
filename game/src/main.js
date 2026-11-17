// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, wasted, busted and story-complete.
// ?seed=N fixes the city. ?shot=cover|street|drive|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, SAVE_KEY, CAMERA_ZOOM_FOOT, CAMERA_ZOOM_CAR } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './city.js';
import { createAudio } from './audio.js';
import {
  createInput, ACTION_UP, ACTION_DOWN, ACTION_CONFIRM, ACTION_PAUSE,
  ACTION_MUTE,
} from './input.js';
import { createRenderer } from './render.js';
import { createPlayer, updatePlayer } from './player.js';
import {
  spawnTrafficCar, spawnParkedCars, updateTrafficCar, resolveCarCollisions,
} from './vehicles.js';
import { spawnPedestrians, updatePedestrians, makePed } from './pedestrians.js';
import { updateWanted, updatePoliceCars, updateOfficers, updateRivals } from './police.js';
import {
  loadSave, writeSave, applySave, createProgress, startMission,
  updateMissions, spawnStashes, nextMissionAvailable, nextMissionDef, MISSION_DEFS,
} from './missions.js';
import { drawHud, drawTitleScreen, drawPauseScreen, drawEndScreen, drawStoryCompleteScreen } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

function createState(freshSeed) {
  const rng = createRandom(freshSeed);
  const city = generateCity(rng);
  const garage = city.places.martasGarage;
  const state = {
    seed: freshSeed,
    rng,
    city,
    time: 0,
    screen: 'title',
    menuIndex: 0,
    save: loadSave(),
    progress: createProgress(),
    stats: { carsStolen: 0, kills: 0, pedsHit: 0, fares: 0, copsDown: 0 },
    player: createPlayer(garage.x, garage.y),
    cars: [],
    peds: [],
    cops: [],
    rivals: [],
    particles: [],
    stashes: [],
    wanted: 0,
    wantedTimer: 0,
    policeSpawnTimer: 0,
    mission: null,
    missionArm: 0, // seconds before the M marker can start the next mission
    taxi: null,
    taxiCooldown: 0,
    message: null,
    camera: { x: garage.x, y: garage.y, zoom: CAMERA_ZOOM_FOOT, shake: 0, viewW: 1280, viewH: 800 },
    audio,
    nextMissionMarker: null,
  };
  spawnParkedCars(state, rng);
  spawnPedestrians(state, rng, 42);
  spawnStashes(state, rng);
  return state;
}

const state = createState(seed);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
// Debug handle for play-testing (and the entry's own screenshots): the live
// game state, so a test can drive it and read it back.
window.__solara = state;

function startPlay(mode) {
  if (mode === 'new') {
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
    const fresh = createState(seed);
    Object.assign(state, fresh);
    state.save = null;
  } else if (mode === 'continue') {
    applySave(state, state.save);
    state.player.x = state.city.places.martasGarage.x;
    state.player.y = state.city.places.martasGarage.y;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.health = 100;
  }
  state.screen = 'play';
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  audio.unlock();
  if (mode === 'new') {
    // A new story starts with Marta's first job, right away.
    startMission(state, 0);
  } else {
    // Give the player a few seconds at the garage before the M marker fires.
    state.missionArm = 5;
  }
  if (mode === 'freeroam') {
    state.message = { text: 'Free roam — fares, stashes and the open road. Drive to the M marker for the next mission.', t: 5, color: '#7ac86a' };
  } else if (mode === 'continue' && nextMissionAvailable(state)) {
    state.message = { text: `Welcome back, Jay. Next job: ${nextMissionDef(state).title} — drive to the M marker.`, t: 5, color: '#e8b64c' };
  }
}

function respawnAfterEnd() {
  const player = state.player;
  player.health = 100;
  player.bustedTimer = 0;
  state.wanted = 0;
  state.wantedTimer = 0;
  state.cops = [];
  for (const car of state.cars) {
    if (car.driver === 'police') car.removed = true;
  }
  player.x = state.city.places.martasGarage.x;
  player.y = state.city.places.martasGarage.y;
  player.onFoot = true;
  player.car = null;
  state.missionArm = 5;
  state.screen = 'play';
  state.message = { text: 'Back on the street. Marta is not happy.', t: 3, color: '#ffd76a' };
}

function updateCamera(state, dt) {
  const player = state.player;
  const cam = state.camera;
  // Look ahead in the direction of travel while driving.
  let tx = player.x;
  let ty = player.y;
  if (player.car) {
    tx += Math.sin(player.angle) * player.car.speed * 0.25;
    ty -= Math.cos(player.angle) * player.car.speed * 0.25;
  }
  const k = 1 - Math.exp(-4.5 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const wantZoom = player.car ? CAMERA_ZOOM_CAR : CAMERA_ZOOM_FOOT;
  cam.zoom += (wantZoom - cam.zoom) * (1 - Math.exp(-2 * dt));
}

function maintainPopulation(state) {
  const p = state.player;
  // Traffic: keep about 14 cruisers near the player.
  const traffic = state.cars.filter((c) => c.driver === 'traffic' && !c.removed);
  if (traffic.length < 14) spawnTrafficCar(state, state.rng);
  state.cars = state.cars.filter((c) => {
    if (c.removed) return false;
    if (c.driver === 'traffic' && Math.hypot(c.x - p.x, c.y - p.y) > 1700) return false;
    return true;
  });
  // Pedestrians: keep about 40 near the player.
  state.peds = state.peds.filter((ped) => Math.hypot(ped.x - p.x, ped.y - p.y) < 1600);
  while (state.peds.length < 40) {
    const ix = state.rng.int(0, 11);
    const iy = state.rng.int(0, 11);
    const x = p.x + state.rng.range(-700, 700);
    const y = p.y + state.rng.range(-700, 700);
    if (state.city.isBlocked(x, y, 6)) continue;
    state.peds.push(makePed(x, y, state.rng));
  }
}

function stepWorld(state, dt) {
  state.time += dt;
  if (state.message) {
    state.message.t -= dt;
    if (state.message.t <= 0) state.message = null;
  }
  updatePlayer(state, input, dt);
  for (const car of state.cars) {
    if (car.driver === 'traffic' && !car.removed) updateTrafficCar(state, car, dt);
  }
  updatePoliceCars(state, dt);
  updateOfficers(state, dt);
  updateRivals(state, dt);
  updatePedestrians(state, dt);
  resolveCarCollisions(state);
  updateMissions(state, dt);
  updateWanted(state, dt);
  // Particles.
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  // The M marker: drive to Marta's Garage to start the next mission.
  if (!state.mission && nextMissionAvailable(state)) {
    const g = state.city.places.martasGarage;
    state.nextMissionMarker = { x: g.x, y: g.y, name: `M — ${nextMissionDef(state).title}`, color: '#e8b64c' };
    if (state.missionArm > 0) {
      state.missionArm -= dt;
    } else if (Math.hypot(state.player.x - g.x, state.player.y - g.y) < 70) {
      startMission(state, state.progress.missionIndex);
    }
  } else {
    state.nextMissionMarker = null;
  }
  // Story complete: the last mission just paid out.
  if (!state.mission && state.progress.missionIndex >= MISSION_DEFS.length && state.screen === 'play' && !state.storyShown) {
    state.storyShown = true;
    state.screen = 'complete';
    writeSave(state);
  }
  updateCamera(state, dt);
  maintainPopulation(state);
}

function runShot(name) {
  stageShot(name, state);
  state.screen = 'play';
  // Settle the staged world a little so traffic and peds spread out.
  for (let i = 0; i < 30; i++) {
    for (const car of state.cars) {
      if (car.driver === 'traffic') updateTrafficCar(state, car, STEP);
    }
    updatePedestrians(state, STEP);
  }
  let painted = 0;
  function paint() {
    renderer.draw(state);
    drawHud(renderer.ctx, state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'title';
  state.screen = screen;
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    // Global keys.
    if (input.pressed(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      status.textContent = muted ? 'Muted (M to unmute)' : '';
    }
    if (screen === 'title') {
      if (input.pressed(ACTION_UP)) state.menuIndex = (state.menuIndex + 2) % 3;
      if (input.pressed(ACTION_DOWN)) state.menuIndex = (state.menuIndex + 1) % 3;
      if (input.pressed(ACTION_CONFIRM)) {
        audio.unlock();
        if (state.menuIndex === 0) startPlay(state.save ? 'continue' : 'new');
        else if (state.menuIndex === 1) startPlay('freeroam');
        else {
          startPlay('freeroam');
          state.message = { text: 'WASD move/drive • E steal car • F punch • click to shoot • Space handbrake • P pause', t: 6, color: '#ffd76a' };
        }
        screen = state.screen;
      }
      renderer.draw(state);
      drawTitleScreen(renderer.ctx, state);
    } else if (screen === 'play') {
      if (input.pressed(ACTION_PAUSE)) {
        screen = 'paused';
        state.screen = screen;
      } else {
        accumulator += elapsed;
        let steps = 0;
        while (accumulator >= STEP && steps < 5) {
          stepWorld(state, STEP);
          accumulator -= STEP;
          steps += 1;
        }
        if (steps === 5) accumulator = 0;
        screen = state.screen;
      }
      renderer.draw(state);
      drawHud(renderer.ctx, state);
      if (screen === 'paused') drawPauseScreen(renderer.ctx, state);
    } else if (screen === 'paused') {
      if (input.pressed(ACTION_PAUSE)) {
        screen = 'play';
        state.screen = screen;
      } else if (input.pressed(ACTION_CONFIRM)) {
        screen = 'title';
        state.screen = screen;
        state.menuIndex = 0;
        state.save = loadSave();
      }
      renderer.draw(state);
      drawHud(renderer.ctx, state);
      drawPauseScreen(renderer.ctx, state);
    } else if (screen === 'over' || screen === 'busted') {
      if (input.pressed(ACTION_CONFIRM)) {
        respawnAfterEnd();
        screen = state.screen;
      }
      renderer.draw(state);
      drawHud(renderer.ctx, state);
      drawEndScreen(renderer.ctx, state, screen);
    } else if (screen === 'complete') {
      if (input.pressed(ACTION_CONFIRM)) {
        screen = 'play';
        state.screen = screen;
      }
      renderer.draw(state);
      drawHud(renderer.ctx, state);
      drawStoryCompleteScreen(renderer.ctx, state);
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
