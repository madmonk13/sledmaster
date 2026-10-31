// The igloo: a dome of staggered snow blocks with an arched entrance tunnel, built in code so
// the game needs no model file. One merged mesh is built once and every igloo on the course
// shares its geometry.
//
// Footprint, in model units (collision in terrain.js uses these): the dome is a circle of
// radius 1 centred on the origin with its base at y = 0, and the entrance runs out along +z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const IGLOO_DOME_R = 1;
export const IGLOO_TUNNEL = { z: 1.12, r: 0.3 }; // the tunnel's collision circle
export const IGLOO_HEIGHT = 1.06;

const RINGS = 5; // courses of blocks from the base to the top
const BLOCK_W = 0.5; // target block width at the base
const BLOCK_DEPTH = 0.2; // thickness; blocks overlap a little, which gives the surface its relief
const TUNNEL_LEN = 0.7; // from inside the dome out to the doorway
const TUNNEL_R = 0.34;

const SNOW = new THREE.Color(0xf4f9ff);
const SHADE = new THREE.Color(0xd3e2f1);

// Give a geometry one flat colour per face group: a random mix of snow and a slightly bluer shade.
function tint(geo, rand, mix = 0.5) {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color().copy(SNOW).lerp(SHADE, rand() * mix);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// a tiny deterministic random source, so every igloo (and every reload) looks the same
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTemplate() {
  const rand = rng(1234);
  const parts = [];
  const m = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const P = new THREE.Vector3(), tA = new THREE.Vector3(), tE = new THREE.Vector3(), N = new THREE.Vector3();

  // ---- dome: rings of blocks, each ring turned half a block from the one below ----
  for (let k = 0; k < RINGS; k++) {
    const e0 = (k / RINGS) * (Math.PI / 2);
    const e1 = ((k + 1) / RINGS) * (Math.PI / 2);
    const e = (e0 + e1) / 2; // elevation of the ring's middle: 0 at the base, π/2 at the top
    const rho = Math.cos(e); // horizontal radius there
    const count = Math.max(5, Math.round((2 * Math.PI * rho) / BLOCK_W));
    // slant length of the band, so blocks reach the next course up
    const slant = Math.hypot(Math.cos(e0) - Math.cos(e1), (Math.sin(e1) - Math.sin(e0)) * IGLOO_HEIGHT);
    const w = ((2 * Math.PI * rho) / count) * 0.94;
    for (let i = 0; i < count; i++) {
      const a = ((i + (k % 2 ? 0.5 : 0)) / count) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      P.set(rho * ca, Math.sin(e) * IGLOO_HEIGHT, rho * sa);
      tA.set(sa, 0, -ca); // along the ring (this way round, so the axes below are right-handed)
      tE.set(-Math.sin(e) * ca, Math.cos(e) * IGLOO_HEIGHT, -Math.sin(e) * sa).normalize(); // up the dome
      N.crossVectors(tA, tE).normalize(); // outward
      basis.makeBasis(tA, tE, N);
      // sink each block so its outer face is on the dome and the rest lies inside it
      m.copy(basis).setPosition(P.x - N.x * BLOCK_DEPTH * 0.5, P.y - N.y * BLOCK_DEPTH * 0.5, P.z - N.z * BLOCK_DEPTH * 0.5);
      const box = new THREE.BoxGeometry(w, slant * 0.97, BLOCK_DEPTH).applyMatrix4(m);
      parts.push(tint(box, rand));
    }
  }
  // the keystone on top
  const cap = new THREE.SphereGeometry(0.17, 8, 5).scale(1, 0.7, 1).translate(0, IGLOO_HEIGHT - 0.07, 0);
  parts.push(tint(cap, rand, 0.3));

  // ---- entrance: an arched tunnel of the same blocks, running out along +z ----
  const zFront = IGLOO_TUNNEL.z + TUNNEL_LEN / 2 - 0.2;
  const zBack = zFront - TUNNEL_LEN;
  const segs = 3; // blocks along the tunnel
  const arch = 7; // blocks around the arch
  const len = TUNNEL_LEN / segs;
  for (let s = 0; s < segs; s++) {
    const z = zBack + (s + 0.5) * len;
    for (let j = 0; j < arch; j++) {
      const t = (j + (s % 2 ? 0.5 : 0)) / arch; // 0..1 across the half circle, left to right
      const ang = Math.PI * t; // 0 = one side at the ground, π = the other
      const bw = ((Math.PI * TUNNEL_R) / arch) * 0.96;
      const x = Math.cos(ang) * TUNNEL_R, y = Math.sin(ang) * TUNNEL_R * 1.05;
      const box = new THREE.BoxGeometry(bw + 0.03, BLOCK_DEPTH * 0.9, len * 0.96);
      box.rotateZ(ang - Math.PI / 2); // lie tangent to the arch
      box.translate(x, y, z);
      parts.push(tint(box, rand));
    }
  }
  // a rim round the doorway
  const rim = new THREE.TorusGeometry(TUNNEL_R + 0.06, 0.05, 6, 14, Math.PI).scale(1, 1.05, 1).translate(0, 0, zFront + len / 2 - 0.02);
  parts.push(tint(rim, rand, 0.2));

  const body = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  body.castShadow = true;
  body.receiveShadow = true;

  // the doorway: a dark half-disc just inside the tunnel mouth
  const door = new THREE.Mesh(
    new THREE.CircleGeometry(TUNNEL_R, 14, 0, Math.PI).scale(1, 1.05, 1).translate(0, 0.001, zFront + len / 2 - 0.12),
    new THREE.MeshBasicMaterial({ color: 0x1c2a3d, side: THREE.DoubleSide }),
  );

  const group = new THREE.Group();
  group.add(body, door);
  return group;
}

let template = null;

// A new igloo at this scale (the model is 1 unit across the dome, so scale is its radius in metres).
export function buildIgloo(scale) {
  template ??= buildTemplate();
  const g = template.clone();
  g.scale.setScalar(scale);
  return g;
}
