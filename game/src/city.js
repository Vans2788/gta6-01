// Solara City itself: a sun-soaked coastal town on a 12x12 road grid.
// generateCity rolls the dice once per block — tower, shops, a park, a car
// park — then pins the story's named places to fixed intersections so the
// missions always know where to send the player. It also answers the two
// questions every system asks: "is this spot blocked?" and "where's the road?"
import { WORLD_W, WORLD_H, ROAD_W, BLOCK, GRID_N, ROAD_AT } from './config.js';

const DOWNTOWN_COLORS = ['#c96f4a', '#b45a68', '#8a6d9e', '#5a7d8c', '#a8895a', '#7a5a8c'];
const OLD_TOWN_COLORS = ['#d9a05b', '#c98a4b', '#b87a5a', '#d9b06a'];
const MARINA_COLORS = ['#5a8fa8', '#6aa8b8', '#4a7d99', '#7ab0a8'];
const ROOF_COLORS = ['#3d4457', '#4a3d55', '#2f3d4a', '#54423a'];

export function districtAt(x, y) {
  if (y > 3480) return 'beach';
  if (x > 2600 && y > 2000) return 'marina';
  if (x < 1400 && y > 2200) return 'oldtown';
  if (y < 1300 && x > 1200 && x < 2600) return 'downtown';
  return 'midtown';
}

function makeBuilding(x, y, w, h, color, rng, floors) {
  return {
    x, y, w, h, color,
    roof: rng.pick(ROOF_COLORS),
    floors,
    windows: rng.int(2, 4),
    sign: rng.chance(0.35) ? rng.pick(['HOTEL', 'CAFÉ', 'BAR', 'SHOP', 'BANK', 'CLUB', 'GYM', 'PIZZA']) : null,
  };
}

export function generateCity(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const lots = [];

  for (let bx = 0; bx < GRID_N - 1; bx++) {
    for (let by = 0; by < GRID_N - 1; by++) {
      const x0 = ROAD_AT(bx) + ROAD_W / 2 + 8;
      const y0 = ROAD_AT(by) + ROAD_W / 2 + 8;
      const w = BLOCK - ROAD_W - 16;
      const h = BLOCK - ROAD_W - 16;
      const cx = x0 + w / 2;
      const cy = y0 + h / 2;
      const district = districtAt(cx, cy);
      // The southern blocks are beach, not streets: no buildings, parks or
      // car parks there — the sand and the sea are drawn by the renderer.
      if (district === 'beach') continue;
      const roll = rng.next();
      if (roll < 0.14) {
        // A park: lawn, a crossing path, and a scatter of trees.
        parks.push({ x: x0, y: y0, w, h, district });
        const treeCount = rng.int(5, 9);
        for (let i = 0; i < treeCount; i++) {
          trees.push({
            x: rng.range(x0 + 16, x0 + w - 16),
            y: rng.range(y0 + 16, y0 + h - 16),
            r: rng.range(9, 15),
            shade: rng.pick(['#3f7d44', '#4c8a3f', '#35703d']),
          });
        }
        continue;
      }
      if (roll < 0.22) {
        // A car park. The parked cars themselves are spawned by vehicles.js.
        lots.push({ x: x0, y: y0, w, h, district });
        continue;
      }
      // Buildings: a single downtown tower, or a row of two or three shops.
      const palette = district === 'downtown' ? DOWNTOWN_COLORS
        : district === 'oldtown' ? OLD_TOWN_COLORS
        : district === 'marina' ? MARINA_COLORS : DOWNTOWN_COLORS;
      if (district === 'downtown' && rng.chance(0.5)) {
        const bw = rng.range(120, 190);
        const bh = rng.range(120, 190);
        buildings.push(makeBuilding(cx - bw / 2, cy - bh / 2, bw, bh, rng.pick(palette), rng, 3));
      } else {
        const shopCount = rng.int(2, 3);
        for (let i = 0; i < shopCount; i++) {
          const bw = rng.range(70, 110);
          const bh = rng.range(70, 110);
          const px = x0 + rng.range(4, w - bw - 4);
          const py = y0 + rng.range(4, h - bh - 4);
          buildings.push(makeBuilding(px, py, bw, bh, rng.pick(palette), rng, 1));
        }
      }
    }
  }

  // Story places, pinned to fixed intersections so missions can find them.
  const places = {
    martasGarage: { x: ROAD_AT(2), y: ROAD_AT(2), name: "Marta's Garage", color: '#e8b64c' },
    palmeraHotel: { x: ROAD_AT(6), y: ROAD_AT(1), name: 'Palmera Grand Hotel', color: '#e87a5a' },
    raysGarage: { x: ROAD_AT(9), y: ROAD_AT(3), name: "Ray's Chop Shop", color: '#7ab0e8' },
    marina: { x: ROAD_AT(9), y: ROAD_AT(10), name: 'Solara Marina', color: '#5ac8c8' },
    docks: { x: ROAD_AT(11), y: ROAD_AT(10), name: 'Harbor Docks', color: '#c8a05a' },
    warehouse: { x: ROAD_AT(1), y: ROAD_AT(9), name: 'Kestrel Warehouse', color: '#b05a6a' },
    plaza: { x: ROAD_AT(5), y: ROAD_AT(5), name: 'Plaza del Sol', color: '#e8c85a' },
    beachBar: { x: ROAD_AT(6), y: ROAD_AT(11), name: 'Sunset Bar', color: '#ff9a5a' },
  };

  return {
    buildings, parks, trees, lots, places,
    // True when a circle of radius r at (x, y) would hit a building, the
    // world border, or the sea along the south edge.
    isBlocked(x, y, r) {
      if (x < 40 + r || x > WORLD_W - 40 - r || y < 40 + r) return true;
      if (y > 3560 - r) return true; // the sea
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
      }
      return false;
    },
    // The closest road centreline coordinate along one axis.
    nearestRoadCoord(v) {
      let best = ROAD_AT(0);
      for (let i = 0; i < GRID_N; i++) {
        if (Math.abs(ROAD_AT(i) - v) < Math.abs(best - v)) best = ROAD_AT(i);
      }
      return best;
    },
    roadIndex(v) {
      let best = 0;
      for (let i = 0; i < GRID_N; i++) {
        if (Math.abs(ROAD_AT(i) - v) < Math.abs(ROAD_AT(best) - v)) best = i;
      }
      return best;
    },
    // True when the point sits on asphalt (within a road band, either way).
    onRoad(x, y) {
      for (let i = 0; i < GRID_N; i++) {
        if (Math.abs(x - ROAD_AT(i)) < ROAD_W / 2 + 4) return true;
        if (Math.abs(y - ROAD_AT(i)) < ROAD_W / 2 + 4) return true;
      }
      return false;
    },
  };
}
