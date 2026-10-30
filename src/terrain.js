// Endless procedural course. The course runs along +Z. The height function is
// analytic (noise-based), so physics samples it directly while meshes are built
// in chunks ahead of the sled and discarded behind it.

import * as THREE from 'three';
import { mulberry32, hash1, hash2 } from './rng.js';

export const CHUNK_LEN = 100;
export const TRACK_HALF = 26; // half-width of the sledding lane; banks rise beyond it
const MESH_HALF = 78;
const SEG_X = 52;
const SEG_Z = 50;
const START_DROP = 22; // height of the opening slope below the launch platform
const START_LEN = 70;
const ICE_START_CHUNK = 2;
const RAMP_START_CHUNK = 1;
const RAMP_LEN = 12;
const RAMP_DROP = 1.2;
const PAD_START_CHUNK = 1;
export const PAD_W = 3.4;
export const PAD_LEN = 5;
const SNOWMAN_START_CHUNK = 2;
export const SNOWMAN_R = 0.75; // collision radius of the bottom ball
export const SNOWMAN_H = 2.3; // clear this much air over the snow to jump a snowman
const TREE_START_CHUNK = 2;
const IGLOO_START_CHUNK = 3;
// Igloo footprint in model units (models/igloo.glb, dome centred, entrance along +z):
// the dome is a circle of radius 1 and the entrance tunnel reaches out to z = 1.3.
const IGLOO_DOME_R = 1;
const IGLOO_TUNNEL = { z: 1.12, r: 0.3 };
const IGLOO_HEIGHT = 1.06;
const CELL_X = (MESH_HALF * 2) / SEG_X;
const CELL_Z = CHUNK_LEN / SEG_Z;

const snowMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12).rotateX(Math.PI / 2);
export const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc83a, emissive: 0x7a5200 });
const treeLowGeo = new THREE.ConeGeometry(2.4, 4.5, 6).translate(0, 3.6, 0);
const treeHighGeo = new THREE.ConeGeometry(1.7, 3.6, 6).translate(0, 6.2, 0);
const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.6, 5).translate(0, 0.8, 0);
const treeMat = new THREE.MeshLambertMaterial({ color: 0x2f6b4f, flatShading: true });
const treeTopMat = new THREE.MeshLambertMaterial({ color: 0x3d8562, flatShading: true });
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a32, flatShading: true });
const gateGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5).translate(0, 0.8, 0);
const gateMat = new THREE.MeshLambertMaterial({ color: 0xff6b3d });

const rampMat = new THREE.MeshLambertMaterial({ color: 0xd9ecfa, flatShading: true });

const COLOR_SNOW =new THREE.Color(0xf7fbff);
const COLOR_BANK = new THREE.Color(0xe4edf6);
const ICE_DEEP = new THREE.Color(0x8fcdee);
const ICE_RIM = new THREE.Color(0xd6f0fc);
const iceMat = new THREE.MeshPhongMaterial({
  vertexColors: true, shininess: 90, specular: 0xbfe6ff,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
});

// Booster pad: scrolling chevrons on a dark plate. One shared texture, so
// animatePads() moves every pad at once.
const padTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c2a5c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(0, 0, 6, 64);
  ctx.fillRect(58, 0, 6, 64);
  const g = ctx.createLinearGradient(0, 10, 0, 54);
  g.addColorStop(0, '#fff27a');
  g.addColorStop(1, '#ff9a1a');
  ctx.fillStyle = g;
  // chevron pointing to the bottom of the canvas, which maps to +Z (downhill)
  ctx.beginPath();
  ctx.moveTo(12, 12);
  ctx.lineTo(32, 34);
  ctx.lineTo(52, 12);
  ctx.lineTo(52, 30);
  ctx.lineTo(32, 52);
  ctx.lineTo(12, 30);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, PAD_LEN / 1.6);
  return tex;
})();
const padMat = new THREE.MeshBasicMaterial({
  map: padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
});

// Snowman parts, shared by every snowman.
const snowBodyMat = new THREE.MeshPhongMaterial({ color: 0xfbfdff, shininess: 4, specular: 0x111111 });
const coalMat = new THREE.MeshLambertMaterial({ color: 0x22252b });
const carrotMat = new THREE.MeshLambertMaterial({ color: 0xff8a1f });
const stickMat = new THREE.MeshLambertMaterial({ color: 0x6b4a32, flatShading: true });
const SCARF_COLORS = [0xe84a3a, 0x3b74c4, 0x2f9e6a, 0x8a4fc8, 0xf2b630];
const scarfMats = SCARF_COLORS.map((color) => new THREE.MeshLambertMaterial({ color }));
const ballGeo = new THREE.SphereGeometry(1, 24, 18);
const coalGeo = new THREE.SphereGeometry(1, 8, 6);
export const carrotGeo = new THREE.ConeGeometry(0.075, 0.38, 10).rotateX(-Math.PI / 2); // points -z
const stickGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.85, 5).translate(0, 0.42, 0);
const scarfGeo = new THREE.TorusGeometry(0.42, 0.08, 8, 24).rotateX(Math.PI / 2);
export { snowBodyMat, coalMat, carrotMat };

// Snowman facing uphill (-z), toward the oncoming sled. Origin at the snow.
function buildSnowman(r) {
  const g = new THREE.Group();
  const ball = (radius, y) => {
    const m = new THREE.Mesh(ballGeo, snowBodyMat);
    m.scale.setScalar(radius);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
  };
  ball(0.75, 0.6);
  ball(0.55, 1.5);
  ball(0.4, 2.2);
  const coal = (x, y, z, size) => {
    const m = new THREE.Mesh(coalGeo, coalMat);
    m.scale.setScalar(size);
    m.position.set(x, y, z);
    g.add(m);
  };
  coal(-0.14, 2.3, -0.34, 0.055);
  coal(0.14, 2.3, -0.34, 0.055);
  for (let i = 0; i < 3; i++) {
    const y = 1.72 - i * 0.2;
    coal(0, y, -Math.sqrt(0.55 * 0.55 - (y - 1.5) ** 2) - 0.01, 0.05); // on the middle ball's surface
  }
  const nose = new THREE.Mesh(carrotGeo, carrotMat);
  nose.position.set(0, 2.2, -0.52);
  g.add(nose);
  const scarf = new THREE.Mesh(scarfGeo, scarfMats[Math.floor(r() * scarfMats.length)]);
  scarf.position.y = 1.9;
  g.add(scarf);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(stickGeo, stickMat);
    arm.position.set(side * 0.48, 1.6, 0);
    arm.rotation.z = -side * (0.9 + r() * 0.5);
    arm.rotation.x = (r() - 0.5) * 0.4;
    arm.castShadow = true;
    g.add(arm);
  }
  g.rotation.y = (r() - 0.5) * 0.5;
  return g;
}

// Lane trees: like the bank trees but with a taller trunk, so the lowest branches
// clear the penguin and only the trunk and inner boughs (the collision circle) stop you.
const laneTrunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.2, 6).translate(0, 1.1, 0);
const laneLowGeo = new THREE.ConeGeometry(1.9, 3.2, 7).translate(0, 3.3, 0);
const laneMidGeo = new THREE.ConeGeometry(1.4, 2.6, 7).translate(0, 4.9, 0);
const laneTopGeo = new THREE.ConeGeometry(0.85, 1.8, 7).translate(0, 6.4, 0);
const laneSnowGeo = new THREE.ConeGeometry(0.5, 0.75, 7).translate(0, 7.0, 0);
const treeSnowMat = new THREE.MeshLambertMaterial({ color: 0xf4f9ff, flatShading: true });
const LANE_TREE_R = 0.9; // collision radius at scale 1
const LANE_TREE_H = 7.3;

function buildLaneTree(scale) {
  const g = new THREE.Group();
  for (const [geo, m] of [[laneTrunkGeo, trunkMat], [laneLowGeo, treeMat], [laneMidGeo, treeTopMat], [laneTopGeo, treeMat], [laneSnowGeo, treeSnowMat]]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
  }
  g.scale.setScalar(scale);
  return g;
}

// The igloo comes from a glTF file loaded at startup (see main.js). Until it arrives,
// or if it fails to load, a plain snow dome stands in.
let iglooTemplate = null;
export function setIglooModel(model) {
  // re-centre so the dome sits at the origin with its base at y = 0
  const box = new THREE.Box3().setFromObject(model);
  const domeZ = box.min.z + IGLOO_DOME_R;
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -domeZ);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  iglooTemplate = new THREE.Group().add(model);
}
const fallbackDomeGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

function buildIgloo(scale) {
  let g;
  if (iglooTemplate) g = iglooTemplate.clone();
  else {
    g = new THREE.Group();
    const dome = new THREE.Mesh(fallbackDomeGeo, snowBodyMat);
    dome.scale.set(1, IGLOO_HEIGHT, 1);
    dome.castShadow = true;
    g.add(dome);
  }
  g.scale.setScalar(scale);
  return g;
}

export function animatePads(dt) {
  padTex.offset.y = (padTex.offset.y + dt * 2.2) % 1;
}

function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

export class Terrain {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.icePatches = new Map();
    this.ramps = new Map();
    this.pads = new Map();
    this.snowmen = new Map();
    this.obstacles = new Map();
  }

  // ---------- height field ----------

  noise1(t, salt) {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    const a = hash1(i, this.seed + salt);
    const b = hash1(i + 1, this.seed + salt);
    return a + (b - a) * u;
  }

  noise2(x, z, salt) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const s = this.seed + salt;
    const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s);
    const c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  // Height along the centre line: launch platform, opening drop, then rolling hills
  // that slowly grow taller with distance on a gentle overall downhill trend.
  profile(z) {
    if (z <= 0) return 0;
    const drop = -START_DROP * smooth(z / START_LEN);
    const trend = -0.012 * Math.max(0, z - START_LEN);
    const amp = Math.min(3 + z * 0.0035, 15) * smooth((z - 50) / 120);
    const hills = (this.noise1(z / 85, 11) * 2 - 1) + 0.35 * (this.noise1(z / 31, 23) * 2 - 1);
    return drop + trend + amp * hills;
  }

  height(x, z) {
    return this.baseHeight(x, z) + this.rampHeight(x, z);
  }

  // Snow surface without ramps (ramps get their own meshes so their lips stay sharp).
  baseHeight(x, z) {
    let h = this.profile(z);
    // gentle cross-slope that wanders, so the sled drifts and needs steering
    h += 1.6 * (this.noise1(z / 140, 37) * 2 - 1) * (x / TRACK_HALF) * smooth((z - 100) / 100);
    // banks either side of the lane
    const b = Math.abs(x) - TRACK_HALF;
    if (b > 0) h += Math.min(b, 18) * 0.5 + Math.min(b * b, 324) * 0.02 + Math.max(0, b - 18) * 0.25;
    // small bumps for texture
    h += 0.06 * (this.noise2(x / 7, z / 7, 5) * 2 - 1) * smooth((z - 10) / 30);
    return h;
  }

  // Height of the rendered (triangulated) snow mesh, so overlays like ice and
  // pads sit exactly on the faces instead of cutting through them.
  meshHeight(x, z) {
    const gx = (x + MESH_HALF) / CELL_X, gz = z / CELL_Z;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const x0 = ix * CELL_X - MESH_HALF, x1 = x0 + CELL_X;
    const z0 = iz * CELL_Z, z1 = z0 + CELL_Z;
    // PlaneGeometry splits each cell into (x0,z0)-(x0,z1)-(x1,z0) and (x0,z1)-(x1,z1)-(x1,z0)
    if (fx + fz <= 1) {
      const ha = this.baseHeight(x0, z0);
      return ha + (this.baseHeight(x1, z0) - ha) * fx + (this.baseHeight(x0, z1) - ha) * fz;
    }
    const hc = this.baseHeight(x1, z1);
    return hc + (this.baseHeight(x0, z1) - hc) * (1 - fx) + (this.baseHeight(x1, z0) - hc) * (1 - fz);
  }

  normal(x, z, out = new THREE.Vector3()) {
    const e = 0.3;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return out.set(-dx, 1, -dz).normalize();
  }

  // ---------- ramps ----------

  rampsFor(ci) {
    let list = this.ramps.get(ci);
    if (list) return list;
    list = [];
    if (ci >= RAMP_START_CHUNK) {
      const r = mulberry32((this.seed ^ Math.imul(ci + 3, 0xc2b2ae35)) >>> 0);
      const n = (r() < 0.7 ? 1 : 0) + (ci > 8 && r() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        // ramps live wholly inside their chunk, one per half so they never overlap
        const half = n === 1 ? r() < 0.5 ? 0 : 1 : i;
        list.push({
          x: (r() * 2 - 1) * (TRACK_HALF - 14),
          lip: ci * CHUNK_LEN + half * 50 + 22 + r() * 22,
          w: 7 + r() * 3,
          len: RAMP_LEN,
          h: 2 + r() * 1.5,
        });
      }
    }
    this.ramps.set(ci, list);
    return list;
  }

  // Kicker profile: a concave run-up to a lip, then a short drop back to the snow.
  rampHeight(x, z) {
    for (const r of this.rampsFor(Math.floor(z / CHUNK_LEN))) {
      const dx = Math.abs(x - r.x);
      if (dx > r.w / 2 + 1) continue;
      const s = z - (r.lip - r.len);
      if (s < 0 || z > r.lip + RAMP_DROP) continue;
      const k = z <= r.lip ? Math.pow(s / r.len, 1.6) : 1 - (z - r.lip) / RAMP_DROP;
      return r.h * k * smooth(r.w / 2 + 1 - dx);
    }
    return 0;
  }

  // ---------- booster pads ----------

  // Pads sit wholly inside their chunk. Some are lined up with a ramp's run-up.
  padsFor(ci) {
    let list = this.pads.get(ci);
    if (list) return list;
    list = [];
    if (ci >= PAD_START_CHUNK) {
      const r = mulberry32((this.seed ^ Math.imul(ci + 5, 0x27d4eb2f)) >>> 0);
      const ramps = this.rampsFor(ci);
      const n = (r() < 0.55 ? 1 : 0) + (ci > 6 && r() < 0.25 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let x, z;
        if (ramps[i] && r() < 0.5) {
          x = ramps[i].x;
          z = ramps[i].lip - ramps[i].len - 7 - PAD_LEN;
        } else {
          x = (r() * 2 - 1) * (TRACK_HALF - 6);
          z = ci * CHUNK_LEN + 6 + r() * (CHUNK_LEN - PAD_LEN - 12);
          for (const ramp of ramps) {
            const overlapsZ = z + PAD_LEN > ramp.lip - ramp.len - 4 && z < ramp.lip + 4;
            if (overlapsZ && Math.abs(x - ramp.x) < ramp.w / 2 + PAD_W) x = ramp.x + (x < ramp.x ? -1 : 1) * (ramp.w / 2 + PAD_W + 1);
          }
        }
        if (list.some((p) => Math.abs(p.z - z) < PAD_LEN + 4 && Math.abs(p.x - x) < PAD_W + 2)) continue;
        list.push({ x, z }); // z is the uphill edge; the pad runs to z + PAD_LEN
      }
    }
    this.pads.set(ci, list);
    return list;
  }

  padAt(x, z) {
    for (const p of this.padsFor(Math.floor(z / CHUNK_LEN))) {
      if (z >= p.z && z <= p.z + PAD_LEN && Math.abs(x - p.x) <= PAD_W / 2 + 0.3) return p;
    }
    return null;
  }

  // ---------- snowmen ----------

  // More of them the further you get. They keep clear of ramps (and the landing
  // zone after each one), booster pads and each other.
  snowmenFor(ci) {
    let list = this.snowmen.get(ci);
    if (list) return list;
    list = [];
    if (ci >= SNOWMAN_START_CHUNK) {
      const r = mulberry32((this.seed ^ Math.imul(ci + 9, 0x165667b1)) >>> 0);
      const n = Math.floor(r() * (1 + Math.min(2.5, ci * 0.07)) + r() * 0.6);
      const ramps = this.rampsFor(ci);
      const pads = this.padsFor(ci);
      for (let i = 0; i < n; i++) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const x = (r() * 2 - 1) * (TRACK_HALF - 4);
          const z = ci * CHUNK_LEN + 5 + r() * (CHUNK_LEN - 10);
          const blocked =
            ramps.some((p) => Math.abs(x - p.x) < p.w / 2 + 3 && z > p.lip - p.len - 3 && z < p.lip + 16) ||
            pads.some((p) => Math.abs(x - p.x) < PAD_W / 2 + 3 && z > p.z - 8 && z < p.z + PAD_LEN + 8) ||
            list.some((s) => Math.hypot(x - s.x, z - s.z) < 7);
          if (blocked) continue;
          list.push({ x, z, broken: false, mesh: null });
          break;
        }
      }
    }
    this.snowmen.set(ci, list);
    return list;
  }

  // The standing snowman whose bottom ball overlaps a sled at (x, z) with this radius.
  snowmanAt(x, z, radius) {
    const reach = SNOWMAN_R + radius;
    for (const s of this.snowmenFor(Math.floor(z / CHUNK_LEN))) {
      if (s.broken) continue;
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < reach * reach) return s;
    }
    return null;
  }

  // ---------- solid obstacles: lane trees and igloos ----------

  // Each obstacle is a few collision circles plus a height you can jump over.
  // They keep clear of ramps (and landings), pads, snowmen and each other.
  obstaclesFor(ci) {
    let list = this.obstacles.get(ci);
    if (list) return list;
    list = [];
    if (ci >= TREE_START_CHUNK) {
      const r = mulberry32((this.seed ^ Math.imul(ci + 11, 0x7feb352d)) >>> 0);
      const ramps = this.rampsFor(ci);
      const pads = this.padsFor(ci);
      const snowmen = this.snowmenFor(ci);
      const fits = (x, z, foot) =>
        !ramps.some((p) => Math.abs(x - p.x) < p.w / 2 + foot + 1 && z > p.lip - p.len - foot - 2 && z < p.lip + 16 + foot) &&
        !pads.some((p) => Math.abs(x - p.x) < PAD_W / 2 + foot + 1 && z > p.z - foot - 6 && z < p.z + PAD_LEN + foot + 6) &&
        !snowmen.some((s) => Math.hypot(x - s.x, z - s.z) < foot + 5) &&
        !list.some((o) => Math.hypot(x - o.x, z - o.z) < foot + o.foot + 4);
      const place = (foot, halfWidth, make) => {
        for (let attempt = 0; attempt < 8; attempt++) {
          const x = (r() * 2 - 1) * halfWidth;
          const z = ci * CHUNK_LEN + 5 + foot + r() * (CHUNK_LEN - 10 - foot * 2);
          if (fits(x, z, foot)) {
            list.push(make(x, z));
            return;
          }
        }
      };

      const trees = Math.floor(r() * (1.4 + Math.min(1.8, ci * 0.05)));
      for (let i = 0; i < trees; i++) {
        const scale = 0.85 + r() * 0.3;
        place(1.9 * scale, TRACK_HALF - 3, (x, z) => ({
          type: 'tree', x, z, scale, foot: 1.9 * scale, h: LANE_TREE_H * scale,
          circles: [{ x, z, r: LANE_TREE_R * scale }], mesh: null,
        }));
      }
      const igloos = ci >= IGLOO_START_CHUNK ? (r() < 0.35 ? 1 : 0) + (ci > 10 && r() < 0.15 ? 1 : 0) : 0;
      for (let i = 0; i < igloos; i++) {
        const scale = 2.4 + r() * 0.4;
        const rot = r() * Math.PI * 2;
        place(1.35 * scale, TRACK_HALF - 6, (x, z) => ({
          type: 'igloo', x, z, scale, rot, foot: 1.35 * scale, h: IGLOO_HEIGHT * scale,
          circles: [
            { x, z, r: IGLOO_DOME_R * scale },
            { x: x + Math.sin(rot) * IGLOO_TUNNEL.z * scale, z: z + Math.cos(rot) * IGLOO_TUNNEL.z * scale, r: IGLOO_TUNNEL.r * scale },
          ],
          mesh: null,
        }));
      }
    }
    this.obstacles.set(ci, list);
    return list;
  }

  // First obstacle circle a sled of this radius overlaps, unless it is high enough to clear it.
  obstacleAt(x, z, radius, heightAbove) {
    for (const o of this.obstaclesFor(Math.floor(z / CHUNK_LEN))) {
      if (heightAbove > o.h) continue;
      for (const c of o.circles) {
        const reach = c.r + radius;
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < reach * reach) return { obstacle: o, circle: c };
      }
    }
    return null;
  }

  // ---------- ice ----------

  patchesFor(ci) {
    let list = this.icePatches.get(ci);
    if (list) return list;
    list = [];
    if (ci >= ICE_START_CHUNK) {
      const r = mulberry32((this.seed ^ Math.imul(ci + 1, 0x9e3779b1)) >>> 0);
      const n = Math.floor(r() * (1.5 + Math.min(3, ci * 0.12))) + (r() < 0.55 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        list.push({
          x: (r() * 2 - 1) * (TRACK_HALF - 8),
          z: ci * CHUNK_LEN + r() * CHUNK_LEN,
          rx: 4 + r() * 10,
          rz: 12 + r() * 34,
        });
      }
    }
    this.icePatches.set(ci, list);
    return list;
  }

  isIce(x, z) {
    const ci = Math.floor(z / CHUNK_LEN);
    for (let c = ci - 1; c <= ci + 1; c++) {
      for (const p of this.patchesFor(c)) {
        const dx = (x - p.x) / p.rx, dz = (z - p.z) / p.rz;
        if (dx * dx + dz * dz < 1) return true;
      }
    }
    return false;
  }

  // ---------- chunks ----------

  update(z) {
    const minCi = Math.floor((z - 120) / CHUNK_LEN);
    const maxCi = Math.floor((z + 520) / CHUNK_LEN);
    for (let ci = Math.max(-1, minCi); ci <= maxCi; ci++) {
      if (!this.chunks.has(ci)) this.chunks.set(ci, this.buildChunk(ci));
    }
    for (const [ci, chunk] of this.chunks) {
      if (ci < minCi) {
        this.disposeChunk(chunk);
        this.chunks.delete(ci);
      }
    }
    for (const cache of [this.icePatches, this.ramps, this.pads, this.snowmen, this.obstacles]) {
      for (const ci of cache.keys()) {
        if (ci < minCi - 2) cache.delete(ci);
      }
    }
  }

  buildChunk(ci) {
    const z0 = ci * CHUNK_LEN;
    const group = new THREE.Group();
    const disposables = [];
    const rand = mulberry32((this.seed ^ Math.imul(ci + 7, 0x85ebca6b)) >>> 0);

    // terrain mesh, flat-shaded with per-face colours
    const plane = new THREE.PlaneGeometry(MESH_HALF * 2, CHUNK_LEN, SEG_X, SEG_Z);
    plane.rotateX(-Math.PI / 2);
    const pp = plane.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i);
      const z = pp.getZ(i) + z0 + CHUNK_LEN / 2;
      pp.setXYZ(i, x, this.baseHeight(x, z), z);
    }
    const geo = plane.toNonIndexed();
    plane.dispose();
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      if (Math.abs(cx) > TRACK_HALF) {
        c.copy(COLOR_BANK).offsetHSL(0, 0, -rand() * 0.035);
      } else {
        c.copy(COLOR_SNOW).offsetHSL(0, 0, -rand() * 0.03);
      }
      for (let k = 0; k < 3; k++) c.toArray(colors, (t + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, snowMat);
    ground.receiveShadow = true;
    group.add(ground);
    disposables.push(geo);

    // ice patches: smooth ovals laid on the snow, glossy with a frosty rim
    for (const p of this.patchesFor(ci)) {
      const geo = this.iceGeometry(p, rand);
      const ice = new THREE.Mesh(geo, iceMat);
      ice.receiveShadow = true;
      group.add(ice);
      disposables.push(geo);
    }

    // booster pads
    for (const p of this.padsFor(ci)) {
      const pg = new THREE.PlaneGeometry(PAD_W, PAD_LEN, 2, 5);
      pg.rotateX(-Math.PI / 2);
      const pp2 = pg.attributes.position;
      for (let i = 0; i < pp2.count; i++) {
        const x = pp2.getX(i) + p.x;
        const z = pp2.getZ(i) + p.z + PAD_LEN / 2;
        pp2.setXYZ(i, x, this.meshHeight(x, z) + 0.07, z);
      }
      const pad = new THREE.Mesh(pg, padMat);
      pad.receiveShadow = true;
      group.add(pad);
      disposables.push(pg);
    }

    // snowmen
    for (const sm of this.snowmenFor(ci)) {
      if (sm.broken) continue;
      sm.mesh = buildSnowman(rand);
      sm.mesh.position.set(sm.x, this.meshHeight(sm.x, sm.z) - 0.08, sm.z);
      group.add(sm.mesh);
    }

    // lane trees and igloos, sat on the lowest ground under their footprint so no edge floats
    for (const o of this.obstaclesFor(ci)) {
      o.mesh = o.type === 'tree' ? buildLaneTree(o.scale) : buildIgloo(o.scale);
      let floor = this.meshHeight(o.x, o.z);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        floor = Math.min(floor, this.meshHeight(o.x + Math.cos(a) * o.foot * 0.8, o.z + Math.sin(a) * o.foot * 0.8));
      }
      o.mesh.position.set(o.x, floor - 0.1, o.z);
      if (o.type === 'igloo') o.mesh.rotation.y = o.rot;
      else o.mesh.rotation.y = rand() * Math.PI * 2;
      group.add(o.mesh);
    }

    // trees on the banks
    const treeCount = 34;
    const lows = new THREE.InstancedMesh(treeLowGeo, treeMat, treeCount);
    const highs = new THREE.InstancedMesh(treeHighGeo, treeTopMat, treeCount);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (TRACK_HALF + 5 + rand() * 45);
      const z = z0 + rand() * CHUNK_LEN;
      const sc = 0.7 + rand() * 0.8;
      p.set(x, this.height(x, z) - 0.3, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI);
      s.set(sc, sc * (0.9 + rand() * 0.3), sc);
      m.compose(p, q, s);
      lows.setMatrixAt(i, m);
      highs.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
    }
    for (const im of [lows, highs, trunks]) {
      im.castShadow = true;
      group.add(im);
      disposables.push(im);
    }

    // lane-edge gates every 20 m
    if (ci >= 0) {
      const gates = new THREE.InstancedMesh(gateGeo, gateMat, 10);
      let g = 0;
      for (let k = 0; k < 5; k++) {
        const z = z0 + k * 20;
        for (const side of [-1, 1]) {
          const x = side * (TRACK_HALF + 0.5);
          m.makeTranslation(x, this.height(x, z), z);
          gates.setMatrixAt(g++, m);
        }
      }
      group.add(gates);
      disposables.push(gates);
    }

    // distance sign at the start of each chunk
    if (ci >= 1) {
      const sign = makeSign(`${ci * CHUNK_LEN} m`);
      const x = TRACK_HALF + 4;
      sign.position.set(x, this.height(x, z0) + 3.5, z0);
      group.add(sign);
      disposables.push(sign.material.map, sign.material);
      const sign2 = sign.clone();
      sign2.position.x = -x;
      sign2.position.y = this.height(-x, z0) + 3.5;
      group.add(sign2);
    }

    // coin patterns
    const coins = [];
    const addCoin = (x, y, z) => {
      if (this.obstacleAt(x, z, 0.6, y - this.height(x, z))) return; // no coins buried in trees or igloos
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      coins.push({ mesh, collected: false, attract: false });
    };

    // kicker ramps, each with a coin arc over the landing
    for (const r of this.rampsFor(ci)) {
      const rg = new THREE.PlaneGeometry(r.w + 2, r.len + RAMP_DROP, 6, 16);
      rg.rotateX(-Math.PI / 2);
      const rp = rg.attributes.position;
      const zc = r.lip - r.len + (r.len + RAMP_DROP) / 2;
      for (let i = 0; i < rp.count; i++) {
        const x = rp.getX(i) + r.x;
        const z = rp.getZ(i) + zc;
        rp.setXYZ(i, x, this.height(x, z) + 0.03, z);
      }
      const geo = rg.toNonIndexed();
      rg.dispose();
      geo.computeVertexNormals();
      const ramp = new THREE.Mesh(geo, rampMat);
      ramp.receiveShadow = true;
      group.add(ramp);
      disposables.push(geo);
      for (const side of [-1, 1]) {
        const x = r.x + side * (r.w / 2 + 0.3);
        const pole = new THREE.Mesh(gateGeo, gateMat);
        pole.position.set(x, this.height(x, r.lip), r.lip);
        group.add(pole);
      }
      for (let j = 0; j < 7; j++) {
        const z = r.lip + 6 + j * 4;
        addCoin(r.x, this.height(r.x, z) + 1.5 + Math.sin((j / 6) * Math.PI) * (2 + r.h), z);
      }
    }
    if (ci >= 0) {
      const patterns = ci === 0 ? 2 : 2 + Math.floor(rand() * 3);
      for (let k = 0; k < patterns; k++) {
        const type = rand();
        const count = 6 + Math.floor(rand() * 6);
        const zStart = z0 + 6 + rand() * (CHUNK_LEN - count * 3.2 - 6);
        const x0 = (rand() * 2 - 1) * (TRACK_HALF - 7);
        const arcHeight = 3 + rand() * 5;
        for (let j = 0; j < count; j++) {
          let x = x0;
          let lift = 1.0;
          const z = zStart + j * 3.2;
          if (type < 0.35) {
            // straight line
          } else if (type < 0.7) {
            x = x0 + Math.sin(j * 0.6) * 5;
          } else if (ci > 0) {
            lift = 1 + Math.sin((j / (count - 1)) * Math.PI) * arcHeight;
          }
          x = Math.max(-(TRACK_HALF - 2), Math.min(TRACK_HALF - 2, x));
          addCoin(x, this.height(x, z) + lift, z);
        }
      }
    }

    this.scene.add(group);
    return { ci, group, coins, disposables };
  }

  iceGeometry(p, rand) {
    const rings = Math.max(4, Math.ceil(Math.max(p.rx, p.rz) / 2.5));
    const segs = 64;
    const verts = [];
    const cols = [];
    const index = [];
    const c = new THREE.Color();
    const push = (u, w) => {
      const x = p.x + u * p.rx, z = p.z + w * p.rz;
      verts.push(x, this.meshHeight(x, z) + 0.05, z);
      const r = Math.hypot(u, w);
      c.copy(ICE_DEEP).lerp(ICE_RIM, smooth((r - 0.72) / 0.28)).offsetHSL(0, 0, (rand() - 0.5) * 0.03);
      cols.push(c.r, c.g, c.b);
    };
    push(0, 0);
    for (let k = 1; k <= rings; k++) {
      const r = k / rings;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        push(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    const ring = (k, s) => 1 + (k - 1) * segs + (s % segs);
    for (let s = 0; s < segs; s++) index.push(0, ring(1, s + 1), ring(1, s));
    for (let k = 1; k < rings; k++) {
      for (let s = 0; s < segs; s++) {
        const a = ring(k, s), b = ring(k, s + 1), cc = ring(k + 1, s), d = ring(k + 1, s + 1);
        index.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  }

  disposeChunk(chunk) {
    this.scene.remove(chunk.group);
    for (const d of chunk.disposables) d.dispose();
  }

  dispose() {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.icePatches.clear();
    this.ramps.clear();
    this.pads.clear();
    this.snowmen.clear();
    this.obstacles.clear();
  }
}

function makeSign(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12304a';
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px Fredoka, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(6, 2.25, 1);
  return sprite;
}
