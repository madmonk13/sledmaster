// Keyboard plus touch/mouse on the game canvas. The first finger down steers (and slingshots the
// launch); a second finger held anywhere fires the rocket. In the air, a quick flick of any finger
// is a trick.

const BLOCKED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
const STEER_PX = 70; // drag this far sideways for full lock (at sensitivity 1)
const SWIPE_PX = 40; // in the air, a flick counts as a trick swipe if the finger moves this far...
const SWIPE_MS = 100; // ...within this long. A steering drag is much slower, so it never qualifies.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedAt = new Map(); // code -> when it went down
    this.pointers = new Map(); // id -> { id, startX, startY, x, y, trail } (trail: recent { t, x, y } samples for swipe speed)
    this.steerId = null; // the pointer that steers (and aims the launch)
    this.steerPx = STEER_PX;
    this.onKeyDown = null;
    this.onKeyUp = null; // (code, heldMs)
    this.onPointerDown = null; // the steering finger only
    this.onPointerUp = null; // the steering finger only
    this.onSwipe = null; // (dir: 'up' | 'down' | 'left' | 'right') while swipes are armed
    this.swipeArmed = false;

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressedAt.set(e.code, e.timeStamp);
        this.onKeyDown?.(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const down = this.pressedAt.get(e.code);
      this.pressedAt.delete(e.code);
      if (down !== undefined) this.onKeyUp?.(e.code, e.timeStamp - down);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressedAt.clear();
      this.pointers.clear();
      this.steerId = null;
    });

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, trail: [] };
      this.pointers.set(e.pointerId, p);
      if (this.steerId === null) {
        this.steerId = e.pointerId;
        this.onPointerDown?.(p);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!this.swipeArmed) return;
      // a swipe is a quick flick: how far the finger has moved in the last SWIPE_MS
      p.trail.push({ t: e.timeStamp, x: p.x, y: p.y });
      while (p.trail.length > 1 && e.timeStamp - p.trail[0].t > SWIPE_MS) p.trail.shift();
      const dx = p.x - p.trail[0].x, dy = p.y - p.trail[0].y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      p.trail.length = 0; // one flick, one trick
      this.onSwipe?.(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (e.pointerId !== this.steerId) return;
      // hand steering to a finger that's still down, starting from where it is now
      this.steerId = null;
      for (const q of this.pointers.values()) {
        q.startX = q.x;
        q.startY = q.y;
        this.steerId = q.id;
        break;
      }
      this.onPointerUp?.(p);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // the steering finger, or null
  get pointer() {
    return this.pointers.get(this.steerId) ?? null;
  }

  // Swipes only count while armed (in the air). Arming forgets each finger's earlier movement, so
  // a steering drag held through the take-off doesn't count towards a swipe.
  armSwipes(on) {
    if (on && !this.swipeArmed) for (const p of this.pointers.values()) p.trail.length = 0;
    this.swipeArmed = on;
  }

  // 1 is the original feel; lower needs a longer drag for the same turn, higher a shorter one
  setSensitivity(k) {
    this.steerPx = STEER_PX / k;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // -1..1, positive = right
  steer() {
    let s = 0;
    if (this.down('ArrowLeft', 'KeyA')) s -= 1;
    if (this.down('ArrowRight', 'KeyD')) s += 1;
    const p = this.pointer;
    if (p) s += (p.x - p.startX) / this.steerPx;
    return Math.max(-1, Math.min(1, s));
  }

  // Rocket: Space or Shift, or a second finger anywhere on the screen. (↑ and W are flips in the air.)
  boost() {
    return this.pointers.size >= 2 || this.down('Space', 'ShiftLeft', 'ShiftRight');
  }
}
