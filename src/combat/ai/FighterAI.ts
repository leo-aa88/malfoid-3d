import * as THREE from 'three';
import type { Malfoid } from '../../character/Malfoid';
import type { ComboSystem } from '../ComboSystem';
import type { FighterTarget } from '../FighterTarget';
import { AttackButton, COMBOS, MOVES } from '../moves';
import { sweepBox } from '../spells/collision';
import type { SpellDef, SpellSystem } from '../spells/SpellSystem';
import { PROTEGO, Protego } from '../Protego';
import type { DodgeState } from '../../character/AnimationController';
import type { Episkey } from '../Episkey';

export type AIState =
  | 'IDLE' | 'OBSERVE' | 'APPROACH' | 'RETREAT' | 'BLOCK' | 'MELEE_ATTACK' | 'CAST' | 'DODGE' | 'STAGGER' | 'RECOVER'
  | 'RETRIEVE' | 'CIRCLE' | 'PROTEGO' | 'DISTRACTED' | 'SKIP';

/**
 * A defensive duellist's habits (Susan), on top of the shared ones: she holds her ground,
 * guards a lot, answers a rush with Impedimenta (her main spell) and a crowding with Depulso
 * (her push spell), and heals with Episkey when hurt (instantaneous: no opening). Chances are per
 * opportunity, times in s, distances in m.
 */
export interface DefensiveStyle {
  /** she walks in when the opponent is further than holdRange[1]; inside it she stands her ground */
  holdRange: [number, number];
  /** a rush: the opponent closing faster than rushSpeed (m/s) between these distances: Impedimenta */
  rushSpeed: number;
  rushRange: [number, number];
  rushChance: number;
  /** crowded within pushRange (being attacked, or very close): Depulso */
  pushChance: number;
  pushRange: number;
  /** below this fraction of her health she heals with Episkey (a chance per decision; the charm's
   * cooldown and charges keep it from being spammed) */
  healBelow: number;
  healChance: number;
  /** below half health she guards this much more often (determined, not reckless) */
  resolveBlock: number;
  /** a spell she sees being cast at her: her guard up just before it arrives (it stops a spell
   * like a strike: chip damage only); no dodge */
  spellBlockChance: number;
  /** ... or, when it is ready, Protego (instead of the guard, this often): raised well ahead
   * to stop the spell, or now and then timed into the perfect window to send it back */
  shieldChance: number;
  parryChance: number;
  /** how far off her parry timing may be (s, either way) */
  timingError: number;
}

/**
 * An evasive duellist's habits (Cho), on top of the shared ones. Ginny has none, so none of
 * this changes her. Chances are per opportunity, times in s, distances in m.
 */
export interface EvasiveStyle {
  /** she keeps the opponent this far away, circling inside it */
  preferredRange: [number, number];
  /** s between changes of circling direction */
  circleSwitch: [number, number];
  /** an attack she sees coming within reach: a quick sidestep / step back (dodge clips) */
  dodgeClipChance: number;
  /** after a dodge or a stopped spell: Stupefy straight back */
  counterChance: number;
  counterDelay: [number, number];
  /** a bolt she sees coming: Protego instead of a dodge (when the shield is ready) */
  shieldChance: number;
  /** ... and timed into the perfect window (a parry that reflects it) */
  perfectChance: number;
  /** how far off her shield timing may be (s, either way): a parry can come too early or late */
  timingError: number;
  /** each Confringo cast at her in the last SPAM_WINDOW s adds this to both chances above */
  spamBonus: number;
  /** crowded within pushRange (being attacked, or very close): Ventus */
  pushChance: number;
  pushRange: number;
  /** the opponent comes inside the preferred range: a quick step back */
  backStepChance: number;
}

/**
 * A chaotic duellist's habits (Luna), on top of the shared ones: the most unpredictable fighter.
 * Randomness shapes her decisions (when, which spell, where she wanders), never her attacks'
 * tells: every spell still has its clip and its wand glow, so it can be read and answered.
 * Chances are per decision, times in s, distances in m.
 */
export interface ChaoticStyle {
  /** she roams this far from the opponent: skipping about, circling, standing and staring */
  roamRange: [number, number];
  /** her think time is her reaction time scaled by a random factor in this range (irregular) */
  whim: [number, number];
  /** roaming: skips to a new spot on the ring (else circles, or stands a moment) */
  skipChance: number;
  /** when nothing presses her: distracted for distractTime s (wand lowered, gazing at
   * nothing: she doesn't see, guard or answer anything until it ends or she is hit) */
  distractChance: number;
  distractTime: [number, number];
  /** a burst of aggression: burstCount actions with only burstGap s between them ... */
  burstChance: number;
  burstCount: [number, number];
  burstGap: [number, number];
  /** ... then an inexplicable pause */
  pauseAfterBurst: [number, number];
  /** Oppugno when ready, at mid range */
  oppugnoChance: number;
  oppugnoRange: [number, number];
  /** Illusio when ready and no copies are out; doubled when she is hurt or crowded */
  illusioChance: number;
  /** Confundo into a rush or an attack (on top of her usual casting) */
  confundoRush: number;
  /** Expelliarmus into the opponent's own cast (while the opponent still has her wand) */
  disarmPunish: number;
  /** an attack she sees coming in reach: a quick sidestep (dodge clips) */
  dodgeClipChance: number;
  /** crowded within escapeRange: she gets away (a step back, or skips off across the room) */
  escapeRange: number;
  escapeChance: number;
  /** a spell she sees cast at her, when her Protego is ready: the shield (well ahead to stop it,
   * or now and then timed into the perfect window to send it back) */
  shieldChance: number;
  parryChance: number;
  /** how far off her parry timing may be (s, either way) */
  timingError: number;
}

/**
 * A prodigy's habits (Hermione), on top of the shared ones: the hardest student, precise rather
 * than random. She keeps a caster's distance, reads every cast (Protego, often timed to send it
 * back), disarms into casts, summons a dropped wand (Accio), binds an opponent who exposes
 * herself (Petrificus Totalus) and follows it up, and fires her plate barrage, aimed where the
 * opponent will be. Her reactions keep human timing: her edge is her choices. Chances are per
 * opportunity, times in s, distances in m.
 */
export interface ProdigyStyle {
  /** she keeps the opponent this far away, circling inside it */
  preferredRange: [number, number];
  circleSwitch: [number, number];
  /** a spell she sees cast at her, with Protego ready: the shield (well ahead, or timed to reflect) */
  shieldChance: number;
  parryChance: number;
  timingError: number;
  /** after her shield stopped / reflected a spell: Petrificus straight back (a chain) */
  chainChance: number;
  /** Expelliarmus into the opponent's cast (early in it) */
  disarmPunish: number;
  /** Petrificus at an opponent who exposes herself (recovering, just cast, her shield cooling
   *  down, repositioning fast); its base chance per decision otherwise is a third of this */
  petrifyChance: number;
  /** while the opponent is bound: one follow-up (Expelliarmus while she has her wand), and the
   *  plates' wind-up timed so they fly as she is back on her feet */
  followUpChance: number;
  /** the plate barrage, at range (never with the opponent close enough to interrupt it) */
  platesChance: number;
  platesRange: [number, number];
  /** Accio at the opponent's wand lying within ACCIO's range */
  accioChance: number;
  /** holding the opponent's wand she lets her come this close before backing off (m: the
   *  opponent must land a strike to win it back; kiting her made that all but impossible) */
  kiteRange: number;
  /** an attack she sees coming in reach: a quick step out of it (dodge clips) */
  dodgeClipChance: number;
  /** aim: fraction of the predicted lead she uses, and how far (m) she aims to the side the
   *  opponent habitually dodges to, once she has learned it */
  lead: number;
  adapt: number;
}

/**
 * how close to facing the opponent she must be before she attacks (rad); further off, she turns
 * first (after picking up her wand she faces where it lay: casting at once sent the spell there).
 * A spell's own start turns her the rest of the way; melee auto-faces within 60 degrees.
 */
const AIM = { spell: 0.5, melee: 0.9 };
/** a counter-spell waits at most this long (s) for her to turn before it is dropped */
const COUNTER_TURN = 0.8;
/** s between re-checks while she turns to attack */
const TURN_CHECK = 0.06;

/** s over which repeated Confringo casts make her expect the next one */
const SPAM_WINDOW = 12.0;
/** however much Confringo she has seen, she shields at most this often and parries at most this often
 * (a parry should stay a satisfying surprise, not the answer to every cast) */
const MAX_SHIELD = 0.65;
const MAX_PERFECT = 0.4;
/** a circling step is blocked if a trunk is this close ahead (m) */
const CIRCLE_LOOKAHEAD = 0.9;

/** s she heads for her dropped wand before thinking again (a trunk in the way, a fight to answer) */
const RETRIEVE_TIME = 3.0;
/** s after a rush in which arriving in reach counts as rushing in (she may strike first) */
const RUSH_MEMORY = 0.8;

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
  /** an evasive duellist's extra habits (Cho); absent for Ginny */
  evasive?: EvasiveStyle;
  /** a defensive duellist's extra habits (Susan) */
  defensive?: DefensiveStyle;
  /** a chaotic duellist's extra habits (Luna) */
  chaotic?: ChaoticStyle;
  /** a prodigy's extra habits (Hermione) */
  prodigy?: ProdigyStyle;
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
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private seenBolts = new Set<number>();
  private boltSeenAt = new Map<number, number>();  // projectile id -> her reaction time left
  private wasBlocking = false;
  private readCast = false;       // she has judged the opponent's current cast (dodge or not)
  onState: ((s: AIState) => void) | null = null;
  /** the opponent's spells (to dodge her bolts and punish her casts) */
  opponentSpells: SpellSystem | null = null;
  /** her Protego (evasive and defensive styles), and her short-range push spell (Ventus) */
  shield: Protego | null = null;
  pushSpell: SpellDef | null = null;
  /** a second ranged spell she alternates with her main one (Susan's Expelliarmus) */
  altSpell: SpellDef | null = null;
  private lastAlt = false;                        // her last ranged cast was the second spell
  /** her healing charm (defensive style) */
  heal: Episkey | null = null;
  /** a chaotic duellist's summoning spells (Luna's Oppugno and Illusio), and whether her copies are out */
  oppugno: SpellDef | null = null;
  illusio: SpellDef | null = null;
  illusions: { readonly active: boolean } | null = null;
  /** keeps a point she heads for inside the arena (its own boundary; null: anywhere) */
  keepIn: ((p: THREE.Vector3) => void) | null = null;
  /** a prodigy's spells (Hermione's): the body-bind, the Summoning Charm, the plate barrage */
  petrify: SpellDef | null = null;
  accio: SpellDef | null = null;
  plates: SpellDef | null = null;
  /** the opponent's Protego (a prodigy presses while it cools down) */
  opponentShield: Protego | null = null;
  /** spells she has planned for a moment from now (a chain, a follow-up): cast when due */
  private plans: { spell: SpellDef; at: number; turn: number }[] = [];
  private foeWasBound = false;
  /** where she wants to face instead of the opponent (Accio: the wand on the floor); null: the opponent */
  private faceGoal: number | null = null;
  /** the opponent's ground velocity (smoothed, m/s) and which way she habitually dodges: -1 her
   *  left .. +1 her right, as seen from here (a prodigy's aim learns it) */
  readonly foeVel = new THREE.Vector3();
  private readonly foePrev = new THREE.Vector3();
  private foeSeen = false;
  habit = 0;
  private habitClock = 0;
  /** something of hers is flying at the opponent (her plates): dodges then teach her aim */
  threatOut: (() => boolean) | null = null;
  private burstLeft = 0;                          // quick actions left in a burst (chaotic)
  /** a spell she chose but first had to turn for (chaotic): she sees it through, not rerolls it */
  private intent: SpellDef | null = null;
  private readonly roamGoal = new THREE.Vector3();
  params: AIParams;
  private clock = 0;                              // game time (s)
  private circleSide: 1 | -1 = 1;
  private shieldAt = -1;                          // s until she raises Protego (-1: not planned)
  private counterAt = -1;                         // s until her counter-spell (-1: none planned)
  private readonly opponentCasts: number[] = [];  // game times of the opponent's Confringo casts
  private countedCast = false;
  private readAt = -99;                           // game time she last read a cast
  private counterTurn = 0;                        // s her counter-spell has waited for her to turn
  private dodged: DodgeState | null = null;
  private prevDist = -1;
  /** how fast the opponent is closing in (m/s, smoothed; negative: moving away) */
  closing = 0;
  private rushAt = -99;                           // game time she last saw a rush
  private guardAt = -1;                           // s until her guard goes up against a spell (-1: none planned)

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
    this.shieldAt = -1;
    this.counterAt = -1;
    this.opponentCasts.length = 0;
    this.prevDist = -1;
    this.closing = 0;
    this.rushAt = -99;
    this.guardAt = -1;
    this.burstLeft = 0;
    this.intent = null;
    this.plans.length = 0;
    this.foeWasBound = false;
    this.faceGoal = null;
    this.foeSeen = false;
    this.foeVel.set(0, 0, 0);
    this.habit = 0;
    this.self.standClip = null;
    if (!on) {
      this.self.stop();
      this.self.setHold('block', false);
      this.shield?.lower();
    }
  }

  /** her shield stopped (or reflected) a spell: an evasive duellist may answer at once, a prodigy
   *  chains Petrificus onto it */
  shieldResult(result: 'reflect' | 'absorb'): void {
    const pr = this.params.prodigy;
    if (pr && this.active && this.petrify && Math.random() < pr.chainChance * (result === 'reflect' ? 1 : 0.6)) {
      this.planCast(this.petrify, rand(0.3, 0.5));
    }
    const ev = this.params.evasive;
    if (!ev || !this.active) return;
    if (Math.random() < ev.counterChance + (result === 'reflect' ? 0.2 : 0)) this.counterAt = rand(ev.counterDelay[0], ev.counterDelay[1]);
  }

  /** Confringo casts at her in the last SPAM_WINDOW s */
  get recentConfringos(): number {
    while (this.opponentCasts.length && this.clock - this.opponentCasts[0] > SPAM_WINDOW) this.opponentCasts.shift();
    return this.opponentCasts.length;
  }

  update(dt: number): void {
    const P = this.params;
    this.clock += dt;
    this.timer -= dt;
    this.think -= dt;
    this.attackReady -= dt;
    const me = this.self;
    const dist = this.distance();
    const angle = this.angleToOpponent();
    if (this.prevDist >= 0 && dt > 0) {
      const v = (this.prevDist - dist) / dt;
      this.closing += (v - this.closing) * (1 - Math.exp(-8 * dt));
    }
    this.prevDist = dist;
    this.track(dt);
    const df = P.defensive;
    if (df && this.closing > df.rushSpeed && dist >= df.rushRange[0] * 0.5 && dist <= df.rushRange[1]) this.rushAt = this.clock;

    if (!this.active || me.defeated || this.opponent.defeated) {
      me.stop();
      me.setHold('block', false);
      me.lookAt(dist < P.detectRange ? angle : null);
      if (this.state !== 'IDLE') this.go('IDLE');
      return;
    }

    // a hit reaction overrides everything; then a short recovery
    if (me.reacting && me.reacting !== 'pickup') {
      this.shieldAt = -1;                            // a hit breaks her concentration
      me.standClip = null;                           // (and snaps her out of a daydream)
      this.burstLeft = 0;
      this.plans.length = 0;
      this.shield?.lower();
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

    // distracted: she sees nothing coming (a fair opening) until it ends or she is hit
    const dazed = this.state === 'DISTRACTED';
    // she notices the opponent's attacks after her reaction time
    if (this.opponentCombat.busy && !dazed) {
      if (this.sawAttack < 0) this.sawAttack = rand(P.reaction[0], P.reaction[1]);
      else if (!this.noticed && (this.sawAttack -= dt) <= 0) this.noticed = true;
    } else {
      this.sawAttack = -1;
      this.noticed = false;
    }

    // she reads the opponent's wand wind-up and steps aside as the bolt is released (the bolt
    // is aimed where she stands at the release)
    const os = this.opponentSpells;
    if (os && os.isCasting && !dazed) {
      const rel = os.castingSpell?.release ?? 0.42;
      if (!this.readCast && os.castTime >= rel - 0.16 && os.castTime < rel) {
        this.readCast = true;
        const aimedAtMe = Math.abs(angDiff(this.opponent.facingAngle, this.angleFrom(this.opponent.position, me.position))) < 0.8;
        const def = os.castingSpell;
        if (def?.id === 'confringo' && !this.countedCast) {
          this.countedCast = true;
          this.opponentCasts.push(this.clock);
        }
        if (P.evasive && aimedAtMe && dist > 1.5 && def && !this.combat.busy && !this.spells.isCasting) {
          // the bolt reaches her this long from now (the rest of the wind-up, then its flight)
          const arrive = Math.max(0, rel - os.castTime) + Math.max(0, dist - 0.5) / def.projectile.speed;
          this.readAt = this.clock;
          this.evade(arrive);
        } else if (P.defensive && aimedAtMe && dist > 1.5 && def && !this.combat.busy && !this.spells.isCasting
            ) {
          // a defensive duellist meets the bolt: Protego when she has it ready (well ahead to stop
          // it, now and then timed to send it back), otherwise her guard
          const df = P.defensive;
          const arrive = Math.max(0, rel - os.castTime) + Math.max(0, dist - 0.5) / def.projectile.speed;
          const parry = Math.random() < df.parryChance;
          if (this.shield?.ready && this.state !== 'PROTEGO' && (parry || arrive > PROTEGO.perfectWindow + 0.05)
              && Math.random() < df.shieldChance) {
            this.shieldAt = parry ? Math.max(0, arrive - rand(0.03, 0.12) + rand(-df.timingError, df.timingError))
              : Math.max(0, arrive - rand(0.45, 0.6));
            me.stop();
            this.pendingSecond = null;
            this.go('PROTEGO', this.shieldAt + 0.75);
          } else if (Math.random() < df.spellBlockChance) {
            this.guardAt = Math.max(0, arrive - rand(0.18, 0.3));
          }
        } else if ((P.chaotic || P.prodigy) && aimedAtMe && dist > 1.5 && def && !this.combat.busy && !this.spells.isCasting
            && this.shield?.ready && this.state !== 'PROTEGO' && Math.random() < (P.chaotic ?? P.prodigy)!.shieldChance) {
          // a chaotic duellist (Luna) or a prodigy (Hermione) with Protego: the shield, well ahead
          // or timed to send it back
          const ch = (P.chaotic ?? P.prodigy)!;
          const arrive = Math.max(0, rel - os.castTime) + Math.max(0, dist - 0.5) / def.projectile.speed;
          const parry = Math.random() < ch.parryChance;
          if (parry || arrive > PROTEGO.perfectWindow + 0.05) {
            this.shieldAt = parry ? Math.max(0, arrive - rand(0.03, 0.12) + rand(-ch.timingError, ch.timingError))
              : Math.max(0, arrive - rand(0.45, 0.6));
            me.stop();
            me.standClip = null;
            this.pendingSecond = null;
            this.go('PROTEGO', this.shieldAt + 0.75);
          }
        } else if (aimedAtMe && dist > 1.5 && Math.random() < P.dodgeChance && !this.combat.busy && !this.spells.isCasting
            && this.state !== 'DODGE') {
          const side = Math.random() < 0.5 ? -1 : 1;
          const to = this.dirToOpponent();
          this.dodgeDir.set(-to.z * side, 0, to.x * side);
          me.setHold('block', false);
          this.pendingSecond = null;
          // a quick sidestep clip if her model has one (her legs then step the way she goes);
          // otherwise she runs aside
          if (!this.dodgeClip(this.sideOf(this.dodgeDir))) this.go('DODGE', 0.55);
        }
      }
    } else {
      this.readCast = false;
      this.countedCast = false;
    }

    // a bolt already flying at her: she sees it after her reaction time and may sidestep it
    if (P.dodgeChance > 0 && this.opponentSpells && this.state !== 'DODGE' && !this.combat.busy && !this.spells.isCasting && !dazed) {
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
        if (P.evasive) {
          // (one decision per spell: a cast she already read is not judged again in flight)
          if (this.clock - this.readAt > 1.0 && this.state !== 'PROTEGO' && !this.self.dodging) {
            this.evade(Math.max(0, along - 0.5) / Math.max(1, b.spec.speed));
          }
        } else if (Math.random() < P.dodgeChance) {
          // step off the bolt's line, to the side she is already on
          const side = Math.sign(toMe.x * -b.direction.z + toMe.z * b.direction.x) || (Math.random() < 0.5 ? -1 : 1);
          this.dodgeDir.set(-b.direction.z * side, 0, b.direction.x * side).normalize();
          me.setHold('block', false);
          this.pendingSecond = null;
          if (!this.dodgeClip(this.sideOf(this.dodgeDir))) this.go('DODGE', 0.45);
        }
      }
    }

    // Protego (planned when she read the cast): up just before the bolt arrives, then down
    if (this.shieldAt >= 0) {
      this.shieldAt -= dt;
      if (this.shieldAt <= 0) {
        this.shieldAt = -1;
        const free = !me.reacting && !me.dodging && !this.combat.busy && !this.spells.isCasting && me.hasWand;
        if (free && this.shield?.raise()) this.go('PROTEGO', 0.75);
      }
    }
    // her guard against a spell on its way (planned when she read the cast)
    if (this.guardAt >= 0) {
      this.guardAt -= dt;
      if (this.guardAt <= 0) {
        this.guardAt = -1;
        if (!me.reacting && !this.combat.busy && !this.spells.isCasting) {
          me.stop();
          this.pendingSecond = null;
          this.wasBlocking = false;
          this.go('BLOCK', rand(0.65, 0.8));      // (it drops at 0.3 s left when no strike comes: up through the arrival)
        }
      }
    }
    // a counter-spell (after a dodge or a stopped spell): as soon as she can cast
    if (this.counterAt >= 0) {
      this.counterAt -= dt;
      if (this.counterAt <= 0 && this.state !== 'PROTEGO' && !this.self.dodging) {
        if (!this.facing(angle, AIM.spell) && this.counterTurn < COUNTER_TURN) {
          // not facing the opponent yet: turn, the counter waits a moment
          me.lookAt(angle);
          this.counterTurn += dt;
          this.counterAt = TURN_CHECK;
        } else {
          this.counterAt = -1;
          this.counterTurn = 0;
          if (this.facing(angle, AIM.spell) && this.spells.canCast(this.spell) && dist <= this.spell.aimRange && this.lineOfSight()) {
            if (this.spells.cast(this.spell)) {
              this.go('CAST');
              return;
            }
          }
        }
      }
    }

    // a prodigy: the opponent just went down bound: a follow-up and the plates (once per bind)
    const pr = P.prodigy;
    const bound = this.opponent.petrified;
    if (pr && bound && !this.foeWasBound && Math.random() < pr.followUpChance) this.planFollowUp();
    this.foeWasBound = bound;
    // planned spells, when due (turning first; given up if it takes too long). Every plan counts
    // down (a later one doesn't wait behind an earlier one)
    for (const p of this.plans) p.at -= dt;
    if (this.plans.length && !me.reacting && !this.combat.busy && !this.spells.isCasting && !me.dodging
        && this.state !== 'PROTEGO') {
      const p = this.plans[0];
      if (p.at <= 0) {
        if (!this.spells.canCast(p.spell) || dist > p.spell.aimRange) {
          if (p.at < -1.0) this.plans.shift();          // (its cooldown may still be running: wait a moment)
        } else if (!this.facing(angle, AIM.spell)) {
          me.stop();
          me.lookAt(angle);
          if ((p.turn += dt) > COUNTER_TURN) this.plans.shift();
        } else {
          this.plans.shift();
          if (this.spells.cast(p.spell)) {
            this.go('CAST');
            return;
          }
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
          if (Math.random() < P.counterChance && this.facing(angle, AIM.melee)) {
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
        if (this.dodged) {
          // a dodge clip carries her; when it ends she may answer with a counter-spell
          me.lookAt(angle);
          if (!me.dodging || this.timer <= 0) {
            const ev = P.evasive;
            if (ev && Math.random() < ev.counterChance) this.counterAt = rand(ev.counterDelay[0], ev.counterDelay[1]);
            this.dodged = null;
            this.go('OBSERVE');
          }
          return;
        }
        me.move(this.dodgeDir, true, angle);
        if (this.timer <= 0) {
          me.stop();
          this.go('OBSERVE');
        }
        return;
      case 'PROTEGO':
        // shield up (or about to be): stand braced facing the opponent
        me.stop();
        me.lookAt(angle);
        if (this.shield && !this.shield.up && this.shieldAt < 0) {
          this.go('RECOVER', P.recover + 0.35);     // lowering it leaves her slower to act
          return;
        }
        if (this.timer <= 0) {
          this.shield?.lower();
          this.go('RECOVER', P.recover + 0.35);
        }
        return;
      case 'DISTRACTED':
        // gazing at nothing in particular: no moves, no reading, no guard
        me.stop();
        me.standClip = 'distracted';
        if (this.timer <= 0) {
          me.standClip = null;
          this.go('OBSERVE');
          this.think = rand(0.15, 0.35);               // she comes round with a start
        }
        return;
      case 'SKIP': {
        // skipping off to somewhere on her ring (she turns to where she goes)
        const to = this.tmp2.set(this.roamGoal.x - me.position.x, 0, this.roamGoal.z - me.position.z);
        if (to.length() < 0.35 || this.timer <= 0 || this.blocked(to, 0.8)) {
          me.stop();
          this.go('OBSERVE');
        } else {
          me.move(to, true);
        }
        break;
      }
      case 'CIRCLE': {
        // round the opponent, keeping her preferred distance; a trunk ahead turns her back
        const range = P.evasive?.preferredRange ?? P.prodigy?.preferredRange ?? P.chaotic!.roamRange;
        const to = this.dirToOpponent();
        const mid = (range[0] + range[1]) / 2;
        const radial = Math.max(-0.7, Math.min(0.7, (dist - mid) * 0.5));
        const dir = this.tmp2.set(-to.z * this.circleSide + to.x * radial, 0, to.x * this.circleSide + to.z * radial);
        if (this.blocked(dir)) {
          this.circleSide = this.circleSide > 0 ? -1 : 1;
          dir.set(-to.z * this.circleSide + to.x * radial, 0, to.x * this.circleSide + to.z * radial);
        }
        me.move(dir, false, angle);
        if (this.timer <= 0) {
          me.stop();
          this.go('OBSERVE');
        }
        break;
      }
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
      case 'RETREAT': {
        // an evasive duellist badly crowded turns and sprints away on a diagonal (her back is
        // open while she runs: a fair chance); otherwise she backs off facing the opponent
        const ev = P.evasive;
        if (ev && dist < ev.preferredRange[0] * 0.8) {
          const to = this.dirToOpponent();
          const dir = this.tmp2.set(-to.x + -to.z * this.circleSide * 0.8, 0, -to.z + to.x * this.circleSide * 0.8);
          if (this.blocked(dir, 1.2)) this.circleSide = this.circleSide > 0 ? -1 : 1;
          me.move(dir, true);
        } else {
          const back = this.dirToOpponent().negate();
          // backed up against something (a trunk, the stands' barrier): slip away along it instead
          if (ev && this.blocked(back, 0.7)) {
            this.circleSide = this.blocked(new THREE.Vector3(-back.z, 0, back.x), 1.0) ? -1 : 1;
            this.go('CIRCLE', rand(ev.circleSwitch[0], ev.circleSwitch[1]));
            break;
          }
          me.move(back, false, angle);
        }
        if (this.timer <= 0 || dist > P.castRange[1] || (ev && dist > ev.preferredRange[0] + 0.5)
            || (P.prodigy && !this.holdingFoeWand && dist > P.prodigy.preferredRange[0] + 0.5)) {
          me.stop();
          this.go('OBSERVE');
        }
        break;
      }
      default:
        me.stop();
        me.lookAt(this.faceGoal ?? angle);
    }

    if (this.think > 0) return;
    const ch = P.chaotic;
    // a chaotic duellist thinks at irregular intervals; in a burst, quickly
    this.think = ch && this.burstLeft > 0 ? rand(ch.burstGap[0], ch.burstGap[1])
      : rand(P.reaction[0], P.reaction[1]) * (ch ? rand(ch.whim[0], ch.whim[1]) : 1);
    const bursting = this.burstLeft > 0;
    this.decide(dist, angle);
    if (ch && bursting && --this.burstLeft === 0) {
      // the burst spent: an inexplicable pause
      this.think = rand(ch.pauseAfterBurst[0], ch.pauseAfterBurst[1]);
    }
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
    if (open && P.evasive && dist <= this.spell.aimRange && Math.random() < P.punishChance
        && this.spells.canCast(this.spell) && this.lineOfSight()) {
      // an evasive duellist punishes from range: Stupefy into the opening
      if (!this.turnedTo(angle, AIM.spell)) return;
      if (this.spells.cast(this.spell)) {
        this.go('CAST');
        return;
      }
    }
    // (a defensive duellist punishes only an opening already in her reach: she doesn't go after one)
    if (open && P.punishChance > 0 && dist <= P.runDistance && Math.random() < P.punishChance && !P.evasive
        && !(P.defensive && dist > P.meleeRange + 0.12)) {
      if (dist <= P.meleeRange + 0.12 && me.canStrike && !this.combat.busy) {
        if (!this.turnedTo(angle, AIM.melee)) return;
        this.strike(true);
      } else {
        this.go('APPROACH', 1.5);
      }
      return;
    }
    const df = P.defensive;
    if (df) {
      // a rush at her: Impedimenta
      const rushing = this.clock - this.rushAt < 0.3;
      if (rushing && dist >= df.rushRange[0] && dist <= df.rushRange[1] && this.spells.canCast(this.spell) && this.lineOfSight()
          && Math.random() < df.rushChance) {
        if (!this.turnedTo(angle, AIM.spell)) return;
        if (this.spells.cast(this.spell)) {
          this.rushAt = -99;
          this.go('CAST');
          return;
        }
      }
      // rushed straight into her reach: she strikes first
      if (this.clock - this.rushAt < RUSH_MEMORY && dist <= P.meleeRange + 0.15 && me.canStrike && !this.combat.busy
          && this.attackReady <= 0 && Math.random() < P.punishChance) {
        this.rushAt = -99;
        if (!this.turnedTo(angle, AIM.melee)) return;
        this.strike(true);
        return;
      }
      // hurt: Episkey, where she stands. It is instantaneous (no opening), so she heals and
      // carries on deciding; its cooldown and charges keep it from being spammed
      const h = this.heal;
      if (h && this.selfTarget.hp < this.selfTarget.maxHp * df.healBelow && h.ready && !this.combat.busy
          && !this.spells.isCasting && Math.random() < df.healChance) {
        h.start();
      }
    }
    // under pressure: back off
    if (this.selfTarget.recentHits >= P.retreatAfterHits && this.state !== 'RETREAT') {
      this.selfTarget.recentHits = 0;
      this.go('RETREAT', rand(P.retreatTime[0], P.retreatTime[1]));
      return;
    }
    // crowded: Ventus (Depulso) throws the opponent back
    const ev = P.evasive;
    const push = ev ?? df;
    if (push && this.pushSpell && dist <= push.pushRange && this.spells.canCast(this.pushSpell)
        && (this.opponentCombat.busy || this.selfTarget.recentHits > 0 || dist < 1.3) && Math.random() < push.pushChance) {
      if (!this.turnedTo(angle, AIM.spell)) return;
      if (this.spells.cast(this.pushSpell)) {
        this.go('CAST');
        return;
      }
    }
    // an attack she sees coming, in reach: an evasive duellist steps out of it
    if (ev && this.noticed && dist < 1.6 && Math.random() < ev.dodgeClipChance) {
      this.noticed = false;
      if (this.dodgeClip(Math.random() < 0.5 ? 'dodge_back' : this.freeSide())) return;
    }
    // block an attack she has seen coming (only if it can reach her)
    const blockChance = P.blockChance + (df && this.selfTarget.hp < this.selfTarget.maxHp * 0.5 ? df.resolveBlock : 0);
    if (this.noticed && dist < 1.4) {
      this.noticed = false;                          // one roll per attack she sees
      if (Math.random() < blockChance) {
        this.go('BLOCK', rand(P.blockTime[0], P.blockTime[1]));
        return;
      }
    }
    // disarmed: her wand first (once it has landed)
    if (!me.hasWand && me.wand.state === 'dropped') {
      this.go('RETRIEVE', RETRIEVE_TIME);
      return;
    }
    const ch = P.chaotic;
    if (ch) {
      const caught = this.chaotic(ch, dist, angle);
      if (caught) return;
    }
    const pr = P.prodigy;
    if (pr) {
      const acted = this.prodigy(pr, dist, angle);
      if (acted) return;
    }
    // her spell: only while the opponent still has a wand (an evasive duellist's Stupefy
    // isn't about the wand), from a distance, in clear sight
    const ranged = ch || pr ? null : this.rangedSpell(dist);        // (a chaotic duellist / a prodigy chose hers above)
    if (ranged && (this.opponent.hasWand || ev || df) && dist >= P.castRange[0] && dist <= P.castRange[1]
        && this.lineOfSight() && Math.random() < P.castChance) {
      if (!this.turnedTo(angle, AIM.spell)) return;
      if (this.spells.cast(ranged)) {
        this.lastAlt = ranged === this.altSpell;
        this.go('CAST');
        return;
      }
    }
    // guard up in anticipation: a jab lands faster than anyone can react, so when the
    // opponent is within striking range and it isn't her moment to attack, she covers up
    if (dist <= P.meleeRange + 0.6 && !this.combat.busy) {
      const attacking = this.opponentCombat.busy;
      const waiting = this.attackReady > 0 || dist > P.meleeRange + 0.08;
      if ((attacking && Math.random() < blockChance) || (waiting && Math.random() < blockChance * 0.6)) {
        this.wasBlocking = true;
        this.go('BLOCK', rand(P.blockTime[0], P.blockTime[1]));
        return;
      }
    }
    // in reach: strike
    if (dist <= P.meleeRange + 0.08) {
      if (this.attackReady <= 0 && me.canStrike && !this.combat.busy) {
        if (!this.turnedTo(angle, AIM.melee)) return;
        this.strike();
      } else {
        this.go('OBSERVE');
      }
      return;
    }
    // a prodigy keeps a caster's distance: off when crowded, in when far, circling between
    if (pr) {
      const keep = this.holdingFoeWand ? pr.kiteRange : pr.preferredRange[0];
      if (dist < keep) {
        // (she walks back: no quick back-step, which chained into a fast slide; removed on request)
        this.go('RETREAT', rand(0.5, 0.9));
        return;
      }
      if (dist > pr.preferredRange[1]) {
        this.go('APPROACH', 1.2);
        return;
      }
      if (this.state !== 'CIRCLE' || Math.random() < 0.3) this.circleSide = Math.random() < 0.5 ? -1 : 1;
      this.go('CIRCLE', rand(pr.circleSwitch[0], pr.circleSwitch[1]));
      return;
    }
    // a chaotic duellist roams: skipping about her ring, circling, standing and staring
    if (ch) {
      this.roam(ch, dist, angle);
      return;
    }
    // an evasive duellist keeps her distance: back off when crowded, close in when far,
    // circle in between
    if (ev) {
      if (dist < ev.preferredRange[0]) {
        if (dist < ev.preferredRange[0] * 0.6 && Math.random() < ev.backStepChance && this.dodgeClip('dodge_back')) return;
        this.go('RETREAT', rand(0.5, 0.9));
        return;
      }
      if (dist > ev.preferredRange[1]) {
        this.go('APPROACH', 1.5);
        return;
      }
      if (this.state !== 'CIRCLE' || Math.random() < 0.3) this.circleSide = Math.random() < 0.5 ? -1 : 1;
      this.go('CIRCLE', rand(ev.circleSwitch[0], ev.circleSwitch[1]));
      return;
    }
    // a defensive duellist holds her ground: walks in only when the opponent is far, otherwise
    // waits for her to come (now and then a step in)
    if (df) {
      if (dist > df.holdRange[1]) this.go('APPROACH', 1.2);
      else if (dist > df.holdRange[0] && Math.random() < 0.25) this.go('APPROACH', 0.5);
      else this.go('OBSERVE');
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

  /**
   * a chaotic duellist's own choices, before the usual ones (true: she has acted). Distracted
   * now and then, bursts of aggression, her summons, and her opportunism.
   */
  private chaotic(ch: ChaoticStyle, dist: number, angle: number): boolean {
    const me = this.self;
    // a spell she already chose (and turned for): cast it now if she still can
    const intent = this.intent;
    this.intent = null;
    if (intent && this.spells.canCast(intent) && dist <= intent.aimRange && this.lineOfSight()) {
      if (!this.turnedTo(angle, AIM.spell)) {
        this.intent = intent;
        return true;
      }
      if (this.spells.cast(intent)) {
        this.lastAlt = intent === this.altSpell;
        this.go('CAST');
        return true;
      }
    }
    const pressed = this.opponentCombat.busy || !!this.opponentSpells?.isCasting || this.selfTarget.recentHits > 0
      || dist < 2.2 || this.closing > 1.2;
    // distracted: only when nothing presses her (and never in a burst)
    if (this.burstLeft === 0 && !pressed && me.hasWand && Math.random() < ch.distractChance) {
      me.stop();
      me.standClip = 'distracted';
      this.pendingSecond = null;
      this.go('DISTRACTED', rand(ch.distractTime[0], ch.distractTime[1]));
      return true;
    }
    // a burst of aggression begins
    if (this.burstLeft === 0 && Math.random() < ch.burstChance) {
      this.burstLeft = Math.round(rand(ch.burstCount[0], ch.burstCount[1]));
    }
    const hurt = this.selfTarget.hp < this.selfTarget.maxHp * 0.6;
    // Illusio: when ready and none of her copies are out (more likely hurt or crowded)
    if (this.illusio && !this.illusions?.active && this.spells.canCast(this.illusio)
        && Math.random() < ch.illusioChance * (hurt || dist < 2.4 ? 2 : 1)) {
      me.stop();
      if (this.spells.cast(this.illusio)) {
        this.go('CAST');
        return true;
      }
    }
    // crowded: she gets away, a step back or a skip off across the room (a caster, not a brawler)
    if (dist < ch.escapeRange && !this.combat.busy && Math.random() < ch.escapeChance) {
      if (Math.random() < 0.4 && this.dodgeClip('dodge_back')) return true;
      const from = Math.atan2(me.position.x - this.opponent.position.x, me.position.z - this.opponent.position.z);
      const a = from + rand(-0.8, 0.8);
      const rr = rand(ch.roamRange[1] * 0.7, ch.roamRange[1]);
      this.roamGoal.set(this.opponent.position.x + Math.sin(a) * rr, 0, this.opponent.position.z + Math.cos(a) * rr);
      this.keepIn?.(this.roamGoal);
      this.go('SKIP', 1.8);
      return true;
    }
    // Expelliarmus into the opponent's cast (early in it: there is time to beat the release)
    const os = this.opponentSpells;
    const alt = this.altSpell;
    if (alt && os?.isCasting && os.castTime < 0.25 && this.opponent.hasWand && dist <= alt.aimRange
        && this.spells.canCast(alt) && this.lineOfSight() && Math.random() < ch.disarmPunish) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(alt);
      if (this.spells.cast(alt)) {
        this.lastAlt = true;
        this.go('CAST');
        return true;
      }
    }
    // Confundo into a rush or an attack
    if ((this.closing > 1.5 || this.opponentCombat.busy) && dist >= 1.0 && dist <= this.spell.aimRange
        && this.spells.canCast(this.spell) && this.lineOfSight() && Math.random() < ch.confundoRush) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(this.spell);
      if (this.spells.cast(this.spell)) {
        this.lastAlt = false;
        this.go('CAST');
        return true;
      }
    }
    // Oppugno at mid range
    const op = this.oppugno;
    if (op && dist >= ch.oppugnoRange[0] && dist <= ch.oppugnoRange[1] && this.spells.canCast(op) && this.lineOfSight()
        && Math.random() < ch.oppugnoChance * (this.burstLeft > 0 ? 1.5 : 1)) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(op);
      if (this.spells.cast(op)) {
        this.go('CAST');
        return true;
      }
    }
    // her usual ranged spell, Confundo or Expelliarmus (chosen once: turning for it doesn't reroll it)
    const ranged = this.rangedSpell(dist);
    if (ranged && dist >= this.params.castRange[0] && dist <= this.params.castRange[1] && this.lineOfSight()
        && Math.random() < this.params.castChance) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(ranged);
      if (this.spells.cast(ranged)) {
        this.lastAlt = ranged === this.altSpell;
        this.go('CAST');
        return true;
      }
    }
    // an attack she sees coming in reach: a quick sidestep
    if (this.noticed && dist < 1.6 && Math.random() < ch.dodgeClipChance) {
      this.noticed = false;
      if (this.dodgeClip(Math.random() < 0.4 ? 'dodge_back' : this.freeSide())) return true;
    }
    return false;
  }

  /**
   * a prodigy's own choices, before the usual ones (true: she has acted): the wand on the floor,
   * a cast to disarm, an opponent to bind, the plates
   */
  private prodigy(pr: ProdigyStyle, dist: number, angle: number): boolean {
    const me = this.self;
    const foe = this.opponent;
    // a spell she already chose (and turned for): cast it now if she still can
    const intent = this.intent;
    this.intent = null;
    if (intent && this.spells.canCast(intent) && dist <= intent.aimRange && this.lineOfSight()) {
      if (!this.turnedTo(angle, AIM.spell)) {
        this.intent = intent;
        return true;
      }
      if (this.spells.cast(intent)) {
        this.go('CAST');
        return true;
      }
    }
    // Accio: the opponent's wand is on the floor, in range: summon it (turned to it first)
    const ac = this.accio;
    if (ac && foe.wand.state === 'dropped' && this.spells.canCast(ac)) {
      const w = foe.wand.getWorldPosition(this.tmp2);
      const wd = Math.hypot(w.x - me.position.x, w.z - me.position.z);
      // (decided once: turning to the wand, she keeps at it)
      if (wd <= ac.aimRange && (this.faceGoal !== null || Math.random() < pr.accioChance)) {
        const a = Math.atan2(w.x - me.position.x, w.z - me.position.z);
        if (!this.facing(a, 0.35)) {
          me.stop();
          this.faceGoal = a;
          me.lookAt(a);
          this.go('OBSERVE');
          this.think = TURN_CHECK;
          return true;
        }
        this.faceGoal = null;
        if (this.spells.cast(ac)) {
          this.go('CAST');
          return true;
        }
      }
    }
    this.faceGoal = null;
    const os = this.opponentSpells;
    // Expelliarmus into the opponent's cast (early in it: there is time to beat the release)
    const alt = this.altSpell;
    if (alt && os?.isCasting && os.castTime < 0.25 && foe.hasWand && dist <= alt.aimRange
        && this.spells.canCast(alt) && this.lineOfSight() && Math.random() < pr.disarmPunish) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(alt);
      if (this.spells.cast(alt)) {
        this.go('CAST');
        return true;
      }
    }
    // Petrificus at an opponent who exposes herself
    const pt = this.petrify;
    const shieldDown = !!this.opponentShield && !this.opponentShield.up && !this.opponentShield.ready;
    // (a wandless opponent is not an opening in itself: binding her again and again while she
    // chased her wand was a death spiral)
    const exposed = !!foe.reacting || shieldDown
      || (!!os?.isCasting && os.castTime > (os.castingSpell?.release ?? 0.4)) || foe.moveSpeed > 1.6;
    if (pt && !foe.petrified && dist >= 1.4 && dist <= pt.aimRange && this.spells.canCast(pt) && this.lineOfSight()
        && Math.random() < pr.petrifyChance * (exposed ? 1 : 0.33)) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(pt);
      if (this.spells.cast(pt)) {
        this.go('CAST');
        return true;
      }
    }
    // the plates: at range, never with her close enough to interrupt the wind-up (and not into
    // a raised shield); more often while the opponent's Protego cools down or she has no wand
    const pl = this.plates;
    const up = !!this.opponentShield?.up;
    if (pl && !foe.petrified && dist >= pr.platesRange[0] && dist <= pr.platesRange[1] && !up && this.spells.canCast(pl)
        && this.lineOfSight() && Math.random() < pr.platesChance * (shieldDown || !foe.hasWand ? 1.6 : 1)) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(pl);
      if (this.spells.cast(pl)) {
        this.go('CAST');
        return true;
      }
    }
    // Expelliarmus at a duellist with her wand (her usual ranged spell)
    if (alt && foe.hasWand && dist >= this.params.castRange[0] && dist <= Math.min(this.params.castRange[1], alt.aimRange)
        && this.spells.canCast(alt) && this.lineOfSight() && Math.random() < this.params.castChance * 0.5) {
      if (!this.turnedTo(angle, AIM.spell)) return this.mean(alt);
      if (this.spells.cast(alt)) {
        this.go('CAST');
        return true;
      }
    }
    // an attack she sees coming in reach: a quick step out of it, to the side (never back)
    if (this.noticed && dist < 1.6 && Math.random() < pr.dodgeClipChance) {
      this.noticed = false;
      if (this.dodgeClip(this.freeSide())) return true;
    }
    return false;
  }

  /** the opponent just went down bound: one follow-up, either Expelliarmus at once (while she
   *  has her wand) or the plates timed for her getting up (both: disarmed, she couldn't raise
   *  Protego against the plates) */
  private planFollowUp(): void {
    const foe = this.opponent;
    const left = this.petrify?.petrify?.duration ?? 2.0;
    if (this.altSpell && foe.hasWand && (!this.plates || Math.random() < 0.5)) {
      this.planCast(this.altSpell, rand(0.3, 0.5));
    } else if (this.plates) {
      // the release (the first plate) as she is back on her feet: bound, then getting up
      const up = left + foe.clipDuration('get_up');
      this.planCast(this.plates, Math.max(0.6, up - this.plates.release - 0.05));
    }
  }

  private planCast(spell: SpellDef, at: number): void {
    if (this.plans.some((p) => p.spell === spell)) return;
    this.plans.push({ spell, at, turn: 0 });
    this.plans.sort((a, b) => a.at - b.at);
  }

  /** she holds the opponent's wand (Accio) */
  get holdingFoeWand(): boolean {
    const s = this.opponent.wand.state;
    return s === 'held' || s === 'summoned';
  }

  /**
   * the opponent's velocity, and her dodging habit: while something of hers flies at the
   * opponent, a quick move across her line counts towards that side
   */
  private track(dt: number): void {
    const p = this.opponent.position;
    if (!this.foeSeen) {
      this.foePrev.copy(p);
      this.foeSeen = true;
      return;
    }
    if (dt <= 0) return;
    const vx = (p.x - this.foePrev.x) / dt, vz = (p.z - this.foePrev.z) / dt;
    this.foePrev.copy(p);
    if (Math.hypot(vx, vz) > 8) return;                          // (a teleport: a new round)
    const k = 1 - Math.exp(-10 * dt);
    this.foeVel.x += (vx - this.foeVel.x) * k;
    this.foeVel.z += (vz - this.foeVel.z) * k;
    this.habitClock -= dt;
    const pr = this.params.prodigy;
    if (!pr || this.habitClock > 0 || !this.threatOut?.()) return;
    const lat = this.lateral(this.foeVel);
    if (Math.abs(lat) < 1.0) return;
    this.habitClock = 0.3;                                       // (one sample per dodge)
    this.habit += (Math.sign(lat) - this.habit) * 0.2;
  }

  /** the opponent's sideways speed across her line from here (+: to the opponent's right as seen from here) */
  private lateral(v: THREE.Vector3): number {
    const to = this.dirToOpponent();
    return -to.z * v.x + to.x * v.z;
  }

  /**
   * where to aim something flying at `speed` from `from` at the opponent: where she will be when
   * it arrives (her smoothed velocity times the flight, by `lead`), and towards the side she
   * habitually dodges to (by `adapt`)
   */
  aimAt(from: THREE.Vector3, speed: number, out: THREE.Vector3): THREE.Vector3 {
    const pr = this.params.prodigy;
    const lead = pr?.lead ?? 0;
    const p = this.opponent.position;
    let t = Math.hypot(p.x - from.x, p.z - from.z) / speed;
    for (let i = 0; i < 2; i++) {
      const x = p.x + this.foeVel.x * t * lead, z = p.z + this.foeVel.z * t * lead;
      t = Math.hypot(x - from.x, z - from.z) / speed;
    }
    const to = this.dirToOpponent();
    const side = this.habit * (pr?.adapt ?? 0);
    const aimY = this.opponent.lying ? 0.25 : 1.15;
    return out.set(p.x + this.foeVel.x * t * lead + -to.z * side, aimY, p.z + this.foeVel.z * t * lead + to.x * side);
  }

  /** she chose this spell but has to turn first: she'll cast it once she faces the opponent */
  private mean(spell: SpellDef): boolean {
    this.intent = spell;
    return true;
  }

  /** a chaotic duellist on the move: skip somewhere on her ring, circle, or stand and stare */
  private roam(ch: ChaoticStyle, dist: number, angle: number): void {
    const [near, far] = ch.roamRange;
    if (dist < near * 0.7 && Math.random() < 0.5 && this.dodgeClip('dodge_back')) return;
    const r = Math.random();
    if (dist > far + 1.0 || (dist < near && r < 0.7) || r < ch.skipChance) {
      // a spot on the ring, somewhere off to one side of where she is
      const from = Math.atan2(this.self.position.x - this.opponent.position.x, this.self.position.z - this.opponent.position.z);
      const a = from + rand(-1.4, 1.4);
      const rr = rand(near, far);
      this.roamGoal.set(this.opponent.position.x + Math.sin(a) * rr, 0, this.opponent.position.z + Math.cos(a) * rr);
      this.keepIn?.(this.roamGoal);                   // (a round room: never a spot beyond the floor)
      this.go('SKIP', 2.2);
      return;
    }
    if (r < 0.75) {
      if (Math.random() < 0.4) this.circleSide = this.circleSide > 0 ? -1 : 1;
      this.go('CIRCLE', rand(0.6, 1.8));
      return;
    }
    this.self.stop();
    this.self.lookAt(angle);
    this.go('OBSERVE');
  }

  /**
   * a spell is on its way (reaching her in `arrive` s): Protego (sometimes timed into the
   * perfect window) or a sidestep, or nothing at all. Repeated Confringos make her readier.
   */
  private evade(arrive: number): void {
    const ev = this.params.evasive!;
    const spam = this.recentConfringos * ev.spamBonus;
    // (the caps limit what repeated Confringos add, never a level's own odds)
    const boosted = (base: number, cap: number) => Math.min(Math.max(base, cap), base + spam);
    const perfect = Math.random() < boosted(ev.perfectChance, MAX_PERFECT);
    // too close for a plain block (it would go up inside the perfect window): dodge instead
    const room = perfect || arrive > PROTEGO.perfectWindow + 0.05;
    if (room && this.shield?.ready && this.state !== 'PROTEGO' && Math.random() < boosted(ev.shieldChance, MAX_SHIELD)) {
      // a parry goes up just before the bolt arrives, off by her timing error (so it can come
      // too early or too late); a plain block goes up well ahead and holds, clear of the
      // perfect window, so a block never turns into a parry by accident
      this.shieldAt = perfect ? Math.max(0, arrive - rand(0.03, 0.12) + rand(-ev.timingError, ev.timingError))
        : Math.max(0, arrive - rand(0.45, 0.6));
      this.self.stop();
      this.pendingSecond = null;
      this.go('PROTEGO', this.shieldAt + 0.75);
      return;
    }
    if (Math.random() < this.params.dodgeChance) this.dodgeClip(this.freeSide());
  }

  /**
   * the ranged spell to cast now: with a second spell (Susan's Expelliarmus) she alternates
   * between the two, taking whichever is ready when only one is; the second (a disarm) only
   * while the opponent still has her wand. null: neither can be cast
   */
  private rangedSpell(dist: number): SpellDef | null {
    const main = this.spells.canCast(this.spell) ? this.spell : null;
    const alt = this.altSpell && this.opponent.hasWand && dist <= this.altSpell.aimRange && this.spells.canCast(this.altSpell)
      ? this.altSpell : null;
    if (main && alt) return this.lastAlt ? main : alt;
    return main ?? alt;
  }

  /** is she facing within tol (rad) of this angle? */
  private facing(angle: number, tol: number): boolean {
    return Math.abs(angDiff(this.self.facingAngle, angle)) < tol;
  }

  /** facing the opponent closely enough to attack? If not: turn towards her and decide again soon */
  private turnedTo(angle: number, tol: number): boolean {
    if (this.facing(angle, tol)) return true;
    this.self.stop();
    this.self.lookAt(angle);
    this.go('OBSERVE');
    this.think = TURN_CHECK;
    return false;
  }

  /** a dodge clip if her model has one, else nothing (false) */
  private dodgeClip(kind: DodgeState): boolean {
    if (this.combat.busy || this.spells.isCasting) return false;
    this.self.setHold('block', false);
    if (!this.self.dodge(kind)) return false;
    this.dodged = kind;
    this.pendingSecond = null;
    this.go('DODGE', 0.6);
    return true;
  }

  /** the dodge clip that moves her along dir (to her left or right) */
  private sideOf(dir: THREE.Vector3): DodgeState {
    const a = this.self.facingAngle;
    return dir.x * Math.cos(a) - dir.z * Math.sin(a) >= 0 ? 'dodge_left' : 'dodge_right';
  }

  /** the side with room to sidestep (a trunk on one side sends her the other way) */
  private freeSide(): DodgeState {
    const a = this.self.facingAngle;
    const left = this.tmp2.set(Math.cos(a), 0, -Math.sin(a));
    const leftFree = !this.blocked(left, 1.3);
    const rightFree = !this.blocked(left.negate(), 1.3);
    if (leftFree !== rightFree) return leftFree ? 'dodge_left' : 'dodge_right';
    return Math.random() < 0.5 ? 'dodge_left' : 'dodge_right';
  }

  /** a trunk within `ahead` m along dir (hip height)? */
  private blocked(dir: THREE.Vector3, ahead = CIRCLE_LOOKAHEAD): boolean {
    const p = this.self.position;
    const from = this.tmpA.set(p.x, 0.9, p.z);
    const l = Math.hypot(dir.x, dir.z) || 1;
    const to = this.tmpB.set(p.x + (dir.x / l) * ahead, 0.9, p.z + (dir.z / l) * ahead);
    for (const box of this.solids()) if (sweepBox(from, to, 0.25, box) >= 0) return true;
    return false;
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
