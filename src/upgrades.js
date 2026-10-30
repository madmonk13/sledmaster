// Upgrade and wing definitions. Each upgrade's `value(level)` is the single source
// of truth for its effect; computeStats() turns a save into the physics numbers.

export const UPGRADES = [
  {
    id: 'slingshot', icon: '🎯', name: 'Slingshot Bands',
    desc: 'Thicker bands for a faster launch.',
    max: 10, base: 60, growth: 1.55,
    value: (l) => 16 + 4.5 * l,
    label: (v) => `${v.toFixed(1)} m/s launch`,
  },
  {
    id: 'runners', icon: '⛸️', name: 'Waxed Runners',
    desc: 'Less snow friction, so you glide further.',
    max: 10, base: 90, growth: 1.6,
    value: (l) => 0.12 * Math.pow(0.9, l),
    label: (v) => `friction ${(v / 0.12 * 100).toFixed(0)}%`,
  },
  {
    id: 'grip', icon: '🧭', name: 'Steering Grip',
    desc: 'Sharper turns and better control on ice.',
    max: 6, base: 75, growth: 1.7,
    value: (l) => 1.2 + 0.22 * l,
    label: (v) => `turn rate ${(v / 1.2 * 100).toFixed(0)}%`,
  },
  {
    id: 'aero', icon: '🪖', name: 'Aero Helmet',
    desc: 'Cuts air drag at high speed.',
    max: 8, base: 180, growth: 1.65,
    value: (l) => 0.0012 * Math.pow(0.86, l),
    label: (v) => `air drag ${(v / 0.0012 * 100).toFixed(0)}%`,
  },
  {
    id: 'magnet', icon: '🧲', name: 'Coin Magnet',
    desc: 'Pulls in nearby coins.',
    max: 6, base: 220, growth: 1.8,
    value: (l) => (l ? 2 + 1.6 * l : 0),
    label: (v) => (v ? `${v.toFixed(1)} m reach` : 'none'),
  },
  {
    id: 'rocket', icon: '🚀', name: 'Booster Rocket',
    desc: 'Hold Space or 🚀 for thrust. More fuel each level.',
    max: 8, base: 450, growth: 1.7,
    value: (l) => (l ? 1.2 + 0.7 * l : 0),
    label: (v) => (v ? `${v.toFixed(1)} s of fuel` : 'none'),
  },
];

// Wings: lift = glide strength, drag = speed lost while gliding, air = steering in the air.
export const WINGS = [
  {
    id: 'cardboard', name: 'Cardboard Flaps', cost: 300,
    desc: 'Taped on and hopeful. A little extra hang time.',
    shape: 'rect', span: 0.7, chord: 0.55, color: 0xc8a26b,
    lift: 0.55, drag: 0.35, air: 0.5,
  },
  {
    id: 'feather', name: 'Feather Fins', cost: 900,
    desc: 'Light and forgiving. Solid all-rounder.',
    shape: 'feather', span: 1.0, chord: 0.6, color: 0xf4f1ea,
    lift: 0.9, drag: 0.35, air: 0.75,
  },
  {
    id: 'delta', name: 'Swept Delta', cost: 2400,
    desc: 'Very low drag keeps your speed. Modest lift.',
    shape: 'delta', span: 1.1, chord: 0.95, color: 0x5b7fa6,
    lift: 0.8, drag: 0.1, air: 0.6,
  },
  {
    id: 'glider', name: 'Ripstop Glider', cost: 5000,
    desc: 'Long nylon wings for floaty glides.',
    shape: 'glider', span: 1.7, chord: 0.55, color: 0xff7a2f,
    lift: 1.5, drag: 0.45, air: 0.8,
  },
  {
    id: 'bat', name: 'Night Batwing', cost: 10000,
    desc: 'Big and twitchy. Superb air steering.',
    shape: 'bat', span: 1.8, chord: 0.95, color: 0x5a3a7a,
    lift: 1.8, drag: 0.6, air: 1.4,
  },
  {
    id: 'albatross', name: 'Albatross Span', cost: 22000,
    desc: 'Enormous span. Effortless soaring.',
    shape: 'glider', span: 2.6, chord: 0.45, color: 0xe8eef5,
    lift: 2.4, drag: 0.4, air: 0.9,
  },
];

export function upgradeCost(u, level) {
  return Math.round(u.base * Math.pow(u.growth, level));
}

export function levelOf(save, id) {
  return save.levels[id] || 0;
}

export function computeStats(save) {
  const v = (id) => UPGRADES.find((u) => u.id === id).value(levelOf(save, id));
  const gripLevel = levelOf(save, 'grip');
  return {
    launchSpeed: v('slingshot'),
    mu: v('runners'),
    turnRate: v('grip'),
    grip: 5 + 1.2 * gripLevel,
    iceGrip: 0.35 + 0.2 * gripLevel,
    dragK: v('aero'),
    magnet: v('magnet'),
    fuel: v('rocket'),
    thrust: 13 + levelOf(save, 'rocket'),
    rocketLevel: levelOf(save, 'rocket'),
    aeroLevel: levelOf(save, 'aero'),
    runnersLevel: levelOf(save, 'runners'),
    wing: WINGS.find((w) => w.id === save.wingEquipped) || null,
  };
}
