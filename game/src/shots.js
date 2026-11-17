// Staged scenes for the entry's screenshots. Each one drops the live game
// into a real playable state — a chase, a street corner, a beach drive, a
// shootout — then lets the normal renderer and HUD paint it, so every shot
// is the game itself and never a mock-up. ?shot=cover|street|drive|mission
// (with &seed=N) picks the scene.
import { ROAD_AT } from './config.js';
import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { setWanted } from './police.js';
import { startMission } from './missions.js';

function placeTraffic(state, specs) {
  for (const s of specs) {
    const car = makeCar(s.x, s.y, s.angle, s.type, 'traffic');
    car.speed = s.speed || 0;
    car.route = [{ x: s.x + 2000, y: s.y }];
    state.cars.push(car);
  }
}

function placePeds(state, cx, cy, count) {
  for (let i = 0; i < count; i++) {
    const x = cx + state.rng.range(-260, 260);
    const y = cy + state.rng.range(-180, 180);
    // Never inside a building, and never on top of the player or their car.
    if (state.city.isBlocked(x, y, 6)) continue;
    if (Math.hypot(x - state.player.x, y - state.player.y) < 80) continue;
    state.peds.push(makePed(x, y, state.rng));
  }
}

function aimCamera(state, x, y, zoom) {
  state.camera.x = x;
  state.camera.y = y;
  state.camera.zoom = zoom;
  state.camera.shake = 0;
}

export function stageShot(name, state) {
  const places = state.city.places;
  if (name === 'cover') {
    // A three-star chase down a downtown avenue: Jay in a red sportscar,
    // two interceptors on his tail, traffic ahead, the Drop running.
    const px = ROAD_AT(5);
    const py = ROAD_AT(5);
    const car = makeCar(px, py, Math.PI / 2, 'sport', 'player');
    car.color = '#d94040';
    car.speed = 380;
    state.cars.push(car);
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = px;
    state.player.y = py;
    state.player.angle = Math.PI / 2;
    state.player.money = 2840;
    const cop1 = makeCar(px - 230, py + 14, Math.PI / 2, 'police', 'police');
    cop1.speed = 430;
    const cop2 = makeCar(px - 330, py - 16, Math.PI / 2, 'police', 'police');
    cop2.speed = 410;
    state.cars.push(cop1, cop2);
    placeTraffic(state, [
      { x: px + 320, y: py - 6, angle: Math.PI / 2, type: 'taxi', speed: 150 },
      { x: px + 520, y: py + 18, angle: Math.PI / 2, type: 'sedan', speed: 140 },
      { x: px + 700, y: py - 20, angle: -Math.PI / 2, type: 'van', speed: 120 },
      { x: px - 60, y: py + 200, angle: 0, type: 'hatch', speed: 130 },
    ]);
    placePeds(state, px + 100, py, 8);
    // Mission index 3 is The Drop: a timed delivery with the cops already on
    // the player's plate, which is exactly the chase the cover wants to show.
    startMission(state, 3); // The Drop: 100 seconds, docks target.
    setWanted(state, 3);
    state.mission.timer = 87;
    state.message = { text: 'The Drop — lose the cops, make the docks!', t: 5, color: '#e8b64c' };
    aimCamera(state, px + 90, py, 0.86);
  } else if (name === 'street') {
    // On foot at Plaza del Sol: pedestrians, traffic, the first fare waiting.
    const px = ROAD_AT(5);
    const py = ROAD_AT(5);
    state.player.x = px + 40;
    state.player.y = py + 60;
    state.player.angle = Math.PI / 4;
    state.player.money = 120;
    placeTraffic(state, [
      { x: px - 260, y: py - 6, angle: Math.PI / 2, type: 'sedan', speed: 150 },
      { x: px + 180, y: py + 18, angle: Math.PI / 2, type: 'taxi', speed: 140 },
      { x: px + 420, y: py - 20, angle: -Math.PI / 2, type: 'coupe', speed: 160 },
      { x: px - 40, y: py - 260, angle: Math.PI, type: 'van', speed: 120 },
    ]);
    placePeds(state, px, py, 14);
    startMission(state, 0); // First Fare: pick up at the Palmera Grand.
    state.message = { text: 'First Fare — pick up the client at the Palmera Grand', t: 5, color: '#e8b64c' };
    aimCamera(state, px + 60, py + 40, 1.0);
  } else if (name === 'drive') {
    // A sunset drive along the beach road in a blue coupe, taxi fare aboard.
    const px = ROAD_AT(6);
    const py = ROAD_AT(11);
    const car = makeCar(px, py, Math.PI / 2, 'coupe', 'player');
    car.speed = 340;
    state.cars.push(car);
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = px;
    state.player.y = py;
    state.player.angle = Math.PI / 2;
    state.player.money = 1960;
    placeTraffic(state, [
      { x: px + 380, y: py - 6, angle: Math.PI / 2, type: 'sedan', speed: 150 },
      { x: px + 640, y: py + 18, angle: Math.PI / 2, type: 'hatch', speed: 130 },
      { x: px - 300, y: py - 20, angle: -Math.PI / 2, type: 'taxi', speed: 140 },
    ]);
    placePeds(state, px + 200, py - 120, 6);
    state.taxi = {
      fare: 140,
      target: { x: places.marina.x, y: places.marina.y, name: 'Solara Marina', color: '#5ac8c8' },
      passenger: null,
    };
    state.message = { text: 'Taxi fare: Solara Marina — $140', t: 5, color: '#7ac86a' };
    aimCamera(state, px + 120, py - 170, 0.8);
  } else if (name === 'mission') {
    // Payback: the warehouse shootout. Jay armed, Kestrels closing in.
    const w = places.warehouse;
    state.player.x = w.x + 40;
    state.player.y = w.y + 180;
    state.player.angle = -Math.PI / 6;
    state.player.weapon = 'pistol';
    state.player.ammo = 18;
    state.player.health = 82;
    state.player.money = 3420;
    // startMission('payback') already posts 4 Kestrels at the warehouse.
    const cop = makeCar(w.x + 420, w.y + 260, Math.PI, 'police', 'police');
    cop.speed = 200;
    state.cars.push(cop);
    placeTraffic(state, [
      { x: w.x + 520, y: w.y - 200, angle: 0, type: 'van', speed: 120 },
    ]);
    setWanted(state, 2);
    startMission(state, 4); // Payback.
    state.mission.objective = 'Clear out the Kestrels at the warehouse (4 left)';
    state.particles.push({
      x: state.player.x + 30, y: state.player.y - 20,
      vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
      color: '#ffd76a', size: 9, kind: 'muzzle',
    });
    state.message = { text: 'Payback — the Kestrels jumped one of ours. Settle it.', t: 5, color: '#e8b64c' };
    aimCamera(state, w.x + 40, w.y + 40, 1.0);
  }
  // Let the staged world settle for a few frames so traffic and peds spread out.
  return name;
}
