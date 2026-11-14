import * as THREE from 'three';
import { Malfoid } from '../character/Malfoid';
import { ComboSystem } from '../combat/ComboSystem';
import { FighterTarget } from '../combat/FighterTarget';
import { FighterAI } from '../combat/ai/FighterAI';
import type { Difficulty } from '../combat/ai/difficulty';
import { SpellSystem, SpellFx } from '../combat/spells/SpellSystem';
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
  /** her own effect pools (updated by her spell system), for their view scale */
  private readonly ownFx: { setView(c: THREE.PerspectiveCamera, h: number): void }[] = [];

  constructor(readonly def: OpponentDef, readonly char: Malfoid, w: OpponentWorld) {
    char.scene = w.scene;
    char.root.visible = false;
    this.target = new FighterTarget(char);
    this.combat = new ComboSystem(char, () => [w.malfoidTarget]);
    // her spells' effects: her main spell's pool is shared if it already exists (Ginny's
    // Expelliarmus is also Malfoid's); otherwise she has her own, which she advances. A spell
    // she reflects keeps flying in its caster's pool (that caster's system advances it).
    const bySpell: Record<string, SpellFx> = { ...w.pools };
    const updates: SpellFx[] = [];
    if (!w.pools[def.spell.id]) {
      const fx = new ConfringoFx(w.scene, def.look, def.spell.id + '_fx');
      bySpell[def.spell.id] = fx;
      updates.push(fx);
      this.ownFx.push(fx);
    }
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
    this.ai = new FighterAI(char, this.target, this.combat, this.spells, def.spell, w.malfoid, w.malfoidCombat, () => w.solids);
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
    this.ai.onState = (s) => {
      // below half health some opponents grow more determined (Susan): that face when attacking
      const low = def.faces.lowHp && this.target.hp < this.target.maxHp * 0.5;
      if (s === 'CAST' || s === 'MELEE_ATTACK') char.setExpression(low ? def.faces.lowHp! : def.faces.attack, 0.9);
      else if (s === 'RETREAT') char.setExpression(def.faces.retreat, 1.0);
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
  }

  /** a fresh duel: full health, wand back, nothing cooling down or in flight */
  reset(): void {
    this.target.reset();
    if (!this.char.hasWand) this.char.wand.retrieve();
    this.spells.reset();
    this.protego?.reset();
    this.episkey?.reset();
    this.episkeyFx?.reset();
  }

  /** after the characters moved: her shield, the shield's look */
  update(dt: number): void {
    this.protego?.update(dt);
    this.protegoFx?.update(dt);
    this.episkey?.update(dt);
    this.episkeyFx?.update(dt);
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    for (const fx of this.ownFx) fx.setView(camera, viewportHeightPx);
  }
}
