import * as THREE from 'three';
import type { Malfoid } from '../../character/Malfoid';
import type { ComboSystem } from '../ComboSystem';
import type { FighterTarget } from '../FighterTarget';
import { AttackButton, COMBOS, MOVES } from '../moves';
import { sweepBox } from '../spells/collision';
import type { SpellDef, SpellSystem } from '../spells/SpellSystem';

export type AIState =
  | 'IDLE' | 'OBSERVE' | 'APPROACH' | 'RETREAT' | 'BLOCK' | 'MELEE_ATTACK' | 'CAST' | 'DODGE' | 'STAGGER' | 'RECOVER'
  | 'RETRIEVE';

/** s she heads for her dropped wand before thinking again (a trunk in the way, a fight to answer) */
const RETRIEVE_TIME = 3.0;

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
  // --- smarter play (0 / false on Easy)
  punishChance: number;          // attacks at once when the opponent is open (whiffed, staggered, casting, picking up)
  counterChance: number;         // strikes straight after blocking an attack
  dodgeChance: number;           // sidesteps an incoming spell she has seen
  smartCombos: boolean;          // presses real two-hit combos (hard-hitting finishers) instead of random pairs
  pressure: number;              // stays close while the opponent still has a wand (no room to cast)
  guardAfterHit: number;         // after a hit reaction, guard up at once (breaks a string of hits)
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
  punishChance: 0,
  counterChance: 0,
  dodgeChance: 0,
  smartCombos: false,
  pressure: 0,
  guardAfterHit: 0,
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
  private readonly dodgeDir = new THREE.Vector3();
  private seenBolts = new Set<number>();
  private boltSeenAt = new Map<number, number>();  // projectile id -> her reaction time left
  private wasBlocking = false;
  private readCast = false;       // she has judged the opponent's current cast (dodge or not)
  onState: ((s: AIState) => void) | null = null;
  /** the opponent's spells (to dodge her bolts and punish her casts) */
  opponentSpells: SpellSystem | null = null;
  params: AIParams;

  constructor(
    private readonly self: Malfoid,
    private readonly selfTarget: FighterTarget,
    private readonly combat: ComboSystem,
    private readonly spells: SpellSystem,
    private readonly spell: SpellDef,
    private readonly opponent: Malfoid,
    private readonly opponentCombat: ComboSystem,
    private readonly solids: () => readonly THREE.Box3[],
    params: AIParams = GINNY_AI,
  ) {
    this.params = params;
  }

  /** s before she makes her first move when a duel starts */
  startDelay = 1.2;

  setActive(on: boolean): void {
    this.active = on;
    this.go(on ? 'OBSERVE' : 'IDLE');
    this.think = on ? this.startDelay : 0;
    this.seenBolts.clear();
    this.boltSeenAt.clear();
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
      // a seasoned fighter raises her guard straight after taking a hit
      if (this.opponentCombat.busy || (dist < 1.4 && Math.random() < P.guardAfterHit)) {
        if (Math.random() < P.guardAfterHit) {
          this.wasBlocking = true;
          this.go('BLOCK', rand(P.blockTime[0], P.blockTime[1]));
        } else {
          this.go('RECOVER', P.recover);
        }
      } else {
        this.go('RECOVER', P.recover);
      }
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

    // she reads the opponent's wand wind-up and steps aside as the bolt is released (the bolt
    // is aimed where she stands at the release)
    const os = this.opponentSpells;
    if (os && os.isCasting) {
      const rel = os.castingSpell?.release ?? 0.42;
      if (!this.readCast && os.castTime >= rel - 0.16 && os.castTime < rel) {
        this.readCast = true;
        const aimedAtMe = Math.abs(angDiff(this.opponent.facingAngle, this.angleFrom(this.opponent.position, me.position))) < 0.8;
        if (aimedAtMe && dist > 1.5 && Math.random() < P.dodgeChance && !this.combat.busy && !this.spells.isCasting
            && this.state !== 'DODGE') {
          const side = Math.random() < 0.5 ? -1 : 1;
          const to = this.dirToOpponent();
          this.dodgeDir.set(-to.z * side, 0, to.x * side);
          me.setHold('block', false);
          this.pendingSecond = null;
          this.go('DODGE', 0.55);
        }
      }
    } else {
      this.readCast = false;
    }

    // a bolt already flying at her: she sees it after her reaction time and may sidestep it
    if (P.dodgeChance > 0 && this.opponentSpells && this.state !== 'DODGE' && !this.combat.busy && !this.spells.isCasting) {
      for (const b of this.opponentSpells.projectiles) {
        if (this.seenBolts.has(b.id)) continue;
        const toMe = this.tmp2.set(me.position.x - b.position.x, 0, me.position.z - b.position.z);
        const along = toMe.x * b.direction.x + toMe.z * b.direction.z;
        if (along < 0.5 || along > 9) continue;                 // passed her, or still far off
        let left = this.boltSeenAt.get(b.id);
        if (left === undefined) {
          left = rand(P.reaction[0], P.reaction[1]) * 0.6;
          this.boltSeenAt.set(b.id, left);
        }
        left -= dt;
        this.boltSeenAt.set(b.id, left);
        if (left > 0) continue;
        this.seenBolts.add(b.id);
        if (Math.random() < P.dodgeChance) {
          // step off the bolt's line, to the side she is already on
          const side = Math.sign(toMe.x * -b.direction.z + toMe.z * b.direction.x) || (Math.random() < 0.5 ? -1 : 1);
          this.dodgeDir.set(-b.direction.z * side, 0, b.direction.x * side).normalize();
          me.setHold('block', false);
          this.pendingSecond = null;
          this.go('DODGE', 0.45);
        }
      }
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
        this.wasBlocking = true;
        // the opponent bounced off her guard: counter at once with her fastest strike
        if (this.opponentCombat.vulnerable && dist <= P.meleeRange + 0.3 && P.counterChance > 0 && !this.combat.busy) {
          me.setHold('block', false);
          this.wasBlocking = false;
          if (Math.random() < P.counterChance) {
            this.strike(true);
            return;
          }
          this.go('OBSERVE');
          return;
        }
        // the attack is over: drop the guard (early if she counters)
        if (this.timer <= 0 || (!this.opponentCombat.busy && this.timer < 0.3)) {
          me.setHold('block', false);
          this.go('OBSERVE');
          if (this.wasBlocking && Math.random() < P.counterChance && dist <= P.meleeRange + 0.25) {
            this.attackReady = 0;
            this.think = 0;                              // counter-attack straight away
          }
          this.wasBlocking = false;
        }
        return;
      case 'DODGE':
        me.move(this.dodgeDir, true, angle);
        if (this.timer <= 0) {
          me.stop();
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
      case 'RETRIEVE': {
        // to her dropped wand (walking onto it picks it up); running when it is far
        if (me.hasWand || me.wand.state !== 'dropped') {
          me.stop();
          this.go('OBSERVE');
          this.think = 0;
          break;
        }
        const w = me.wand.getWorldPosition(this.tmp2);
        const to = this.tmp.set(w.x - me.position.x, 0, w.z - me.position.z);
        const d = to.length();
        me.move(to.divideScalar(Math.max(d, 1e-6)), d > 1.5);
        if (this.timer <= 0) {
          me.stop();
          this.go('OBSERVE');
        }
        return;
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
    // an opening: the opponent whiffed a heavy strike, is reeling, casting or picking up her wand
    const open = this.opponentCombat.vulnerable || !!this.opponent.reacting
      || (!!this.opponentSpells?.isCasting && this.opponentSpells.castTime < 0.3);
    if (open && P.punishChance > 0 && dist <= P.runDistance && Math.random() < P.punishChance) {
      if (dist <= P.meleeRange + 0.12 && me.canStrike && !this.combat.busy) {
        this.strike(true);
      } else {
        this.go('APPROACH', 1.5);
      }
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
    // disarmed: her wand first (once it has landed)
    if (!me.hasWand && me.wand.state === 'dropped') {
      this.go('RETRIEVE', RETRIEVE_TIME);
      return;
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
    // guard up in anticipation: a jab lands faster than anyone can react, so when the
    // opponent is within striking range and it isn't her moment to attack, she covers up
    if (dist <= P.meleeRange + 0.6 && !this.combat.busy) {
      const attacking = this.opponentCombat.busy;
      const waiting = this.attackReady > 0 || dist > P.meleeRange + 0.08;
      if ((attacking && Math.random() < P.blockChance) || (waiting && Math.random() < P.blockChance * 0.6)) {
        this.wasBlocking = true;
        this.go('BLOCK', rand(P.blockTime[0], P.blockTime[1]));
        return;
      }
    }
    // in reach: strike
    if (dist <= P.meleeRange + 0.08) {
      if (this.attackReady <= 0 && me.canStrike && !this.combat.busy) {
        this.strike();
      } else {
        this.go('OBSERVE');
      }
      return;
    }
    // out of reach: close in, unless she would rather keep her distance for the spell
    // (with pressure she would rather stay in the opponent's face while they can still cast)
    const crowd = this.opponent.hasWand && Math.random() < P.pressure;
    const wantsDistance = !crowd && this.opponent.hasWand && this.spells.cooldownLeft(this.spell) < 1.0 && dist <= P.castRange[1];
    if (!wantsDistance || dist > P.castRange[1]) {
      this.go('APPROACH', 3.0);
      return;
    }
    this.go('OBSERVE');
  }

  /** a strike, or a two-hit combo; fast: open with the jab (counters and punishes) */
  private strike(fast = false): void {
    const P = this.params;
    if (P.smartCombos && Math.random() < P.comboChance) {
      // a real combo, favouring the hard-hitting finishers
      const keys = Object.keys(COMBOS).filter((k) => !fast || k[0] === 'J');
      let best = pick(keys);
      for (let i = 0; i < 2; i++) {
        const k = pick(keys);
        if (MOVES[COMBOS[k].finisher].damage > MOVES[COMBOS[best].finisher].damage) best = k;
      }
      this.combat.press(best[0] as AttackButton);
      this.pendingSecond = { button: best[1] as AttackButton, at: rand(0.08, 0.18) };
    } else {
      this.combat.press(pick(OPENERS));
      if (Math.random() < P.comboChance) this.pendingSecond = { button: pick(OPENERS), at: rand(0.12, 0.28) };
    }
    this.attackReady = rand(P.attackCooldown[0], P.attackCooldown[1]);
    this.go('MELEE_ATTACK');
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

  private angleFrom(a: THREE.Vector3, b: THREE.Vector3): number {
    return Math.atan2(b.x - a.x, b.z - a.z);
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

function angDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
