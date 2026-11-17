// Keyboard and mouse, sampled once per frame by the loop. Actions carry the
// player's intent ("run", "steal a car") rather than the key that fires them,
// so rebinding later is a one-line change in the table below.
export const ACTION_UP = 'up';
export const ACTION_DOWN = 'down';
export const ACTION_LEFT = 'left';
export const ACTION_RIGHT = 'right';
export const ACTION_ENTER_CAR = 'enterCar';
export const ACTION_ATTACK = 'attack';
export const ACTION_BRAKE = 'brake';
export const ACTION_PAUSE = 'pause';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_MUTE = 'mute';
export const ACTION_RUN = 'run';

const KEY_BINDINGS = {
  KeyW: ACTION_UP, ArrowUp: ACTION_UP,
  KeyS: ACTION_DOWN, ArrowDown: ACTION_DOWN,
  KeyA: ACTION_LEFT, ArrowLeft: ACTION_LEFT,
  KeyD: ACTION_RIGHT, ArrowRight: ACTION_RIGHT,
  KeyE: ACTION_ENTER_CAR,
  Space: ACTION_BRAKE,
  KeyF: ACTION_ATTACK,
  KeyP: ACTION_PAUSE, Escape: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  KeyM: ACTION_MUTE,
  ShiftLeft: ACTION_RUN, ShiftRight: ACTION_RUN,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function keyDown(event) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) pressed.add(action);
    held.add(action);
  }

  function keyUp(event) {
    const action = KEY_BINDINGS[event.code];
    if (action) held.delete(action);
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  function mouseDown(event) {
    trackMouse(event);
    mouse.down = true;
    mouse.clicked = true;
    pressed.add(ACTION_ATTACK);
    held.add(ACTION_ATTACK);
  }

  function mouseUp() {
    mouse.down = false;
    held.delete(ACTION_ATTACK);
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', mouseDown);
  window.addEventListener('mouseup', mouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held(action) { return held.has(action); },
    // Edge-triggered: a press is consumed the first time it is read, so one
    // tap fires exactly one action even when the frame runs several fixed
    // simulation steps (an unconsumed press would exit the car and then
    // re-enter it in the very next sub-step of the same frame).
    pressed(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      return true;
    },
    mouse,
    // Called at the end of every frame: edge-triggered presses live one frame.
    endFrame() { pressed.clear(); mouse.clicked = false; },
  };
}
