// Keyboard + a single tracked pointer (mouse or touch) on the game canvas.

const BLOCKED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pointer = null; // { id, startX, startY, x, y }
    this.boostButton = false;
    this.onKeyDown = null;
    this.onPointerDown = null;
    this.onPointerUp = null;

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.onKeyDown?.(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer = null;
      this.boostButton = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (this.pointer) return;
      canvas.setPointerCapture(e.pointerId);
      this.pointer = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
      this.onPointerDown?.(this.pointer);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointer && this.pointer.id === e.pointerId) {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.pointer && this.pointer.id === e.pointerId) {
        const p = this.pointer;
        this.pointer = null;
        this.onPointerUp?.(p);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // -1..1, positive = right
  steer() {
    let s = 0;
    if (this.down('ArrowLeft', 'KeyA')) s -= 1;
    if (this.down('ArrowRight', 'KeyD')) s += 1;
    if (this.pointer) {
      s += (this.pointer.x - this.pointer.startX) / 70;
    }
    return Math.max(-1, Math.min(1, s));
  }

  boost() {
    return this.boostButton || this.down('Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'KeyW');
  }
}
