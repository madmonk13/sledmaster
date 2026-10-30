// Point-mass sled physics. Every step is ballistic (gravity, drag, thrust, lift);
// if that puts the sled below the snow it is pushed back to the surface and the
// into-ground velocity is removed, so slopes, crests and jumps all fall out naturally.

import * as THREE from 'three';
import { SNOWMAN_H, SNOWMAN_R } from './terrain.js';

export const GRAVITY = 12;
export const ICE_MU = 0.01;
const LIFT_K = 0.0045;
const WING_DRAG_K = 0.0015;
const MAX_X = 62;
const CARVE_LOSS = 0.3; // share of scrubbed sideways energy lost when carving a turn
const PAD_KICK = 3; // instant m/s from a booster pad...
const PAD_SURGE = 0.5; // ...then this many seconds of extra push
const PAD_ACCEL = 9;
export const SHATTER_SPEED = 12; // m/s: at or above this a snowman bursts, below it the sled stops dead
export const SHATTER_KEEP = 0.55; // share of speed kept after smashing through
const SLED_R = 0.6;

const tmpN = new THREE.Vector3();

export class SledBody {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.facing = 0; // yaw; forward = (sin, 0, cos)
    this.contact = true;
    this.airTime = 0; // seconds since the runners last touched snow
    this.deploy = 0; // wing deployment 0..1
    this.fuel = 0;
    this.boosting = false;
    this.onIce = false;
    this.surge = 0; // booster pad push remaining, seconds
    this.lastPad = null;
    this.padHits = 0; // pads hit since the game last read it
    this.snowmanHits = []; // { snowman, kind: 'smash' | 'bonk', speed, vel } since the game last read it
    this.lastSnowman = null;
    this.landing = null; // { impact, airTime } set on the step the sled lands
  }

  get speed() {
    return this.vel.length();
  }

  get airborne() {
    return this.airTime > 0.15;
  }

  // ctl: { steer: -1..1 (positive = right), boost: bool }
  step(dt, ctl, st, terrain) {
    const p = this.pos;
    const v = this.vel;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    this.landing = null;

    v.y -= GRAVITY * dt;

    this.boosting = false;
    if (ctl.boost && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - dt);
      v.x += fx * st.thrust * dt;
      v.z += fz * st.thrust * dt;
      this.boosting = true;
    }
    if (this.surge > 0) {
      this.surge = Math.max(0, this.surge - dt);
      v.x += fx * PAD_ACCEL * dt;
      v.z += fz * PAD_ACCEL * dt;
    }

    let speed = v.length();
    if (speed > 0) {
      const drag = Math.min(speed, st.dragK * speed * speed * dt);
      v.multiplyScalar(1 - drag / speed);
    }

    // wings open once properly airborne and fold on the snow
    const wantDeploy = st.wing && this.airborne ? 1 : 0;
    this.deploy += (wantDeploy - this.deploy) * Math.min(1, dt * 6);

    if (!this.contact) {
      // air steering: weak without wings, better with them
      const airControl = st.wing ? st.wing.air : 0.25;
      const dyaw = -ctl.steer * st.turnRate * airControl * dt;
      this.facing += dyaw;
      rotateHorizontal(v, dyaw * (st.wing ? 0.9 : 0.3));

      if (st.wing && this.deploy > 0.3) this.applyLift(dt, st.wing);
    }

    p.addScaledVector(v, dt);
    if (Math.abs(p.x) > MAX_X) {
      p.x = Math.sign(p.x) * MAX_X;
      v.x = 0;
    }

    const ground = terrain.height(p.x, p.z);
    this.checkSnowman(terrain, ground);
    const wasAirTime = this.airTime;
    if (p.y <= ground) {
      p.y = ground;
      const n = terrain.normal(p.x, p.z, tmpN);
      const vn = v.dot(n);
      if (vn < 0) {
        v.addScaledVector(n, -vn);
        if (wasAirTime > 0.3) {
          const impact = -vn;
          if (impact > 10) v.multiplyScalar(Math.max(0.8, 1 - (impact - 10) * 0.015));
          this.landing = { impact, airTime: wasAirTime };
        }
      }
      this.contact = true;
      this.airTime = 0;
      this.onIce = terrain.isIce(p.x, p.z);
      this.groundStep(dt, ctl, st, n);
      // booster pad: fires once per pad, on entry
      const pad = terrain.padAt(p.x, p.z);
      if (pad && pad !== this.lastPad) {
        v.x += fx * PAD_KICK;
        v.z += fz * PAD_KICK;
        this.surge = PAD_SURGE;
        this.padHits++;
      }
      this.lastPad = pad;
    } else {
      this.contact = false;
      this.airTime += dt;
    }
  }

  // Snowmen: smash through when fast, stop dead when slow. Clear them with enough air.
  checkSnowman(terrain, ground) {
    const p = this.pos, v = this.vel;
    const sm = p.y - ground < SNOWMAN_H ? terrain.snowmanAt(p.x, p.z, SLED_R) : null;
    if (!sm) {
      this.lastSnowman = null;
      return;
    }
    const speed = v.length();
    if (sm !== this.lastSnowman) {
      if (speed >= SHATTER_SPEED) {
        sm.broken = true;
        this.snowmanHits.push({ snowman: sm, kind: 'smash', speed, vel: v.clone() });
        v.multiplyScalar(SHATTER_KEEP);
        this.surge = 0;
        return;
      }
      this.snowmanHits.push({ snowman: sm, kind: 'bonk', speed, vel: v.clone() });
      v.set(0, Math.min(0, v.y), 0);
      this.surge = 0;
    }
    this.lastSnowman = sm;
    // still touching (e.g. rocketing into it): push out and drop the inward velocity so you can slide round
    const dx = p.x - sm.x, dz = p.z - sm.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const reach = SNOWMAN_R + SLED_R;
    p.x = sm.x + nx * reach;
    p.z = sm.z + nz * reach;
    const vin = v.x * nx + v.z * nz;
    if (vin < 0) {
      v.x -= vin * nx;
      v.z -= vin * nz;
    }
  }

  groundStep(dt, ctl, st, n) {
    const v = this.vel;
    const speed = v.length();

    // friction
    const mu = this.onIce ? ICE_MU : st.mu;
    const decel = mu * GRAVITY * n.y;
    if (speed > 0) v.multiplyScalar(1 - Math.min(speed, decel * dt) / speed);

    // steering turns the sled; the runners then pull the velocity round to match
    const steerScale = Math.min(1, speed / 3) * (this.onIce ? 0.6 : 1);
    this.facing -= ctl.steer * st.turnRate * steerScale * dt;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const rx = -fz, rz = fx; // right-hand side of the sled
    const vf = v.x * fx + v.z * fz;
    const vl = v.x * rx + v.z * rz;
    const grip = this.onIce ? st.iceGrip : st.grip;
    const vlNew = vl * Math.exp(-grip * dt);
    // Redirect the scrubbed sideways speed forward without ever creating energy:
    // the horizontal speed² can only shrink, by CARVE_LOSS of what was scrubbed.
    const h2 = vf * vf + vl * vl;
    const h2New = h2 - CARVE_LOSS * (vl * vl - vlNew * vlNew);
    const vfNew = Math.sign(vf || 1) * Math.sqrt(Math.max(0, h2New - vlNew * vlNew));
    v.x = fx * vfNew + rx * vlNew;
    v.z = fz * vfNew + rz * vlNew;
  }

  // Lift acts perpendicular to the velocity (in the vertical plane), so it bends the
  // flight path rather than adding energy; induced drag pays for the glide.
  applyLift(dt, wing) {
    const v = this.vel;
    const sp = v.length();
    if (sp < 1) return;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const align = (v.x * fx + v.z * fz) / sp;
    if (align < 0.2) return;
    const uy = v.y / sp;
    const perpLen = Math.sqrt(Math.max(1e-6, 1 - uy * uy));
    const lx = (-v.x / sp * uy) / perpLen;
    const ly = (1 - uy * uy) / perpLen;
    const lz = (-v.z / sp * uy) / perpLen;
    const lift = Math.min(wing.lift * LIFT_K * sp * sp * align * this.deploy, 1.2 * GRAVITY);
    v.x += lx * lift * dt;
    v.y += ly * lift * dt;
    v.z += lz * lift * dt;
    const drag = Math.min(sp, wing.drag * WING_DRAG_K * sp * sp * this.deploy * dt);
    v.multiplyScalar(1 - drag / sp);
  }
}

function rotateHorizontal(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x;
  v.z = z;
}
