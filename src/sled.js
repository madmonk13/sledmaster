// Smooth penguin on a low-poly sled, with swappable wings and an optional rocket.
// The model faces +Z with +Y up; its origin sits where the runners touch the snow.

import * as THREE from 'three';

const TRICK_PIVOT = 0.7; // height of the body's centre above the snow, which flips and spins turn about
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) };
const UPRIGHT = new THREE.Quaternion();

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function sphere(r, material, ws = 8, hs = 6) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
}

// Wing outline in (outward, forward) coordinates for each wing style.
function wingOutline(shape, span, c) {
  switch (shape) {
    case 'delta':
      return [[0, c * 0.6], [span, -c * 0.35], [span, -c * 0.6], [0, -c * 0.5]];
    case 'feather':
      return [
        [0, c * 0.5], [span * 0.7, c * 0.45], [span, c * 0.15], [span * 0.88, -c * 0.02],
        [span * 0.96, -c * 0.22], [span * 0.76, -c * 0.28], [span * 0.82, -c * 0.48], [0, -c * 0.5],
      ];
    case 'bat':
      return [
        [0, c * 0.5], [span * 0.5, c * 0.55], [span, c * 0.32], [span * 0.82, -c * 0.2],
        [span * 0.66, -c * 0.04], [span * 0.48, -c * 0.45], [span * 0.26, -c * 0.22], [0, -c * 0.5],
      ];
    case 'glider':
      return [[0, c * 0.5], [span, c * 0.22], [span * 1.02, 0], [span, -c * 0.18], [0, -c * 0.5]];
    case 'rect':
    default:
      return [[0, c * 0.5], [span, c * 0.42], [span, -c * 0.42], [0, -c * 0.5]];
  }
}

function wingGeometry(w) {
  const shape = new THREE.Shape();
  const pts = wingOutline(w.shape, w.span, w.chord);
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); // shape (outward, forward) -> model (x, z), thickness downward
  return geo;
}

export function buildSled() {
  const group = new THREE.Group();

  // ---- sled ----
  const woodMat = mat(0xc0392b);
  const runnerMat = mat(0x8a8f99);
  const deck = box(0.95, 0.1, 1.8, woodMat);
  deck.position.set(0, 0.32, 0);
  const nose = box(0.95, 0.08, 0.45, woodMat);
  nose.position.set(0, 0.42, 1.05);
  nose.rotation.x = -0.6;
  const back = box(0.95, 0.3, 0.08, woodMat);
  back.position.set(0, 0.45, -0.88);
  group.add(deck, nose, back);
  for (const side of [-1, 1]) {
    const runner = box(0.07, 0.07, 1.9, runnerMat);
    runner.position.set(side * 0.4, 0.04, -0.05);
    const tip = box(0.07, 0.07, 0.4, runnerMat);
    tip.position.set(side * 0.4, 0.17, 1.02);
    tip.rotation.x = -0.75;
    group.add(runner, tip);
    for (const z of [-0.6, 0.55]) {
      const strut = box(0.06, 0.24, 0.06, runnerMat);
      strut.position.set(side * 0.4, 0.17, z);
      group.add(strut);
    }
  }

  // ---- penguin ----
  const penguin = new THREE.Group();
  penguin.position.set(0, 0.37, -0.15);
  penguin.rotation.x = -0.12; // sitting back on its bottom
  group.add(penguin);
  // smooth-shaded so the penguin reads soft against the faceted world
  const smooth = (color, shininess = 12) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0x222222 });
  const black = smooth(0x23262e, 30);
  const white = smooth(0xf7f7f2, 6);
  const orange = smooth(0xff9a2e, 20);
  const red = smooth(0xe84a3a, 4);
  const S = 28; // sphere segments

  const torso = sphere(0.42, black, S, S * 0.75);
  torso.scale.set(1, 1.25, 0.95);
  torso.position.y = 0.5;
  const belly = sphere(0.36, white, S, S * 0.75);
  belly.scale.set(0.85, 1.1, 0.6);
  belly.position.set(0, 0.45, 0.25);
  const head = sphere(0.3, black, S, S * 0.75);
  head.position.y = 1.08;
  const face = sphere(0.21, white, S, S * 0.75);
  face.scale.set(1, 0.9, 0.6);
  face.position.set(0, 1.07, 0.2);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 16), orange);
  beak.scale.set(1, 0.7, 1);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.02, 0.36);
  penguin.add(torso, belly, head, face, beak);
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = sphere(0.045, black, 16, 12);
    eye.position.set(side * 0.09, 1.13, 0.3);
    const shine = sphere(0.014, glint, 8, 6);
    shine.position.set(side * 0.09 + 0.015, 1.15, 0.34);
    // sitting pose: stubby legs reach forward and the feet sit toes-up on the deck
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 6, 12).rotateX(Math.PI / 2), black);
    leg.position.set(side * 0.15, 0.1, 0.4);
    const foot = sphere(0.13, orange, 16, 10);
    foot.scale.set(0.8, 0.28, 1.1);
    foot.rotation.set(-0.9, side * 0.2, 0); // toes up, splayed slightly outward
    foot.position.set(side * 0.16, 0.13, 0.54);
    penguin.add(eye, shine, leg, foot);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.065, 12, 28), red);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.84;
  const scarfTail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 6, 12), red);
  scarfTail.geometry.rotateX(Math.PI / 2).translate(0, 0, -0.2);
  scarfTail.scale.set(1, 0.4, 1);
  scarfTail.position.set(0.12, 0.84, -0.22);
  penguin.add(scarf, scarfTail);

  // ---- aero helmet: appears with the Aero Helmet upgrade and gets fancier with level ----
  const helmet = new THREE.Group();
  helmet.position.set(0, 1.08, 0);
  helmet.rotation.x = -0.4; // tipped back so the face stays clear
  const shellMat = smooth(0xf3f6f9, 50);
  const stripeMat = smooth(0xe84a3a, 20);
  const goldMat = smooth(0xffc93a, 80);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.325, S, S / 2, 0, Math.PI * 2, 0, Math.PI * 0.52), shellMat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.322, 0.022, 8, 40), shellMat);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = -0.02;
  // racing stripe down the centre line, back edge over the crown to the front edge
  const stripeGeo = new THREE.TorusGeometry(0.327, 0.02, 8, 40, Math.PI * 0.8).rotateZ(Math.PI * 0.1).rotateY(Math.PI / 2);
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.scale.set(2.2, 1, 1); // flatten the tube sideways into a band
  // time-trial tail that streamlines the back of the head
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, S).rotateX(-Math.PI / 2), shellMat);
  tail.scale.set(1, 0.55, 1);
  tail.position.set(0, 0.06, -0.38);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.352, S, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.37, Math.PI * 0.13),
    new THREE.MeshPhongMaterial({ color: 0x1b3a5c, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.75 }),
  );
  visor.rotation.x = 0.4; // undo the helmet tilt so the visor sits level across the eyes
  visor.position.set(0, 0, 0.005);
  helmet.add(shell, brim, stripe, tail, visor);
  penguin.add(helmet);

  const flippers = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.38, 0.75, 0);
    const flipper = sphere(0.25, black, 20, 14);
    flipper.scale.set(0.18, 1, 0.48);
    flipper.position.y = -0.2;
    pivot.add(flipper);
    pivot.rotation.z = side * 0.35;
    pivot.userData.side = side;
    penguin.add(pivot);
    flippers.push(pivot);
  }

  // ---- wings: bolted to the sides of the deck ----
  const wingMount = new THREE.Group();
  wingMount.position.set(0, 0.3, -0.1);
  group.add(wingMount);
  const wingPivots = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.46;
    pivot.rotation.z = side * 0.1; // slight dihedral
    pivot.userData.side = side;
    wingMount.add(pivot);
    wingPivots.push(pivot);
  }
  let wingMaterial = null;
  let wingGeo = null;

  function setWing(w) {
    for (const pivot of wingPivots) pivot.clear();
    if (wingGeo) wingGeo.dispose();
    if (wingMaterial) wingMaterial.dispose();
    wingGeo = null;
    wingMaterial = null;
    if (!w) return;
    wingGeo = wingGeometry(w);
    wingMaterial = mat(w.color, { side: THREE.DoubleSide });
    for (const pivot of wingPivots) {
      const mesh = new THREE.Mesh(wingGeo, wingMaterial);
      mesh.scale.x = pivot.userData.side; // mirror for the right wing (-x)
      mesh.castShadow = true;
      pivot.add(mesh);
    }
  }

  // ---- rocket backpack: twin boosters strapped to the penguin's back ----
  const rocket = new THREE.Group();
  penguin.add(rocket); // rides with the penguin, so it leans into turns too
  const packMat = smooth(0x2f6fb0, 10);
  const strapMat = smooth(0x1d3550, 6);
  const metal = smooth(0xc4ccd6, 60);
  const packShape = new THREE.Shape();
  {
    const w = 0.25, h = 0.26, rr = 0.09;
    packShape.moveTo(-w + rr, -h);
    packShape.lineTo(w - rr, -h);
    packShape.quadraticCurveTo(w, -h, w, -h + rr);
    packShape.lineTo(w, h - rr);
    packShape.quadraticCurveTo(w, h, w - rr, h);
    packShape.lineTo(-w + rr, h);
    packShape.quadraticCurveTo(-w, h, -w, h - rr);
    packShape.lineTo(-w, -h + rr);
    packShape.quadraticCurveTo(-w, -h, -w + rr, -h);
  }
  const packGeo = new THREE.ExtrudeGeometry(packShape, {
    depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 8,
  });
  packGeo.translate(0, 0, -0.07);
  const pack = new THREE.Mesh(packGeo, packMat);
  pack.position.set(0, 0.52, -0.5);
  const flap = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 6, 12).rotateZ(Math.PI / 2), strapMat);
  flap.scale.set(1, 1, 0.6);
  flap.position.set(0, 0.68, -0.62);
  rocket.add(pack, flap);
  for (const side of [-1, 1]) {
    // shoulder strap arcing from the pack over the shoulder to the chest
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.028, 8, 24, Math.PI * 0.82), strapMat);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(side * 0.18, 0.6, -0.02);
    rocket.add(strap);
  }

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9 });
  const flameCore = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95 });
  const flames = [];
  for (const side of [-1, 1]) {
    const booster = new THREE.Group();
    booster.position.set(side * 0.31, 0.5, -0.58);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 20).rotateX(Math.PI / 2), metal);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 20).rotateX(Math.PI / 2), red);
    cap.position.z = 0.32;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.08, 16).rotateX(Math.PI / 2), strapMat);
    nozzle.position.z = -0.27;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.14), red);
    fin.position.set(side * 0.09, 0, -0.17);
    const flame = new THREE.Group();
    flame.position.z = -0.31;
    flame.add(
      new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.55, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.27), flameMat),
      new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.15), flameCore),
    );
    flame.visible = false;
    booster.add(tube, cap, nozzle, fin, flame);
    rocket.add(booster);
    flames.push(flame);
  }

  group.traverse((o) => {
    if (o.isMesh && o.material !== flameMat && o.material !== flameCore) o.castShadow = true;
  });

  // Everything above hangs off one pivot at the penguin's centre, so a trick turns the whole
  // sled (wings, rocket and all) about its middle rather than about the runners.
  const acro = new THREE.Group();
  acro.position.y = TRICK_PIVOT;
  const rig = new THREE.Group();
  rig.position.y = -TRICK_PIVOT;
  for (const child of [...group.children]) rig.add(child);
  acro.add(rig);
  group.add(acro);

  const runnerBase = new THREE.Color(0x8a8f99);
  const runnerGold = new THREE.Color(0xffd24a);

  function setLoadout(stats) {
    setWing(stats.wing);
    rocket.visible = stats.rocketLevel > 0;
    const aero = stats.aeroLevel || 0;
    helmet.visible = aero > 0;
    stripe.visible = aero >= 3;
    tail.visible = aero >= 5;
    visor.visible = aero >= 7;
    const top = aero >= 8 ? goldMat : shellMat; // maxed: gold
    shell.material = brim.material = tail.material = top;
    runnerMat.color.copy(runnerBase).lerp(runnerGold, Math.min(1, stats.runnersLevel / 10));
  }

  let time = 0;
  // info: { steer, airborne, deploy, boosting, speed, crashed, trick: { axis: 'x' | 'y', sign, progress } | null }
  function animate(dt, info) {
    time += dt;
    // a trick is one full turn, eased in and out; with none under way (or once it's over) ease back upright
    if (info.trick && !info.crashed) {
      const u = info.trick.progress;
      const eased = u * u * (3 - 2 * u);
      acro.quaternion.setFromAxisAngle(AXES[info.trick.axis], info.trick.sign * eased * Math.PI * 2);
    } else {
      acro.quaternion.slerp(UPRIGHT, Math.min(1, dt * 20));
    }
    // wiped out: the penguin slumps over onto one side
    const lean = info.crashed && !info.airborne ? 1.3 : info.steer * 0.3;
    penguin.rotation.z += (lean - penguin.rotation.z) * Math.min(1, dt * 8);
    const flap = info.airborne && !info.hasWing ? Math.sin(time * 18) * 0.6 : 0;
    for (const f of flippers) {
      const side = f.userData.side;
      const target = info.airborne ? side * (1.1 + flap) : side * 0.35;
      f.rotation.z += (target - f.rotation.z) * Math.min(1, dt * 10);
    }
    scarfTail.rotation.y = Math.sin(time * 9) * 0.25 * Math.min(1, info.speed / 15);
    scarfTail.rotation.x = 0.4 - Math.min(0.45, info.speed / 40);
    // wings stay put; they just flex up a little under lift in the air
    for (const pivot of wingPivots) {
      pivot.rotation.z = pivot.userData.side * (0.1 + 0.12 * info.deploy);
    }
    for (const flame of flames) {
      flame.visible = info.boosting;
      if (info.boosting) {
        const s = 0.8 + Math.random() * 0.5;
        flame.scale.set(s, s, 0.8 + Math.random() * 0.7);
      }
    }
  }

  return { group, setLoadout, animate };
}
