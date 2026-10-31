// DOM overlays: menu, HUD, aiming meter, results and the upgrade workshop.

import { UPGRADES, WINGS, upgradeCost, levelOf } from './upgrades.js';
import { DEFAULT_SENSITIVITY, SENS_MIN, SENS_MAX } from './save.js';
import { TRICKS_ENABLED } from './tricks.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString();
export const MPH = 2.23694; // m/s -> mph

export class UI {
  constructor(handlers) {
    this.h = handlers; // { play, openShop, closeShop, endRun, buyUpgrade, buyWing, equipWing, reset, sensitivity(k) }
    this.tab = 'sled';
    for (const id of ['help-tricks', 'res-tricks-row']) $(id).classList.toggle('hidden', !TRICKS_ENABLED);
    this.lastCoins = -1;
    this.toastTimer = null;

    $('btn-play').onclick = () => this.h.play();
    $('btn-shop').onclick = () => this.h.openShop();
    $('btn-again').onclick = () => this.h.play();
    $('btn-res-shop').onclick = () => this.h.openShop();
    $('btn-shop-back').onclick = () => this.h.closeShop();
    $('btn-shop-play').onclick = () => this.h.play();
    $('btn-end').onclick = () => this.h.endRun();
    $('btn-pause').onclick = () => this.h.pause(true);
    $('btn-resume').onclick = () => this.h.pause(false);
    $('btn-pause-end').onclick = () => {
      this.h.pause(false);
      this.h.endRun();
    };
    $('btn-reset').onclick = () => {
      if (confirm('Reset all coins, upgrades and best distance?')) this.h.reset();
    };
    for (const tab of document.querySelectorAll('.tab')) {
      tab.onclick = () => {
        this.tab = tab.dataset.tab;
        for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
        this.renderShop(this.save);
      };
    }

    // settings: touch steering sensitivity
    const sens = $('sens');
    sens.min = SENS_MIN;
    sens.max = SENS_MAX;
    sens.step = 0.05;
    sens.oninput = () => this.setSensitivity(Number(sens.value));
    $('btn-settings').onclick = () => {
      this.showSensitivity();
      this.show('settings');
    };
    $('btn-settings-done').onclick = () => this.showMenu(this.save);
    $('btn-help').onclick = () => this.show('help');
    $('btn-help-close').onclick = () => this.showMenu(this.save);
    $('btn-settings-reset').onclick = () => {
      this.setSensitivity(DEFAULT_SENSITIVITY);
    };
  }

  setSensitivity(k) {
    this.save.touchSensitivity = k;
    this.h.sensitivity(k);
    this.showSensitivity();
  }

  showSensitivity() {
    $('sens').value = this.save.touchSensitivity;
    $('sens-value').textContent = `${Math.round(this.save.touchSensitivity * 100)}%`;
  }

  show(screen) {
    for (const id of ['menu', 'results', 'shop', 'settings', 'help', 'pause']) $(id).classList.toggle('hidden', id !== screen);
  }

  showMenu(save) {
    this.save = save;
    $('menu-coins').textContent = fmt(save.coins);
    $('menu-best').textContent = `${fmt(save.best)} m`;
    this.show('menu');
    this.setMode('menu');
  }

  // Flash the fuel gauge after picking up a gas can.
  refuel() {
    const el = $('fuel-wrap');
    el.classList.remove('refuel');
    void el.offsetWidth; // restart the animation
    el.classList.add('refuel');
  }

  // which in-world UI is visible for a game mode
  setMode(mode, stats) {
    $('hud').classList.toggle('hidden', mode !== 'run');
    $('btn-end').classList.toggle('hidden', mode !== 'run');
    $('btn-pause').classList.toggle('hidden', mode !== 'run');
    $('aim-ui').classList.toggle('hidden', mode !== 'aim');
    const hasRocket = stats && stats.fuel > 0;
    $('fuel-wrap').classList.toggle('hidden', !(mode === 'run' && hasRocket));
    if (mode !== 'menu') this.show(null);
  }

  setPower(power, speed) {
    $('power-bar').style.width = `${Math.round(power * 100)}%`;
    $('power-label').textContent = power > 0.02 ? `Power ${Math.round(power * 100)}% · ${speed.toFixed(0)} m/s` : 'Pull back to charge';
  }

  updateHud(run, body, stats, best) {
    $('hud-dist').textContent = `${fmt(run.maxZ)} m`;
    $('hud-speed').textContent = `${fmt(body.speed * MPH)} mph`;
    if (run.coins !== this.lastCoins) {
      const el = $('hud-coins');
      el.textContent = fmt(run.coins);
      if (this.lastCoins >= 0) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      this.lastCoins = run.coins;
    }
    const toBest = best - run.maxZ;
    $('hud-best').textContent = best > 0 ? (toBest > 0 ? `Best ${fmt(best)} m · ${fmt(toBest)} m to go` : '🏁 New best!') : '';
    if (stats.fuel > 0) $('fuel-bar').style.width = `${(body.fuel / stats.fuel) * 100}%`;
  }

  resetHud() {
    this.lastCoins = -1;
  }

  // the Paused card covers the game; the in-run buttons step aside while it's up
  showPause(on) {
    this.show(on ? 'pause' : null);
    for (const id of ['btn-pause', 'btn-end']) $(id).classList.toggle('hidden', on);
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  showResults(r, save) {
    $('res-title').textContent = r.newBest ? 'What a run!' : 'Run complete';
    $('res-best-badge').classList.toggle('hidden', !r.newBest);
    $('res-dist').textContent = `${fmt(r.distance)} m`;
    $('res-coins').textContent = `+${fmt(r.coins)}`;
    $('res-bonus').textContent = `+${fmt(r.bonus)}`;
    $('res-air').textContent = `+${fmt(r.air)}`;
    $('res-tricks').textContent = `+${fmt(r.tricks)}`;
    $('res-total').textContent = `+${fmt(r.total)}`;
    $('res-wallet').textContent = fmt(save.coins);
    this.setMode('results');
    this.show('results');
  }

  showShop(save) {
    this.setMode('shop');
    this.show('shop');
    this.renderShop(save);
  }

  renderShop(save) {
    this.save = save;
    $('shop-coins').textContent = fmt(save.coins);
    const grid = $('shop-grid');
    grid.innerHTML = '';
    if (this.tab === 'sled') {
      for (const u of UPGRADES) grid.appendChild(this.upgradeCard(u, save));
    } else {
      grid.appendChild(this.noWingCard(save));
      for (const w of WINGS) grid.appendChild(this.wingCard(w, save));
    }
  }

  upgradeCard(u, save) {
    const level = levelOf(save, u.id);
    const maxed = level >= u.max;
    const cost = maxed ? 0 : upgradeCost(u, level);
    const el = document.createElement('div');
    el.className = 'item';
    const pips = Array.from({ length: u.max }, (_, i) => `<div class="pip${i < level ? ' on' : ''}"></div>`).join('');
    const now = u.label(u.value(level));
    const next = maxed ? '' : ` → <b>${u.label(u.value(level + 1))}</b>`;
    el.innerHTML = `
      <div class="item-head"><span class="item-icon">${u.icon}</span><span class="item-name">${u.name}</span></div>
      <div class="item-desc">${u.desc}</div>
      <div class="pips">${pips}</div>
      <div class="item-stat">${now}${next}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = maxed ? 'Maxed' : `Upgrade · 🪙 ${fmt(cost)}`;
    btn.disabled = maxed || save.coins < cost;
    btn.onclick = () => this.h.buyUpgrade(u);
    el.appendChild(btn);
    return el;
  }

  noWingCard(save) {
    const el = document.createElement('div');
    el.className = 'item' + (save.wingEquipped ? '' : ' equipped');
    el.innerHTML = `
      <div class="item-head"><span class="item-icon">🛷</span><span class="item-name">No wings</span></div>
      <div class="item-desc">Pure sled. No glide, no extra drag.</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = save.wingEquipped ? 'Equip' : 'Equipped';
    btn.disabled = !save.wingEquipped;
    btn.onclick = () => this.h.equipWing(null);
    el.appendChild(btn);
    return el;
  }

  wingCard(w, save) {
    const owned = save.wingsOwned.includes(w.id);
    const equipped = save.wingEquipped === w.id;
    const el = document.createElement('div');
    el.className = 'item' + (equipped ? ' equipped' : '');
    const bar = (label, v, max) => `<span>${label}</span><div class="wb"><div style="width:${Math.min(100, (v / max) * 100)}%"></div></div>`;
    const hex = `#${w.color.toString(16).padStart(6, '0')}`;
    el.innerHTML = `
      <div class="item-head"><span class="wing-swatch" style="background:${hex}"></span><span class="item-name">${w.name}</span></div>
      <div class="item-desc">${w.desc}</div>
      <div class="wing-bars">
        ${bar('Lift', w.lift, 2.4)}
        ${bar('Low drag', 0.7 - w.drag, 0.6)}
        ${bar('Air control', w.air, 1.4)}
        ${bar('Span', w.span, 2.6)}
      </div>`;
    const btn = document.createElement('button');
    if (!owned) {
      btn.className = 'btn primary';
      btn.textContent = `Buy · 🪙 ${fmt(w.cost)}`;
      btn.disabled = save.coins < w.cost;
      btn.onclick = () => this.h.buyWing(w);
    } else {
      btn.className = 'btn';
      btn.textContent = equipped ? 'Equipped' : 'Equip';
      btn.disabled = equipped;
      btn.onclick = () => this.h.equipWing(w.id);
    }
    el.appendChild(btn);
    return el;
  }
}
