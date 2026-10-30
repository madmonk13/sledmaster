// Balance check: run in the browser console on the game page (or via the dev tools)
//   const { runBalance } = await import('/tools/balance.js?' + Date.now()); await runBalance();
// Simulates full-power launches with a simple "stay centred" driver across several
// seeds and upgrade levels, and reports average distance and total upgrade cost.

const bust = () => `?${Date.now()}`;

// Point down the course, drifting back toward the centre line.
export function botSteer(b) {
  const want = Math.max(-0.4, Math.min(0.4, -b.pos.x * 0.03));
  return Math.max(-1, Math.min(1, -(want - b.facing) * 3));
}

export async function runBalance({ seeds = 6, fracs = [0, 0.2, 0.4, 0.6, 0.8, 1], wings = [null, 'glider', 'albatross'] } = {}) {
  const { Terrain } = await import('/src/terrain.js');
  const { SledBody } = await import('/src/physics.js');
  const { computeStats, UPGRADES, upgradeCost } = await import('/src/upgrades.js');
  const { defaultSave } = await import('/src/save.js');
  const fakeScene = { add() {}, remove() {} };

  function sim(seed, st) {
    const t = new Terrain(fakeScene, seed);
    const b = new SledBody();
    b.vel.set(0, 0, st.launchSpeed);
    b.fuel = st.fuel;
    let maxZ = 0, still = 0, stagnant = 0, time = 0, air = 0;
    const dt = 1 / 120;
    while (time < 900) {
      b.step(dt, { steer: botSteer(b), boost: b.speed < 12 }, st, t);
      time += dt;
      if (b.airborne) air += dt;
      if (b.pos.z > maxZ + 0.25) { maxZ = b.pos.z; stagnant = 0; } else stagnant += dt;
      still = b.speed < 0.6 && !b.airborne ? still + dt : 0;
      if (time > 1 && (still > 1 || stagnant > 5)) break;
    }
    return { dist: maxZ, air };
  }

  const rows = [];
  for (const frac of fracs) {
    for (const wing of wings) {
      const s = defaultSave();
      let cost = 0;
      for (const u of UPGRADES) {
        const l = Math.round(u.max * frac);
        s.levels[u.id] = l;
        for (let i = 0; i < l; i++) cost += upgradeCost(u, i);
      }
      s.wingEquipped = wing;
      const st = computeStats(s);
      const res = Array.from({ length: seeds }, (_, k) => sim((k + 1) * 104729, st));
      const avg = res.reduce((a, r) => a + r.dist, 0) / seeds;
      const air = res.reduce((a, r) => a + r.air, 0) / seeds;
      rows.push(`${String(Math.round(frac * 100)).padStart(3)}% ${(wing || '-').padEnd(9)} avg ${Math.round(avg)} m  air ${air.toFixed(1)} s  [${res.map((r) => Math.round(r.dist)).join(',')}]  cost ${cost}`);
    }
  }
  return rows;
}
