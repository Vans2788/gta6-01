// The story of Solara City: six missions for Mara Voss, a getaway driver
// working for the fixer Dario Kestrel. Each mission is a list of steps; the
// world runs them and this module decides when a step is done, what spawns
// and what the HUD should say. Nothing here draws or reads input.

import { MISSION_PAYOUTS, ROAD_W } from './config.js';

const STORY = {
  hero: 'Mara Voss',
  fixer: 'Dario Kestrel',
};

function snapToRoad(city, x, y) {
  const road = city.nearestRoad(x, y);
  if (road.axis === 'v') return { x: road.line, y };
  return { x, y: road.line };
}

function districtPoint(city, name) {
  const d = city.districts.find((item) => item.name === name);
  return { x: d.x, y: d.y };
}

function onSidewalk(city, x, y) {
  const road = city.nearestRoad(x, y);
  const off = ROAD_W / 2 + 14;
  if (road.axis === 'v') return { x: road.line + off, y };
  return { x, y: road.line + off };
}

export const MISSIONS = [
  {
    title: 'First Fare',
    briefing: `${STORY.fixer} needs a driver. Pick up Lena at Meridian Plaza and get her to Old Harbor — smooth, no cops.`,
  },
  {
    title: 'The Stash',
    briefing: `A package is waiting at The Docks. Grab it on foot and walk it to the drop in Sunset Strip.`,
  },
  {
    title: 'Hot Wheels',
    briefing: `A yellow Comet GT is parked at Civic Center, keys in it. Take it — and take it to the Northgate garage.`,
  },
  {
    title: 'Meridian Shootout',
    briefing: `Three of ${STORY.fixer}'s rivals are waiting at Meridian Plaza. Settle it, then get clear.`,
  },
  {
    title: 'The Getaway',
    briefing: `The job went loud. Three stars and the whole city after you — survive the chase, then vanish.`,
  },
  {
    title: 'The Big Score',
    briefing: `The bank van stops at Civic Center. Take the cash, outrun four stars, and disappear. This is the one.`,
  },
];

/** Build the step list for a mission, with concrete points in this city. */
export function buildMissionSteps(city, index) {
  const plaza = districtPoint(city, 'Meridian Plaza');
  const harbor = districtPoint(city, 'Old Harbor');
  const docks = districtPoint(city, 'The Docks');
  const strip = districtPoint(city, 'Sunset Strip');
  const civic = districtPoint(city, 'Civic Center');
  const northgate = districtPoint(city, 'Northgate');
  switch (index) {
    case 0: {
      const pickup = snapToRoad(city, plaza.x, plaza.y);
      const drop = snapToRoad(city, harbor.x, harbor.y);
      return [
        { kind: 'get-car', text: 'Get in a car — any car will do' },
        { kind: 'goto', at: pickup, r: 70, text: 'Pick up Lena at Meridian Plaza' },
        { kind: 'goto', at: drop, r: 70, text: 'Drive Lena to Old Harbor' },
      ];
    }
    case 1: {
      const stash = onSidewalk(city, docks.x, docks.y);
      const drop = onSidewalk(city, strip.x, strip.y);
      return [
        { kind: 'goto', at: stash, r: 46, text: 'Pick up the stash at The Docks', onFoot: true },
        { kind: 'goto', at: drop, r: 46, text: 'Deliver the stash to Sunset Strip', onFoot: true },
      ];
    }
    case 2: {
      const carAt = snapToRoad(city, civic.x, civic.y);
      const garage = snapToRoad(city, northgate.x, northgate.y);
      return [
        { kind: 'goto', at: carAt, r: 80, text: 'Find the yellow Comet at Civic Center' },
        { kind: 'steal-car', text: 'Steal the Comet GT' },
        { kind: 'goto', at: garage, r: 70, text: 'Deliver it to the Northgate garage' },
      ];
    }
    case 3: {
      const plazaAt = snapToRoad(city, plaza.x, plaza.y);
      const safe = snapToRoad(city, harbor.x, harbor.y);
      return [
        { kind: 'goto', at: plazaAt, r: 80, text: 'Meet the gunmen at Meridian Plaza' },
        { kind: 'kill', count: 3, text: 'Take down all three gunmen', spawnAt: plazaAt },
        { kind: 'goto', at: safe, r: 70, text: 'Get clear — reach the safehouse' },
      ];
    }
    case 4: {
      const safe = snapToRoad(city, harbor.x, harbor.y);
      return [
        { kind: 'get-car', text: 'Get a car — the cops are coming' },
        { kind: 'survive', seconds: 60, wanted: 3, text: 'Survive the chase — stay alive' },
        { kind: 'goto', at: safe, r: 70, text: 'Reach the safehouse in Old Harbor' },
      ];
    }
    default: {
      const van = snapToRoad(city, civic.x, civic.y);
      const safe = snapToRoad(city, harbor.x, harbor.y);
      return [
        { kind: 'goto', at: van, r: 70, text: 'Reach the bank van at Civic Center' },
        { kind: 'grab', at: van, r: 50, text: 'Grab the cash' },
        { kind: 'goto', at: safe, r: 70, text: 'Escape to the safehouse — four stars!' },
      ];
    }
  }
}

/** Start a mission: reset its state and set up anything it needs. */
export function startMission(world, index) {
  const steps = buildMissionSteps(world.city, index);
  world.mission = {
    index,
    title: MISSIONS[index].title,
    briefing: MISSIONS[index].briefing,
    steps,
    step: 0,
    active: true,
    timer: 0,
    marker: null,
    spawned: false,
  };
  if (index === 4) world.setWanted(3);
  if (index === 2) world.spawnMissionCar(steps[0].at);
  refreshMarker(world);
}

function refreshMarker(world) {
  const m = world.mission;
  if (!m.active) {
    m.marker = null;
    return;
  }
  const step = m.steps[m.step];
  m.marker = step && step.at ? { x: step.at.x, y: step.at.y, r: step.r || 60 } : null;
}

/** The current objective line for the HUD. */
export function missionObjective(world) {
  const m = world.mission;
  if (!m.active) return 'No job right now — press M for the next one.';
  const step = m.steps[m.step];
  if (step.kind === 'survive') return `${step.text} — ${Math.ceil(step.seconds - m.timer)}s left`;
  if (step.kind === 'kill') return `${step.text} — ${world.enemies.length} left`;
  return step.text;
}

/** Advance the mission one fixed step. Returns 'complete' when it pays out. */
export function updateMission(world, dt) {
  const m = world.mission;
  if (!m.active) return null;
  const step = m.steps[m.step];
  const p = world.player;
  const distTo = (at) => Math.hypot(p.x - at.x, p.y - at.y);

  function advance() {
    m.step += 1;
    m.timer = 0;
    m.spawned = false;
    if (m.step >= m.steps.length) {
      m.active = false;
      m.marker = null;
      m.lastPayout = MISSION_PAYOUTS[m.index];
      p.cash += m.lastPayout;
      // The next job is the one to save: continuing resumes after this one.
      m.index = Math.min(m.index + 1, MISSIONS.length);
      world.addEvent('mission-done');
      world.audio.missionDone();
      world.saveProgress();
      return 'complete';
    }
    const next = m.steps[m.step];
    if (next.kind === 'kill' && !m.spawned) {
      world.spawnEnemies(next.spawnAt, next.count);
      m.spawned = true;
    }
    if (next.kind === 'grab') world.setWanted(4);
    refreshMarker(world);
    return null;
  }

  switch (step.kind) {
    case 'get-car':
      if (p.car) return advance();
      break;
    case 'goto':
      if (step.onFoot && p.car) break;
      if (distTo(step.at) < step.r) return advance();
      break;
    case 'steal-car':
      if (p.car && p.car.missionCar) return advance();
      break;
    case 'kill':
      if (!m.spawned) {
        world.spawnEnemies(step.spawnAt, step.count);
        m.spawned = true;
      }
      if (world.enemies.length === 0) return advance();
      break;
    case 'survive':
      if (world.wanted < step.wanted) world.setWanted(step.wanted);
      m.timer += dt;
      if (m.timer >= step.seconds) return advance();
      break;
    case 'grab':
      if (distTo(step.at) < step.r) {
        p.cash += 500;
        world.addEvent('cash-grab');
        world.audio.cash();
        return advance();
      }
      break;
    default:
      break;
  }
  return null;
}
