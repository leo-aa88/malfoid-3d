import * as THREE from 'three';
import type { Malfoid } from '../character/Malfoid';
import type { TrainingDummy, HitResult } from './TrainingDummy';
import { DUMMY_RADIUS } from './TrainingDummy';
import {
  AttackButton, Combo, COMBOS, COMBO_WINDOW, AUTO_FACE_ANGLE, AUTO_FACE_RANGE, MAX_SPACING_STEP, Move, MOVES, OPENERS,
} from './moves';

/** what happened, for the HUD */
export type CombatEvent =
  | { type: 'strike'; move: Move; result: HitResult; damage: number; ko: boolean; at: THREE.Vector3 }
  | { type: 'whiff'; move: Move }
  | { type: 'combo'; hits: number; combo: Combo }
  | { type: 'broken'; reason: 'blocked' | 'missed' }
  | { type: 'vulnerable'; on: boolean };

/** a press this close to the end of a strike is queued as the next strike (s) */
const QUEUE_TAIL = 0.2;

type Outcome ='pending' | 'hit' | 'blocked' | 'missed';

interface Running {
  move: Move;
  button: AttackButton;
  t: number;                 // seconds into the clip
  rate: number;              // playback speed (slowed while recovering from a whiff)
  outcome: Outcome;
  combo: Combo | null;       // set when this strike is the finisher of a combo
  openerHit: boolean;
  /** where she steps to during the wind-up (null: no opponent in front) */
  spot: THREE.Vector3 | null;
}

/**
 * Two-hit combos on top of single strikes.
 *
 * - A press while idle starts an opener (J jab, U body jab, I low kick,
 *   K roundhouse).
 * - The second press is buffered from the start of the opener until
 *   COMBO_WINDOW after its active frames end (so it can be entered early).
 * - At the end of the opener's active frames (its cancel point) a buffered
 *   press chains straight into the finisher, but only if the opener hit
 *   (hit confirmation). A blocked or missed opener drops the combo.
 * - If the opener's clip ends before the window closes she returns to her
 *   stance and a press inside the window still links into the finisher.
 * - Finishers have their own damage and effect (stagger, knockback,
 *   knockdown). A blocked finisher only chips. A whiffed heavy finisher
 *   plays out slowly: she is open ("vulnerable") until it ends.
 * - When a strike starts she turns towards the opponent if it is within
 *   AUTO_FACE_ANGLE either side and AUTO_FACE_RANGE away.
 */
export class ComboSystem {
  private running: Running | null = null;
  private buffered: AttackButton | null = null;
  /** after an opener hit and its clip ended: until this time a press can still link */
  private linkWindow: { button: AttackButton; until: number } | null = null;
  private clock = 0;
  private vulnerableNow = false;
  onEvent: ((e: CombatEvent) => void) | null = null;

  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly malfoid: Malfoid, private readonly dummy: TrainingDummy) {}

  get busy(): boolean {
    return this.running !== null;
  }

  get vulnerable(): boolean {
    return this.vulnerableNow;
  }

  /** seconds into the current strike (debugging) */
  get time(): number {
    return this.running ? this.running.t : -1;
  }

  /** current move id (for debugging / the HUD) */
  get current(): string | null {
    return this.running ? this.running.move.id : null;
  }

  press(button: AttackButton): void {
    this.malfoid.resetIdleTimer();
    const r = this.running;
    if (r) {
      if (this.buffered !== null) return;
      // an opener takes the second press until the window closes; near the
      // end of any strike a press is kept and played as the next strike
      const inWindow = !r.combo && r.t <= r.move.active[1] + COMBO_WINDOW;
      const tail = r.move.duration - r.t <= QUEUE_TAIL && !this.vulnerableNow;
      if (inWindow || tail) this.buffered = button;
      return;
    }
    if (!this.malfoid.canStrike) return;
    const link = this.linkWindow;
    this.linkWindow = null;
    if (link && this.clock <= link.until) {
      const combo = COMBOS[link.button + button];
      if (combo) {
        this.start(MOVES[combo.finisher], button, combo, true);
        return;
      }
    }
    this.start(MOVES[OPENERS[button]], button, null, false);
  }

  private start(move: Move, button: AttackButton, combo: Combo | null, openerHit: boolean): void {
    const t = combo ? move.chainStart : 0;
    this.running = { move, button, t, rate: 1, outcome: 'pending', combo, openerHit, spot: null };
    this.buffered = null;
    this.malfoid.playStrike(move.id, t, combo ? 0.07 : 0.08);
    if (this.autoFace()) this.running.spot = this.spacing(move);
  }

  /** turn towards the dummy if it is roughly in front of her; true if she does */
  private autoFace(): boolean {
    if (!this.dummy.vulnerable) return false;
    const p = this.malfoid.position;
    const d = this.tmp.subVectors(this.dummy.position, p);
    d.y = 0;
    if (d.length() > AUTO_FACE_RANGE) return false;
    const want = Math.atan2(d.x, d.z);
    const f = this.malfoid.facingAngle;
    const diff = Math.atan2(Math.sin(want - f), Math.cos(want - f));
    if (Math.abs(diff) > AUTO_FACE_ANGLE) return false;
    this.malfoid.faceToward(want);
    return true;
  }

  /** the spot at the move's range from the dummy, along the line to her (limited step) */
  private spacing(move: Move): THREE.Vector3 {
    const p = this.malfoid.position;
    const d = this.tmp.subVectors(p, this.dummy.position).setY(0);
    const dist = d.length();
    const want = THREE.MathUtils.clamp(move.range, dist - MAX_SPACING_STEP, dist + MAX_SPACING_STEP);
    return this.dummy.position.clone().setY(p.y).addScaledVector(d.normalize(), want);
  }

  /** is the dummy inside the strike's hitbox (relative to her position and facing)? */
  private inHitbox(move: Move): boolean {
    const p = this.malfoid.position;
    const d = this.tmp.subVectors(this.dummy.position, p);
    d.y = 0;
    const f = this.malfoid.facingAngle;
    const fwd = d.x * Math.sin(f) + d.z * Math.cos(f);
    const side = d.x * Math.cos(f) - d.z * Math.sin(f);
    return fwd > 0 && fwd - DUMMY_RADIUS <= move.reach && Math.abs(side) <= move.width + DUMMY_RADIUS;
  }

  update(dt: number): void {
    this.clock += dt;
    const r = this.running;
    if (!r) return;
    const m = r.move;
    r.t += dt * r.rate;

    // wind-up: step in / back to the move's range, arriving as the strike lands
    if (r.spot && r.outcome === 'pending') {
      const left = m.active[0] - r.t;
      const k = left <= dt ? 1 : Math.min(1, dt / left) * 1.6;
      this.malfoid.position.lerp(r.spot, Math.min(k, 1));
      if (left <= 0) r.spot = null;
    }

    // active frames: connect once
    if (r.outcome === 'pending' && r.t >= m.active[0]) {
      if (this.inHitbox(m) && this.dummy.vulnerable) {
        this.dir.subVectors(this.dummy.position, this.malfoid.position).setY(0).normalize();
        const res = this.dummy.receive(m.damage, m.height, m.effect, this.dir);
        r.outcome = res.result === 'hit' ? 'hit' : res.result === 'blocked' ? 'blocked' : 'missed';
        const at = this.dummy.position.clone().setY(m.height === 'high' ? 1.55 : 1.0);
        this.emit({ type: 'strike', move: m, result: res.result, damage: res.damage, ko: res.ko, at });
        if (r.combo && r.openerHit && r.outcome === 'hit') this.emit({ type: 'combo', hits: 2, combo: r.combo });
      } else if (r.t >= m.active[1]) {
        r.outcome = 'missed';
        this.emit({ type: 'whiff', move: m });
        if (m.heavy) {
          // whiffed heavy finisher: the rest of the move plays out slowly
          const left = m.duration - r.t;
          r.rate = left / (left + m.missRecovery);
          this.malfoid.setStrikeRate(r.rate);
          this.setVulnerable(true);
        }
      }
    }

    // cancel point of an opener: chain into the finisher
    if (!r.combo && r.t >= m.active[1] && r.outcome !== 'pending') {
      const combo = this.buffered ? COMBOS[r.button + this.buffered] : undefined;
      if (this.buffered && combo) {
        if (r.outcome === 'hit') {
          this.start(MOVES[combo.finisher], this.buffered, combo, true);
          return;
        }
        this.emit({ type: 'broken', reason: r.outcome === 'blocked' ? 'blocked' : 'missed' });
        this.buffered = null;
      }
    }

    if (r.t >= m.duration) {
      const next = this.buffered;
      this.running = null;
      this.buffered = null;
      this.malfoid.endStrike();
      this.setVulnerable(false);
      // an opener that hit keeps the combo window open a little longer
      if (!r.combo && r.outcome === 'hit') {
        this.linkWindow = { button: r.button, until: this.clock + (m.active[1] + COMBO_WINDOW - m.duration) };
      }
      // a press that doesn't form a combo is played as the next strike
      if (next) this.press(next);
    }
  }

  private setVulnerable(on: boolean): void {
    if (on === this.vulnerableNow) return;
    this.vulnerableNow = on;
    this.emit({ type: 'vulnerable', on });
  }

  private emit(e: CombatEvent): void {
    this.onEvent?.(e);
  }
}
