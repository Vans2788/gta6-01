// Solara City itself: a procedurally generated grid of streets, blocks,
// buildings and parks, built once from a seed so the same seed always gives
// the same city. The world also answers the questions the traffic, the
// pedestrians and the missions ask it: where is the nearest road, what lane
// runs here, is this point inside a building.

import { WORLD_W, WORLD_H, ROAD_SPACING, ROAD_W, SIDEWALK_W, PALETTE } from './config.js';

const ROOF_COLORS = [PALETTE.buildingRoof, PALETTE.buildingRoof2, PALETTE.buildingRoof3, '#a89a6b', '#7d8ba0'];
const DISTRICTS = [
  { name: 'Meridian Plaza', x: 0.5, y: 0.42 },
  { name: 'Old Harbor', x: 0.5, y: 0.94 },
  { name: 'Northgate', x: 0.5, y: 0.08 },
  { name: 'Sunset Strip', x: 0.12, y: 0.5 },
  { name: 'The Docks', x: 0.88, y: 0.85 },
  { name: 'Civic Center', x: 0.85, y: 0.2 },
];

export function buildCity(rng) {
  const vRoads = [];
  const hRoads = [];
  for (let x = ROAD_SPACING / 2; x < WORLD_W; x += ROAD_SPACING) vRoads.push(x);
  for (let y = ROAD_SPACING / 2; y < WORLD_H; y += ROAD_SPACING) hRoads.push(y);

  const buildings = [];
  const parks = [];
  const trees = [];

  // Each block between four roads holds buildings, or a park.
  for (let i = 0; i < vRoads.length - 1; i += 1) {
    for (let j = 0; j < hRoads.length - 1; j += 1) {
      const bx = vRoads[i] + ROAD_W / 2 + SIDEWALK_W;
      const by = hRoads[j] + ROAD_W / 2 + SIDEWALK_W;
      const bw = vRoads[i + 1] - vRoads[i] - ROAD_W - SIDEWALK_W * 2;
      const bh = hRoads[j + 1] - hRoads[j] - ROAD_W - SIDEWALK_W * 2;
      if (rng.chance(0.22)) {
        const park = { x: bx, y: by, w: bw, h: bh };
        parks.push(park);
        const count = rng.int(4, 9);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: bx + rng.range(14, bw - 14), y: by + rng.range(14, bh - 14), r: rng.range(7, 12) });
        }
        continue;
      }
      const cols = rng.chance(0.5) ? 2 : 1;
      const rows = rng.chance(0.5) ? 2 : 1;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const w = (bw - (cols - 1) * 18) / cols;
          const h = (bh - (rows - 1) * 18) / rows;
          buildings.push({
            x: bx + c * (w + 18),
            y: by + r * (h + 18),
            w,
            h,
            color: rng.pick(ROOF_COLORS),
            shade: rng.range(0.85, 1.1),
          });
        }
      }
    }
  }

  // The southern edge is the harbor: sand, then water.
  const harbor = { y: WORLD_H - 170, waterY: WORLD_H - 90 };

  // Parked cars line the roads.
  const parking = [];
  for (let i = 0; i < 46; i += 1) {
    const horizontal = rng.chance(0.5);
    if (horizontal) {
      const y = rng.pick(hRoads);
      parking.push({ x: rng.range(140, WORLD_W - 140), y: y + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 - 14), angle: rng.chance(0.5) ? 0 : Math.PI });
    } else {
      const x = rng.pick(vRoads);
      parking.push({ x: x + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 - 14), y: rng.range(140, WORLD_H - 260), angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 });
    }
  }

  const city = {
    vRoads,
    hRoads,
    buildings,
    parks,
    trees,
    parking,
    harbor,
    districts: DISTRICTS.map((d) => ({ name: d.name, x: d.x * WORLD_W, y: d.y * WORLD_H })),
  };

  // --- Queries -------------------------------------------------------------

  /** True when the point is on a road surface (not sidewalk, not a block). */
  city.isOnRoad = (x, y) => {
    for (const rx of vRoads) if (Math.abs(x - rx) < ROAD_W / 2) return true;
    for (const ry of hRoads) if (Math.abs(y - ry) < ROAD_W / 2) return true;
    return false;
  };

  /** The road axis ('v' or 'h') and centre line nearest the point. */
  city.nearestRoad = (x, y) => {
    let best = null;
    for (const rx of vRoads) {
      const d = Math.abs(x - rx);
      if (!best || d < best.d) best = { axis: 'v', line: rx, d };
    }
    for (const ry of hRoads) {
      const d = Math.abs(y - ry);
      if (!best || d < best.d) best = { axis: 'h', line: ry, d };
    }
    return best;
  };

  /** Push a circle out of every building it overlaps; returns true on a hit. */
  city.collideCircle = (body) => {
    let hit = false;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < body.r * body.r) {
        hit = true;
        if (dist2 > 0.0001) {
          const dist = Math.sqrt(dist2);
          body.x = cx + (dx / dist) * body.r;
          body.y = cy + (dy / dist) * body.r;
        } else {
          // Centre inside the building: leave by the nearest face.
          const left = body.x - b.x + body.r;
          const right = b.x + b.w - body.x + body.r;
          const top = body.y - b.y + body.r;
          const bottom = b.y + b.h - body.y + body.r;
          const min = Math.min(left, right, top, bottom);
          if (min === left) body.x = b.x - body.r;
          else if (min === right) body.x = b.x + b.w + body.r;
          else if (min === top) body.y = b.y - body.r;
          else body.y = b.y + b.h + body.r;
        }
      }
    }
    return hit;
  };

  city.clamp = (body, margin) => {
    body.x = Math.max(margin, Math.min(WORLD_W - margin, body.x));
    body.y = Math.max(margin, Math.min(WORLD_H - margin, body.y));
  };

  city.randomRoadPoint = () => {
    if (rng.chance(0.5)) {
      return { x: rng.pick(vRoads), y: rng.range(80, WORLD_H - 220) };
    }
    return { x: rng.range(80, WORLD_W - 80), y: rng.pick(hRoads) };
  };

  city.randomSidewalkPoint = () => {
    const p = city.randomRoadPoint();
    const road = city.nearestRoad(p.x, p.y);
    const off = ROAD_W / 2 + SIDEWALK_W / 2;
    if (road.axis === 'v') return { x: p.x + (rng.chance(0.5) ? -off : off), y: p.y };
    return { x: p.x, y: p.y + (rng.chance(0.5) ? -off : off) };
  };

  city.districtAt = (x, y) => {
    let best = city.districts[0];
    let bestD = Infinity;
    for (const d of city.districts) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best.name;
  };

  return city;
}
