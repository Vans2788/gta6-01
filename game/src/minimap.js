// The minimap: the whole of Solara City shrunk into a corner of the screen —
// land, sea and beach, the road grid, parks and named places, the pulsing
// mission or taxi target, blue police blips, red rival blips and the white
// player arrow pointing the way the player faces.
import { WORLD_W, WORLD_H, ROAD_W, ROAD_AT, GRID_N } from './config.js';

export function drawMinimap(ctx, state, x, y, size) {
  const scale = size / WORLD_W;
  ctx.save();
  ctx.translate(x, y);
  // Frame.
  ctx.fillStyle = 'rgba(10,14,26,0.85)';
  ctx.fillRect(-6, -6, size + 12, size + 12);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-6, -6, size + 12, size + 12);
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();
  // Land, then the beach band and the sea along the south edge.
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e8d49a';
  ctx.fillRect(0, 3480 * scale, size, 90 * scale);
  ctx.fillStyle = '#2a7fa8';
  ctx.fillRect(0, 3570 * scale, size, (WORLD_H - 3570) * scale);
  // The road grid.
  ctx.fillStyle = '#3a3f4a';
  for (let i = 0; i < GRID_N; i++) {
    ctx.fillRect(0, (ROAD_AT(i) - ROAD_W / 2) * scale, size, ROAD_W * scale);
    ctx.fillRect((ROAD_AT(i) - ROAD_W / 2) * scale, 0, ROAD_W * scale, size);
  }
  // Parks.
  ctx.fillStyle = '#4c8a3f';
  for (const park of state.city.parks) {
    ctx.fillRect(park.x * scale, park.y * scale, park.w * scale, park.h * scale);
  }
  // Named places as gold dots.
  ctx.fillStyle = '#e8b64c';
  for (const key of Object.keys(state.city.places)) {
    const place = state.city.places[key];
    ctx.beginPath();
    ctx.arc(place.x * scale, place.y * scale, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // The mission or taxi target, pulsing so it is easy to spot.
  const target = state.mission?.target || state.taxi?.target;
  if (target) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = target.color;
    ctx.beginPath();
    ctx.arc(target.x * scale, target.y * scale, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police interceptors in blue, Kestrel rivals in red. The blips are drawn
  // a touch larger than the place dots so a chase reads at a glance.
  ctx.fillStyle = '#3a6aff';
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.removed) continue;
    ctx.beginPath();
    ctx.arc(car.x * scale, car.y * scale, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3a3a';
  for (const rival of state.rivals) {
    ctx.beginPath();
    ctx.arc(rival.x * scale, rival.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow rotated to the facing direction.
  const p = state.player;
  ctx.save();
  ctx.translate(p.x * scale, p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#20242e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // North marker.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', size / 2, 11);
  ctx.restore();
}
