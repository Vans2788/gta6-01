// Boot and the one loop: input is read once per frame, the world advances
// in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between six screens: title, play, paused, wasted, busted and
// mission complete.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|street|drive|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_WASTED, SCREEN_BUSTED, SCREEN_MISSION } from './render.js';
import { stageShot } from './shots.js';
import { missionObjective } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const BANNER_SECONDS = 2.6;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

// A read handle for automated play-tests (and curious players): the live
// world, nothing more. The game never reads it back.
window.__solara = { world };

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, {
      missionText: missionObjective(world),
      banner: null,
      best: world.player.cash,
      hasSave: false,
      saveMission: 0,
      missionLine: '',
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerUntil = 0;
  let missionLine = '';
  const saved = world.loadProgress();
  let hasSave = !!saved && saved.missionIndex < 6;
  let saveMission = saved ? saved.missionIndex : 0;
  let newGameKey = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && !event.repeat) newGameKey = true;
    if (event.code === 'KeyM' && !event.repeat) {
      if (screen === SCREEN_PLAY && !world.mission.active) {
        if (world.mission.index < 6) {
          world.startMission(world.mission.index);
          showBanner(`New job: ${world.mission.title}`);
        } else {
          showBanner('All six jobs done — free roam, Mara.');
        }
      }
    }
  });

  function showBanner(text) {
    banner = text;
    bannerUntil = performance.now() + BANNER_SECONDS * 1000;
  }

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    const save = continueSave ? world.loadProgress() : null;
    world.reset(save);
    world.over = null;
    if (save && save.missionIndex < 6) world.startMission(save.missionIndex);
    else if (!save) world.startMission(0);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mara Voss, Solara City.');
  }

  function respawn() {
    const keep = {
      cash: world.player.cash,
      missionIndex: world.mission.index,
      ammo: 24,
    };
    world.reset(keep);
    world.over = null;
    if (keep.missionIndex < 6) world.startMission(keep.missionIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
  }

  function drainEvents() {
    for (const event of world.events) {
      if (event === 'mission-done') {
        const payout = world.mission.lastPayout || 0;
        missionLine = `Paid $${payout.toLocaleString('en-US')} — ${world.mission.index >= 6 ? 'all six jobs done!' : 'next job is waiting.'}`;
        screen = SCREEN_MISSION;
        showBanner('Mission complete');
      } else if (event === 'stole-car') showBanner('Car stolen — the cops are coming');
      else if (event === 'hit-ped') showBanner('You hit a pedestrian!');
      else if (event === 'evaded') showBanner('You lost the cops');
      else if (event === 'downed-cop') showBanner('You downed a cop — heat is up');
      else if (event === 'cash-grab') showBanner('Cash grabbed — run!');
    }
    world.events.length = 0;
  }

  // Take the frame's one-shot presses once, decide the screen change, and
  // return what the world may consume this frame: 0 when the press changed
  // screens, so a click that starts the game never also fires a shot.
  // Presses are OR-accumulated into pendingActions and cleared only when a
  // fixed step consumes them (or a screen change does): a press landing on a
  // frame with no fixed step is held for the next one, never dropped — and
  // never fired twice, because the first step that reads them clears them.
  let pendingActions = 0;
  function handleActions(actions) {
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        startGame(hasSave);
        return 0;
      }
      if (newGameKey) {
        startGame(false);
        return 0;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return 0;
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
        return 0;
      }
    } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        respawn();
        return 0;
      }
    } else if (screen === SCREEN_MISSION) {
      if (actions & ACTION_CONFIRM) {
        if (world.mission.index < 6) world.startMission(world.mission.index);
        screen = SCREEN_PLAY;
        return 0;
      }
    }
    newGameKey = false;
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    world.viewW = canvas.width;
    world.viewH = canvas.height;
    pendingActions |= input.takeActions();
    const stepActions = handleActions(pendingActions);
    if (stepActions === 0) pendingActions = 0;
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        const actions = first ? stepActions : 0;
        if (first) pendingActions = 0;
        first = false;
        world.step(STEP, input, actions);
        accumulator -= STEP;
        drainEvents();
        if (world.over === 'wasted') {
          screen = SCREEN_WASTED;
          announce('Wasted.');
          break;
        }
        if (world.over === 'busted') {
          screen = SCREEN_BUSTED;
          announce('Busted.');
          break;
        }
      }
      if (accumulator > STEP * 4) accumulator = 0;
    } else {
      accumulator = 0;
    }
    if (banner && now > bannerUntil) banner = null;
    const save = world.loadProgress();
    renderer.draw(world, screen, {
      missionText: missionObjective(world),
      banner,
      best: save ? save.cash : 0,
      hasSave,
      saveMission,
      missionLine,
    });
  }

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara City. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
