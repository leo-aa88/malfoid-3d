import * as THREE from 'three';
import { Malfoid } from '../character/Malfoid';
import { ComboSystem } from '../combat/ComboSystem';
import { FighterTarget } from '../combat/FighterTarget';
import { FighterAI } from '../combat/ai/FighterAI';
import type { Difficulty } from '../combat/ai/difficulty';
import { SpellSystem, SpellFx, SpellDef } from '../combat/spells/SpellSystem';
import { OPPUGNO_SPELL, OppugnoFlock, OppugnoFx } from '../combat/spells/Oppugno';
import { ILLUSIO_LOOK, ILLUSIO_SPELL, Illusions, OPPUGNO_LOOK } from '../combat/Illusio';
import { PLATES, PLATES_SPELL, PlateBarrage, PlateFx } from '../combat/spells/Plates';
import { ACCIO, ACCIO_LOOK } from '../combat/spells/Accio';
import { ConfringoFx } from '../combat/spells/ConfringoFx';
import { SpellFxSet } from '../combat/spells/SpellFxSet';
import { VentusFx } from '../combat/spells/Ventus';
import { Protego } from '../combat/Protego';
import { ProtegoFx } from '../combat/ProtegoFx';
import { Episkey } from '../combat/Episkey';
import { EpiskeyFx } from '../combat/EpiskeyFx';
import type { OpponentDef } from './opponents';

/** s her healing face holds after Episkey */
const EPISKEY_FACE = 1.6;

/** what an opponent is built against: the scene, Malfoid and her systems, shared effects */
export interface OpponentWorld {
  scene: THREE.Scene;
  malfoid: Malfoid;
  malfoidTarget: FighterTarget;
  malfoidCombat: ComboSystem;
  malfoidSpells: SpellSystem;
  solids: THREE.Box3[];
  /** effect pools by spell id that already exist (shared: one set of lights per look) */
  pools: Record<string, ConfringoFx>;
}

/**
 * One opponent in the game: her character, health, combo system, spells (with their
 * effects), Protego if she has one, and her AI, built from her definition. Hidden until a
 * duel against her starts.
 */
export class Opponent {
  readonly target: FighterTarget;
  readonly combat: ComboSystem;
  readonly spells: SpellSystem;
  readonly ai: FighterAI;
  readonly protego: Protego | null = null;
  private readonly protegoFx: ProtegoFx | null = null;
  /** her healing charm (Susan), and its look */
  readonly episkey: Episkey | null = null;
  private readonly episkeyFx: EpiskeyFx | null = null;
  /** her spells' effect pools by spell id (Malfoid's Protego sends her bolts back in these) */
  readonly fxBySpell: Readonly<Record<string, SpellFx>>;
  /** her main spell (her own copy: a level may tune it, Confundo's confusion) */
  readonly spell: SpellDef;
  /** Luna's birds (Oppugno) and copies of herself (Illusio), and how they look */
  readonly flock: OppugnoFlock | null = null;
  private readonly flockFx: OppugnoFx | null = null;
  readonly illusions: Illusions | null = null;
  private birds = 5;
  private copies = 2;
  /** Hermione's plate barrage and how it looks; plates per barrage (per level) */
  readonly barrage: PlateBarrage | null = null;
  private readonly plateFx: PlateFx | null = null;
  private plateCount = PLATES.plates;
  /** her own copy of the barrage's spell (a level sets its cooldown) */
  private readonly platesSpell = { ...PLATES_SPELL };
  /** where the barrage's plates come from (the Great Hall's tables: the nearest places, taken
   *  off the tables); null: conjured round her */
  plateSource: ((near: THREE.Vector3, count: number) => THREE.Vector3[]) | null = null;
  private wasHit = false;
  /** Malfoid (Accio takes her wand) */
  private readonly foe: Malfoid;
  /** her own effect pools (updated by her spell system), for their view scale */
  private readonly ownFx: { setView(c: THREE.PerspectiveCamera, h: number): void }[] = [];

  constructor(readonly def: OpponentDef, readonly char: Malfoid, w: OpponentWorld) {
    char.scene = w.scene;
    char.root.visible = false;
    this.foe = w.malfoid;
    this.target = new FighterTarget(char);
    this.combat = new ComboSystem(char, () => [w.malfoidTarget]);
    // her spells' effects: her main spell's pool is shared if it already exists (Ginny's
    // Expelliarmus is also Malfoid's); otherwise she has her own, which she advances. A spell
    // she reflects keeps flying in its caster's pool (that caster's system advances it).
    const bySpell: Record<string, SpellFx> = { ...w.pools };
    const updates: SpellFx[] = [];
    this.spell = def.spell.confuse ? { ...def.spell, confuse: { ...def.spell.confuse } }
      : def.spell.petrify ? { ...def.spell, petrify: { ...def.spell.petrify } } : def.spell;
    const own = (id: string, look: typeof def.look) => {
      const fx = new ConfringoFx(w.scene, look, id + '_fx');
      bySpell[id] = fx;
      updates.push(fx);
      this.ownFx.push(fx);
    };
    if (!w.pools[def.spell.id]) own(def.spell.id, def.look);
    // summons have no bolt, only the charge at her wand: gold for the birds, silver for the copies
    if (def.oppugno) own(OPPUGNO_SPELL.id, OPPUGNO_LOOK);
    if (def.illusio) own(ILLUSIO_SPELL.id, ILLUSIO_LOOK);
    // Hermione's summons: a gold charge at her wand for the plates and for Accio
    if (def.plates) own(PLATES_SPELL.id, OPPUGNO_LOOK);
    if (def.accio) own(ACCIO.id, ACCIO_LOOK);
    if (def.push) {
      // a bolt with its own look (Depulso), or Ventus's gust
      const fx = def.pushLook ? new ConfringoFx(w.scene, def.pushLook, def.push.id + '_fx') : new VentusFx(w.scene);
      bySpell[def.push.id] = fx;
      updates.push(fx);
      this.ownFx.push(fx);
    }
    this.fxBySpell = bySpell;
    this.spells = new SpellSystem(char, char.spellEmitter, () => this.combat.busy, new SpellFxSet(bySpell, updates),
      { targets: [w.malfoidTarget], solids: w.solids, groundY: 0 });
    this.spells.world.solids = w.solids;
    this.ai = new FighterAI(char, this.target, this.combat, this.spells, this.spell, w.malfoid, w.malfoidCombat, () => w.solids);
    this.ai.opponentSpells = w.malfoidSpells;          // she sees Malfoid's casts and bolts
    this.ai.pushSpell = def.push ?? null;
    // a second ranged spell (Susan's Expelliarmus): its effects are a shared pool
    if (def.altSpell && !bySpell[def.altSpell.id]) throw new Error(`no effects for ${def.altSpell.id}`);
    this.ai.altSpell = def.altSpell ?? null;
    if (def.protego) {
      this.protego = new Protego(char);
      this.protegoFx = new ProtegoFx(w.scene, this.protego, char);
      this.target.shield = this.protego;
      this.target.reflector = this.spells;              // a reflected spell becomes hers
      this.ai.shield = this.protego;
      this.target.onShield = (r) => {
        this.ai.shieldResult(r);
        const face = r === 'reflect' ? def.faces.parried : def.faces.shielded;
        if (face) char.setExpression(face, 1.2);
      };
    }
    this.target.resolve = def.resolve ?? null;
    if (def.episkey) {
      this.episkey = new Episkey(char, this.target);
      // her healing face (set before the look chains its flare onto the same callback)
      this.episkey.onHealed = () => {
        if (def.faces.heal) char.setExpression(def.faces.heal, EPISKEY_FACE);
      };
      this.episkeyFx = new EpiskeyFx(w.scene, this.episkey, char);
      this.ai.heal = this.episkey;
    }
    // Luna's summons: at the release of Oppugno a flock flies from her wand at Malfoid; at the
    // release of Illusio her copies appear (and she is shuffled among them)
    if (def.oppugno) {
      this.flock = new OppugnoFlock();
      this.flockFx = new OppugnoFx(w.scene, this.flock);
      this.flock.onEvent = (e) => this.spells.onEvent?.(e);      // the HUD, Protego's feedback, sounds
      this.ai.oppugno = OPPUGNO_SPELL;
    }
    if (def.illusio) {
      const twins = [0, 1, 2].map(() => char.makeTwin());
      this.illusions = new Illusions(w.scene, twins, char, this.target, w.malfoid);
      this.ai.illusio = ILLUSIO_SPELL;
      this.ai.illusions = this.illusions;
    }
    // Hermione: the plates rise with the cast, fall if it is cut short, fly at the release; Accio
    // brings Malfoid's dropped wand to her free hand
    if (def.plates) {
      this.barrage = new PlateBarrage();
      this.plateFx = new PlateFx(w.scene, this.barrage);
      this.barrage.onEvent = (e) => this.spells.onEvent?.(e);
      this.ai.plates = this.platesSpell;
      this.ai.threatOut = () => this.barrage!.plates.some((p) => p.state === 'flying');
    }
    if (def.accio) this.ai.accio = ACCIO;
    if (this.spell.petrify) this.ai.petrify = this.spell;
    this.ai.opponentShield = w.malfoidTarget.shield;
    this.spells.onCast = (s, phase) => {
      if (s.summon !== 'plates' || !this.barrage) return;
      if (phase === 'start') this.barrage.levitate(char, this.plateSource?.(char.position, this.plateCount) ?? [], this.plateCount);
      else this.barrage.interrupt();
    };
    this.spells.onSummon = (s, origin) => {
      if (s.summon === 'plates' && this.barrage) {
        this.barrage.fire(w.malfoidTarget, this.target, (from, out) => this.ai.aimAt(from, this.barrage!.cfg.speed, out));
        return;
      }
      if (s.summon === 'accio') {
        if (w.malfoid.wand.state === 'dropped' && char.offHand) w.malfoid.wand.summon(char.offHand);
        return;
      }
      if (s.summon === 'oppugno' && this.flock) {
        const f = char.facingAngle;
        this.flock.launch(origin, new THREE.Vector3(Math.sin(f), 0, Math.cos(f)), w.malfoidTarget, this.target, this.birds);
      } else if (s.summon === 'illusio' && this.illusions) {
        this.illusions.cast(this.copies);
      }
    };
    this.ai.onState = (s) => {
      // below half health some opponents grow more determined (Susan): that face when attacking
      const low = def.faces.lowHp && this.target.hp < this.target.maxHp * 0.5;
      if (s === 'CAST' || s === 'MELEE_ATTACK') char.setExpression(low ? def.faces.lowHp! : def.faces.attack, 0.9);
      else if (s === 'RETREAT') char.setExpression(def.faces.retreat, 1.0);
      else if (s === 'DISTRACTED' && def.faces.distracted) char.setExpression(def.faces.distracted, 2.5);
    };
  }

  /** this difficulty's AI and health */
  setLevel(level: Difficulty): void {
    const l = this.def.difficulty[level];
    this.ai.params = l.ai;
    this.target.maxHp = l.hp;
    if (this.episkey && l.heal) {
      this.episkey.amount = l.heal.amount;
      this.episkey.maxCharges = l.heal.charges;
    }
    if (l.hermione) {
      this.plateCount = l.hermione.plates;
      if (this.barrage) this.barrage.cfg.damage = l.hermione.plateDamage;
      this.platesSpell.cooldown = l.hermione.platesCooldown;
      if (this.spell.petrify) this.spell.cooldown = l.hermione.petrifyCooldown;
      if (this.spell.petrify) this.spell.petrify.duration = l.hermione.petrify;
    }
    if (l.luna) {
      if (this.spell.confuse) this.spell.confuse.duration = l.luna.confuse;
      this.birds = l.luna.birds;
      this.copies = l.luna.copies;
      if (this.illusions) this.illusions.cfg.life = l.luna.illusionLife;
    }
  }

  /** a fresh duel: full health, wand back, nothing cooling down or in flight */
  reset(): void {
    this.target.reset();
    if (!this.char.hasWand) this.char.wand.retrieve();
    this.spells.reset();
    this.protego?.reset();
    this.episkey?.reset();
    this.episkeyFx?.reset();
    this.flockFx?.reset();
    this.illusions?.reset();
    this.plateFx?.reset();
    this.wasHit = false;
  }

  /** she holds Malfoid's wand (Accio) */
  get holdingFoeWand(): boolean {
    const s = this.foe.wand.state;
    return s === 'held' || s === 'summoned';
  }

  /** after the characters moved: her shield, the shield's look, her birds and copies */
  update(dt: number, solids: readonly THREE.Box3[] = []): void {
    this.protego?.update(dt);
    this.protegoFx?.update(dt);
    this.episkey?.update(dt);
    this.episkeyFx?.update(dt);
    this.flock?.update(dt, solids);
    this.flockFx?.update(dt);
    this.illusions?.update(dt);
    // a hit that gets through: the plates still round her fall, and she lets go of Malfoid's wand
    const hit = !!this.char.reacting && this.char.reacting !== 'pickup';
    if (hit && !this.wasHit) {
      this.barrage?.interrupt();
      if (this.holdingFoeWand && this.char.scene) {
        const d = new THREE.Vector3(this.foe.position.x - this.char.position.x, 0, this.foe.position.z - this.char.position.z);
        this.foe.wand.loose(this.char.scene, d.lengthSq() > 1e-6 ? d.normalize() : d.set(0, 0, 1));
      }
    }
    this.wasHit = hit;
    this.barrage?.update(dt, solids);
    this.plateFx?.update(dt);
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    for (const fx of this.ownFx) fx.setView(camera, viewportHeightPx);
    this.flockFx?.setView(camera, viewportHeightPx);
    this.illusions?.setView(camera, viewportHeightPx);
    this.plateFx?.setView(camera, viewportHeightPx);
  }
}
