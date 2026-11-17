// Solara City tuning: every number a designer would reach for lives here,
// so the rest of the game reads like rules instead of magic constants.

// --- The world: one square city on a regular road grid. ---
export const WORLD_W = 3840;
export const WORLD_H = 3840;
export const ROAD_W = 76;
export const BLOCK = 320;
export const GRID_N = 12; // road centrelines per side
export const GRID0 = 240; // position of the first centreline
export const ROAD_AT = (i) => GRID0 + i * BLOCK;

// Fixed-step simulation: the world advances in sixtieths of a second.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solara-city-save-v1';

// --- Jay on foot. ---
export const WALK_SPEED = 210;
export const RUN_SPEED = 330;
export const PLAYER_RADIUS = 13;
export const PLAYER_HEALTH = 100;

// --- Cars: size, arcade handling, traffic and police pace. ---
export const CAR_W = 34;
export const CAR_L = 58;
export const CAR_ACCEL = 430;
export const CAR_BRAKE = 700;
export const CAR_MAX_SPEED = 560;
export const CAR_MAX_REVERSE = 200;
export const CAR_TURN = 2.55; // full-lock turn rate, scaled by speed
export const TRAFFIC_SPEED = 165;
export const POLICE_SPEED = 600;
export const CAR_HEALTH = 100;

// --- The heat: wanted stars, how fast they cool, how many cops each star buys. ---
// The decay only ticks while no cop can see the player, so ducking out of
// sight is the way out — and each star adds roughly one more interceptor.
export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 14;
export const POLICE_PER_STAR = [0, 2, 3, 4, 6, 8];

// --- Combat. ---
export const PUNCH_RANGE = 34;
export const PUNCH_DAMAGE = 12;
export const PISTOL_DAMAGE = 34;
export const PISTOL_RANGE = 420;
export const PISTOL_AMMO_START = 24;

// --- Money on the street. ---
export const TAXI_FARE_BASE = 60;
export const STASH_VALUE = 250;

// --- Camera: how far the lens pulls back on foot versus behind the wheel. ---
export const CAMERA_ZOOM_FOOT = 1.0;
export const CAMERA_ZOOM_CAR = 0.86;
