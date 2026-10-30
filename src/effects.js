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
      p.vel.y -= 12 * dt;
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
