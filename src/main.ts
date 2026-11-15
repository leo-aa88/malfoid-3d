import './styles/main.css';
import * as THREE from 'three';
import { SceneManager, STUDIO_LOOK } from './scene/SceneManager';
import { ForestArena } from './scene/forest/ForestArena';
import { PitchArena } from './scene/pitch';
import { GreenhouseArena } from './scene/greenhouse';
import { RavenclawArena } from './scene/ravenclaw';
import type { Arena } from './scene/arena';
import { CameraController } from './camera/CameraController';
import { Malfoid } from './character/Malfoid';
import { CharacterController } from './character/CharacterController';
import { TrainingDummy, DUMMY_RADIUS, Guard } from './combat/TrainingDummy';
import { ComboSystem } from './combat/ComboSystem';
import { FighterTarget } from './combat/FighterTarget';
import { CombatHud } from './ui/CombatHud';
import { CAMEO, CameoTrigger, DobbyCameo } from './ui/DobbyCameo';
import { SpellSystem } from './combat/spells/SpellSystem';
import { ConfringoFx } from './combat/spells/ConfringoFx';
import { CONFRINGO } from './combat/spells/Confringo';
import { EXPELLIARMUS, EXPELLIARMUS_LOOK } from './combat/spells/Expelliarmus';
import { DIFFICULTY, Difficulty } from './combat/ai/difficulty';
import { FighterAI } from './combat/ai/FighterAI';
import { Sfx } from './audio/Sfx';
import { connectCombatSounds } from './audio/combatSounds';
import { VolumeControl } from './ui/VolumeControl';
import { DuelVoices } from './audio/duelVoices';
import { SpellFxSet } from './combat/spells/SpellFxSet';
import { ALL_SPELLS, CAMPAIGN, Campaign, spellsBefore, LossResult, SPELL_INFO, SpellId, WinResult } from './game/campaign';
import { MATCH, Match } from './game/match';
import { OPPONENTS, OpponentDef, OpponentId } from './game/opponents';
import { Opponent } from './game/Opponent';
import { SlowFx } from './combat/SlowFx';
import { ConfusionFx } from './combat/ConfusionFx';
import { PROTEGO, Protego } from './combat/Protego';
import { ProtegoFx } from './combat/ProtegoFx';
import type { SpellDef, SpellFx } from './combat/spells/SpellSystem';

const BASE = import.meta.env.BASE_URL;
const DUMMY_DISTANCE = 0.56;                  // m, centre to centre: in reach of every strike
// at the start it stands at her front-right (screen left as she faces the camera), off the
// path she takes to the right and still inside the auto-facing angle
const DUMMY_START_ANGLE = -1.0;               // rad (+ is her left)
const DUMMY_START_DISTANCE = 0.9;
// an opponent waits at her other side, a few steps away, until a duel starts (hidden)
const OPPONENT_WAIT = new THREE.Vector3(1.8, 0, -0.4);
const FIGHTER_GAP = 0.45;                     // m centre to centre: fighters can't walk through each other

/** push two bodies apart (centre to centre at least gap); share decides who moves (0: only a, 1: only b) */
function keepApart(a: THREE.Vector3, b: THREE.Vector3, gap: number, share = 0): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d >= gap || d < 1e-6) return;
  const push = gap - d;
  a.x += (dx / d) * push * (1 - share);
  a.z += (dz / d) * push * (1 - share);
  b.x -= (dx / d) * push * share;
  b.z -= (dz / d) * push * share;
}

async function start(): Promise<void> {
  const sm = new SceneManager(document.getElementById('app')!);
  const cam = new CameraController(sm.camera, sm.renderer.domElement);
  // ?char=ginny / ?char=cho shows that model in the player's place (inspection)
  const asked = new URLSearchParams(location.search).get('char') as OpponentId | null;
  const char = asked && OPPONENTS[asked] ? OPPONENTS[asked] : null;
  const ids = Object.keys(OPPONENTS) as OpponentId[];
  const [malfoid, ...opponentChars] = await Promise.all([
    Malfoid.load(`${BASE}models/${char?.model ?? 'malfoid'}.glb`, `${BASE}models/${char?.model ?? 'malfoid'}.json`, char?.character),
    ...ids.map((id) => Malfoid.load(`${BASE}models/${OPPONENTS[id].model}.glb`, `${BASE}models/${OPPONENTS[id].model}.json`,
      OPPONENTS[id].character)),
  ]);
  malfoid.scene = sm.scene;
  sm.scene.add(malfoid.root, ...opponentChars.map((c) => c.root));
  for (const c of opponentChars) {
    c.root.position.copy(OPPONENT_WAIT);
    c.lookAt(Math.atan2(-OPPONENT_WAIT.x, -OPPONENT_WAIT.z));
    c.update(1 / 60);
  }
  malfoid.update(1 / 60);                             // posed (not in the bind pose) behind the mode select

  // training dummy
  const dummy = new TrainingDummy();
  sm.scene.add(dummy.root);
  const placeDummy = (angle: number, dist: number) => {
    const f = malfoid.facingAngle + angle;
    const p = malfoid.position.clone().add(new THREE.Vector3(Math.sin(f), 0, Math.cos(f)).multiplyScalar(dist));
    dummy.placeAt(p, malfoid.position);
  };
  placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);

  // who can be hit: the dummy and the fighters
  const malfoidTarget = new FighterTarget(malfoid);
  const slowFx = new SlowFx(sm.scene, malfoidTarget);   // Impedimenta's rings round her legs while she is slowed
  const confusionFx = new ConfusionFx(sm.scene, malfoidTarget);   // Confundo's stars round her head while she is confused
  // her Protego (learned from Cho): spells reaching its front are stopped, or sent back by a
  // shield raised just as they arrive; strikes are guarded like a block
  const protego = new Protego(malfoid);
  const protegoFx = new ProtegoFx(sm.scene, protego, malfoid);
  malfoidTarget.shield = protego;
  const solids: THREE.Box3[] = [];
  // training: the dummy in the studio; practice (any opponent, every spell, straight into the
  // fight) and the campaign (opponents in order, spells learned): a duel in the woods
  type Mode = 'training' | 'practice' | 'campaign';
  let mode: Mode = 'training';
  const isDuel = () => mode !== 'training';
  let opp: Opponent;                                  // whom Malfoid duels (set below)
  // (Luna's copies are always listed: a copy that isn't showing is not targetable)
  const malfoidTargets = () => (isDuel() ? [opp.target, ...(opp.illusions?.targets ?? [])] : [dummy]);
  const combat = new ComboSystem(malfoid, malfoidTargets);
  const hud = new CombatHud(sm.camera, document.getElementById('hud')!);
  combat.onEvent = (e) => hud.handle(e);

  // spells: each caster casts from her own wand tip; Malfoid's spells hit the dummy or her
  // opponent, the opponent's hit Malfoid. One effect pool per look (each lit pool adds point
  // lights to every lit material): Malfoid's Expelliarmus shares Ginny's red pool (a charge
  // orb each); Malfoid's spell system advances both of her pools (it runs in every mode)
  const spellFx = new ConfringoFx(sm.scene);
  const ginnyFx = new ConfringoFx(sm.scene, EXPELLIARMUS_LOOK, 'expelliarmus_fx');
  // (her pools by spell id also get every opponent's, below: a bolt her Protego sends back
  // flies on in its caster's pool, which its caster's system advances)
  const malfoidPools: Record<string, SpellFx> = { confringo: spellFx, expelliarmus: ginnyFx };
  const spells = new SpellSystem(malfoid, malfoid.spellEmitter, () => combat.busy,
    new SpellFxSet(malfoidPools, [spellFx, ginnyFx]), { solids, groundY: 0 });
  malfoidTarget.reflector = spells;                    // a spell she sends back becomes hers
  spells.onEvent = (e) => {
    hud.handleSpell(e);
    if (e.type === 'hit' && e.disarmed) hud.announce('DISARMED!', 'disarm');
    // her spell met the opponent's shield: stopped, or (a parry) sent straight back at her
    if (e.type === 'shielded') hud.flashStatusText('PROTEGO', 'miss');
    if (e.type === 'reflected') hud.announce('REFLECTED!', 'disarm');
  };
  hud.addSpell('confringo', CONFRINGO.name, 'L', 'confringo');
  hud.addSpell('expelliarmus', SPELL_INFO.expelliarmus.name, SPELL_INFO.expelliarmus.key, 'expelliarmus');
  hud.addSpell('protego', SPELL_INFO.protego.name, SPELL_INFO.protego.key, 'protego');
  const SPELL_DEFS: Record<Exclude<SpellId, 'protego'>, SpellDef> = { confringo: CONFRINGO, expelliarmus: EXPELLIARMUS };
  malfoidTarget.onShield = (r) => {
    if (r === 'reflect') hud.announce('REFLECTED!', 'disarm');
    else hud.flashStatusText('PROTEGO', 'miss');
  };

  // the campaign run: the next opponent, the spells learned (remembered in this browser)
  let store: Storage | null = null;
  try {
    store = window.localStorage;
  } catch {
    /* storage blocked: the run lasts this session */
  }
  const campaign = new Campaign(store);
  type FightResult = { won: true; r: WinResult } | { won: false; r: LossResult };
  let pendingResult: FightResult | null = null;     // a campaign fight just ended: shown once the winner's line ends
  // the opponents (OPPONENTS: Ginny, Cho): each with her own health, combo system, spells,
  // shield and AI; only the one being duelled is shown and updated. The AI only fights once a
  // duel has started.
  const world = { scene: sm.scene, malfoid, malfoidTarget, malfoidCombat: combat, malfoidSpells: spells, solids,
    pools: { confringo: spellFx, expelliarmus: ginnyFx } };
  const opponents = {} as Record<OpponentId, Opponent>;
  ids.forEach((id, i) => {
    const o = new Opponent(OPPONENTS[id], opponentChars[i], world);
    opponents[id] = o;
    for (const [spell, fx] of Object.entries(o.fxBySpell)) malfoidPools[spell] ??= fx;
    o.combat.onEvent = (e) => hud.handle(e);
    o.spells.onEvent = (e) => {
      hud.handleSpell(e);
      if (e.type === 'hit' && e.disarmed) {
        hud.announce('DISARMED!', 'disarm');
        o.char.setExpression(o.def.faces.disarmedFoe, 1.6);
      }
      if (e.type === 'hit' && e.direct && e.spell.slow && e.report.result === 'hit' && !e.report.ko) hud.announce('SLOWED!', 'disarm');
      if (e.type === 'hit' && e.direct && e.spell.confuse && e.report.result === 'hit' && !e.report.ko) hud.announce('CONFUNDED!', 'disarm');
      if (e.type === 'hit' && e.direct && e.spell.petrify && e.report.result === 'hit' && !e.report.ko && malfoid.petrified) {
        hud.announce('PETRIFIED!', 'disarm');
      }
      // Accio: Malfoid's wand flies to her
      if (e.type === 'release' && e.spell.summon === 'accio' && malfoid.wand.state === 'summoned') {
        hud.announce('ACCIO!', 'disarm');
        o.char.setExpression(o.def.faces.disarmedFoe, 1.6);
      }
    };
    o.target.onDefeated = () => { if (o === opp) finish(malfoid); };
    // Luna's copies: popping one says so
    if (o.illusions) o.illusions.onEvent = (e) => { if (e === 'pop') hud.flashStatusText('ILLUSION!', 'miss'); };
  });
  opp = opponents.ginny;
  let level: Difficulty = 'easy';
  const setLevel = (l: Difficulty) => {
    level = l;
    opp.setLevel(l);
    hud.setLevel(opp.def.difficulty[l].label);
  };
  // sounds, and the duel's voice lines (the fighters' mouths follow them)
  const sfx = new Sfx(sm.camera);
  const voices = new DuelVoices(sfx, malfoid, opp.char);
  /** duel this opponent (the others are hidden and still) */
  const setOpponent = (id: OpponentId) => {
    if (opp !== opponents[id]) {
      opp.ai.setActive(false);
      opp.char.root.visible = false;
      opp.char.root.position.copy(OPPONENT_WAIT);
    }
    opp = opponents[id];
    voices.setOpponent(opp.char, opp.def.lines);
    hud.setOpponent(opp.def.name, opp.def.hudColour);
    spells.world.targets = malfoidTargets();
  };
  /** every fighter's wand back in her hand: a knocked-away wand lies in the scene, not under its
   *  owner, so hiding an opponent (or changing arena) would leave it on the floor */
  const gatherWands = () => {
    for (const c of [malfoid, ...Object.values(opponents).map((o) => o.char)]) if (!c.hasWand) c.wand.retrieve();
  };
  voices.onIntroDone = () => announceRound();
  let duel = false;
  let duelOver = 0;
  // the campaign: each duel is a match, best of three rounds (practice: one fight). A round won
  // short of the match: ROUND_BREAK s on the knockout, the screen dips to dark over the last
  // ROUND_FADE s while both fighters are reset (same arena, same opponent), then the round's
  // title holds ROUND_INTRO s with nobody moving, then DUEL!
  const match = new Match();
  const ROUND_BREAK = 3.0;
  const ROUND_FADE = 0.35;
  const ROUND_INTRO = 1.3;
  let roundBreak = false;
  let roundIntro = 0;                                 // s left of the round's title (fighters held)
  const fadeEl = document.createElement('div');
  fadeEl.id = 'round-fade';
  sm.renderer.domElement.after(fadeEl);            // over the scene, under the HUD and the menus
  // Dobby's cameo (a fighting-game easter egg): rarely, when a duellist is stunned, he pops up in
  // the bottom-right corner with a "Toasty!" (over the HUD's help bar, under the pause screen
  // and the menus; hooked to the fighters below, once the sounds are connected)
  const cameo = new DobbyCameo(document.body, `${BASE}dobby.png`);
  document.getElementById('paused')!.before(cameo.el);
  const cameoTrigger = new CameoTrigger();
  let closeUpOn: Malfoid | null = null;            // the voice-line close-up being held
  const faceAt = new THREE.Vector3();
  const setDuel = (on: boolean) => {
    cameo.hide();                                     // not carried into a new duel or round
    duel = on;
    duelOver = 0;
    roundBreak = false;
    roundIntro = 0;
    fadeEl.classList.remove('on');                    // a new round fades back in
    if (on) {
      // a fresh start: full health, wands back, facing each other a few steps apart
      malfoidTarget.reset();
      protego.reset();
      opp.reset();
      gatherWands();
      spells.reset();
      // side by side across the screen (the camera looks along -z): Malfoid on the left
      // facing right, her opponent on the right facing left (a bounded arena: at its centre)
      if (arena?.finite) malfoid.root.position.set(arena.spawn.x - opp.def.startDistance / 2, 0, arena.spawn.z);
      opp.char.root.position.copy(malfoid.position).add(new THREE.Vector3(opp.def.startDistance, 0, 0));
      malfoid.setFacing(Math.PI / 2);
      opp.char.setFacing(-Math.PI / 2);
      cam.frame(malfoid.position, opp.char.position);
      // her face through the opening lines (held to their end when she has one of her own: Susan's
      // serious face), else her start face for a few seconds
      const introFace = intro() ? opp.def.faces.intro : undefined;
      opp.char.setExpression(introFace ?? opp.def.faces.start, introFace ? 60 : 5);
      malfoid.resetIdleTimer();                       // she starts in her stance, not the bored arms-crossed idle
      malfoid.snapToStance();                         // on their feet at once (no rising out of a knockout)
      opp.char.snapToStance();
      // the campaign's first round: the opening lines first, the fight (both fighters) starts
      // once they are said; later rounds and practice: straight into the fight
      if (intro()) voices.startIntro();
      else voices.stop();
      closeUpOn = null;
    }
    opp.ai.setActive(false);
    hud.setDuel(on);
    if (on && mode !== 'campaign') startFight();
    else if (on && !intro()) announceRound();
  };
  /** a campaign round's title (ROUND 1, ROUND 2, FINAL ROUND); the fight starts after it */
  const announceRound = () => {
    if (!duel || duelOver || opp.ai.active) return;
    if (closeUpOn) cam.frame(malfoid.position, opp.char.position);   // back to the duel view
    closeUpOn = null;
    roundIntro = ROUND_INTRO;
    if (opp.def.faces.intro) opp.char.setExpression(opp.def.faces.start, 2.5);   // the opening lines are over
    hud.announce(match.final ? 'FINAL ROUND' : `ROUND ${match.round}`, 'duel');
  };
  const intro = () => mode === 'campaign' && match.round === 1;
  const startFight = () => {
    if (!duel || duelOver || opp.ai.active) return;
    opp.ai.setActive(true);
    if (closeUpOn) cam.frame(malfoid.position, opp.char.position);   // back to the duel view
    closeUpOn = null;
    hud.announce('DUEL!', 'duel');
  };
  const finish = (winner: Malfoid) => {
    if (!duel || duelOver) return;
    duelOver = 1;
    opp.ai.setActive(false);
    if (winner === opp.char) opp.char.setExpression(opp.def.faces.win, 4);
    else if (opp.def.faces.lose) opp.char.setExpression(opp.def.faces.lose, 99);
    if (mode === 'campaign') {
      const round = match.record(winner === malfoid);
      hud.setRounds([match.malfoidWins, match.opponentWins], MATCH.toWin);
      if (!round.decided) {                           // the match goes on: the next round soon
        hud.announce(`${winner.name.toUpperCase()} WINS ROUND ${round.round}`, 'win');
        roundBreak = true;
        return;
      }
      // the match: a win teaches her the opponent's spell and the next one is up; a loss is
      // game over (the run starts again from the first opponent)
      pendingResult = round.malfoidWon ? { won: true, r: campaign.win() } : { won: false, r: campaign.lose() };
      refreshMenu();
    }
    hud.announce(`${winner.name.toUpperCase()} WINS`, 'win');
    // the winner's line: the campaign only (practice has no voice lines, like no opening lines)
    if (mode === 'campaign') voices.win(winner);
  };
  malfoidTarget.onDefeated = () => finish(opp.char);

  const input = new CharacterController(malfoid, combat);
  input.viewYaw = () => cam.getYaw();
  input.confused = () => malfoidTarget.confused;          // Confundo: her directions reversed
  // H: Protego while held (learned from Cho). Raised over a held block or crouch; not while
  // striking, casting, reacting or disarmed; letting go (or its time running out) lowers it
  input.onShield = (on) => {
    if (!on) {
      protego.lower();
      return;
    }
    if (!mySpells.has('protego') || !protego.ready) return;
    malfoid.setHold('block', false);
    malfoid.setHold('crouch', false);
    if (malfoid.canHold) protego.raise();
  };
  input.onSpell = (id) => {
    if (!mySpells.has(id)) return;                    // not learned yet (or not in this fight)
    if (!malfoid.hasWand) hud.flashStatusText('NO WAND', 'miss');
    else spells.cast(SPELL_DEFS[id]);
  };
  // mode select (start screen; "Change mode" in the HUD brings it back)
  const modeEl = document.getElementById('mode')!;
  let menuOpen = true;
  // Malfoid's spells in this mode: every spell in training and practice; in the campaign
  // Confringo and what she has learned in this run
  let mySpells: ReadonlySet<SpellId> = ALL_SPELLS;
  const helpExpelliarmus = document.getElementById('help-expelliarmus')!;
  const helpProtego = document.getElementById('help-protego')!;
  const refreshSpells = () => {
    // practice: the spells she has when she reaches this opponent in the campaign (against
    // Ginny only Confringo; nothing learned from her or anyone after her)
    mySpells = mode === 'campaign' ? campaign.spells
      : mode === 'practice' ? spellsBefore(opp.def.id) : ALL_SPELLS;
    hud.showSpell('confringo', true);
    hud.showSpell('expelliarmus', mySpells.has('expelliarmus'));
    helpExpelliarmus.hidden = !mySpells.has('expelliarmus');
    hud.showSpell('protego', mySpells.has('protego'));
    helpProtego.hidden = !mySpells.has('protego');
    if (!mySpells.has('protego')) protego.reset();
  };
  // the start menu's campaign box: continue the run (who is next, difficulty) or start
  // a new one (two clicks while a run is in progress: a stray click gives up nothing)
  const continueBtn = modeEl.querySelector<HTMLButtonElement>('.campaign .continue')!;
  const newRunEl = modeEl.querySelector<HTMLElement>('.campaign .new-run')!;
  const newRunBtns = [...modeEl.querySelectorAll<HTMLButtonElement>('.campaign .levels button')];
  let armed: HTMLButtonElement | null = null;
  let armTimer = 0;
  // the campaign's order under its title (from the campaign list: it can't drift from it)
  modeEl.querySelector('.campaign-order')!.textContent =
    `Best of ${MATCH.bestOf} · one defeat ends the run · ${CAMPAIGN.map((o) => (o.id === 'voldemort' ? 'Voldemort' : o.name.split(' ')[0])).join(', ')}`;
  const refreshMenu = () => {
    const run = campaign.run;
    const next = campaign.opponent;
    continueBtn.hidden = !run;
    if (run) {
      const status = `${run.level[0].toUpperCase()}${run.level.slice(1)}`;
      continueBtn.disabled = !next?.playable;
      continueBtn.innerHTML = next?.playable ? `Continue: ${next.name}<small>${status}</small>`
        : `Next: ${next?.name ?? 'the end'} · coming soon<small>${status}</small>`;
    }
    newRunEl.textContent = run ? 'Or start over' : 'Choose the difficulty';
    newRunEl.classList.remove('warn');
    for (const b of newRunBtns) b.classList.remove('confirm');
    armed = null;
    window.clearTimeout(armTimer);
  };
  for (const b of newRunBtns) {
    b.addEventListener('click', () => {
      b.blur();
      if (campaign.run && armed !== b) {
        refreshMenu();
        armed = b;
        b.classList.add('confirm');
        newRunEl.textContent = 'Click again to give up the current run';
        newRunEl.classList.add('warn');
        armTimer = window.setTimeout(refreshMenu, 3000);
        return;
      }
      campaign.start(b.dataset.level as Difficulty);
      enterMode('campaign');
    });
  }
  continueBtn.addEventListener('click', () => enterMode('campaign'));
  modeEl.querySelector('button[data-mode="training"]')!.addEventListener('click', () => enterMode('training'));
  // practice: pick the opponent (a chip), then the difficulty starts the fight
  let practiceOpponent: OpponentId = 'ginny';
  for (const b of modeEl.querySelectorAll<HTMLButtonElement>('.practice .levels button')) {
    b.addEventListener('click', () => enterMode('practice', b.dataset.level as Difficulty, practiceOpponent));
  }
  for (const b of modeEl.querySelectorAll<HTMLButtonElement>('.practice .opponents button')) {
    b.addEventListener('click', () => {
      b.blur();
      if (!(b.dataset.opponent! in OPPONENTS)) return;
      practiceOpponent = b.dataset.opponent as OpponentId;
      for (const o of modeEl.querySelectorAll('.practice .opponents button')) o.classList.toggle('on', o === b);
    });
  }
  // the end of a campaign match: a new spell / a win, or game over
  const resultEl = document.getElementById('result')!;
  const showResult = (res: FightResult) => {
    pendingResult = null;
    let cls: string, tag: string, title: string, how = '', next = '';
    let actions: [label: string, act: string][];
    if (res.won) {
      const { learned, beaten, next: nx } = res.r;
      if (learned) {
        const info = SPELL_INFO[learned];
        [cls, tag, title, how] = ['spell', 'New spell acquired', info.name, `Press <b>${info.key}</b> to ${info.how}`];
      } else {
        [cls, tag, title] = ['won', 'Victory', `${beaten.name.split(' ')[0]} defeated`];
      }
      next = nx ? `Next duel: <b>${nx.name}</b>${nx.playable ? '' : '<span>coming soon</span>'}` : 'The campaign is complete';
      actions = nx?.playable ? [['Next duel', 'continue'], ['Back to menu', 'menu']]
        : learned ? [['Practise it in Training', 'training'], ['Back to menu', 'menu']] : [['Back to menu', 'menu']];
    } else {
      [cls, tag, title] = ['over', `Defeated by ${res.r.opponent.name.split(' ')[0]}`, 'Game over'];
      how = `The campaign starts again from <b>${CAMPAIGN[0].name}</b>, every spell learned in it forgotten`;
      actions = [['New campaign', 'restart'], ['Back to menu', 'menu']];
    }
    resultEl.className = cls;
    // the match's score (rounds, Malfoid's first)
    resultEl.querySelector('.tag')!.textContent = `${tag} · ${match.malfoidWins}–${match.opponentWins}`;
    resultEl.querySelector('.title')!.textContent = title;
    resultEl.querySelector('.how')!.innerHTML = how;
    resultEl.querySelector('.next')!.innerHTML = next;
    const box = resultEl.querySelector('.actions')!;
    box.replaceChildren(...actions.map(([label, act], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (i === 0) b.className = 'main';
      b.addEventListener('click', () => {
        resultEl.hidden = true;
        if (act === 'continue') enterMode('campaign');
        else if (act === 'restart') {
          campaign.start(level);                        // the same difficulty as the run just lost
          enterMode('campaign');
        } else if (act === 'training') enterMode('training');
        else openMenu();
      });
      return b;
    }));
    menuOpen = true;                                  // Esc doesn't close it; a choice does
    input.setPaused(true);
    resultEl.hidden = false;
  };
  /** training; practice against `who` (default: the last one picked); the campaign's next opponent */
  const enterMode = (m: Mode, l?: Difficulty, who?: OpponentId) => {
    if (m === 'campaign') {
      if (l || !campaign.run) campaign.start(l ?? level);   // (debugging: enterMode('campaign', level) starts a run)
      const next = campaign.opponent;
      if (!next?.playable || !(next.id in OPPONENTS)) {    // the next opponent isn't in this build yet
        openMenu();
        return;
      }
      who = next.id as OpponentId;
      l = campaign.run!.level;
    }
    if (m === 'practice') who = who ?? practiceOpponent;
    if (who) setOpponent(who);
    mode = m;
    match.reset();                                    // a campaign duel starts at round 1
    hud.setRounds(m === 'campaign' ? [0, 0] : null, MATCH.toWin);
    gatherWands();                                    // nothing left lying from an earlier fight
    if (l || who) setLevel(l ?? level);
    menuOpen = false;
    modeEl.hidden = true;
    resultEl.hidden = true;
    spells.world.targets = malfoidTargets();
    dummy.root.visible = m === 'training';
    for (const o of Object.values(opponents)) o.char.root.visible = isDuel() && o === opp;
    hud.setMode(m);
    refreshSpells();
    setEnvironment(isDuel() ? arenas[opp.def.arena] : null);
    if (m === 'training') {
      voices.stop();
      closeUpOn = null;
      setDuel(false);
      malfoid.root.position.set(0, 0, 0);
      placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);
      malfoidTarget.reset();
      protego.reset();
    } else {
      // the duel starts in the spawn clearing of the woods
      malfoid.root.position.set(arena!.spawn.x - opp.def.startDistance / 2, 0, arena!.spawn.z);
      setDuel(true);
    }
    input.setPaused(false);
  };
  const openMenu = () => {
    if (pendingResult) {                              // left during the winner's line: the result first
      voices.stop();
      setDuel(false);
      showResult(pendingResult);
      return;
    }
    refreshMenu();
    menuOpen = true;
    voices.stop();
    closeUpOn = null;
    setDuel(false);
    input.setPaused(true);
    modeEl.hidden = false;
  };
  hud.onModeButton = openMenu;
  // G / the HUD button: a fresh duel, in practice only (a campaign fight can't be restarted)
  input.onDuel = () => { if (mode === 'practice') setDuel(true); };
  hud.onDuelButton = () => { if (mode === 'practice') setDuel(true); };
  // the arenas (each opponent's definition names hers; training keeps the studio): the
  // Forbidden Woods, the Quidditch Pitch, the Herbology Greenhouse, the Ravenclaw common room. Built
  // once; only the current one is shown and updated.
  const woods = new ForestArena(sm.scene);
  const arenas: Record<OpponentDef['arena'], Arena> = { woods, pitch: new PitchArena(sm.scene),
    greenhouse: new GreenhouseArena(sm.scene), ravenclaw: new RavenclawArena(sm.scene), greathall: woods };
  let arena: Arena | null = null;
  // spells hit trunks and stands: every caster shares one list of solids, refilled each frame
  spells.world.solids = solids;
  const setEnvironment = (next: Arena | null) => {
    for (const a of Object.values(arenas)) if (a !== next) a.setActive(false);
    arena = next;
    sm.setEnvironment(next ? next.kind : 'studio', next ? next.look() : STUDIO_LOOK);
    next?.setActive(true);
    cam.limit = next?.cameraLimit ?? null;
    solids.length = 0;
  };
  const guards: Guard[] = ['none', 'high', 'low'];
  input.onDummyGuard = () => dummy.setGuard(guards[(guards.indexOf(dummy.guard) + 1) % guards.length]);
  input.onDummyReset = () => placeDummy(0, DUMMY_DISTANCE);
  cam.reset(malfoid.position);
  malfoid.resetIdleTimer();          // the countdown starts when she appears
  document.getElementById('reset-camera')!.addEventListener('click', (e) => {
    cam.reset(malfoid.position);
    (e.currentTarget as HTMLButtonElement).blur();     // keep WASD working
  });
  document.getElementById('loading')!.remove();

  const pausedEl = document.getElementById('paused')!;
  // sound effects (public/sfx); M mutes
  const combatSounds = connectCombatSounds(sfx, { malfoid, combat, spells, malfoidShield: protego,
    opponents: Object.values(opponents), fighters: [malfoidTarget, ...Object.values(opponents).map((o) => o.target)] });
  // a stun (a stagger, after Susan's Resolve) during a fight: now and then, Dobby
  for (const t of [malfoidTarget, ...Object.values(opponents).map((o) => o.target)]) {
    const prev = t.onReaction;
    t.onReaction = (effect) => {
      prev?.(effect);
      if (effect !== 'stagger' || !duel || duelOver || !cameoTrigger.stunned()) return;
      cameo.show();
      sfx.play('toasty', { volume: CAMEO.volume });
    };
  }
  // the volume control: on the start menu and the pause screen
  const volume = new VolumeControl(sfx, document.querySelectorAll<HTMLElement>('.volume'));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat) return;
    sfx.setMuted(!sfx.muted);
    volume.refresh();
    hud.flashStatusText(sfx.muted ? 'SOUND OFF' : 'SOUND ON', 'miss');
  });
  input.onPauseChange = (p) => {
    sfx.setPaused(p);
    pausedEl.hidden = !p || menuOpen;
    if (!p && menuOpen) input.setPaused(true);          // Esc doesn't skip the mode select
  };
  input.setPaused(true);                                // the mode select comes first
  modeEl.hidden = false;
  hud.setMode('training');
  refreshSpells();
  refreshMenu();
  // click to resume, but not at the end of a volume drag released outside the control
  let pressInVolume = false;
  pausedEl.addEventListener('pointerdown', (e) => (pressInVolume = !!(e.target as Element).closest('.volume')));
  pausedEl.addEventListener('click', () => {
    if (!pressInVolume) input.setPaused(false);
  });
  // automated playtests: an AI in the player's place (window.setPlayerBot; never set in play)
  let playerBot: { update(dt: number): void } | null = null;
  const setPlayerBot = (bot: { update(dt: number): void } | null) => (playerBot = bot);
  const stateEl = document.getElementById('state')!;
  const fpsEl = document.getElementById('fps')!;
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTime = 0;
  let lastState = '';

  // the duel camera frames Malfoid and her opponent; while Luna's copies are out, the middle of
  // them all (framing her alone would give her away)
  const focus = new THREE.Vector3();
  const keepIn = (p: THREE.Vector3) => arena?.resolve(p, 0.8);
  const wandAt = new THREE.Vector3();
  const duelFocus = (): THREE.Vector3 => {
    focus.copy(opp.char.position);
    let n = 1;
    for (const c of opp.illusions?.shown() ?? []) {
      focus.add(c.position);
      n++;
    }
    return focus.divideScalar(n);
  };
  sm.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!input.paused) {
      // during the opening lines and a round's title nobody moves: Malfoid's controls are
      // locked, the AI is off
      if (roundIntro > 0 && (roundIntro -= dt) <= 0) startFight();
      input.locked = duel && (voices.introRunning || roundIntro > 0);
      if (input.locked) malfoid.resetIdleTimer();     // listening, not bored: no arms-crossed idle
      input.update();
      playerBot?.update(dt);                // automated playtests drive Malfoid (debug only)
      const duelMode = isDuel();
      const foe = opp.char;
      // a slowed fighter (Impedimenta) lives at a fraction of the game's time: moving, striking
      // and casting (her bolts in flight too) all slow down together
      const mdt = dt * malfoidTarget.timeScale;
      const fdt = dt * opp.target.timeScale;
      if (duelMode) opp.ai.update(fdt);
      combat.update(mdt);
      if (duelMode) opp.combat.update(fdt);
      voices.update(dt);                    // voice lines and mouths: before the pose update applies them
      malfoid.update(mdt);
      if (duelMode) foe.update(fdt);
      spells.update(mdt);                   // after the pose update: the wand tip is where it is drawn
      protego.update(mdt);
      protegoFx.update(dt);
      if (duelMode) {
        opp.spells.update(fdt);
        if (opp.illusions) opp.illusions.world = arena;   // her copies keep out of walls and furniture
        opp.ai.keepIn = keepIn;                           // where she heads for stays in the arena
        opp.update(fdt, solids);            // her shield, her healing charm, her birds and copies
      }
      combatSounds.update(dt);              // footsteps follow the poses just updated
      malfoidTarget.update(dt);
      opp.target.update(dt);
      slowFx.update(dt);
      confusionFx.update(dt);
      if (duelMode) {
        keepApart(malfoid.position, foe.position, FIGHTER_GAP, 0.5);
        const ar = arena!;
        ar.resolve(malfoid.position, 0.28);               // trunks, the stands' barrier, hoop posts
        ar.resolve(foe.position, 0.28);
        ar.fillSolids(solids, [malfoid.position, foe.position]);
        // a wand knocked away always lies where a fighter can reach it (not on a bench or a table)
        for (const c of [malfoid, foe]) {
          if (c.wand.state !== 'dropped') continue;
          const w = c.wand.getWorldPosition(wandAt);
          const x = w.x, z = w.z;
          ar.resolve(w, 0.35);
          if (Math.abs(w.x - x) + Math.abs(w.z - z) > 1e-4) c.wand.moveDropped(w.x, w.z);
        }
        ar.update(dt, malfoid.position, [malfoid.position, foe.position], sm.camera, sm.renderer.domElement.height);
      }
      else if (!dummy.down) keepApart(malfoid.position, dummy.position, DUMMY_RADIUS + 0.22);
      if (!duelMode) dummy.update(dt, malfoid.position);
      hud.update(dt);
      cameoTrigger.update(dt);
      cameo.update(dt);
      if (duelOver) {
        duelOver += dt;
        // a round of a campaign match: dip to dark, then the next round
        if (roundBreak && duelOver > ROUND_BREAK - ROUND_FADE) fadeEl.classList.add('on');
        if (roundBreak && duelOver > ROUND_BREAK && duel) setDuel(true);
        // after the winner's line: the campaign's result screen, or (practice) a rematch
        else if (!roundBreak && duelOver > 4 && duel && !(pendingResult && voices.speaking)) {
          setDuel(false);
          if (pendingResult) showResult(pendingResult);
          else hud.announce('G: FIGHT AGAIN', 'duel');
        }
      }
    }
    hud.setDummy(dummy.hp, dummy.guard);
    hud.setSpell('confringo', spells.cooldownLeft(CONFRINGO), CONFRINGO.cooldown, malfoid.hasWand);
    if (mySpells.has('expelliarmus')) hud.setSpell('expelliarmus', spells.cooldownLeft(EXPELLIARMUS), EXPELLIARMUS.cooldown, malfoid.hasWand);
    if (mySpells.has('protego')) hud.setSpell('protego', protego.cooldownLeft, PROTEGO.cooldown, malfoid.hasWand);
    hud.setFighters(malfoidTarget, opp.target, duel ? opp.ai.state : null);
    spellFx.setView(sm.camera, sm.renderer.domElement.height);
    ginnyFx.setView(sm.camera, sm.renderer.domElement.height);
    opp.setView(sm.camera, sm.renderer.domElement.height);
    // voice lines: cut to a close-up of whoever speaks (her mouth is readable) and hold it
    // through the pause between the opening lines; the fight cuts back to the duel view
    const speaker = voices.speaking as Malfoid | null;
    if (!input.paused && speaker && speaker !== closeUpOn && !cam.manual) {
      cam.closeUp(speaker.facePosition(faceAt), speaker.facingAngle);
      closeUpOn = speaker;
    } else if (closeUpOn && !speaker && !voices.introRunning) {
      closeUpOn = null;                     // a win line ended: the follow camera eases back out
    }
    cam.update(malfoid.position, input.paused || closeUpOn ? undefined : {
      heading: malfoid.facingAngle, speed: malfoid.moveSpeed,
      other: isDuel() && !menuOpen ? duelFocus() : null,
    });
    sm.followShadow(malfoid.position);
    sm.render();

    if (malfoid.state !== lastState) {
      lastState = malfoid.state;
      stateEl.textContent = lastState;
    }
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = String(Math.round(frames / fpsTime));
      frames = 0;
      fpsTime = 0;
    }
  });
  // expose for debugging / automated checks
  const g = opponents.ginny;
  const c = opponents.cho;
  const su = opponents.susan;
  const lu = opponents.luna;
  const he = opponents.hermione;
  Object.assign(window, { sfx, volume, voices, malfoid, cam, combat, dummy, spells, spellFx, ginnyFx, malfoidTarget,
    // Ginny's systems by their old names, Cho's, and whoever is being duelled
    ginny: g.char, ginnyCombat: g.combat, ginnySpells: g.spells, ginnyTarget: g.target, ai: g.ai,
    cho: c.char, choCombat: c.combat, choSpells: c.spells, choTarget: c.target, choAi: c.ai, choProtego: c.protego,
    susan: su.char, susanCombat: su.combat, susanSpells: su.spells, susanTarget: su.target, susanAi: su.ai, susanEpiskey: su.episkey, slowFx,
    luna: lu.char, lunaAi: lu.ai, lunaSpells: lu.spells, lunaTarget: lu.target, lunaFlock: lu.flock, lunaIllusions: lu.illusions,
    hermione: he.char, hermioneAi: he.ai, hermioneSpells: he.spells, hermioneTarget: he.target, hermioneBarrage: he.barrage,
    hermioneOpp: he,
    confusionFx,
    protego, protegoFx, cameo, cameoTrigger,
    opponents, opp: () => opp, setOpponent, setPlayerBot, FighterAI, DIFFICULTY,
    setDuel, enterMode, openMenu, match, setLevel, getLevel: () => level, CONFRINGO, EXPELLIARMUS, campaign, arenas, arena: () => arena, forest: (arenas.woods as ForestArena).world,
    renderer: sm.renderer, scene: sm.scene, input, solids });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = 'Failed to load Malfoid: ' + String(err);
});
