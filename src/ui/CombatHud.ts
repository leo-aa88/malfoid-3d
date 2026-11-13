import * as THREE from 'three';
import type { CombatEvent } from '../combat/ComboSystem';
import type { SpellEvent } from '../combat/spells/SpellSystem';
import { DUMMY_MAX_HP, Guard } from '../combat/TrainingDummy';
import type { FighterTarget } from '../combat/FighterTarget';

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
  private readonly spellList = el('div', 'spell-list');
  private readonly spellSlots = new Map<string, { box: HTMLElement; state: HTMLElement; fill: HTMLElement; shown: string }>();
  private readonly duelBox: HTMLElement;
  private readonly duelButton: HTMLButtonElement;
  private readonly bars: { el: HTMLElement; fill: HTMLElement; text: HTMLElement; shown: number }[] = [];
  private readonly aiText: HTMLElement;
  private readonly announceEl = el('div', 'announce');
  private announceTimer = 0;
  onDuelButton: (() => void) | null = null;
  onModeButton: (() => void) | null = null;
  private readonly dummyBox: HTMLElement;
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
    this.dummyBox = box;
    this.hpFill = box.querySelector('.hp-fill')!;
    this.hpText = box.querySelector('.hp-text')!;
    this.guardText = box.querySelector('.guard')!;
    hud.append(this.spellList);               // one slot per spell (addSpell)
    // duel: both fighters' health, Ginny's state, start / stop
    this.duelBox = el('div', 'duel-box');
    this.duelBox.innerHTML =
      '<div class="fighter"><div class="row"><span class="label">Malfoid</span><span class="hp-text"></span></div>' +
      '<div class="hp"><div class="hp-fill"></div></div></div>' +
      '<div class="fighter"><div class="row"><span class="label">Ginny</span><span class="hp-text"></span></div>' +
      '<div class="hp"><div class="hp-fill ginny"></div></div></div>' +
      '<div class="row"><span class="label">Ginny AI</span><span class="ai-state">waiting</span></div>' +
      '<div class="row"><span class="label">Difficulty</span><span class="level"></span></div>' +
      '<div class="row lives-row"><span class="label">Lives</span><span class="lives"></span></div>' +
      '<button class="duel-button" type="button">Restart duel [G]</button>';
    hud.append(this.duelBox);
    for (const f of this.duelBox.querySelectorAll<HTMLElement>('.fighter')) {
      this.bars.push({ el: f, fill: f.querySelector('.hp-fill')!, text: f.querySelector('.hp-text')!, shown: -1 });
    }
    this.aiText = this.duelBox.querySelector('.ai-state')!;
    this.duelButton = this.duelBox.querySelector('.duel-button')!;
    this.duelButton.addEventListener('click', () => {
      this.duelButton.blur();                          // keep the keys working
      this.onDuelButton?.();
    });
    const mode = document.createElement('button');
    mode.className = 'mode-button';
    mode.type = 'button';
    mode.textContent = 'Change mode';
    mode.addEventListener('click', () => {
      mode.blur();
      this.onModeButton?.();
    });
    hud.append(mode);
    document.body.append(this.announceEl);
  }

  /** training shows the dummy's panel, a duel both fighters' health; only practice restarts (G) */
  setMode(mode: 'training' | 'practice' | 'campaign'): void {
    this.dummyBox.hidden = mode !== 'training';
    this.duelBox.hidden = mode === 'training';
    this.duelButton.hidden = mode !== 'practice';
    this.duelBox.querySelector<HTMLElement>('.lives-row')!.hidden = mode !== 'campaign';
  }

  /** the campaign's lives left (of total) */
  setLives(left: number, total: number): void {
    this.duelBox.querySelector('.lives')!.textContent = '♥'.repeat(left) + '♡'.repeat(Math.max(0, total - left));
  }

  setLevel(label: string): void {
    this.duelBox.querySelector('.level')!.textContent = label;
  }

  setDuel(on: boolean): void {
    this.duelBox.classList.toggle('on', on);
  }

  /** both fighters' health, and what Ginny's AI is doing (null: no duel) */
  setFighters(a: FighterTarget, b: FighterTarget, aiState: string | null): void {
    [a, b].forEach((f, i) => {
      const bar = this.bars[i];
      if (f.hp === bar.shown) return;
      bar.shown = f.hp;
      bar.fill.style.width = `${(100 * f.hp) / f.maxHp}%`;
      bar.text.textContent = `${f.hp} / ${f.maxHp}`;
    });
    const t = aiState ?? 'waiting';
    if (this.aiText.textContent !== t) this.aiText.textContent = t;
  }

  /** big centred text: DUEL!, DISARMED!, the winner */
  announce(text: string, cls: string): void {
    this.announceEl.textContent = text;
    this.announceEl.className = 'announce ' + cls;
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add('show');
    this.announceTimer = 1.8;
  }

  /** short status line under the combo banner (NO WAND, MISS, ...) */
  flashStatusText(text: string, cls: string): void {
    this.flashStatus(text, cls);
  }

  /** a spell slot: name, key and cooldown bar (cls styles it: 'confringo', 'expelliarmus') */
  addSpell(id: string, name: string, key: string, cls: string): void {
    const box = el('div', `spell-box ready ${cls}`);
    box.innerHTML =
      `<div class="row"><span class="spell-name">${name.toUpperCase()} [${key}]</span><span class="spell-state"></span></div>` +
      '<div class="cd"><div class="cd-fill"></div></div>';
    this.spellList.append(box);
    this.spellSlots.set(id, { box, state: box.querySelector('.spell-state')!, fill: box.querySelector('.cd-fill')!, shown: '' });
  }

  /** show or hide a spell's slot (a spell not learned yet, or not allowed in this fight) */
  showSpell(id: string, on: boolean): void {
    const slot = this.spellSlots.get(id)!;
    if (slot.box.hidden === !on) return;
    slot.box.hidden = !on;
    if (on) {                                  // a slot that appears pops in once
      slot.box.classList.remove('learned');
      void slot.box.offsetWidth;
      slot.box.classList.add('learned');
    }
  }

  /** a spell slot's state: seconds of cooldown left (0 = ready) out of total; no wand: can't cast */
  setSpell(id: string, left: number, total: number, hasWand = true): void {
    const slot = this.spellSlots.get(id)!;
    const ready = left <= 0 && hasWand;
    const text = !hasWand ? 'NO WAND' : ready ? 'READY' : `${left.toFixed(1)}s`;
    if (text === slot.shown) return;
    slot.shown = text;
    slot.state.textContent = text;
    slot.box.classList.toggle('ready', ready);
    slot.box.classList.toggle('cooling', !ready);
    slot.fill.style.width = `${ready ? 100 : !hasWand ? 0 : (100 * (1 - left / total)).toFixed(1)}%`;
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
    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.announceEl.classList.remove('show');
    }
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
