import './styles/main.css';
import * as THREE from 'three';
import { SceneManager, STUDIO_LOOK } from './scene/SceneManager';
import { FOREST_CONFIG, ForestWorld, forestLook, SPAWN_CENTRE } from './scene/forest';
import { CameraController } from './camera/CameraController';
import { Malfoid } from './character/Malfoid';
import { CharacterController } from './character/CharacterController';
import { TrainingDummy, DUMMY_RADIUS, Guard } from './combat/TrainingDummy';
import { ComboSystem } from './combat/ComboSystem';
import { FighterTarget } from './combat/FighterTarget';
import { CombatHud } from './ui/CombatHud';
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
import { ALL_SPELLS, CAMPAIGN, CAMPAIGN_LIVES, Campaign, LossResult, SPELL_INFO, SpellId, WinResult } from './game/campaign';
import { OPPONENTS, OpponentId } from './game/opponents';
import { Opponent } from './game/Opponent';

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
  const solids: THREE.Box3[] = [];
  // training: the dummy in the studio; practice (any opponent, every spell, straight into the
  // fight) and the campaign (opponents in order, lives, spells learned): a duel in the woods
  type Mode = 'training' | 'practice' | 'campaign';
  let mode: Mode = 'training';
  const isDuel = () => mode !== 'training';
  let opp: Opponent;                                  // whom Malfoid duels (set below)
  const malfoidTargets = () => (isDuel() ? [opp.target] : [dummy]);
  const combat = new ComboSystem(malfoid, malfoidTargets);
  const hud = new CombatHud(sm.camera, document.getElementById('hud')!);
  combat.onEvent = (e) => hud.handle(e);

  // spells: each caster casts from her own wand tip; Malfoid's spells hit the dummy or her
  // opponent, the opponent's hit Malfoid. One effect pool per look (each lit pool adds point
  // lights to every lit material): Malfoid's Expelliarmus shares Ginny's red pool (a charge
  // orb each); Malfoid's spell system advances both of her pools (it runs in every mode)
  const spellFx = new ConfringoFx(sm.scene);
  const ginnyFx = new ConfringoFx(sm.scene, EXPELLIARMUS_LOOK, 'expelliarmus_fx');
  const spells = new SpellSystem(malfoid, malfoid.spellEmitter, () => combat.busy,
    new SpellFxSet({ confringo: spellFx, expelliarmus: ginnyFx }, [spellFx, ginnyFx]), { solids, groundY: 0 });
  spells.onEvent = (e) => {
    hud.handleSpell(e);
    if (e.type === 'hit' && e.disarmed) hud.announce('DISARMED!', 'disarm');
    // her spell met the opponent's shield: stopped, or (a parry) sent straight back at her
    if (e.type === 'shielded') hud.flashStatusText('PROTEGO', 'miss');
    if (e.type === 'reflected') hud.announce('REFLECTED!', 'disarm');
  };
  hud.addSpell('confringo', CONFRINGO.name, 'L', 'confringo');
  hud.addSpell('expelliarmus', SPELL_INFO.expelliarmus.name, SPELL_INFO.expelliarmus.key, 'expelliarmus');
  const SPELL_DEFS: Record<SpellId, typeof CONFRINGO> = { confringo: CONFRINGO, expelliarmus: EXPELLIARMUS };

  // the campaign run: lives, the next opponent, the spells learned (remembered in this browser)
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
    o.combat.onEvent = (e) => hud.handle(e);
    o.spells.onEvent = (e) => {
      hud.handleSpell(e);
      if (e.type === 'hit' && e.disarmed) {
        hud.announce('DISARMED!', 'disarm');
        o.char.setExpression(o.def.faces.disarmedFoe, 1.6);
      }
    };
    o.target.onDefeated = () => { if (o === opp) finish(malfoid); };
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
  voices.onIntroDone = () => startFight();
  let duel = false;
  let duelOver = 0;
  let closeUpOn: Malfoid | null = null;            // the voice-line close-up being held
  const faceAt = new THREE.Vector3();
  const setDuel = (on: boolean) => {
    duel = on;
    duelOver = 0;
    if (on) {
      // a fresh start: full health, wands back, facing each other a few steps apart
      malfoidTarget.reset();
      opp.reset();
      if (!malfoid.hasWand) malfoid.wand.retrieve();
      spells.reset();
      // side by side across the screen (the camera looks along -z): Malfoid on the left
      // facing right, her opponent on the right facing left
      opp.char.root.position.copy(malfoid.position).add(new THREE.Vector3(opp.def.startDistance, 0, 0));
      malfoid.setFacing(Math.PI / 2);
      opp.char.setFacing(-Math.PI / 2);
      cam.frame(malfoid.position, opp.char.position);
      opp.char.setExpression(opp.def.faces.start, 5);
      malfoid.resetIdleTimer();                       // she starts in her stance, not the bored arms-crossed idle
      // campaign: the opening lines first, the fight (both fighters) starts once they are
      // said; practice: straight into the fight
      if (mode === 'campaign') voices.startIntro();
      else voices.stop();
      closeUpOn = null;
    }
    opp.ai.setActive(false);
    hud.setDuel(on);
    if (on && mode !== 'campaign') startFight();
  };
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
    hud.announce(`${winner.name.toUpperCase()} WINS`, 'win');
    if (mode === 'campaign') {
      // a win teaches her the opponent's spell and the next one is up; a loss costs a life
      pendingResult = winner === malfoid ? { won: true, r: campaign.win() } : { won: false, r: campaign.lose() };
      hud.setLives(campaign.run?.lives ?? 0, CAMPAIGN_LIVES);
      refreshMenu();
    }
    if (winner === opp.char) opp.char.setExpression(opp.def.faces.win, 4);
    else if (opp.def.faces.lose) opp.char.setExpression(opp.def.faces.lose, 99);
    // the winner's line: the campaign only (practice has no voice lines, like no opening lines)
    if (mode === 'campaign') voices.win(winner);
  };
  malfoidTarget.onDefeated = () => finish(opp.char);

  const input = new CharacterController(malfoid, combat);
  input.viewYaw = () => cam.getYaw();
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
  const refreshSpells = () => {
    mySpells = mode === 'campaign' ? campaign.spells : ALL_SPELLS;
    hud.showSpell('confringo', true);
    hud.showSpell('expelliarmus', mySpells.has('expelliarmus'));
    helpExpelliarmus.hidden = !mySpells.has('expelliarmus');
  };
  // the start menu's campaign box: continue the run (who is next, lives, difficulty) or start
  // a new one (two clicks while a run is in progress: a stray click gives up nothing)
  const continueBtn = modeEl.querySelector<HTMLButtonElement>('.campaign .continue')!;
  const newRunEl = modeEl.querySelector<HTMLElement>('.campaign .new-run')!;
  const newRunBtns = [...modeEl.querySelectorAll<HTMLButtonElement>('.campaign .levels button')];
  let armed: HTMLButtonElement | null = null;
  let armTimer = 0;
  const refreshMenu = () => {
    const run = campaign.run;
    const next = campaign.opponent;
    continueBtn.hidden = !run;
    if (run) {
      const status = `${'♥'.repeat(run.lives)} · ${run.level[0].toUpperCase()}${run.level.slice(1)}`;
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
  // the end of a campaign fight: a new spell / a win, a lost life, or game over
  const resultEl = document.getElementById('result')!;
  const showResult = (res: FightResult) => {
    pendingResult = null;
    const hearts = (n: number) => `<span class="hearts">${'♥'.repeat(n)}<span class="gone">${'♥'.repeat(CAMPAIGN_LIVES - n)}</span></span>`;
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
    } else if (!res.r.gameOver) {
      const n = res.r.lives;
      [cls, tag, title] = ['lost', 'Defeated', 'Try again'];
      how = `${hearts(n)}<br>${n} ${n === 1 ? 'life' : 'lives'} left`;
      next = `Next duel: <b>${res.r.opponent.name}</b> again`;
      actions = [['Fight again', 'continue'], ['Back to menu', 'menu']];
    } else {
      [cls, tag, title] = ['over', 'Out of lives', 'Game over'];
      how = `The campaign starts again from <b>${CAMPAIGN[0].name}</b>`;
      actions = [['New campaign', 'restart'], ['Back to menu', 'menu']];
    }
    resultEl.className = cls;
    resultEl.querySelector('.tag')!.textContent = tag;
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
      hud.setLives(campaign.run!.lives, CAMPAIGN_LIVES);
    }
    if (m === 'practice') who = who ?? practiceOpponent;
    if (who) setOpponent(who);
    mode = m;
    if (l || who) setLevel(l ?? level);
    menuOpen = false;
    modeEl.hidden = true;
    resultEl.hidden = true;
    spells.world.targets = malfoidTargets();
    dummy.root.visible = m === 'training';
    for (const o of Object.values(opponents)) o.char.root.visible = isDuel() && o === opp;
    hud.setMode(m);
    refreshSpells();
    setEnvironment(isDuel());
    if (m === 'training') {
      voices.stop();
      closeUpOn = null;
      setDuel(false);
      malfoid.root.position.set(0, 0, 0);
      placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);
      if (!malfoid.hasWand) malfoid.wand.retrieve();
      malfoidTarget.reset();
    } else {
      // the duel starts in the spawn clearing of the woods
      malfoid.root.position.set(SPAWN_CENTRE.x - opp.def.startDistance / 2, 0, SPAWN_CENTRE.z);
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
  // the Forbidden Woods: the duel's environment (training keeps the studio)
  const forest = new ForestWorld(FOREST_CONFIG);
  sm.scene.add(forest.group);
  forest.atmosphere.setMoon(new THREE.Vector3(...FOREST_CONFIG.moonOffset));
  // spells hit trunks: every caster shares one list of solids, refilled each frame
  spells.world.solids = solids;
  const setEnvironment = (woods: boolean) => {
    sm.setEnvironment(woods ? 'woods' : 'studio', woods ? forestLook() : STUDIO_LOOK);
    forest.setActive(woods);
    if (!woods) solids.length = 0;
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
  const combatSounds = connectCombatSounds(sfx, { malfoid, combat, spells,
    opponents: Object.values(opponents), fighters: [malfoidTarget, ...Object.values(opponents).map((o) => o.target)] });
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

  sm.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!input.paused) {
      // during the opening lines nobody moves: Malfoid's controls are locked, the AI is off
      input.locked = duel && voices.introRunning;
      if (input.locked) malfoid.resetIdleTimer();     // listening, not bored: no arms-crossed idle
      input.update();
      playerBot?.update(dt);                // automated playtests drive Malfoid (debug only)
      const duelMode = isDuel();
      const foe = opp.char;
      if (duelMode) opp.ai.update(dt);
      combat.update(dt);
      if (duelMode) opp.combat.update(dt);
      voices.update(dt);                    // voice lines and mouths: before the pose update applies them
      malfoid.update(dt);
      if (duelMode) foe.update(dt);
      spells.update(dt);                    // after the pose update: the wand tip is where it is drawn
      if (duelMode) {
        opp.spells.update(dt);
        opp.update(dt);                     // her shield
      }
      combatSounds.update(dt);              // footsteps follow the poses just updated
      malfoidTarget.update(dt);
      opp.target.update(dt);
      if (duelMode) {
        keepApart(malfoid.position, foe.position, FIGHTER_GAP, 0.5);
        forest.resolve(malfoid.position, 0.28);           // trunks are solid; nothing else is
        forest.resolve(foe.position, 0.28);
        forest.fillSolids(solids, [malfoid.position, foe.position]);
        forest.update(dt, malfoid.position, [malfoid.position, foe.position], sm.camera, sm.renderer.domElement.height);
      }
      else if (!dummy.down) keepApart(malfoid.position, dummy.position, DUMMY_RADIUS + 0.22);
      if (!duelMode) dummy.update(dt, malfoid.position);
      hud.update(dt);
      if (duelOver) {
        duelOver += dt;
        // after the winner's line: the campaign's result screen, or (practice) a rematch
        if (duelOver > 4 && duel && !(pendingResult && voices.speaking)) {
          setDuel(false);
          if (pendingResult) showResult(pendingResult);
          else hud.announce('G: FIGHT AGAIN', 'duel');
        }
      }
    }
    hud.setDummy(dummy.hp, dummy.guard);
    hud.setSpell('confringo', spells.cooldownLeft(CONFRINGO), CONFRINGO.cooldown, malfoid.hasWand);
    if (mySpells.has('expelliarmus')) hud.setSpell('expelliarmus', spells.cooldownLeft(EXPELLIARMUS), EXPELLIARMUS.cooldown, malfoid.hasWand);
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
      other: isDuel() && !menuOpen ? opp.char.position : null,
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
  Object.assign(window, { sfx, volume, voices, malfoid, cam, combat, dummy, spells, spellFx, ginnyFx, malfoidTarget,
    // Ginny's systems by their old names, Cho's, and whoever is being duelled
    ginny: g.char, ginnyCombat: g.combat, ginnySpells: g.spells, ginnyTarget: g.target, ai: g.ai,
    cho: c.char, choCombat: c.combat, choSpells: c.spells, choTarget: c.target, choAi: c.ai, choProtego: c.protego,
    opponents, opp: () => opp, setOpponent, setPlayerBot, FighterAI, DIFFICULTY,
    setDuel, enterMode, openMenu, setLevel, getLevel: () => level, CONFRINGO, EXPELLIARMUS, campaign, forest,
    renderer: sm.renderer, scene: sm.scene, input, solids });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = 'Failed to load Malfoid: ' + String(err);
});
