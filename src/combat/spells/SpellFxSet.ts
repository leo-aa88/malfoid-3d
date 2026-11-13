import type { SpellDef, SpellFx } from './SpellSystem';
import type { SpellEmitter } from './SpellEmitter';
import type { Impact, Projectile } from './Projectile';

/**
 * One caster's spell effects when she has several spells: each spell's effects go to the pool
 * with its look (Malfoid's Confringo to the fire pool, her Expelliarmus to the red one).
 *
 * A pool can be shared by two casters (one set of point lights per look, not per caster), so
 * exactly one set updates each pool: `updates` lists the pools this set advances in update(dt).
 * (A pool has a charge orb per caster, so both can wind up the same spell at once.)
 */
export class SpellFxSet implements SpellFx {
  constructor(
    private readonly bySpell: Readonly<Record<string, SpellFx>>,
    private readonly updates: readonly SpellFx[],
  ) {}

  private pool(def: SpellDef): SpellFx {
    const p = this.bySpell[def.id];
    if (!p) throw new Error(`no effects for spell ${def.id}`);
    return p;
  }

  castStart(def: SpellDef, emitter: SpellEmitter): void { this.pool(def).castStart(def, emitter); }
  castUpdate(def: SpellDef, emitter: SpellEmitter, charge: number): void { this.pool(def).castUpdate(def, emitter, charge); }
  castEnd(def: SpellDef, released: boolean, emitter: SpellEmitter): void { this.pool(def).castEnd(def, released, emitter); }
  projectileStart(def: SpellDef, p: Projectile): void { this.pool(def).projectileStart(def, p); }
  projectileUpdate(def: SpellDef, p: Projectile): void { this.pool(def).projectileUpdate(def, p); }
  projectileEnd(def: SpellDef, p: Projectile, impact: Impact): void { this.pool(def).projectileEnd(def, p, impact); }
  update(dt: number): void {
    for (const p of this.updates) p.update(dt);
  }
}
