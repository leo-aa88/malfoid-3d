import * as THREE from 'three';
import type { CombatEvent } from '../combat/ComboSystem';
import type { SpellEvent } from '../combat/spells/SpellSystem';
import { DUMMY_MAX_HP, Guard } from '../combat/TrainingDummy';

/**
 * Combat overlay: "2 HIT COMBO" banner with the combo's name, damage numbers
 * over the dummy, BLOCKED / MISS / VULNERABLE call-outs, the dummy's HP and
 * guard.
 */
export class CombatHud {
  private readonly banner = el('div', 'combo-banner');
  private readonly status = el('div', 'combat-status');
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly guardText: HTMLElement;
  private readonly spellBox: HTMLElement;
  private readonly spellState: HTMLElement;
  private readonly spellFill: HTMLElement;
  private spellShown = '';
  private bannerTimer = 0;
  private hpShown = -1;
  private readonly v = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera, hud: HTMLElement) {
    document.body.append(this.banner, this.status);
    const box = el('div', 'dummy-box');
    box.innerHTML =
      '<div class="row"><span class="label">Dummy</span><span class="hp-text"></span></div>' +
      '<div class="hp"><div class="hp-fill"></div></div>' +
      '<div class="row"><span class="label">Guard</span><span class="guard"></span></div>';
    hud.append(box);
    this.hpFill = box.querySelector('.hp-fill')!;
    this.hpText = box.querySelector('.hp-text')!;
    this.guardText = box.querySelector('.guard')!;
    this.spellBox = el('div', 'spell-box ready');
    this.spellBox.innerHTML =
      '<div class="row"><span class="spell-name"></span><span class="spell-state"></span></div>' +
      '<div class="cd"><div class="cd-fill"></div></div>';
    hud.append(this.spellBox);
    this.spellState = this.spellBox.querySelector('.spell-state')!;
    this.spellFill = this.spellBox.querySelector('.cd-fill')!;
  }

  /** spell slot: name, key, seconds of cooldown left (0 = ready) out of total */
  setSpell(name: string, key: string, left: number, total: number): void {
    const ready = left <= 0;
    const text = ready ? 'READY' : `${left.toFixed(1)}s`;
    if (text === this.spellShown) return;
    if (!this.spellShown) this.spellBox.querySelector('.spell-name')!.textContent = `${name.toUpperCase()} [${key}]`;
    this.spellShown = text;
    this.spellState.textContent = text;
    this.spellBox.classList.toggle('ready', ready);
    this.spellBox.classList.toggle('cooling', !ready);
    this.spellFill.style.width = `${ready ? 100 : (100 * (1 - left / total)).toFixed(1)}%`;
  }

  /** damage numbers for spell hits (same pop-ups as melee) */
  handleSpell(e: SpellEvent): void {
    if (e.type !== 'hit') return;
    const r = e.report;
    // above the blast (the fireball would swallow a number drawn at the impact point)
    const at = e.at.clone().setY(e.at.y + 0.45);
    if (r.result === 'hit') this.popup(at, `${r.damage}`, 'dmg' + (e.direct ? ' heavy spell' : ' spell'));
    else if (r.result === 'blocked') this.popup(at, `BLOCKED ${r.damage}`, 'blocked');
    if (r.ko) this.popup(at.setY(at.y + 0.3), 'K.O.', 'ko');
  }

  setDummy(hp: number, guard: Guard): void {
    if (hp !== this.hpShown) {
      this.hpShown = hp;
      this.hpFill.style.width = `${(100 * hp) / DUMMY_MAX_HP}%`;
      this.hpText.textContent = `${hp} / ${DUMMY_MAX_HP}`;
    }
    if (this.guardText.textContent !== guard) this.guardText.textContent = guard;
  }

  handle(e: CombatEvent): void {
    switch (e.type) {
      case 'strike':
        if (e.result === 'hit') this.popup(e.at, `${e.damage}`, 'dmg' + (e.move.heavy ? ' heavy' : ''));
        else if (e.result === 'blocked') this.popup(e.at, `BLOCKED ${e.damage}`, 'blocked');
        if (e.ko) this.popup(e.at.clone().setY(e.at.y + 0.3), 'K.O.', 'ko');
        break;
      case 'whiff':
        this.flashStatus('MISS', 'miss');
        break;
      case 'combo':
        this.banner.innerHTML = `<div class="hits">${e.hits} HIT COMBO</div><div class="name">${e.combo.name}</div>`;
        this.banner.classList.remove('show');
        void this.banner.offsetWidth;            // restart the CSS animation
        this.banner.classList.add('show');
        this.bannerTimer = 1.6;
        break;
      case 'broken':
        this.flashStatus(e.reason === 'blocked' ? 'COMBO BLOCKED' : 'COMBO DROPPED', 'miss');
        break;
      case 'vulnerable':
        if (e.on) this.setStatus('VULNERABLE', 'vulnerable');
        else if (this.status.classList.contains('vulnerable')) this.setStatus('', '');
        break;
    }
  }

  update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }

  private statusTimer = 0;

  private setStatus(text: string, cls: string): void {
    window.clearTimeout(this.statusTimer);
    this.status.textContent = text;
    this.status.className = 'combat-status' + (cls ? ' show ' + cls : '');
  }

  private flashStatus(text: string, cls: string): void {
    if (this.status.classList.contains('vulnerable')) return;    // keep the warning up
    this.setStatus(text, cls);
    this.statusTimer = window.setTimeout(() => this.setStatus('', ''), 700);
  }

  /** floating text at a world position, rises and fades (CSS) */
  private popup(at: THREE.Vector3, text: string, cls: string): void {
    this.v.copy(at).project(this.camera);
    if (this.v.z > 1) return;
    const p = el('div', 'popup ' + cls);
    p.textContent = text;
    p.style.left = `${((this.v.x + 1) / 2) * window.innerWidth + (Math.random() - 0.5) * 30}px`;
    p.style.top = `${((1 - this.v.y) / 2) * window.innerHeight}px`;
    document.body.append(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
