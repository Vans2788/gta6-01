// Keyboard and mouse input. Held keys steer and move; one-shot presses are
// queued as bit flags and taken exactly once by the loop, so a press is never
// lost and never counted twice.
//
// THE HARD RULE: takeActions() is called ONCE per frame, before the fixed
// steps, and it clears the flags as it reads them. A plain "is key down"
// lookup double-fires when one frame runs several fixed steps (one tap of E
// exited a car and re-entered it in the same frame). Edge actions live only
// in these flags; the fixed steps read held keys, never the flags.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let run = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (RUN.has(event.code)) run = true;
    else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (RUN.has(event.code)) run = false;
  });
  function releaseAll() {
    up = down = left = right = run = false;
    mouseDown = false;
  }
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', releaseAll);
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_SHOOT;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Release every held key at once (tab blur, screen changes). */
    releaseAll,
    /** Held movement keys as {x, y} in [-1, 1], normalised. */
    move() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** Held steering for a car: -1 left, 1 right, plus throttle in [-1, 1]. */
    drive() {
      const steer = (right ? 1 : 0) - (left ? 1 : 0);
      const throttle = (up ? 1 : 0) - (down ? 1 : 0);
      return { steer, throttle };
    },
    running() {
      return run;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call; reading clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
