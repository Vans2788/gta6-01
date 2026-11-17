// Everything the eye sees: the city from above, the cars, the people, the
// police lights, the effects, the HUD with its minimap, and the menus.
// All drawing is plain canvas 2D, culling anything outside the camera view.

import { WORLD_W, WORLD_H, ROAD_W, SIDEWALK_W, CAR_LENGTH, CAR_WIDTH, PLAYER_RADIUS, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_MISSION = 'mission';

const MINIMAP_W = 190;
const MINIMAP_H = 138;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(car, time, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      roundRect(-CAR_LENGTH / 2 - 5, -CAR_WIDTH / 2 - 5, CAR_LENGTH + 10, CAR_WIDTH + 10, 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(-CAR_LENGTH / 2 + 3, -CAR_WIDTH / 2 + 3, CAR_LENGTH, CAR_WIDTH, 7);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 7);
    ctx.fill();
    ctx.fillStyle = '#20262e';
    roundRect(-8, -CAR_WIDTH / 2 + 3, 16, CAR_WIDTH - 6, 4);
    ctx.fill();
    ctx.fillStyle = '#9fc4d8';
    roundRect(6, -CAR_WIDTH / 2 + 4, 10, CAR_WIDTH - 8, 3);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#ffe9a3';
    ctx.fillRect(CAR_LENGTH / 2 - 3, -CAR_WIDTH / 2 + 3, 3, 5);
    ctx.fillRect(CAR_LENGTH / 2 - 3, CAR_WIDTH / 2 - 8, 3, 5);
    if (car.kind === 'police') {
      const flash = Math.floor(time * 3) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-4, -CAR_WIDTH / 2 - 2, 8, 5);
      ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-4, CAR_WIDTH / 2 - 3, 8, 5);
    }
    if (car.missionCar) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 0);
    }
    ctx.restore();
  }

  function drawPed(ped, time) {
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(ped.x, ped.y);
    const bob = Math.sin(time * 10 + ped.x) * 1.5;
    ctx.fillStyle = ped.isCop ? '#1f3a93' : ped.color || '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.isCop) {
      ctx.fillStyle = '#0f2360';
      ctx.fillRect(-5, -8 + bob * 0.3, 10, 4);
    }
    ctx.restore();
  }

  function drawCity(world, view) {
    const city = world.city;
    const { x0, y0, x1, y1 } = view;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Harbor: sand then water along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0, Math.max(y0, city.harbor.y), x1 - x0, Math.max(0, Math.min(y1, city.harbor.waterY) - Math.max(y0, city.harbor.y)));
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, Math.max(y0, city.harbor.waterY), x1 - x0, Math.max(0, y1 - Math.max(y0, city.harbor.waterY)));
    // Parks.
    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks then roads.
    for (const rx of city.vRoads) {
      if (rx < x0 - ROAD_W || rx > x1 + ROAD_W) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - ROAD_W / 2 - SIDEWALK_W, y0, ROAD_W + SIDEWALK_W * 2, y1 - y0);
    }
    for (const ry of city.hRoads) {
      if (ry < y0 - ROAD_W || ry > y1 + ROAD_W) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x0, ry - ROAD_W / 2 - SIDEWALK_W, x1 - x0, ROAD_W + SIDEWALK_W * 2);
    }
    for (const rx of city.vRoads) {
      if (rx < x0 - ROAD_W || rx > x1 + ROAD_W) continue;
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
      ctx.fillStyle = PALETTE.lane;
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
        ctx.fillRect(rx - 2, y, 4, 22);
      }
    }
    for (const ry of city.hRoads) {
      if (ry < y0 - ROAD_W || ry > y1 + ROAD_W) continue;
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
      ctx.fillStyle = PALETTE.lane;
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
        ctx.fillRect(x, ry - 2, 22, 4);
      }
    }
    // Buildings with windows.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 8);
      ctx.fillStyle = 'rgba(30, 40, 60, 0.5)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          ctx.fillRect(b.x + 10 + c * 26, b.y + 22 + r * 26, 12, 10);
        }
      }
    }
    // Trees.
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#43a047';
      ctx.beginPath();
      ctx.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMinimap(world) {
    const w = canvas.width;
    const h = canvas.height;
    const mx = 16;
    const my = h - MINIMAP_H - 16;
    const sx = MINIMAP_W / WORLD_W;
    const sy = MINIMAP_H / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    roundRect(mx - 6, my - 6, MINIMAP_W + 12, MINIMAP_H + 12, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(mx, my, MINIMAP_W, MINIMAP_H);
    ctx.clip();
    ctx.fillStyle = '#20262e';
    ctx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 1.5;
    for (const rx of world.city.vRoads) {
      ctx.beginPath();
      ctx.moveTo(mx + rx * sx, my);
      ctx.lineTo(mx + rx * sx, my + MINIMAP_H);
      ctx.stroke();
    }
    for (const ry of world.city.hRoads) {
      ctx.beginPath();
      ctx.moveTo(mx, my + ry * sy);
      ctx.lineTo(mx + MINIMAP_W, my + ry * sy);
      ctx.stroke();
    }
    if (world.mission.marker) {
      ctx.fillStyle = '#f1c40f';
      const px = mx + world.mission.marker.x * sx;
      const py = my + world.mission.marker.y * sy;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.cars) {
      ctx.fillStyle = car.kind === 'police' ? '#ff4444' : '#cfd8dc';
      ctx.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
    }
    const p = world.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Viewport rectangle.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    const vx = mx + (world.camera.x - canvas.width / 2) * sx;
    const vy = my + (world.camera.y - canvas.height / 2) * sy;
    ctx.strokeRect(vx, vy, canvas.width * sx, canvas.height * sy);
    // District name above the map.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(world.city.districtAt(p.x, p.y), mx, my - 18);
  }

  function drawHud(world, ui) {
    const p = world.player;
    const w = canvas.width;
    ctx.textBaseline = 'top';
    // Cash, health, ammo — top left.
    ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    roundRect(12, 12, 250, 92, 8);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 24, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Ammo  ${p.ammo}  •  ${p.car ? 'Driving' : 'On foot'}`, 24, 52);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(24, 74, 150, 10);
    ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(24, 74, 150 * (p.health / 100), 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(p.health)} HP`, 182, 70);
    // Wanted stars — top right.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < world.wanted ? '★' : '☆';
    ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    const starW = ctx.measureText('★★★★★').width;
    roundRect(w - 24 - starW - 28, 12, starW + 28, 44, 8);
    ctx.fill();
    ctx.fillStyle = world.wanted > 0 ? '#ffd94d' : '#888888';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(stars, w - 24, 18);
    // Mission tracker — top centre.
    if (world.mission.active) {
      const text = ui.missionText;
      ctx.font = 'bold 16px system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(world.mission.title).width, ctx.measureText(text).width);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
      roundRect(w / 2 - tw / 2 - 18, 12, tw + 36, 58, 8);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.textAlign = 'center';
      ctx.fillText(world.mission.title.toUpperCase(), w / 2, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(text, w / 2, 42);
    }
    // Off-screen mission marker arrow.
    if (world.mission.marker) {
      const m = world.mission.marker;
      const dx = m.x - world.camera.x;
      const dy = m.y - world.camera.y;
      const onScreen = Math.abs(dx) < canvas.width / 2 - 60 && Math.abs(dy) < canvas.height / 2 - 60;
      if (!onScreen) {
        const a = Math.atan2(dy, dx);
        const ax = canvas.width / 2 + Math.cos(a) * (Math.min(canvas.width, canvas.height) / 2 - 70);
        const ay = canvas.height / 2 + Math.sin(a) * (Math.min(canvas.width, canvas.height) / 2 - 70);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.hypot(dx, dy))}m`, ax, ay + 16);
      }
    }
    // Controls hint — bottom right.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD move / drive   •   E enter car   •   Click shoot   •   F punch   •   P pause   •   M mission', w - 16, canvas.height - 22);
    drawMinimap(world);
    // Transient banner.
    if (ui.banner) {
      ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
      ctx.font = 'bold 22px system-ui, sans-serif';
      const bw = ctx.measureText(ui.banner).width + 40;
      roundRect(w / 2 - bw / 2, canvas.height * 0.3, bw, 46, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd94d';
      ctx.textAlign = 'center';
      ctx.fillText(ui.banner, w / 2, canvas.height * 0.3 + 11);
    }
  }

  function drawTitle(world, ui) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#ff9a3c');
    grad.addColorStop(0.5, '#ff5e62');
    grad.addColorStop(1, '#7b2ff7');
    ctx.fillStyle = grad;
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SOLARA CITY', w / 2, h * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An open-world crime game in the spirit of GTA 6 — made for make.fun', w / 2, h * 0.3 + 58);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#ffd94d';
    ctx.fillText('Mara Voss. One city. Six jobs. No brakes.', w / 2, h * 0.3 + 92);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = 'bold 24px system-ui, sans-serif';
    const lines = ui.hasSave
      ? ['Press ENTER — Continue (mission ' + (ui.saveMission + 1) + ' of 6)', 'Press N — New game']
      : ['Press ENTER — New game'];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.58 + i * 36));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('WASD move / drive  •  E steal & enter cars  •  Mouse click to shoot  •  F punch  •  Shift run  •  P pause', w / 2, h * 0.58 + lines.length * 36 + 24);
    ctx.fillText('Steal cars, outrun the police, run six story missions. Your progress saves automatically.', w / 2, h * 0.58 + lines.length * 36 + 50);
    if (ui.best > 0) {
      ctx.fillStyle = '#2ecc71';
      ctx.fillText(`Saved cash: $${ui.best.toLocaleString('en-US')}`, w / 2, h * 0.58 + lines.length * 36 + 78);
    }
  }

  function drawCentre(title, sub, color) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = 'rgba(5, 8, 12, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, h * 0.42);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(sub, w / 2, h * 0.42 + 56);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Press ENTER to continue', w / 2, h * 0.42 + 96);
  }

  return {
    draw(world, screen, ui) {
      const time = world.time;
      if (screen === SCREEN_TITLE) {
        drawTitle(world, ui);
        return;
      }
      const w = canvas.width;
      const h = canvas.height;
      const camX = world.camera.x - w / 2;
      const camY = world.camera.y - h / 2;
      const view = { x0: camX - 40, y0: camY - 40, x1: camX + w + 40, y1: camY + h + 40 };
      ctx.save();
      ctx.translate(-Math.round(camX), -Math.round(camY));
      drawCity(world, view);
      // Skid marks.
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.45)';
      ctx.lineWidth = 4;
      for (const s of world.skids) {
        ctx.globalAlpha = Math.min(1, s.life / 6);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Pickups.
      for (const pk of world.pickups) {
        if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
        ctx.fillStyle = pk.kind === 'cash' ? '#2ecc71' : pk.kind === 'ammo' ? '#f39c12' : '#e74c3c';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'ammo' ? 'A' : '+', pk.x, pk.y + 1);
      }
      // Mission marker beacon.
      if (world.mission.marker) {
        const m = world.mission.marker;
        const pulse = 1 + Math.sin(time * 4) * 0.15;
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(241, 196, 15, 0.18)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y - 34);
        ctx.lineTo(m.x - 10, m.y - 14);
        ctx.lineTo(m.x + 10, m.y - 14);
        ctx.closePath();
        ctx.fill();
      }
      // Cars, peds, enemies, bullets, particles.
      for (const car of world.cars) {
        if (car.x < view.x0 || car.x > view.x1 || car.y < view.y0 || car.y > view.y1) continue;
        drawCar(car, time, car === world.player.car);
      }
      for (const e of world.enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(e.angle) * 22, Math.sin(e.angle) * 22);
        ctx.stroke();
        ctx.fillStyle = '#f1c27d';
        ctx.beginPath();
        ctx.arc(Math.cos(e.angle) * 3, Math.sin(e.angle) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const ped of world.peds) {
        if (ped.x < view.x0 || ped.x > view.x1 || ped.y < view.y0 || ped.y > view.y1) continue;
        drawPed(ped, time);
      }
      if (!world.player.car) {
        const p = world.player;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = '#f5f5f5';
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(Math.cos(p.facing) * 4, Math.sin(p.facing) * 4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(p.facing) * 20, Math.sin(p.facing) * 20);
        ctx.stroke();
        ctx.restore();
      }
      for (const b of world.bullets) {
        ctx.fillStyle = '#ffe45e';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const pt of world.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.max);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
        drawHud(world, ui);
        if (screen === SCREEN_PAUSED) {
          ctx.fillStyle = 'rgba(5, 8, 12, 0.55)';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 56px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('PAUSED', w / 2, h * 0.42);
          ctx.font = '18px system-ui, sans-serif';
          ctx.fillText('Press P or ENTER to keep playing', w / 2, h * 0.42 + 48);
        }
      } else if (screen === SCREEN_WASTED) {
        drawHud(world, ui);
        drawCentre('WASTED', 'Mara is down. The city keeps moving.', '#e74c3c');
      } else if (screen === SCREEN_BUSTED) {
        drawHud(world, ui);
        drawCentre('BUSTED', 'The cops caught up with you. Dario is not happy.', '#3498db');
      } else if (screen === SCREEN_MISSION) {
        drawHud(world, ui);
        drawCentre('MISSION COMPLETE', ui.missionLine || '', '#2ecc71');
      }
    },
  };
}
