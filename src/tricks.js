// Aerial tricks. A trick is one full 360° turn that takes a fixed time, so it has to be started
// early enough to finish before touchdown. Tricks can be chained within one jump: the first
// scores 1x its base points, the second 2x, the third 3x and so on. Landing mid-trick is a crash.
// Points are paid out as coins at the end of the run, so they're small next to Just Ski's score.

export const TRICKS = {
  up: { name: 'Front flip', axis: 'x', sign: 1, time: 0.65, points: 10 },
  down: { name: 'Back flip', axis: 'x', sign: -1, time: 0.65, points: 10 },
  left: { name: 'Spin left', axis: 'y', sign: 1, time: 0.55, points: 8 },
  right: { name: 'Spin right', axis: 'y', sign: -1, time: 0.55, points: 8 },
};

export const TRICK_KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const FORGIVE = 0.9; // landing this far through a trick still counts as finishing it
export const TAP_MS = 150; // a trick key pressed and released within this is a tap (a trick); held longer, ←/→ steer
const BUFFER = 0.15; // a press in the last this-many seconds of a trick is held for the next one

export class Tricks {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = null; // { ...TRICKS entry }
    this.t = 0; // seconds into the current trick
    this.buffered = null; // a trick asked for just before the current one ended
    this.count = 0; // tricks completed in this jump
    this.total = 0; // points scored from tricks this run
  }

  get active() {
    return !!this.current;
  }

  // 0..1 through the current trick
  get progress() {
    return this.current ? Math.min(1, this.t / this.current.time) : 0;
  }

  // Ask for a trick. It starts now. While one is under way the request is ignored, except in
  // its last moments, when one press is held and starts the instant the current trick ends,
  // so chaining doesn't need frame-perfect timing.
  request(dir) {
    const trick = TRICKS[dir];
    if (!trick) return;
    if (!this.current) {
      this.current = trick;
      this.t = 0;
    } else if (this.current.time - this.t <= BUFFER) {
      this.buffered = trick;
    }
  }

  // Advance by dt while in the air. Returns the trick that finished on this step, if any:
  // { name, points, count } where points already include the combo multiplier.
  update(dt) {
    if (!this.current) return null;
    this.t += dt;
    if (this.t < this.current.time) return null;
    return this.finish();
  }

  finish() {
    const trick = this.current;
    this.count++;
    const points = trick.points * this.count;
    this.total += points;
    this.current = this.buffered;
    this.buffered = null;
    this.t = 0;
    return { name: trick.name, points, count: this.count };
  }

  // Touchdown. Returns { crashed, finished } where finished is a trick completed by the
  // forgiveness margin; the combo resets either way.
  land() {
    let crashed = false;
    let finished = null;
    if (this.current) {
      if (this.progress >= FORGIVE) finished = this.finish();
      else crashed = true;
    }
    this.current = null;
    this.buffered = null;
    this.t = 0;
    this.count = 0;
    return { crashed, finished };
  }

  // Drop whatever is in progress (after a crash).
  cancel() {
    this.current = null;
    this.buffered = null;
    this.t = 0;
    this.count = 0;
  }
}
