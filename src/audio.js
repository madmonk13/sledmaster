// Synthesized sound effects (Web Audio, no sample files). Continuous layers for wind,
// runners and the rocket follow the sled each frame; everything else is a one-shot.
// Browsers only allow audio after a user gesture, so the context starts on the first
// pointer or key press.

const MUTE_KEY = 'sledmaster.muted';
const COIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19]; // pentatonic climb for coin streaks

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = loadMuted();
    this.combo = 0;
    this.lastCoin = 0;
    this.lastPull = 0;
    const unlock = () => this.unlock();
    // iOS Safari only unlocks audio on some gesture types, so listen to all of them
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, unlock, { capture: true });
    }
  }

  unlock() {
    if (this.ctx) {
      // iOS reports 'interrupted' after a call or app switch, not just 'suspended'
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.kick();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS treats Web Audio as "ambient" and the ring/silent switch mutes it; ask for
    // media playback instead (Safari 16.4+), with a silent <audio> loop for older iOS
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    this.keepAlive();
    const ctx = (this.ctx = new AC());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx.state !== 'running') ctx.resume().catch(() => {});
    });

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp);

    // two seconds of white noise, shared by every noisy sound
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.wind = this.loop('lowpass', 300, 0.5);
    this.runner = this.loop('lowpass', 900, 0.5);
    this.rocket = this.loop('lowpass', 380, 0.9);
    this.rumble = ctx.createOscillator();
    this.rumble.type = 'sawtooth';
    this.rumble.frequency.value = 52;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 160;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumble.connect(rumbleLp).connect(this.rumbleGain).connect(this.master);
    this.rumble.start();

    // slingshot band creak while pulling
    this.creak = ctx.createOscillator();
    this.creak.type = 'sawtooth';
    this.creak.frequency.value = 90;
    const creakBp = ctx.createBiquadFilter();
    creakBp.type = 'bandpass';
    creakBp.frequency.value = 700;
    creakBp.Q.value = 4;
    this.creakGain = ctx.createGain();
    this.creakGain.gain.value = 0;
    this.creak.connect(creakBp).connect(this.creakGain).connect(this.master);
    this.creak.start();
    this.kick();
  }

  // Play a one-sample silent buffer inside the gesture; older iOS only truly starts
  // the context once something has been scheduled during a user activation.
  kick() {
    this.keepAlive();
    const b = this.ctx.createBufferSource();
    b.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    b.connect(this.ctx.destination);
    b.start(0);
  }

  // A looping, silent <audio> element puts the page in the media-playback category on
  // iOS versions without navigator.audioSession, so the silent switch stops muting us.
  keepAlive() {
    if (navigator.audioSession) return;
    if (!this.silentEl) {
      const rate = 8000, n = rate / 2; // half a second of 8-bit silence
      const buf = new ArrayBuffer(44 + n);
      const v = new DataView(buf);
      const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true);
      v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
      new Uint8Array(buf, 44).fill(128);
      const el = (this.silentEl = document.createElement('audio'));
      el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      el.loop = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('x-webkit-airplay', 'deny');
    }
    if (this.silentEl.paused) this.silentEl.play().catch(() => {}); // retried on the next gesture
  }

  // A looping noise source through a filter into its own gain (starts silent).
  loop(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(0, Math.random() * 1.5);
    return { filter, gain };
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* preference just won't persist */
    }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  // ---------- continuous ----------

  // s: { running, speed, contact, onIce, airborne, boosting }
  update(s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const speed = s.running ? s.speed : 0;
    const k = Math.min(1, speed / 45);

    // wind: low-passed rush that swells and opens up a little with speed, a touch stronger in the air
    const windVol = Math.pow(k, 1.4) * (s.airborne ? 0.2 : 0.14);
    this.wind.gain.gain.setTargetAtTime(windVol, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(180 + speed * 11, t, 0.2);

    // runners: soft low-passed crunch on snow, a quiet thin hiss on ice, silent in the air
    const onGround = s.running && s.contact;
    const crunch = s.onIce ? 1 : 0.75 + Math.random() * 0.5;
    const runVol = onGround ? Math.min(1, speed / 18) * (s.onIce ? 0.05 : 0.1) * crunch : 0;
    this.runner.gain.gain.setTargetAtTime(runVol, t, 0.04);
    this.runner.filter.frequency.setTargetAtTime(s.onIce ? 2600 : 700 + speed * 14, t, 0.08);

    const boost = s.running && s.boosting;
    this.rocket.gain.gain.setTargetAtTime(boost ? 0.55 : 0, t, 0.06);
    this.rumbleGain.gain.setTargetAtTime(boost ? 0.18 : 0, t, 0.06);
  }

  // pull: 0..1 slingshot draw; creaks while it changes
  stretch(pull, dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rate = Math.abs(pull - this.lastPull) / Math.max(dt, 1e-3);
    this.lastPull = pull;
    this.creakGain.gain.setTargetAtTime(Math.min(0.12, rate * 0.08), t, 0.03);
    this.creak.frequency.setTargetAtTime(70 + pull * 90, t, 0.05);
  }

  stopStretch() {
    if (!this.ready) return;
    this.lastPull = 0;
    this.creakGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  // ---------- one-shot helpers ----------

  tone(freq, { type = 'sine', at = 0, dur = 0.2, vol = 0.2, attack = 0.004, slideTo = null, out = this.master } = {}) {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  burst({ type = 'bandpass', freq = 1000, slideTo = null, q = 1, at = 0, dur = 0.3, vol = 0.3, attack = 0.01 } = {}) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- events ----------

  // Metallic clink: a bright fundamental plus inharmonic bell partials that die fast.
  // Coins picked up in quick succession climb a pentatonic scale.
  coin() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.combo = now - this.lastCoin < 0.6 ? Math.min(this.combo + 1, COIN_STEPS.length - 1) : 0;
    this.lastCoin = now;
    const f = 1250 * Math.pow(2, COIN_STEPS[this.combo] / 12);
    this.tone(f, { type: 'triangle', dur: 0.32, vol: 0.16 });
    this.tone(f * 2.76, { dur: 0.16, vol: 0.07 });
    this.tone(f * 5.4, { dur: 0.07, vol: 0.04 });
    this.tone(f * 1.5, { type: 'triangle', at: 0.05, dur: 0.22, vol: 0.06 });
  }

  // Band snapping forward: a falling twang and a whoosh.
  launch(power) {
    if (!this.ready) return;
    this.stopStretch();
    this.tone(220 + power * 80, { type: 'triangle', dur: 0.3, vol: 0.3, slideTo: 55 });
    this.tone(110, { type: 'square', dur: 0.08, vol: 0.06 });
    this.burst({ freq: 600, slideTo: 2600, q: 0.8, dur: 0.45, vol: 0.25 * (0.4 + power), attack: 0.03 });
  }

  // Booster pad: rising zip and a quick arpeggio.
  pad() {
    if (!this.ready) return;
    this.burst({ freq: 500, slideTo: 4000, q: 1.2, dur: 0.4, vol: 0.3, attack: 0.02 });
    this.tone(300, { type: 'square', dur: 0.28, vol: 0.06, slideTo: 1200 });
    [660, 880, 1320].forEach((f, i) => this.tone(f, { type: 'triangle', at: 0.04 + i * 0.05, dur: 0.14, vol: 0.09 }));
  }

  // Landing: a soft thump and a puff of snow, bigger for harder landings.
  landing(impact) {
    if (!this.ready) return;
    const k = Math.min(1, impact / 20);
    this.tone(95, { dur: 0.22, vol: 0.12 + 0.3 * k, slideTo: 40 });
    this.burst({ type: 'lowpass', freq: 900 + 900 * k, q: 0.5, dur: 0.25 + 0.2 * k, vol: 0.12 + 0.25 * k });
  }

  // Airtime bonus: two-note chime.
  chime() {
    if (!this.ready) return;
    this.tone(1046, { type: 'triangle', dur: 0.25, vol: 0.12 });
    this.tone(1568, { type: 'triangle', at: 0.09, dur: 0.35, vol: 0.12 });
  }

  // Run over: a little fanfare for a new best, otherwise a gentle sign-off.
  runEnd(newBest) {
    if (!this.ready) return;
    if (newBest) {
      [523, 659, 784, 1046].forEach((f, i) =>
        this.tone(f, { type: 'triangle', at: i * 0.11, dur: i === 3 ? 0.6 : 0.18, vol: 0.16 }));
      this.tone(1568, { at: 0.33, dur: 0.6, vol: 0.05 });
    } else {
      this.tone(659, { type: 'triangle', dur: 0.2, vol: 0.12 });
      this.tone(523, { type: 'triangle', at: 0.14, dur: 0.4, vol: 0.12 });
    }
  }

  // Shop purchase: ka-ching.
  purchase() {
    if (!this.ready) return;
    this.burst({ type: 'highpass', freq: 3000, q: 0.7, dur: 0.12, vol: 0.12 });
    [1568, 2093].forEach((f, i) => {
      this.tone(f, { type: 'triangle', at: 0.06 + i * 0.08, dur: 0.3, vol: 0.12 });
      this.tone(f * 2.76, { at: 0.06 + i * 0.08, dur: 0.12, vol: 0.04 });
    });
  }

  // Smashing through a snowman: a crunchy whump with crumbling snow after it.
  smash(speed) {
    if (!this.ready) return;
    const k = Math.min(1, speed / 35);
    this.tone(130, { dur: 0.25, vol: 0.35, slideTo: 45 });
    this.burst({ type: 'lowpass', freq: 2400, slideTo: 400, q: 0.7, dur: 0.5, vol: 0.4 + 0.2 * k, attack: 0.005 });
    for (let i = 0; i < 4; i++) {
      this.burst({ freq: 1400 + Math.random() * 1600, q: 1.5, at: 0.06 + i * 0.07 + Math.random() * 0.04, dur: 0.12, vol: 0.12 });
    }
  }

  // Crashing into a snowman too slowly: a dull bonk and a cartoon boing.
  bonk() {
    if (!this.ready) return;
    this.tone(85, { dur: 0.3, vol: 0.45, slideTo: 38 });
    this.burst({ type: 'lowpass', freq: 700, q: 0.6, dur: 0.25, vol: 0.3 });
    this.tone(260, { type: 'triangle', at: 0.05, dur: 0.45, vol: 0.12, slideTo: 140 });
  }

  // Hitting a tree or igloo; severity 0..1 (1 = head-on) scales the impact.
  thud(kind, severity) {
    if (!this.ready) return;
    const k = 0.35 + 0.65 * severity;
    if (kind === 'tree') {
      // woody thunk, then snow sliding off the branches
      this.tone(150, { type: 'triangle', dur: 0.22, vol: 0.32 * k, slideTo: 70 });
      this.burst({ freq: 420, q: 2, dur: 0.16, vol: 0.25 * k });
      this.burst({ type: 'highpass', freq: 2500, q: 0.5, at: 0.08, dur: 0.6, vol: 0.06 + 0.08 * severity, attack: 0.08 });
    } else {
      // dull whump of packed snow
      this.tone(70, { dur: 0.3, vol: 0.4 * k, slideTo: 35 });
      this.burst({ type: 'lowpass', freq: 600, q: 0.7, dur: 0.35, vol: 0.35 * k });
    }
  }

  click() {
    if (!this.ready) return;
    this.tone(900, { type: 'triangle', dur: 0.05, vol: 0.06, slideTo: 600 });
  }
}
