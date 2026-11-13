import * as THREE from 'three';
import type { Malfoid } from '../../character/Malfoid';
import type { ComboSystem } from '../ComboSystem';
import type { FighterTarget } from '../FighterTarget';
import type { AttackButton } from '../moves';
import { sweepBox } from '../spells/collision';
import type { SpellDef, SpellSystem } from '../spells/SpellSystem';

export type AIState =
  | 'IDLE' | 'OBSERVE' | 'APPROACH' | 'RETREAT' | 'BLOCK' | 'MELEE_ATTACK' | 'CAST' | 'STAGGER' | 'RECOVER';

/** everything that shapes how she fights (tuned in play) */
export interface AIParams {
  detectRange: number;           // m: notices the opponent within this
  meleeRange: number;            // m centre to centre: close enough to strike
  castRange: [number, number];   // m: casts her spell between these distances
  reaction: [number, number];    // s: delay before she acts on what she sees
  attackCooldown: [number, number];   // s between strikes
  comboChance: number;           // a second press for a two-hit combo
  blockChance: number;           // blocks an attack she sees coming
  blockTime: [number, number];   // s
  castChance: number;            // per decision, when the spell is usable
  retreatTime: [number, number]; // s
  retreatAfterHits: number;      // backs off after this many hits in quick succession
  recover: number;               // s after a hit reaction before she acts again
  runDistance: number;           // m: runs to close a gap larger than this
}

export const GINNY_AI: AIParams = {
  detectRange: 12,
  meleeRange: 0.72,
  castRange: [2.0, 9.0],
  reaction: [0.2, 0.45],
  attackCooldown: [0.9, 1.6],
  comboChance: 0.45,
  blockChance: 0.35,
  blockTime: [0.45, 0.8],
  castChance: 0.6,
  retreatTime: [0.8, 1.4],
  retreatAfterHits: 2,
  recover: 0.35,
  runDistance: 3.5,
};

const OPENERS: AttackButton[] = ['J', 'U', 'K', 'I'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * A believable opponent: watches, keeps her distance, closes in, backs off under pressure,
 * sometimes blocks, strikes (with combos) and casts her spell. She acts on what she saw a
 * fraction of a second ago (never instantly) and only fights while active.
 */
export class FighterAI {
  state: AIState = 'IDLE';
  active = false;
  private timer = 0;              // time left in the current state
  private think = 0;              // until the next decision
  private attackReady = 0;        // until the next strike is allowed
  private pendingSecond: { button: AttackButton; at: number } | null = null;
  private sawAttack = -1;         // counts down her reaction time once the opponent attacks
  private noticed = false;        // she has seen the attack coming
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  onState: ((s: AIState) => void) | null = null;

  constructor(
    private readonly self: Malfoid,
    private readonly selfTarget: FighterTarget,
    private readonly combat: ComboSystem,
    private readonly spells: SpellSystem,
    private readonly spell: SpellDef,
    private readonly opponent: Malfoid,
    private readonly opponentCombat: ComboSystem,
    private readonly solids: () => readonly THREE.Box3[],
    readonly params: AIParams = GINNY_AI,
  ) {}

  /** s before she makes her first move when a duel starts */
  startDelay = 1.2;

  setActive(on: boolean): void {
    this.active = on;
    this.go(on ? 'OBSERVE' : 'IDLE');
    this.think = on ? this.startDelay : 0;
    if (!on) {
      this.self.stop();
      this.self.setHold('block', false);
    }
  }

  update(dt: number): void {
    const P = this.params;
    this.timer -= dt;
    this.think -= dt;
    this.attackReady -= dt;
    const me = this.self;
    const dist = this.distance();
    const angle = this.angleToOpponent();

    if (!this.active || me.defeated || this.opponent.defeated) {
      me.stop();
      me.setHold('block', false);
      me.lookAt(dist < P.detectRange ? angle : null);
      if (this.state !== 'IDLE') this.go('IDLE');
      return;
    }

    // a hit reaction overrides everything; then a short recovery
    if (me.reacting && me.reacting !== 'pickup') {
      if (this.state !== 'STAGGER') {
        me.stop();
        me.setHold('block', false);
        this.pendingSecond = null;
        this.go('STAGGER');
      }
      return;
    }
    if (this.state === 'STAGGER') {
      this.go('RECOVER', P.recover);
      // under pressure: back off after the recovery
      if (this.selfTarget.recentHits >= P.retreatAfterHits) this.think = P.recover;
    }

    // she notices the opponent's attacks after her reaction time
    if (this.opponentCombat.busy) {
      if (this.sawAttack < 0) this.sawAttack = rand(P.reaction[0], P.reaction[1]);
      else if (!this.noticed && (this.sawAttack -= dt) <= 0) this.noticed = true;
    } else {
      this.sawAttack = -1;
      this.noticed = false;
    }

    // second press of a combo
    if (this.pendingSecond) {
      this.pendingSecond.at -= dt;
      if (this.pendingSecond.at <= 0) {
        this.combat.press(this.pendingSecond.button);
        this.pendingSecond = null;
      }
    }

    switch (this.state) {
      case 'RECOVER':
        me.stop();
        me.lookAt(angle);
        if (this.timer <= 0) this.go('OBSERVE');
        return;
      case 'BLOCK':
        me.stop();
        me.lookAt(angle);
        me.setHold('block', true);
        if (this.timer <= 0) {
          me.setHold('block', false);
          this.go('OBSERVE');
        }
        return;
      case 'CAST':
        me.stop();
        if (!this.spells.isCasting) this.go('OBSERVE');
        return;
      case 'MELEE_ATTACK':
        me.stop();
        if (!this.combat.busy && !this.pendingSecond) this.go('OBSERVE');
        return;
      case 'APPROACH': {
        const run = dist > P.runDistance;
        me.move(this.dirToOpponent(), run, run ? null : angle);
        if (dist <= P.meleeRange || this.timer <= 0) {
          me.stop();
          this.go('OBSERVE');
        }
        break;
      }
      case 'RETREAT':
        me.move(this.dirToOpponent().negate(), false, angle);
        if (this.timer <= 0 || dist > P.castRange[1]) {
          me.stop();
          this.go('OBSERVE');
        }
        break;
      default:
        me.stop();
        me.lookAt(angle);
    }

    if (this.think > 0) return;
    this.think = rand(P.reaction[0], P.reaction[1]);
    this.decide(dist, angle);
  }

  private decide(dist: number, angle: number): void {
    const P = this.params;
    const me = this.self;
    if (dist > P.detectRange) {
      this.go('IDLE');
      return;
    }
    // under pressure: back off
    if (this.selfTarget.recentHits >= P.retreatAfterHits && this.state !== 'RETREAT') {
      this.selfTarget.recentHits = 0;
      this.go('RETREAT', rand(P.retreatTime[0], P.retreatTime[1]));
      return;
    }
    // block an attack she has seen coming (only if it can reach her)
    if (this.noticed && dist < 1.4) {
      this.noticed = false;                          // one roll per attack she sees
      if (Math.random() < P.blockChance) {
        this.go('BLOCK', rand(P.blockTime[0], P.blockTime[1]));
        return;
      }
    }
    // her spell: only while the opponent still has a wand, from a distance, in clear sight
    if (this.opponent.hasWand && dist >= P.castRange[0] && dist <= P.castRange[1] && this.spells.canCast(this.spell)
        && this.lineOfSight() && Math.random() < P.castChance) {
      me.lookAt(angle);
      if (this.spells.cast(this.spell)) {
        this.go('CAST');
        return;
      }
    }
    // in reach: strike
    if (dist <= P.meleeRange + 0.08) {
      if (this.attackReady <= 0 && me.canStrike && !this.combat.busy) {
        const first = pick(OPENERS);
        this.combat.press(first);
        if (Math.random() < P.comboChance) this.pendingSecond = { button: pick(OPENERS), at: rand(0.12, 0.28) };
        this.attackReady = rand(P.attackCooldown[0], P.attackCooldown[1]);
        this.go('MELEE_ATTACK');
      } else {
        this.go('OBSERVE');
      }
      return;
    }
    // out of reach: close in, unless she would rather keep her distance for the spell
    const wantsDistance = this.opponent.hasWand && this.spells.cooldownLeft(this.spell) < 1.0 && dist <= P.castRange[1];
    if (!wantsDistance || dist > P.castRange[1]) {
      this.go('APPROACH', 3.0);
      return;
    }
    this.go('OBSERVE');
  }

  private go(s: AIState, time = 0): void {
    if (s !== this.state) {
      this.state = s;
      this.onState?.(s);
    }
    this.timer = time;
  }

  private distance(): number {
    const a = this.self.position;
    const b = this.opponent.position;
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  private angleToOpponent(): number {
    const a = this.self.position;
    const b = this.opponent.position;
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  private dirToOpponent(): THREE.Vector3 {
    const a = this.self.position;
    const b = this.opponent.position;
    return this.tmp.set(b.x - a.x, 0, b.z - a.z).normalize();
  }

  /** nothing solid between her wand and the opponent's chest */
  private lineOfSight(): boolean {
    const from = this.tmp2.copy(this.self.position).setY(1.3);
    const to = new THREE.Vector3(this.opponent.position.x, 1.15, this.opponent.position.z);
    for (const box of this.solids()) if (sweepBox(from, to, 0, box) >= 0) return false;
    return true;
  }
}
