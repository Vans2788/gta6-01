// Solara City — shared tuning constants for the open-world game.
// One place for every number the world, the missions and the renderer agree on,
// so a balance change touches this file and nowhere else.

export const STEP = 1 / 60;
export const SAVE_KEY = 'solara-city-save-v1';

// World size in pixels. The city is a grid of roads; blocks sit between them.
export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_SPACING = 450;
export const ROAD_W = 96;
export const SIDEWALK_W = 26;

// The player's on-foot movement.
export const WALK_SPEED = 150;
export const RUN_SPEED = 235;
export const PLAYER_RADIUS = 13;
export const PLAYER_HEALTH = 100;

// Cars: top speed, acceleration and steering, in pixels and radians.
export const CAR_TOP_SPEED = 560;
export const CAR_ACCEL = 420;
export const CAR_BRAKE = 640;
export const CAR_REVERSE_SPEED = 190;
export const CAR_STEER = 2.5;
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;

// Combat.
export const PISTOL_DAMAGE = 34;
export const PISTOL_RANGE = 430;
export const PISTOL_AMMO_START = 24;
export const PISTOL_AMMO_MAX = 120;
export const PUNCH_DAMAGE = 20;
export const PUNCH_RANGE = 34;
export const PED_HEALTH = 50;
export const COP_HEALTH = 90;

// Wanted level: 0 to 5 stars. Police numbers and aggression scale with it.
export const WANTED_MAX = 5;
export const EVADE_SECONDS = 14;
export const COP_CAR_SPEED = 520;
export const COP_FOOT_SPEED = 205;

// Money.
export const CASH_START = 150;
export const MISSION_PAYOUTS = [400, 650, 900, 1400, 1800, 3200];

// Pickups.
export const PICKUP_RADIUS = 18;

// Colours for the sun-soaked city palette.
export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9c4c',
  park: '#69a854',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#e8d44d',
  sidewalk: '#9aa0a8',
  buildingRoof: '#b08968',
  buildingRoof2: '#8d7b8a',
  buildingRoof3: '#6f8f9e',
  buildingEdge: '#5d4a3a',
  water: '#4d8fb5',
  sand: '#d9c48a',
};
