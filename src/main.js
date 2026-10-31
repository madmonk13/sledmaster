import * as THREE from 'three';
import { Terrain, CHUNK_LEN, TRACK_HALF, animatePads } from './terrain.js';
import { buildSled } from './sled.js';
import { SledBody, SHATTER_KEEP } from './physics.js';
import { Input } from './input.js';
import { UI, MPH } from './ui.js';
import { computeStats, upgradeCost, levelOf } from './upgrades.js';
import { loadSave, writeSave, clearSave, defaultSave } from './save.js';
import { Mountains, Clouds, Spray } from './scenery.js';
import { Environment } from './environment.js';
import { CoinFx, HazardFx } from './effects.js';
import { Sfx } from './audio.js';
import { Tricks, TRICK_KEYS, TAP_MS } from './tricks.js';

const STEP = 1 / 120;
const MAX_AIM = 0.45;
const PULL_DIST = 6;
const UP = new THREE.Vector3(0, 1, 0);
const CAN_PICK_R = 2.2;
const CAN_REFILL = 0.5; // share of a full tank per gas can

// ---------- renderer & scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2500);

const hemi = new THREE.HemisphereLight(0xe2f2ff, 0xb4c6da, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dd, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 220 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_DIST = 100; // how far up the light's direction the shadow-casting light sits

const mountains = new Mountains(scene);
const clouds = new Clouds(scene);
const env = new Environment(scene, { hemi, sun, clouds });
const spray = new Spray(scene);
const coinFx = new CoinFx(scene);
const hazardFx = new HazardFx(scene, () => terrain);
const sfx = new Sfx();

// ---------- slingshot ----------
const POST_L = new THREE.Vector3(2.2, 1.5, -0.9);
const POST_R = new THREE.Vector3(-2.2, 1.5, -0.9);
const REST_POCKET = new THREE.Vector3(0, 0.5, -0.9);
const sling = new THREE.Group();
{
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5233, flatShading: true });
  for (const top of [POST_L, POST_R]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, top.y, 6), wood);
    post.position.set(top.x, top.y / 2, top.z);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), wood);
    knob.position.copy(top);
    post.castShadow = knob.castShadow = true;
    sling.add(post, knob);
  }
}
const bandMat = new THREE.MeshLambertMaterial({ color: 0x9b2d2d });
const bandL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), bandMat);
const bandR = bandL.clone();
sling.add(bandL, bandR);
scene.add(sling);

const tmpV = new THREE.Vector3();
function setSegment(mesh, a, b) {
  tmpV.subVectors(b, a);
  const len = tmpV.length();
  mesh.position.copy(a).addScaledVector(tmpV, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, tmpV.normalize());
}
function setBands(pocket) {
  setSegment(bandL, POST_L, pocket);
  setSegment(bandR, POST_R, pocket);
}
setBands(REST_POCKET);

const arrowMat = new THREE.MeshBasicMaterial({ color: 0x4cd37f, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
const arrow = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.25, 0);
  s.lineTo(0.25, 0);
  s.lineTo(0.25, 0.7);
  s.lineTo(0.6, 0.7);
  s.lineTo(0, 1);
  s.lineTo(-0.6, 0.7);
  s.lineTo(-0.25, 0.7);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s).rotateX(Math.PI / 2); // points along +z
  const mesh = new THREE.Mesh(geo, arrowMat);
  mesh.renderOrder = 2;
  return mesh;
})();
arrow.visible = false;
scene.add(arrow);

// ---------- best-distance banner ----------
let bestBanner = null;
function placeBestBanner() {
  if (bestBanner) {
    scene.remove(bestBanner);
    bestBanner.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    bestBanner = null;
  }
  if (save.best < 30) return;
  const z = save.best;
  const group = new THREE.Group();
  const hL = terrain.height(TRACK_HALF, z), hR = terrain.height(-TRACK_HALF, z);
  const top = Math.max(hL, hR, terrain.height(0, z)) + 6;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const [x, h] of [[TRACK_HALF, hL], [-TRACK_HALF, hR]]) {
    const len = top - h + 0.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, len, 6), poleMat.clone());
    pole.position.set(x, h + len / 2, z);
    group.add(pole);
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5b81c';
  ctx.fillRect(0, 0, 1024, 64);
  ctx.fillStyle = '#5a3d00';
  ctx.font = 'bold 44px Fredoka, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`★  BEST ${Math.floor(save.best)} m  ★`, 512, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF * 2, 3.2),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  banner.position.set(0, top, z);
  banner.rotation.y = Math.PI; // readable when approached from behind
  group.add(banner);
  scene.add(group);
  bestBanner = group;
}

// ---------- game state ----------
let save = loadSave();
let stats = computeStats(save);
let terrain = null;
const body = new SledBody();
const tricks = new Tricks();
const sled = buildSled();
scene.add(sled.group);
sled.setLoadout(stats);

const input = new Input(canvas);
input.setSensitivity(save.touchSensitivity);
let mode = 'menu'; // menu | aim | run | results | shop
let run = null;
let accumulator = 0;
let steerSmooth = 0;
let fovKick = 0; // brief FOV punch when a booster pad fires
let shake = 0; // camera shake from snowman hits, decays to 0
let time = 0;
const aimState = { pull: 0, aim: 0, keyPull: 0, keyAim: 0 };

const ui = new UI({
  play: () => startCourse(),
  openShop: () => {
    mode = 'shop';
    ui.showShop(save);
  },
  closeShop: () => {
    mode = 'menu';
    ui.showMenu(save);
  },
  endRun: () => mode === 'run' && endRun(),
  sensitivity: (k) => {
    input.setSensitivity(k);
    writeSave(save);
  },
  buyUpgrade: (u) => {
    const level = levelOf(save, u.id);
    const cost = upgradeCost(u, level);
    if (level >= u.max || save.coins < cost) return;
    save.coins -= cost;
    save.levels[u.id] = level + 1;
    sfx.purchase();
    afterPurchase();
  },
  buyWing: (w) => {
    if (save.wingsOwned.includes(w.id) || save.coins < w.cost) return;
    save.coins -= w.cost;
    save.wingsOwned.push(w.id);
    save.wingEquipped = w.id;
    sfx.purchase();
    afterPurchase();
  },
  equipWing: (id) => {
    save.wingEquipped = id;
    afterPurchase();
  },
  reset: () => {
    const { touchSensitivity } = save; // resetting progress keeps your controls
    clearSave();
    save = defaultSave();
    save.touchSensitivity = touchSensitivity;
    afterPurchase();
    newCourse();
    ui.showMenu(save);
  },
});

function afterPurchase() {
  writeSave(save);
  stats = computeStats(save);
  sled.setLoadout(stats);
  if (mode === 'shop') ui.renderShop(save);
}

function newCourse() {
  if (terrain) terrain.dispose();
  terrain = new Terrain(scene, (Math.random() * 4294967296) >>> 0, { fuelCans: stats.fuel > 0 });
  terrain.update(0);
  body.reset();
  spray.clear();
  setBands(REST_POCKET);
  placeBestBanner();
  updateSledVisual(0, true);
  updateCamera(0, true);
}

function startCourse() {
  stats = computeStats(save); // before the course, which only places gas cans if you own a rocket
  newCourse();
  sled.setLoadout(stats);
  mode = 'aim';
  Object.assign(aimState, { pull: 0, aim: 0, keyPull: 0, keyAim: 0 });
  ui.setMode('aim', stats);
}

function launch() {
  if (mode !== 'aim' || aimState.pull < 0.08) return;
  const a = aimState.aim;
  body.vel.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(stats.launchSpeed * aimState.pull);
  body.facing = a;
  body.fuel = stats.fuel;
  run = { coins: 0, air: 0, tricks: 0, maxZ: 0, still: 0, stagnant: 0, time: 0, crashTime: 0 };
  tricks.reset();
  accumulator = 0;
  steerSmooth = 0;
  mode = 'run';
  arrow.visible = false;
  setBands(REST_POCKET);
  ui.resetHud();
  ui.setMode('run', stats);
  sfx.launch(aimState.pull);
}

function endRun() {
  mode = 'results';
  tricks.cancel();
  const distance = Math.max(0, Math.floor(run.maxZ));
  const bonus = Math.floor(distance / 5);
  const total = run.coins + bonus + run.air + run.tricks;
  const newBest = distance > save.best;
  save.coins += total;
  save.runs += 1;
  save.totalDistance += distance;
  save.totalCoins += total;
  if (newBest) save.best = distance;
  writeSave(save);
  sfx.runEnd(newBest);
  ui.showResults({ distance, coins: run.coins, bonus, air: run.air, tricks: run.tricks, total, newBest }, save);
}

// ---------- sound controls ----------
const muteBtn = document.getElementById('btn-mute');
function showMute() {
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
}
function toggleMute() {
  sfx.toggleMute();
  showMute();
}
muteBtn.onclick = toggleMute;
showMute();
// soft tick on menu and shop buttons
document.addEventListener('click', (e) => {
  if (e.target.closest('button') && e.target.closest('.overlay')) sfx.click();
});

input.onPointerUp = () => {
  if (mode === 'aim') launch();
};
// A trick is a quick tap of an arrow key (or a flick of the screen) in the air. ←/→ steer when held,
// so a trick has to be pressed in the air and released within TAP_MS; ↑ and ↓ work the same way.
function requestTrick(dir) {
  if (mode === 'run' && body.airborne && !body.crashed) tricks.request(dir);
}
input.onSwipe = requestTrick;
const trickPressedInAir = new Set();
input.onKeyUp = (code, heldMs) => {
  if (trickPressedInAir.delete(code) && heldMs <= TAP_MS) requestTrick(TRICK_KEYS[code]);
};

input.onKeyDown = (code) => {
  if (code === 'KeyM') return toggleMute();
  if (TRICK_KEYS[code]) {
    if (mode === 'run' && body.airborne && !body.crashed) trickPressedInAir.add(code);
    if (mode !== 'aim') return; // in the aim screen ↑/↓/←/→ still set the power and direction
  }
  if (mode === 'aim' && code === 'Space') launch();
  else if ((mode === 'menu' || mode === 'results') && (code === 'Enter' || code === 'Space')) startCourse();
};

// ---------- per-mode updates ----------
function updateAim(dt) {
  if (input.down('ArrowDown', 'KeyS')) aimState.keyPull = Math.min(1, aimState.keyPull + dt * 0.9);
  if (input.down('ArrowUp', 'KeyW')) aimState.keyPull = Math.max(0, aimState.keyPull - dt * 0.9);
  if (input.down('ArrowLeft', 'KeyA')) aimState.keyAim = Math.min(MAX_AIM, aimState.keyAim + dt * 0.6);
  if (input.down('ArrowRight', 'KeyD')) aimState.keyAim = Math.max(-MAX_AIM, aimState.keyAim - dt * 0.6);
  let pull = aimState.keyPull;
  let aim = aimState.keyAim;
  const p = input.pointer;
  if (p) {
    // slingshot: drag down to pull back, drag left to aim right (and vice versa)
    pull = THREE.MathUtils.clamp((p.y - p.startY) / (window.innerHeight * 0.3), 0, 1);
    aim = THREE.MathUtils.clamp(((p.x - p.startX) / (window.innerWidth * 0.3)) * MAX_AIM, -MAX_AIM, MAX_AIM);
  }
  aimState.pull = pull;
  aimState.aim = aim;

  const dx = Math.sin(aim), dz = Math.cos(aim);
  body.pos.set(-dx * pull * PULL_DIST, 0, -dz * pull * PULL_DIST);
  body.vel.set(0, 0, 0);
  body.facing = aim;
  setBands(tmpPocket.set(body.pos.x - dx * 0.95, 0.5, body.pos.z - dz * 0.95));

  arrow.visible = true;
  arrow.position.set(body.pos.x + dx * 1.4, 0.05, body.pos.z + dz * 1.4);
  arrow.rotation.y = aim;
  arrow.scale.set(1 + pull, 1, 1.5 + pull * 5);
  arrowMat.color.setHSL(0.36 - pull * 0.36, 0.7, 0.55);
  ui.setPower(pull, pull * stats.launchSpeed);
  sfx.stretch(pull, dt);
}
const tmpPocket = new THREE.Vector3();

function updateRun(dt) {
  const target = body.crashed ? 0 : input.steer();
  steerSmooth += (target - steerSmooth) * Math.min(1, dt * 10);
  const ctl = { steer: steerSmooth, boost: !body.crashed && input.boost() };
  input.armSwipes(!body.crashed && body.airborne);
  accumulator += dt;
  while (accumulator >= STEP) {
    body.step(STEP, ctl, stats, terrain);
    accumulator -= STEP;
    if (!body.crashed) updateTricks();
    if (body.landing && !body.crashed) onLanding(body.landing);
  }
  if (body.padHits) {
    body.padHits = 0;
    fovKick = 10;
    ui.toast('Boost!');
    sfx.pad();
  }
  for (const hit of body.snowmanHits) {
    if (hit.kind === 'smash') {
      hazardFx.smash(hit);
      sfx.smash(hit.speed);
      shake = Math.max(shake, 0.3);
      ui.toast(`Smash! −${Math.round(hit.speed * (1 - SHATTER_KEEP) * MPH)} mph`);
    } else {
      hazardFx.bonk(hit);
      sfx.bonk();
      shake = Math.max(shake, 0.45);
      ui.toast('Bonk!');
    }
  }
  body.snowmanHits.length = 0;
  for (const hit of body.obstacleHits) {
    hazardFx.obstacle(hit);
    sfx.thud(hit.obstacle.type === 'tree' ? 'tree' : 'snow', hit.severity);
    if (hit.obstacle.type === 'bear') sfx.growl(hit.severity);
    shake = Math.max(shake, 0.12 + 0.4 * hit.severity);
    if (hit.severity > 0.6) ui.toast({ tree: 'Thwack!', igloo: 'Whump!', bear: 'Oof!' }[hit.obstacle.type]);
  }
  body.obstacleHits.length = 0;
  for (const hit of body.penguinHits) {
    sfx.squawk(hit.kind === 'knock');
    ui.toast('Sorry!');
    if (hit.kind === 'knock') {
      hazardFx.knock(hit);
      shake = Math.max(shake, 0.15);
    } else {
      hazardFx.penguinBonk(hit);
      shake = Math.max(shake, 0.35);
    }
  }
  body.penguinHits.length = 0;
  for (const hit of body.birdHits) {
    const knocked = hit.kind === 'knock';
    hazardFx.birdHit(hit);
    sfx.birdHit(knocked);
    shake = Math.max(shake, knocked ? 0.15 : 0.35);
    ui.toast('Bonk!');
  }
  body.birdHits.length = 0;

  run.time += dt;
  if (body.pos.z > run.maxZ + 0.25) {
    run.maxZ = body.pos.z;
    run.stagnant = 0;
  } else {
    run.stagnant += dt;
  }
  const slow = body.speed < 0.6 && !body.airborne && !body.boosting;
  run.still = slow ? run.still + dt : 0;

  collectCoins(dt);
  collectCans(dt);
  terrain.update(body.pos.z);
  spray.emit(body, dt);
  ui.updateHud(run, body, stats, save.best);

  // after a wipeout, watch the slide for a moment, then the results
  if (body.crashed) {
    run.crashTime += dt;
    if (run.crashTime > 1.8) endRun();
    return;
  }
  // stopped, or sloshing back and forth in a valley without making progress
  if (run.time > 1 && (run.still > 1.0 || run.stagnant > 5)) endRun();
}

function onTrick({ name, points, count }) {
  run.tricks += points;
  sfx.chime();
  ui.toast(count > 1 ? `${name} ×${count}! +${points}` : `${name}! +${points}`);
}

// Advance the trick in progress; touching down before it's done is a wipeout.
function updateTricks() {
  const done = tricks.update(STEP);
  if (done) onTrick(done);
  if (!body.touchdown) return;
  const landed = tricks.land();
  if (landed.finished) onTrick(landed.finished);
  if (landed.crashed) {
    body.wipeout();
    sfx.thud('snow', 1);
    shake = Math.max(shake, 0.6);
    ui.toast('Bad landing!');
  }
}

function onLanding({ impact, airTime }) {
  sfx.landing(impact);
  if (airTime > 1.5) {
    const bonus = Math.floor((airTime - 1) * 3);
    run.air += bonus;
    sfx.chime();
    ui.toast(impact > 12 ? `Hangtime! +${bonus}` : `Airtime +${bonus}`);
  } else if (impact > 12) {
    ui.toast('Oof!');
  } else if (airTime > 0.8) {
    ui.toast('Nice Landing!');
  }
}

function coinValue(z) {
  return 1 + Math.floor(z / 600);
}

function collectCoins(dt) {
  const ci = Math.floor(body.pos.z / CHUNK_LEN);
  const sx = body.pos.x, sy = body.pos.y + 0.7, sz = body.pos.z;
  const magnet = stats.magnet;
  const pickR2 = 1.8 * 1.8;
  for (const chunk of terrain.chunks.values()) {
    const near = Math.abs(chunk.ci - ci) <= 1;
    for (const c of chunk.coins) {
      if (c.collected) continue;
      const m = c.mesh.position;
      c.mesh.rotation.y += dt * 3;
      if (!near) continue;
      const dx = sx - m.x, dy = sy - m.y, dz = sz - m.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (magnet > 0 && d2 < magnet * magnet) c.attract = true;
      if (c.attract) {
        const k = Math.min(1, dt * (8 + body.speed * 0.3));
        m.x += dx * k;
        m.y += dy * k;
        m.z += dz * k;
      }
      if (d2 < pickR2) {
        c.collected = true;
        c.mesh.visible = false;
        coinFx.collect(m, body);
        sfx.coin();
        run.coins += coinValue(m.z);
      }
    }
  }
}

// Gas cans bob and spin; flying through one tops the tank up by half its size.
function collectCans(dt) {
  const ci = Math.floor(body.pos.z / CHUNK_LEN);
  const sx = body.pos.x, sy = body.pos.y + 0.7, sz = body.pos.z;
  for (const chunk of terrain.chunks.values()) {
    for (const c of chunk.cans) {
      if (c.collected) continue;
      const m = c.mesh.position;
      c.mesh.rotation.y += dt * 2;
      m.y = c.baseY + Math.sin(time * 2.5 + m.z) * 0.2;
      c.glow.material.opacity = 0.6 + 0.4 * Math.sin(time * 5);
      if (Math.abs(chunk.ci - ci) > 1) continue;
      const dx = sx - m.x, dy = sy - m.y, dz = sz - m.z;
      if (dx * dx + dy * dy + dz * dz < CAN_PICK_R * CAN_PICK_R) {
        c.collected = true;
        c.mesh.visible = false;
        c.glow.visible = false;
        const before = body.fuel;
        body.fuel = Math.min(stats.fuel, body.fuel + stats.fuel * CAN_REFILL);
        sfx.refuel();
        ui.refuel();
        ui.toast(body.fuel > before + 0.01 ? `Fuel +${Math.round(((body.fuel - before) / stats.fuel) * 100)}%` : 'Tank already full');
      }
    }
  }
}

// ---------- visuals ----------
const qTarget = new THREE.Quaternion();
const basis = new THREE.Matrix4();
const F = new THREE.Vector3(), U = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3();

function updateSledVisual(dt, snap = false) {
  const p = body.pos;
  const g = terrain.height(p.x, p.z);
  sled.group.position.set(p.x, Math.max(p.y, g), p.z);
  F.set(Math.sin(body.facing), 0, Math.cos(body.facing));
  if (body.airborne) {
    const vh = Math.hypot(body.vel.x, body.vel.z) || 1;
    const along = body.vel.x * F.x + body.vel.z * F.z >= 0 ? 1 : -1;
    F.y = THREE.MathUtils.clamp((body.vel.y / vh) * along, -0.7, 0.5);
    F.normalize();
    X.crossVectors(UP, F).normalize();
    Y.crossVectors(F, X);
    basis.makeBasis(X, Y, F);
  } else {
    terrain.normal(p.x, p.z, U);
    X.crossVectors(U, F).normalize();
    F.crossVectors(X, U);
    basis.makeBasis(X, U, F);
  }
  qTarget.setFromRotationMatrix(basis);
  if (snap) sled.group.quaternion.copy(qTarget);
  else sled.group.quaternion.slerp(qTarget, 1 - Math.exp(-dt * 12));

  sled.animate(dt, {
    steer: mode === 'run' ? steerSmooth : 0,
    airborne: mode === 'run' && body.airborne,
    hasWing: !!stats.wing,
    deploy: body.deploy,
    boosting: body.boosting,
    speed: body.speed,
    crashed: body.crashed,
    trick: mode === 'run' && tricks.active
      ? { axis: tricks.current.axis, sign: tricks.current.sign, progress: tricks.progress }
      : null,
  });
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt, snap = false) {
  const p = body.pos;
  const fx = Math.sin(body.facing), fz = Math.cos(body.facing);
  let back, up, ahead, lookDrop;
  let yaw = 0;
  if (mode === 'run') {
    const sp = body.speed;
    back = 7 + Math.min(5, sp * 0.07);
    up = 2.8 + Math.min(2.5, sp * 0.03);
    ahead = 6;
    lookDrop = 1;
  } else if (mode === 'aim') {
    back = 8.5;
    up = 3.8;
    ahead = 20;
    lookDrop = -2;
  } else {
    back = 9;
    up = 4;
    ahead = 12;
    lookDrop = 0;
    yaw = Math.sin(time * 0.25) * 0.5;
  }
  const ox = Math.sin(body.facing + yaw), oz = Math.cos(body.facing + yaw);
  camTarget.set(p.x - ox * back, p.y + up, p.z - oz * back);
  const gh = terrain.height(camTarget.x, camTarget.z) + 1.5;
  if (camTarget.y < gh) camTarget.y = gh;
  lookTarget.set(p.x + fx * ahead, p.y + lookDrop, p.z + fz * ahead);

  if (snap) {
    camPos.copy(camTarget);
    camLook.copy(lookTarget);
  } else {
    camPos.lerp(camTarget, 1 - Math.exp(-dt * 6));
    camLook.lerp(lookTarget, 1 - Math.exp(-dt * 8));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.2);
    const a = shake * shake;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    camera.rotation.z += (Math.random() - 0.5) * a * 0.15;
  }

  fovKick = Math.max(0, fovKick - dt * 8);
  const fov = mode === 'run' ? 62 + Math.min(18, body.speed * 0.25) + fovKick : 62;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * (fovKick > 0 ? 9 : 3));
    camera.updateProjectionMatrix();
  }

  sun.position.copy(p).addScaledVector(env.lightDir, SUN_DIST);
  sun.target.position.copy(p);
  mountains.follow(camera);
  clouds.update(dt, camera);
  env.update(dt, camera, renderer);
}

// ---------- loop ----------
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
const IDLE_FRAME_MS = 30; // the menu, results and shop only need ~30fps behind the overlay
function frame(now) {
  requestAnimationFrame(frame);
  if ((mode === 'menu' || mode === 'results' || mode === 'shop') && now - last < IDLE_FRAME_MS) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (mode === 'aim') updateAim(dt);
  else if (mode === 'run') updateRun(dt);

  spray.update(dt);
  sfx.update({
    running: mode === 'run', speed: body.speed, contact: body.contact,
    onIce: body.onIce, airborne: body.airborne, boosting: body.boosting,
  });
  animatePads(dt);
  terrain.animate(dt);
  coinFx.update(dt, body);
  hazardFx.update(dt);
  updateSledVisual(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

newCourse();
ui.showMenu(save);
requestAnimationFrame(frame);

// handy for debugging from the console
window.__sledmaster = { input, tricks, body, get mode() { return mode; }, get terrain() { return terrain; }, get save() { return save; }, get stats() { return stats; }, coinFx, sfx, env };
