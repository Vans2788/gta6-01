// Missions and story: Jay Cruz, a driver-for-hire in Solara City, takes jobs
// from fixer Marta Reyes while the Kestrel crew moves against them. Six story
// missions, taxi fares and hidden cash stashes on the side — and every bit of
// progress lands in localStorage, so a reload picks up where the player left off.
import { SAVE_KEY, STASH_VALUE, TAXI_FARE_BASE, PISTOL_AMMO_START, ROAD_AT } from './config.js';
import { makeCar } from './vehicles.js';
import { spawnRival } from './police.js';
import { setWanted } from './police.js';

export const MISSION_DEFS = [
  {
    id: 'first-fare', title: 'First Fare', reward: 150,
    brief: "Marta: a client waits at the Palmera Grand. Pick them up, drop them at the Marina. Don't keep them waiting.",
  },
  {
    id: 'borrowed-wheels', title: 'Borrowed Wheels', reward: 300,
    brief: "Marta: Ray needs a red sportscar, no questions. One is parked in Downtown. Bring it to Ray's Chop Shop.",
  },
  {
    id: 'heat-wave', title: 'Heat Wave', reward: 250,
    brief: "Marta: the cops are crawling the block. Shake a 2-star heat and get back to the garage clean.",
  },
  {
    id: 'the-drop', title: 'The Drop', reward: 500,
    brief: "Marta: a package for the Harbor Docks. 100 seconds. The cops already know your plate — drive like it.",
  },
  {
    id: 'payback', title: 'Payback', reward: 700,
    brief: "Marta: the Kestrels jumped one of ours at their warehouse. Go in armed, settle it, then come home.",
  },
  {
    id: 'king-of-solara', title: 'King of Solara', reward: 1200,
    brief: "Marta: last job. Sunset Bar to the Plaza, 90 seconds, three stars on you. Do this and Solara is ours.",
  },
];

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      missionIndex: state.progress.missionIndex,
      stashes: state.progress.stashes,
      stats: state.stats,
      completed: state.progress.completed,
    }));
  } catch {
    // Storage off: progress lasts this visit only.
  }
}

export function applySave(state, save) {
  if (!save) return;
  state.player.money = save.money || 0;
  state.progress.missionIndex = save.missionIndex || 0;
  state.progress.stashes = save.stashes || [];
  state.progress.completed = save.completed || [];
  if (save.stats) Object.assign(state.stats, save.stats);
}

export function createProgress() {
  return { missionIndex: 0, stashes: [], completed: [] };
}

function markerAt(state, place) {
  return { x: place.x, y: place.y, name: place.name, color: place.color };
}

export function startMission(state, index) {
  const def = MISSION_DEFS[index];
  if (!def) return false;
  const places = state.city.places;
  const mission = {
    def, index,
    stage: 0,
    timer: 0,
    target: null,
    objective: '',
    car: null,
    client: null,
    done: false,
  };
  state.mission = mission;
  state.audio.missionStart();
  switch (def.id) {
    case 'first-fare': {
      mission.target = markerAt(state, places.palmeraHotel);
      mission.objective = 'Pick up the client at the Palmera Grand Hotel';
      break;
    }
    case 'borrowed-wheels': {
      // A red sportscar parked in Downtown.
      const car = makeCar(ROAD_AT(4) + 200, ROAD_AT(2) + 26, Math.PI / 2, 'sport', 'parked');
      car.color = '#d94040';
      state.cars.push(car);
      mission.car = car;
      mission.target = { x: car.x, y: car.y, name: 'Red Sportscar', color: '#d94040' };
      mission.objective = 'Steal the red sportscar in Downtown';
      break;
    }
    case 'heat-wave': {
      setWanted(state, 2);
      mission.target = markerAt(state, places.martasGarage);
      mission.objective = 'Lose the 2-star heat, then return to Marta\'s Garage';
      break;
    }
    case 'the-drop': {
      mission.timer = 100;
      mission.target = markerAt(state, places.docks);
      mission.objective = 'Deliver the package to the Harbor Docks — 100 seconds';
      setWanted(state, 2);
      break;
    }
    case 'payback': {
      state.player.weapon = 'pistol';
      state.player.ammo = Math.max(state.player.ammo, PISTOL_AMMO_START);
      const w = places.warehouse;
      for (let i = 0; i < 4; i++) {
        spawnRival(state, w.x + state.rng.range(-160, 160), w.y + state.rng.range(-120, 120));
      }
      mission.target = markerAt(state, places.warehouse);
      mission.objective = 'Clear out the Kestrels at the warehouse (4 left)';
      mission.onRivalDown = (s) => {
        const left = s.rivals.length;
        if (left > 0) {
          mission.objective = `Clear out the Kestrels at the warehouse (${left} left)`;
        } else {
          mission.stage = 1;
          mission.target = markerAt(s, s.city.places.martasGarage);
          mission.objective = 'Warehouse clear. Get back to Marta\'s Garage';
        }
      };
      break;
    }
    case 'king-of-solara': {
      mission.timer = 90;
      setWanted(state, 3);
      mission.target = markerAt(state, places.plaza);
      mission.objective = 'Reach Plaza del Sol in 90 seconds — 3 stars on you';
      break;
    }
    default:
      break;
  }
  state.message = { text: `${def.title} — ${def.brief}`, t: 5, color: '#e8b64c' };
  return true;
}

function completeMission(state) {
  const mission = state.mission;
  if (!mission || mission.done) return;
  mission.done = true;
  state.player.money += mission.def.reward;
  state.progress.completed.push(mission.def.id);
  state.progress.missionIndex = Math.min(MISSION_DEFS.length, mission.index + 1);
  state.audio.missionDone();
  state.audio.cash();
  state.message = {
    text: `Mission complete: ${mission.def.title} — +$${mission.def.reward}`,
    t: 4, color: '#7ac86a',
  };
  state.mission = null;
  writeSave(state);
}

function failMission(state, reason) {
  const mission = state.mission;
  if (!mission) return;
  state.audio.missionFail();
  state.message = { text: `Mission failed: ${reason}`, t: 4, color: '#ff6a5a' };
  state.mission = null;
  setWanted(state, Math.max(0, state.wanted - 1));
}

function nearTarget(state, radius) {
  const m = state.mission;
  if (!m || !m.target) return false;
  return Math.hypot(state.player.x - m.target.x, state.player.y - m.target.y) < radius;
}

export function updateMissions(state, dt) {
  const mission = state.mission;
  if (mission) {
    if (mission.timer > 0) {
      mission.timer -= dt;
      if (mission.timer <= 0) {
        failMission(state, 'Out of time.');
        return;
      }
    }
    switch (mission.def.id) {
      case 'first-fare': {
        if (mission.stage === 0 && nearTarget(state, 70)) {
          mission.stage = 1;
          mission.objective = 'Client aboard. Drop them at the Solara Marina';
          mission.target = markerAt(state, state.city.places.marina);
          state.message = { text: 'Client: "Marina, and step on it."', t: 3, color: '#e8b64c' };
        } else if (mission.stage === 1 && nearTarget(state, 70)) {
          completeMission(state);
        }
        break;
      }
      case 'borrowed-wheels': {
        if (mission.stage === 0 && state.player.car === mission.car) {
          mission.stage = 1;
          mission.objective = "Got it. Deliver it to Ray's Chop Shop";
          mission.target = markerAt(state, state.city.places.raysGarage);
        } else if (mission.stage === 1) {
          if (!state.cars.includes(mission.car) || mission.car.removed) {
            failMission(state, 'The sportscar was destroyed.');
          } else if (state.player.car === mission.car && nearTarget(state, 80)) {
            completeMission(state);
          }
        }
        break;
      }
      case 'heat-wave': {
        if (state.wanted === 0) {
          mission.stage = 1;
          mission.objective = "Clean. Get back to Marta's Garage";
          if (nearTarget(state, 80)) completeMission(state);
        }
        break;
      }
      case 'the-drop': {
        if (nearTarget(state, 80)) completeMission(state);
        break;
      }
      case 'payback': {
        if (mission.stage === 1 && nearTarget(state, 80)) completeMission(state);
        break;
      }
      case 'king-of-solara': {
        if (nearTarget(state, 80)) completeMission(state);
        break;
      }
      default:
        break;
    }
  }

  // Taxi fares: a waiting pedestrian flags the player's car down.
  if (!mission && state.player.car && !state.taxi && state.taxiCooldown <= 0) {
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - state.player.x, ped.y - state.player.y);
      if (d < 120 && state.rng.chance(0.02)) {
        const dest = state.city.places[state.rng.pick(Object.keys(state.city.places))];
        // Fares run $60–$180: the base plus up to six $20 steps by distance.
        state.taxi = {
          fare: TAXI_FARE_BASE + state.rng.int(0, 6) * 20,
          target: markerAt(state, dest),
          passenger: ped,
        };
        state.message = { text: `Taxi fare: ${dest.name} — $${state.taxi.fare}`, t: 3, color: '#7ac86a' };
        state.peds = state.peds.filter((p) => p !== ped);
        break;
      }
    }
  }
  if (state.taxi) {
    const t = state.taxi;
    if (Math.hypot(state.player.x - t.target.x, state.player.y - t.target.y) < 80) {
      state.player.money += t.fare;
      state.stats.fares += 1;
      state.audio.cash();
      state.message = { text: `Fare paid: +$${t.fare}`, t: 2.5, color: '#7ac86a' };
      state.taxi = null;
      state.taxiCooldown = 20;
      writeSave(state);
    } else if (!state.player.car) {
      state.taxi = null;
      state.taxiCooldown = 15;
      state.message = { text: 'The fare walked off.', t: 2, color: '#ffd76a' };
    }
  }
  state.taxiCooldown = Math.max(0, (state.taxiCooldown || 0) - dt);

  // Hidden cash stashes.
  for (const stash of state.stashes) {
    if (stash.taken) continue;
    if (Math.hypot(state.player.x - stash.x, state.player.y - stash.y) < 34) {
      stash.taken = true;
      state.player.money += STASH_VALUE;
      state.progress.stashes.push(stash.id);
      state.audio.cash();
      state.message = { text: `Cash stash found: +$${STASH_VALUE}`, t: 2.5, color: '#7ac86a' };
      writeSave(state);
    }
  }
}

export function spawnStashes(state, rng) {
  state.stashes = [];
  for (let i = 0; i < 10; i++) {
    const ix = rng.int(0, 11);
    const iy = rng.int(0, 11);
    const x = ROAD_AT(ix) + rng.pick([-52, 52]) + rng.range(-40, 40);
    const y = ROAD_AT(iy) + rng.pick([-52, 52]) + rng.range(-40, 40);
    state.stashes.push({ id: i, x, y, taken: state.progress.stashes.includes(i) });
  }
}

export function nextMissionAvailable(state) {
  return state.progress.missionIndex < MISSION_DEFS.length;
}

export function nextMissionDef(state) {
  return MISSION_DEFS[state.progress.missionIndex];
}
