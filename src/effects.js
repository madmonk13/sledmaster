// Coin pickup effect: the coin hops up over the penguin, spins and shrinks away,
// with a burst of golden glints. Ghost coins ride along with the sled so they
// stay in view at any speed.

import * as THREE from 'three';
import { coinGeo, coinMat, carrotGeo, snowBodyMat, coalMat, carrotMat } from './terrain.js';

const GHOSTS = 24;
const GHOST_LIFE = 0.42;
const GLINTS = 240;
const GLINTS_PER_COIN = 10;
const GLINT_LIFE = 0.5;
const HOP = new THREE.Vector3(0, 2.3, 0); // where the ghost coin ends up, relative to the sled

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,214,70,1)');
  g.addColorStop(0.6, 'rgba(240,160,20,0.7)');
  g.addColorStop(1, 'rgba(240,160,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  // four-point star streaks
  ctx.fillStyle = 'rgba(255,236,150,1)';
  ctx.fillRect(15, 1, 2, 30);
  ctx.fillRect(1, 15, 30, 2);
  return new THREE.CanvasTexture(c);
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

export class CoinFx {
  constructor(scene) {
    this.ghosts = [];
    for (let i = 0; i < GHOSTS; i++) {
      const material = coinMat.clone();
      material.transparent = true;
      const mesh = new THREE.Mesh(coinGeo, material);
      mesh.visible = false;
      scene.add(mesh);
      this.ghosts.push({ mesh, t: 1, from: new THREE.Vector3() });
    }
    this.nextGhost = 0;

    this.glintPos = new Float32Array(GLINTS * 3).fill(-99999);
    this.glintCol = new Float32Array(GLINTS * 3);
    this.glintVel = new Float32Array(GLINTS * 3);
    this.glintLife = new Float32Array(GLINTS);
    this.nextGlint = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.glintPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.glintCol, 3));
    this.glints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.7, map: glintTexture(), vertexColors: true, transparent: true,
        depthWrite: false, alphaTest: 0.02,
      }),
    );
    this.glints.frustumCulled = false;
    scene.add(this.glints);
  }

  // pos: the coin's world position at pickup; body: the sled it flies to
  collect(pos, body) {
    const g = this.ghosts[this.nextGhost];
    this.nextGhost = (this.nextGhost + 1) % GHOSTS;
    g.t = 0;
    g.from.copy(pos).sub(body.pos);
    g.mesh.visible = true;
    g.mesh.position.copy(pos);

    for (let k = 0; k < GLINTS_PER_COIN; k++) {
      const i = this.nextGlint;
      this.nextGlint = (this.nextGlint + 1) % GLINTS;
      const o = i * 3;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 0.5;
      const s = 3 + Math.random() * 3;
      this.glintPos[o] = pos.x;
      this.glintPos[o + 1] = pos.y;
      this.glintPos[o + 2] = pos.z;
      // inherit most of the sled's velocity so the burst doesn't streak backwards
      this.glintVel[o] = body.vel.x * 0.85 + Math.cos(a) * s;
      this.glintVel[o + 1] = body.vel.y * 0.85 + up * s;
      this.glintVel[o + 2] = body.vel.z * 0.85 + Math.sin(a) * s;
      this.glintLife[i] = GLINT_LIFE * (0.6 + Math.random() * 0.4);
    }
  }

  update(dt, body) {
    for (const g of this.ghosts) {
      if (g.t >= 1) continue;
      g.t = Math.min(1, g.t + dt / GHOST_LIFE);
      const m = g.mesh;
      if (g.t >= 1) {
        m.visible = false;
        continue;
      }
      const e = ease(g.t);
      m.position.copy(g.from).lerp(HOP, e).add(body.pos);
      m.position.y += Math.sin(g.t * Math.PI) * 0.6; // little arc on the way up
      const scale = g.t < 0.3 ? 1 + g.t * 1.5 : 1.45 * (1 - (g.t - 0.3) / 0.7) + 0.1;
      m.scale.setScalar(scale);
      m.rotation.y += dt * 22;
      m.material.opacity = g.t < 0.6 ? 1 : 1 - (g.t - 0.6) / 0.4;
    }

    for (let i = 0; i < GLINTS; i++) {
      if (this.glintLife[i] <= 0) continue;
      const o = i * 3;
      this.glintLife[i] -= dt;
      if (this.glintLife[i] <= 0) {
        this.glintPos[o + 1] = -99999;
        continue;
      }
      this.glintVel[o + 1] -= 6 * dt;
      this.glintPos[o] += this.glintVel[o] * dt;
      this.glintPos[o + 1] += this.glintVel[o + 1] * dt;
      this.glintPos[o + 2] += this.glintVel[o + 2] * dt;
      // flicker between white-hot and gold so the burst twinkles against bright snow
      const tw = 0.75 + 0.25 * Math.sin(this.glintLife[i] * 60 + i);
      this.glintCol[o] = 1;
      this.glintCol[o + 1] = tw;
      this.glintCol[o + 2] = tw * 0.8;
    }
    this.glints.geometry.attributes.position.needsUpdate = true;
    this.glints.geometry.attributes.color.needsUpdate = true;
  }
}

// Hazard hits. A snowman smash bursts it into tumbling chunks of snow (plus the carrot
// and coal) that bounce on the slope, and a slow bonk makes it wobble. Trees sway and
// shed snow from their branches; igloos throw up a puff of packed snow.
const DEBRIS = 72;
const DEBRIS_LIFE = 1.6;
const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
const debrisSnowMat = snowBodyMat.clone();
debrisSnowMat.flatShading = true;

const featherGeo = new THREE.PlaneGeometry(0.09, 0.22);
const featherMat = new THREE.MeshLambertMaterial({ color: 0xf6f8fb, side: THREE.DoubleSide });

// A penguin lying on its belly reaches this far below its origin (its feet when standing),
// and its body runs this far ahead of it toward the head, at scale 1.
const BELLY_DEPTH = 0.44;
const BODY_LENGTH = 1.3;

export class HazardFx {
  constructor(scene, terrainRef) {
    this.terrainRef = terrainRef; // () => current terrain, for bouncing off the snow
    this.pieces = [];
    for (let i = 0; i < DEBRIS; i++) {
      const mesh = new THREE.Mesh(chunkGeo, debrisSnowMat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pieces.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, size: 1 });
    }
    this.next = 0;
    this.wobbles = [];
    this.tumblers = [];
    this.dazed = [];
  }

  spawn(geo, mat, size, pos, vel) {
    const p = this.pieces[this.next];
    this.next = (this.next + 1) % DEBRIS;
    p.mesh.geometry = geo;
    p.mesh.material = mat;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.size = size;
    p.mesh.scale.setScalar(size);
    p.vel.copy(vel);
    p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    p.life = DEBRIS_LIFE * (0.7 + Math.random() * 0.3);
    p.floaty = false;
  }

  // hit: { snowman, vel } from the physics; vel is the sled's velocity before impact
  smash(hit) {
    const sm = hit.snowman;
    if (sm.mesh) sm.mesh.visible = false;
    const base = sm.mesh ? sm.mesh.position : new THREE.Vector3(sm.x, 0, sm.z);
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const balls = [[0.6, 0.75, 10], [1.5, 0.55, 8], [2.2, 0.4, 6]];
    for (const [y, r, count] of balls) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        pos.set(base.x + Math.cos(a) * r * 0.6, base.y + y + (Math.random() - 0.5) * r, base.z + Math.sin(a) * r * 0.6);
        vel.copy(hit.vel).multiplyScalar(0.55 + Math.random() * 0.35);
        vel.x += Math.cos(a) * (2 + Math.random() * 4);
        vel.z += Math.sin(a) * (2 + Math.random() * 4);
        vel.y += 2 + Math.random() * 5;
        this.spawn(chunkGeo, debrisSnowMat, r * (0.25 + Math.random() * 0.3), pos, vel);
      }
    }
    // the carrot and a few lumps of coal go flying too
    pos.set(base.x, base.y + 2.2, base.z);
    vel.copy(hit.vel).multiplyScalar(0.8);
    vel.y += 7;
    this.spawn(carrotGeo, carrotMat, 1, pos, vel);
    for (let i = 0; i < 4; i++) {
      vel.copy(hit.vel).multiplyScalar(0.6 + Math.random() * 0.3);
      vel.x += (Math.random() - 0.5) * 6;
      vel.y += 3 + Math.random() * 4;
      this.spawn(chunkGeo, coalMat, 0.06, pos, vel);
    }
  }

  bonk(hit) {
    if (hit.snowman.mesh) this.wobble(hit.snowman.mesh, 0.16);
  }

  // A bowled-over penguin flies off ahead of the sled, tumbling, then lands on its belly and
  // toboggans to a stop, flippers going. It stays lying there (chunk disposal cleans it up).
  knock(hit) {
    const pg = hit.penguin;
    const mesh = pg.mesh;
    if (!mesh) return;
    const vel = hit.vel.clone().multiplyScalar(0.85);
    const side = Math.random() < 0.5 ? -1 : 1;
    vel.x += side * (1.5 + Math.random() * 2.5);
    vel.y = Math.max(0, vel.y) + 4 + Math.min(4, hit.speed * 0.12);
    mesh.rotation.order = 'YXZ';
    mesh.userData.body.rotation.set(0, 0, 0);
    mesh.userData.body.position.y = 0;
    this.tumblers.push({ mesh, vel, flip: 0, spin: 9 + Math.random() * 5, t: 0, landed: false, scale: pg.scale });
    // a little snow kicked up where it stood
    const pos = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      pos.set(pg.x + (Math.random() - 0.5) * 0.6, mesh.position.y + 0.2, pg.z + (Math.random() - 0.5) * 0.6);
      v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3).addScaledVector(hit.vel, 0.3);
      this.spawn(chunkGeo, debrisSnowMat, 0.08 + Math.random() * 0.1, pos, v);
    }
  }

  // A bird strike: a puff of feathers, then the bird tumbles for a moment before it
  // flaps off up and away, out of the sled's path.
  birdHit(hit) {
    const mesh = hit.bird.mesh;
    if (!mesh) return;
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      pos.copy(mesh.position).add(vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6));
      vel.copy(hit.vel).multiplyScalar(0.3 + Math.random() * 0.3);
      vel.x += (Math.random() - 0.5) * 6;
      vel.y += 1 + Math.random() * 3;
      vel.z += (Math.random() - 0.5) * 6;
      this.spawn(featherGeo, featherMat, 1, pos, vel);
      this.pieces[(this.next + DEBRIS - 1) % DEBRIS].floaty = true;
    }
    const away = hit.vel.clone().setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    away.normalize();
    // knocked sideways off the sled's line, then away
    const side = Math.random() < 0.5 ? -1 : 1;
    const vx = away.x * 0.7 - away.z * side * 0.7, vz = away.z * 0.7 + away.x * side * 0.7;
    this.dazed.push({ mesh, t: 0, vel: new THREE.Vector3(vx * 14 + hit.vel.x * 0.4, 2, vz * 14 + hit.vel.z * 0.4), spin: (8 + Math.random() * 6) * side });
  }

  // Highest snow under a lying penguin, sampled from its feet to its head, so no part of
  // it sinks in on a slope or over a bump.
  slideFloor(mesh, scale) {
    const terrain = this.terrainRef();
    if (!terrain) return 0;
    const hx = -Math.sin(mesh.rotation.y), hz = -Math.cos(mesh.rotation.y); // head direction
    let floor = -Infinity;
    for (const k of [0, 0.5, 1]) {
      const d = k * BODY_LENGTH * scale;
      floor = Math.max(floor, terrain.height(mesh.position.x + hx * d, mesh.position.z + hz * d));
    }
    return floor;
  }

  // Too slow to bowl it over: the penguin rocks back, flapping indignantly.
  penguinBonk(hit) {
    const mesh = hit.penguin.mesh;
    if (!mesh) return;
    this.wobble(mesh, 0.22);
    mesh.userData.indignant = 1.2;
  }

  wobble(mesh, amp) {
    if (this.wobbles.some((w) => w.mesh === mesh)) return;
    this.wobbles.push({ mesh, t: 0, amp, baseX: mesh.rotation.x, baseZ: mesh.rotation.z });
  }

  // hit: { obstacle, severity, x, z } from the physics
  obstacle(hit) {
    const o = hit.obstacle;
    const terrain = this.terrainRef();
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    if (o.type === 'bear' && o.mesh) {
      this.wobble(o.mesh, 0.02 + 0.03 * hit.severity);
      o.mesh.userData.startled = 1.5; // snaps its head round to the sled (see update)
      o.mesh.userData.lookAt = Math.atan2(hit.x - o.x, hit.z - o.z) - o.rot;
    }
    if (o.type === 'tree') {
      if (o.mesh) this.wobble(o.mesh, 0.04 + 0.08 * hit.severity);
      const base = o.mesh ? o.mesh.position.y : terrain.height(o.x, o.z);
      const n = 6 + Math.round(10 * hit.severity);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = (0.6 + Math.random() * 1.1) * o.scale;
        pos.set(o.x + Math.cos(a) * rr, base + (2.4 + Math.random() * 3.2) * o.scale, o.z + Math.sin(a) * rr);
        vel.set(Math.cos(a) * Math.random() * 1.5, -Math.random() * 2, Math.sin(a) * Math.random() * 1.5);
        this.spawn(chunkGeo, debrisSnowMat, 0.08 + Math.random() * 0.14, pos, vel);
      }
    } else {
      const g = terrain ? terrain.height(hit.x, hit.z) : 0;
      const n = 5 + Math.round(9 * hit.severity);
      for (let i = 0; i < n; i++) {
        pos.set(hit.x + (Math.random() - 0.5) * 0.8, g + 0.4 + Math.random() * 0.8, hit.z + (Math.random() - 0.5) * 0.8);
        vel.set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 4);
        this.spawn(chunkGeo, debrisSnowMat, 0.1 + Math.random() * 0.18, pos, vel);
      }
    }
  }

  update(dt) {
    const terrain = this.terrainRef();
    for (const p of this.pieces) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const m = p.mesh;
      if (p.life <= 0) {
        m.visible = false;
        continue;
      }
      if (p.floaty) {
        // feathers: drag hard and drift down slowly
        p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
        p.vel.y = Math.max(p.vel.y - 6 * dt, -1.2);
      } else {
        p.vel.y -= 12 * dt;
      }
      m.position.addScaledVector(p.vel, dt);
      m.rotation.x += p.spin.x * dt;
      m.rotation.y += p.spin.y * dt;
      m.rotation.z += p.spin.z * dt;
      const floor = terrain ? terrain.height(m.position.x, m.position.z) + p.size * 0.5 : -Infinity;
      if (m.position.y < floor) {
        m.position.y = floor;
        if (p.vel.y < 0) p.vel.y *= -0.3;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
        p.spin.multiplyScalar(0.7);
      }
      m.scale.setScalar(p.size * Math.min(1, p.life / 0.4));
    }

    for (let i = this.tumblers.length - 1; i >= 0; i--) {
      const tb = this.tumblers[i];
      const m = tb.mesh;
      tb.t += dt;
      const flippers = m.userData.flippers;
      const ground = terrain ? terrain.height(m.position.x, m.position.z) : 0;
      const hSpeed = Math.hypot(tb.vel.x, tb.vel.z);
      if (hSpeed > 0.3) m.rotation.y = Math.atan2(-tb.vel.x, -tb.vel.z); // head (-z) leads
      if (!tb.landed) {
        tb.vel.y -= 12 * dt;
        m.position.addScaledVector(tb.vel, dt);
        tb.flip -= tb.spin * dt;
        m.rotation.x = tb.flip;
        if (tb.vel.y < 0 && m.position.y < ground + BELLY_DEPTH * tb.scale) {
          tb.landed = true;
          tb.flip = (((tb.flip % (Math.PI * 2)) - Math.PI * 2) % (Math.PI * 2)); // into (-2pi, 0]
          if (tb.flip < -1.5 * Math.PI) tb.flip += Math.PI * 2;
        }
      } else {
        // belly-sliding: ease onto the belly, follow the snow, slow down
        tb.flip += (-Math.PI / 2 - tb.flip) * Math.min(1, dt * 10);
        m.rotation.x = tb.flip;
        const keep = Math.max(0, hSpeed - 4 * dt) / Math.max(hSpeed, 1e-6);
        tb.vel.x *= keep;
        tb.vel.z *= keep;
        m.position.x += tb.vel.x * dt;
        m.position.z += tb.vel.z * dt;
        m.position.y = this.slideFloor(m, tb.scale) + BELLY_DEPTH * tb.scale;
      }
      for (const f of flippers) f.rotation.z = f.userData.side * (0.6 + 0.7 * Math.sin(tb.t * 26));
      if (tb.t > 6) {
        for (const f of flippers) f.rotation.z = f.userData.side * 1.2; // splayed out, having a lie down
        this.tumblers.splice(i, 1);
      }
    }

    for (let i = this.dazed.length - 1; i >= 0; i--) {
      const d = this.dazed[i];
      const m = d.mesh;
      d.t += dt;
      const wings = m.userData.wings;
      if (d.t < 0.7) {
        // tumbling: spin and drop, wings askew
        d.vel.y -= 9 * dt;
        m.rotation.z += d.spin * dt;
        m.rotation.x += d.spin * 0.6 * dt;
        for (const w of wings) w.rotation.z = w.userData.side * 1.1;
      } else {
        // recovered: level out and climb away, flapping hard
        m.rotation.x *= Math.max(0, 1 - dt * 6);
        m.rotation.z *= Math.max(0, 1 - dt * 6);
        d.vel.y += (6 - d.vel.y) * Math.min(1, dt * 2);
        m.rotation.y = Math.atan2(d.vel.x, d.vel.z);
        for (const w of wings) w.rotation.z = w.userData.side * Math.sin(d.t * 22) * 0.8;
      }
      m.position.addScaledVector(d.vel, dt);
      if (d.t > 5) {
        m.visible = false;
        this.dazed.splice(i, 1);
      }
    }

    for (let i = this.wobbles.length - 1; i >= 0; i--) {
      const w = this.wobbles[i];
      w.t += dt;
      const k = Math.max(0, 1 - w.t / 1.1);
      w.mesh.rotation.z = w.baseZ + Math.sin(w.t * 22) * w.amp * k;
      w.mesh.rotation.x = w.baseX + Math.sin(w.t * 17) * w.amp * 0.5 * k;
      if (k === 0) this.wobbles.splice(i, 1);
    }
  }
}
