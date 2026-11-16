# malfoid-3d

An anime-style 3D fighting game in the browser: **Malfoid**, a Slytherin student, duels Harry
Potter's potential romantic interests (and a Hufflepuff who simply wants her stopped) one by
one, with fists, kicks and spells, then Harry himself, Bellatrix Lestrange, and finally Lord
Voldemort. Built with Three.js + TypeScript + Vite.

Like Mega Man, every opponent Malfoid beats in the campaign teaches her a spell: beating Ginny
teaches her **Expelliarmus**. **Ginny Weasley** and **Cho Chang**, the first two opponents, are
playable; the rest of the campaign is planned. The built characters
(`public/models/*.glb`) and sound effects (`public/sfx/`) are included, so the game runs straight
from a clone.

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). `npm run build` produces a static
site in `dist/`.

## Modes

The start screen offers three modes:

- **Training:** Malfoid against a training dummy in the studio scene, no opponent, with every
  spell, to practise strikes, combos and spells.
- **Practice:** pick an opponent and a difficulty and fight straight away, with the spells
  Malfoid has when she reaches that opponent in the campaign (Ginny: Confringo only; Cho: and
  Expelliarmus; Susan: and Protego; Luna: and Impedimenta; Hermione: and Illusio), and no voice lines.
  **G** restarts the fight. Ginny, Cho, Susan, Luna or Hermione; a Malfoid mirror match is listed as coming soon.
- **Campaign:** choose the difficulty once, at the start, and fight the opponents in order
  (Ginny, then Cho, then Susan Bones, ...). Each duel is a **best-of-three match**: the first to
  win two rounds takes it (win–win, win–lose–win and lose–win–win are victories; lose–lose,
  lose–win–lose and win–lose–lose are defeats). Only the match counts:
  - a win teaches Malfoid the opponent's spell and moves on to the next opponent;
  - a loss is **game over**: there are no lives, so the run starts again from Ginny, at the
    difficulty chosen again, and the spells learned are forgotten.

  Between rounds the screen dips to dark and both fighters start over in the same arena: full
  health, wands back, every cooldown and healing charge reset. The HUD shows each side's round
  wins (● ○) by her name. A campaign fight can't be restarted with G. The run (difficulty, the
  next opponent, the spells learned) is remembered in the browser, so the start screen offers
  to continue it; starting a new run while one is in progress takes a second click. The rules
  are in `src/game/campaign.ts` and `src/game/match.ts`.

Each opponent has her arena:

- **Forbidden Woods** (Ginny): an infinite procedural forest that streams in chunks around the
  player, with no walls. See `src/scene/forest/` and `docs/forest/REPORT.md`; all values are in
  `src/scene/forest/config.ts`.
- **Quidditch Pitch** (Cho): a finite, bounded stadium generated in code. An oval grass field
  with mown stripes and chalk lines, six goal hoops, timber grandstands with house canopies and
  banners, twelve house towers, and hills, trees and the castle beyond, in daylight. The fighters
  stay inside a low barrier at the foot of the stands, spells burst on it, and the camera stays
  on the pitch. See `docs/pitch/REPORT.md`; all values are in `src/scene/pitch/config.ts`.
- **Herbology Greenhouse** (Susan): a finite Victorian glasshouse generated in code.
  - **Structure:** a brick plinth, iron-framed glass walls and a barrel-vaulted glass roof.
  - **Planting:** potting benches and staging full of potted plants along both long walls,
    planters of palms at the ends (a path through the east one to the door), hanging baskets, ivy
    and Hufflepuff banners.
  - **The fight:** on the stone floor in the middle. The fighters can't walk into the benches
    or planters (they can walk up the path to the closed door), spells burst on the plants, and the camera never stands behind the plants.
  - **Outside:** the Hogwarts grounds and castle, seen through the glass.
  - See `docs/greenhouse/REPORT.md`; all values are in `src/scene/greenhouse/config.ts`.
- **Ravenclaw Common Room** (Luna): a finite, round tower room generated in code, at night.
  - **The room:** arched windows onto a starry sky and the mountains, blue silks and eagle
    banners between them, a dome painted with stars and ribbed in bronze, and candles floating
    under it.
  - **Round the wall:** bookcases, tables with chairs, blue armchairs, and Rowena Ravenclaw's
    white marble statue in a niche, facing the duel camera.
  - **The fight:** across the whole room, mostly on the round midnight-blue carpet with its
    bronze stars. The fighters walk round the tables, armchairs and statue up to the bookcases at
    the wall, and spells burst on the furniture and the walls.
  - All values are in `src/scene/ravenclaw/config.ts`.
- **The Great Hall** (Hermione): a finite, long stone hall generated in code, at night.
  - **The hall:** tall pointed windows down both walls, house banners between them, the
    entrance doors at one end and the staff's high table on its dais at the other, with the
    golden owl lectern; 140 candles float overhead under the enchanted ceiling (the night sky).
  - **The tables:** the four house tables and their benches run the length of the hall, set
    with plates, goblets, jugs and dishes. The plates are Hermione's ammunition: her barrage
    lifts them off the nearest places, and every plate is back for each duel or round.
  - **The fight:** it starts in the wide central aisle (about 11 m clear between the benches). The fighters walk the whole floor round
    the tables, benches and dais; spells fly over the tables and burst on the walls, benches,
    dais and high table. The camera rises over the tables (high enough that their plates and
    goblets don't fill the view, and to see the fighters' feet past them).
  - All values are in `src/scene/greathall/config.ts`.

## Opponents

The campaign, in order (the planned roster; see the status column for what is in the game):

| Stage | Opponent | Combat challenge | Story purpose | Spell unlocked | Status |
|---|---|---|---|---|---|
| 1 | Ginny Weasley | Aggressive, close-range fighter | Establish the romantic rivalry | Expelliarmus | playable |
| 2 | Cho Chang | Evasion, counters, precision | Another romantic rival | Protego | playable |
| 3 | Susan Bones | Defence, resilience | The only Hufflepuff, and the first who ignores the rivalry: she wants Malfoid stopped | Impedimenta | playable ([design](docs/susan/DESIGN.md)) |
| 4 | Luna Lovegood | Unpredictable, chaotic spellcasting | Comic relief before the darker story | Illusio | playable ([report](docs/luna/REPORT.md)) |
| 5 | Hermione Granger | Tactical, intelligent, versatile | Final challenging school duel | – | playable ([report](docs/hermione/REPORT.md)) |
| 6 | Harry Potter | Superior duellist; scripted defeat | Major turning point | – | planned |
| 7 | Bellatrix Lestrange | Cruel, relentless, uses Unforgivable Curses | First genuinely terrifying boss | – | planned |
| 8 | Lord Voldemort | Final boss; lethal magic | The end of the campaign | – | planned |

The game follows this order (`src/game/campaign.ts`): after Hermione, the campaign shows Harry
Potter as the next duel (coming soon).

Each opponent is built by the same character pipeline as Malfoid (their own profile in
`tools/blender/malfoid/character.py`), with their own expressions, voice lines, signature
spells and AI tuning.

### Ginny Weasley

The duel against Ginny has three difficulties:

| Level | Ginny's HP | How she fights |
|---|---|---|
| Easy | 100 | the original Ginny: slow to react, rarely blocks, random strikes |
| Normal | 160 | faster reactions; guards up when you're close and after taking a hit; counters blocked strikes; punishes openings; reads your wand wind-up to dodge Confringo; real combos; stays close while you have your wand |
| Hard | 240 | all of the above, quicker and more often |

When she moves while facing Malfoid (backing off, stepping round her) her legs follow the way she
goes: a reversed walk backwards, a side-step sideways; her dodge is a quick sidestep.

Ginny's signature spell is Expelliarmus. It knocks Malfoid's wand out of her hand, and the wand
lands on the floor inside a ring. Until Malfoid walks over and picks it up, she can only fight
with her fists. See `docs/ginny/REPORT.md` for details.

### Cho Chang

The Ravenclaw seeker: an evasive duellist who fights from range and punishes predictable attacks,
above all repeated Confringos. See `docs/cho/REPORT.md`.

- **Spacing:** she keeps 4–7 m away and circles round you (trunks turn her back), steps back
  when you crowd her, closes in when you are far.
- **Stupefy:** a fast bright-red bolt (8 damage, a stagger, 4 s), her counterattack after a
  dodge, a stopped spell, or an opening (a whiffed heavy strike, a cast, a stagger).
- **Ventus:** a short, wide gust that throws you back (3 damage, 7 s) when you crowd her.
- **Protego:** a shield before her for up to 0.9 s, then 5 s before she can raise it again.
  It stops spells from the front; raised just as a spell arrives (within 0.2 s) it **sends it
  back** at you. Lowering it leaves her slow for a moment. Melee hits it like a guard.
- **Seeker's reflex:** quick sidesteps and back-steps (real movement, no teleport).
- **Not omniscient:** she reacts after a delay, often just takes the hit, and her parries are
  only sometimes timed right; the more Confringos you throw in quick succession, the readier
  she is for the next.

| Level | Cho's HP | How she fights |
|---|---|---|
| Easy | 100 | slow reactions, rarely shields, seldom parries, few counters |
| Normal | 130 | quicker; shields and counters more, parries now and then |
| Hard | 170 | sharp reactions, frequent dodges and counters, the best-timed parries |

### Susan Bones

The only Hufflepuff, a defensive duellist: not fast or aggressive, but stubborn and very hard
to put down. She stands her ground and makes you work for every hit. See `docs/susan/REPORT.md`.

- **Holding her ground:** she waits at middle distance and walks in only when you are far. She
  guards a lot and holds her guard. Against a spell she sees you cast at her, she raises
  **Protego** when it is ready (now and then timed to send the spell back), or else her guard
  (chip damage only). No dodging.
- **Impedimenta:** a cold blue bolt (4 damage, 6 s) that **slows you to 55 % for 2.5 s**
  (moving, striking and casting). She uses it when you rush at her. Blue rings at your legs
  show the slow.
- **Expelliarmus:** she alternates it with Impedimenta at range, while you still have your wand.
- **Depulso:** a violet bolt that throws you well back (9 damage, 7 m range, 8 s) when you crowd
  or attack her.
- **Punishing a rush:** run straight into her reach and she may strike first.
- **No healing:** she used to heal with Episkey; it was removed (on Hard it made her a wall once
  the stun-lock exploit was fixed).
- **Hufflepuff Resolve:** a stagger only makes her flinch, a knockdown only knocks her back,
  and she is pushed 40 % less.
- **More determined, not more aggressive:** below half health her face hardens and she guards
  more.
- She fights in the Herbology Greenhouse. In the campaign Malfoid opens the duel and Susan replies;
  each has a win line.

| Level | Susan's HP | How she fights |
|---|---|---|
| Easy | 120 | slow reactions, guards half the time, seldom answers a rush |
| Normal | 150 | quicker; guards and counters more; meets most rushes and spells |
| Hard | 190 | sharp reactions, a stubborn guard, real combos |

### Luna Lovegood

A Ravenclaw and the most unpredictable duellist: an illusion-and-disruption fighter rather than a
damage dealer. Randomness shapes her decisions, never her attacks' tells: every spell has its
own wind-up and wand glow, so it can be read and answered. See `docs/luna/REPORT.md`.

- **Confundo:** a lilac bolt (3 damage, 8 s). A hit **reverses your directions** (W and S, A
  and D, running included) for 2-3 s; attacks, guard and spells still work. Stars circle your
  head and CONFUNDED! shows. A block stops it. She fires it into a rush or an attack.
- **Expelliarmus:** she alternates it with Confundo at range, and fires it into your own cast
  while you still have your wand.
- **Oppugno:** she raises her wand high (a gold glow) and a small flock of yellow birds chases
  you, each landing a small hit (3, a flinch), one after another. They turn at a limited rate
  and, close in, commit to a dive: step aside as they dive and most shoot past. Your guard takes
  each as chip damage, walls stop them, Protego pops them, and a perfectly timed Protego sends
  one back at her.
- **Illusio:** she draws a circle overhead (a silver glow) and 2-3 copies of her appear. They
  skip about, circle and mimic her casts, but deal no damage. As they appear, she is shuffled
  among them. Any hit pops a copy (ILLUSION!), and only the copy: a spell bursting on one harms no
  one else, Luna included. Walking into one pops it, and hitting her makes them all vanish. The tells: **copies cast no shadow**, they mimic her casts a beat late with
  no bolt and no glow, and only she ever acts on her own. The duel camera frames the whole group,
  so it doesn't give her away.
- **Distracted:** when nothing presses her, she sometimes lowers her wand and gazes up at
  something only she can see, reaching for it. She sees nothing coming until it ends or you hit
  her: a fair opening.
- **Erratic:** she skips about the room (her gait in place of a run), circles, stops and stares,
  thinks at irregular intervals, and chains short bursts of spells followed by inexplicable
  pauses. Light on guard, quick to sidestep. No healing.
- **Protego:** she meets a spell she sees cast at her with the shield when it's ready (now and
  then timed to send it back).
- She fights in the Ravenclaw Common Room. In the campaign she opens the duel, angry at Malfoid
  (her face set hard through the exchange), and Malfoid replies; each has a win line.

| Level | Luna's HP | Confusion | Birds | Copies | How she fights |
|---|---|---|---|---|---|
| Easy | 120 | 2.0 s | 4 | 2 (8 s) | slow reactions, often distracted, rare bursts |
| Normal | 150 | 2.5 s | 5 | 2 (9 s) | quicker; more opportunism and bursts, distracted now and then |
| Hard | 180 | 3.0 s | 6 | 3 (10 s) | sharp reactions, frequent bursts, rarely distracted, real combos |

### Hermione Granger

The hardest student by a considerable margin: precise, not random. She reads you, punishes your
casts, steals your wand and chains her spells; her reactions keep human timing, so her edge is
her choices. Her strongest attacks need a wind-up that can be interrupted. See
`docs/hermione/DESIGN.md` and `docs/hermione/REPORT.md`.

- **Plate Barrage (Oppugno):** she raises her wand and her left hand, and 8-12 dinner plates
  rise off the nearest places on the house tables into a fan round her (the wind-up, about a
  second). **Hit her then and they all drop and shatter.** Then she conducts them at you one
  after another, fast and straight (no homing once thrown), aimed where you will be: she leads
  your movement and learns which way you like to dodge. Each plate is a small hit (a flinch);
  your guard takes each as chip damage, Protego stops them while it lasts (0.9 s: not a whole
  volley), and a perfect Protego sends one plate back at her (only one). They shatter on
  whatever they hit.
- **Petrificus Totalus:** a pale blue bolt. A hit binds you: you go rigid, topple backwards like
  a plank and lie bound for about 2 s, then get up. While you are down (and getting up) only one
  more hit lands. A guard or Protego stops it; it can be dodged. She fires it when you expose
  yourself: reeling, just after your cast, your Protego cooling down, sprinting about.
- **Expelliarmus and Accio:** she disarms into your casts, and when your wand is on the floor she
  turns to it and summons it into her left hand (ACCIO!). Land a strike on her (a hit that gets
  through) and she lets go of it: pick it up. Hit her during the cast and nothing comes; it has
  a cooldown before she can steal it again.
- **Chains:** after her shield stops (or reflects) your spell she answers with Petrificus; with
  you bound she follows up once, either Expelliarmus at once or the plates timed to fly just as
  you are back on your feet.
- **Protego:** she meets your spells with the shield, often timed to send them back.
- She keeps a caster's distance, circling; holding your wand, she lets you come close.
- She fights in the Great Hall, after a longer opening exchange: three lines each, she first.

## Expelliarmus (1)

Malfoid learns Ginny's Disarming Charm by beating her in the campaign. In training she always
has it, in practice against anyone but Ginny, and never against Ginny herself. A red bolt: 4
damage, a stagger, and the target's wand knocked out of her hand. It has its own 8 s cooldown, separate
from Confringo's, and its own slot in the HUD. A disarmed opponent runs back to her wand and
picks it up before casting again. A knocked-away wand always comes to rest where a fighter can
reach it (never on a bench, a table or in a wall). Tuning is in `src/combat/spells/Expelliarmus.ts`.

## Impedimenta (3)

Malfoid learns Susan's Impediment Jinx by beating her in the campaign. In training she always
has it, and in practice from Luna on. It's Susan's cold blue bolt: 4 damage, a flinch, and the
target **slowed to 55 % for 2.5 s**. While she's slowed, everything she does runs slower: her
movement, strikes, casts and reactions (her AI's thinking too). Two blue rings turn round her
legs and **SLOWED!** shows.

- **Against Hermione:** slowed, her plate barrage takes about 2 s to rise instead of 1 s, a
  much wider window to hit her and drop it.
- **Timing:** Malfoid casts it with her wand thrust, the same timing as Expelliarmus (released
  at 0.42 s).
- **Cooldown:** 10 s, its own (Susan's is 6 s; a slow that often would trivialise a fight).
- **Defence against it:** a guard or Protego stops it, and a perfect parry sends it back at
  Malfoid.

Tuning is in `src/combat/spells/Impedimenta.ts` (`MALFOID_IMPEDIMENTA`).

## Illusio (4)

Malfoid learns Luna's charm by beating her in the campaign. In training she always has it, and
in practice against Hermione. Her wand circles overhead, her arms sweep open, and **two copies
of her** appear beside her. Unlike Luna, she stays where she is: the player steers her.

- **The copies:** they face and circle her opponent (the dummy in training), and stand, circle or
  skip about, more calmly than Luna's. They mimic her casts a beat late, and **feint casts of
  their own** (the first 0.4–1.2 s after appearing, then every 2–3.5 s), but no bolt ever leaves
  their wands, and they cast no shadow.
- **Popping:** any hit pops a copy, and so does the opponent walking into it. When Malfoid
  herself is hit, they all vanish.
- **Length:** 8 s, with a 16 s cooldown.
- **Fooling the opponent:** as the copies appear, she may take one of them for Malfoid. She then
  moves, aims and casts at it: her bolts, strikes and plates pop it. When the copy she watched
  pops, she picks again among the figures left.
- **Seeing through it:**
  - **In time:** Hermione takes 2.6–3.4 s on Easy, 1.8–2.4 s on Normal and 1.1–1.5 s on Hard.
    Others take 2.5–3.5 s.
  - **Given away:** at once if the real Malfoid's bolt flies (a copy's never does) or she strikes
    within reach.
  - **Spotting:** as the copies appear, Hermione spots the real one at once 15 % / 25 % / 35 % of
    the time.
  - **Afterwards:** seen through, she keeps to the real one until the copies are gone.
- **Her plates:** each plate is aimed as it leaves, at the figure she believes. Fooled, she pours
  the barrage at one copy: the first plate to reach it pops it, but the next ~4 are already flying
  at the empty spot. Then she picks again among the figures left. Cast during her wind-up, Illusio
  let 4.5 of 10 plates reach Malfoid on average (Normal, 8 barrages: 0 to 10).
- **Baiting her Protego:** while she watches a copy, she reads that copy's casts (its mimicry or
  its feints) as the real thing, and may raise her Protego (or dodge) at a bolt that never comes.
  Her shield then needs its 5 s before it can go up again: a window for your Confringo. Meanwhile
  she doesn't read the real Malfoid's cast; its bolt, once it flies, gives her away.

Tuning is in `src/combat/Illusio.ts` (`MALFOID_ILLUSIO`, `MALFOID_ILLUSIO_CFG`). How it was built and measured:
[docs/illusio/REPORT.md](docs/illusio/REPORT.md).

## How a duel runs

- **Opening lines (campaign):** the two exchange a line each in close-ups: against Ginny Malfoid
  speaks first, against Cho, Cho does, against Susan, Malfoid does, against Luna, Luna does;
  against Hermione they exchange three lines each, she first, each line with its speaker's face.
  Then **ROUND 1** shows; nobody can move or attack until **DUEL!** appears. Practice goes
  straight to the fight.
- **Rounds (campaign):** a round lost or won short of the match is announced (**GINNY WINS
  ROUND 1**); after 3 s the next round's title (**ROUND 2**, or **FINAL ROUND** at one round
  each) holds for 1.3 s with both fighters still, then **DUEL!**. No voice lines between rounds.
- **The fight:** first to 0 HP loses. A strike blocked by a fighter leaves the attacker slow
  to recover, an opening for either side. In practice, **G** (or the HUD button) restarts it.
- **The last word (campaign):** the match's winner says her line after the deciding KO, then the
  result follows with the score in rounds: the spell learned and the next opponent, or game
  over.
- **Dobby:** now and then, when a duellist is stunned (a stagger: Stupefy, Expelliarmus, a
  combo's stunning blow), Dobby peeks up from the bottom-right corner with a "Toasty!", as in the
  classic arcade fighters. The chance is 10 % per stun, with at least 60 s of game time between
  appearances. Susan's Resolve turns a stagger into a flinch, so she never brings him. The
  settings are in `src/ui/DobbyCameo.ts` ([screenshot](docs/dobby/cameo.png)).
- **Lip movement:** the speakers' mouths open and close with the loudness of their lines
  (`audio/duelVoices.ts`).
- **Leaving:** **Change mode** in the HUD returns to the start screen.

## Controls

| Input | Action |
|---|---|
| W / A / S / D | walk away from / towards the camera, left / right on screen |
| Shift + WASD | run |
| Space | jump: in the air she clears the low kicks (shin kick, leg sweep) |
| Left Ctrl | crouch (hold): she ducks under the high strikes (jab, cross, roundhouse, spinning kick); an uppercut still catches her |
| J / U | high / low punch (jab / body jab) |
| K / I | high / low kick (roundhouse / shin kick) |
| two strike keys quickly | combo (see below) |
| O or Enter | block (hold): O beside the strike keys for melee, or Enter (the main or the keypad one) |
| 0 | cast Confringo (5 s cooldown; needs the wand). The spell keys work on the number row or the keypad |
| 1 | cast Expelliarmus (8 s cooldown; needs the wand; learned from Ginny in the campaign) |
| 2 | Protego (hold): a shield before her for up to 0.9 s, then 5 s before it can be raised again. It stops spells reaching its front, and one raised just as a spell arrives (within 0.2 s) sends it back at its caster; it guards strikes like a block. Needs the wand; learned from Cho in the campaign |
| 3 | cast Impedimenta (10 s cooldown; needs the wand; learned from Susan in the campaign) |
| 4 | cast Illusio (16 s cooldown; needs the wand; learned from Luna in the campaign): two copies of her |
| G | restart the fight (practice) |
| B | training dummy guard: none / high / low |
| N | bring the training dummy in front of her |
| M | mute / unmute sound (the volume is set on the start menu and the pause screen) |
| Esc | pause (click or Esc to resume) |
| Left drag | orbit (the camera follows on its own: behind her as she moves, side-on to both fighters in a duel; a drag holds the view for a moment) |
| Right drag | pan |
| Wheel | zoom (towards the cursor) |
| Reset Camera | restore the initial view |

After `IDLE_ANNOYED_TIMEOUT` seconds (10, in `src/character/Malfoid.ts`) without movement she
shifts her weight, crosses her arms and makes an annoyed face. Camera input does not reset the
timer; moving blends her back into walking.

## Combos

Two strikes in quick succession chain into a finisher:

| Input | Combo | Opener → finisher | Finisher effect |
|---|---|---|---|
| J → J | Double High Punch | jab → cross | stagger |
| U → U | Double Low Punch | body jab → body hook | stagger |
| I → I | Double Low Kick | low shin kick → leg sweep | knockdown |
| K → K | Double High Kick | roundhouse → spinning high kick | knockback |
| U → J | Rising Strike | body jab → uppercut | knockback |
| J → U | High-Low Breaker | jab → heavy body punch | knockback |
| K → I | High-Low Sweep | roundhouse → leg sweep | knockdown |
| I → K | Rising Kick | low kick → rising roundhouse | knockdown |

- **Input buffer:** the second key is accepted from the start of the opener until 350 ms after
  its active (hitting) frames, so it can be pressed before the opener finishes.
- **Cancel point:** at the end of the opener's active frames she cancels straight into the
  finisher (skipping its wind-up).
- **Hit confirmation:** the finisher only comes out if the opener hit. A blocked or missed opener
  drops the combo; a blocked finisher only does chip damage, with no effect.
- **Recovery:** whiffing a heavy finisher (uppercut, heavy body punch, sweeps, spinning or rising
  kick) slows the rest of the move: she is shown as VULNERABLE until it ends.
- **2 HIT COMBO** appears when both strikes connect.
- **Ducking and jumping:** a crouch ducks under the jab, the cross, the roundhouse and the
  spinning high kick (an uppercut still catches a crouch); a jump, while her feet are off the
  floor, clears the low shin kick and the leg sweep. The strike whiffs (a whiffed heavy finisher
  leaves its thrower open) and DODGED! shows. Body punches must be blocked low. The same goes for
  every fighter (`Move.avoid` in `combat/moves.ts`).
- **No stun-lock:** a hit that lands while the target is still reeling (or just after) chains
  onto it. The third in a row knocks her back out of reach, and once she is up she has 0.7 s
  in which hits still hurt but don't stun her: time to block, counter or step away. This holds
  for Malfoid and for every opponent (`CHAIN` in `combat/FighterTarget.ts`).
- **Facing and spacing:** a strike turns her towards the opponent if it is within 60° either side
  (and 1.6 m), and she steps in or back (up to 35 cm) to that strike's range during the wind-up.
- Hitboxes are relative to her position and facing, with a high/low height that a matching guard
  blocks. Damage, active frames and ranges are in `src/combat/moves.ts`.

## Confringo (0)

The Blasting Curse, cast with her wand. She keeps the wand up her right sleeve. When she casts,
it slides out into her hand. It stays there afterwards, while she walks, runs, jumps or idles,
and goes back up the sleeve as soon as she punches or kicks.

She turns towards her target (the dummy or her opponent) if it is within 60°, raises the wand while fire gathers at its tip,
and thrusts it at the target. At 0.42 s a fiery bolt leaves the tip, flies at 18 m/s with a
flame trail and sparks, and explodes on the first thing it touches: a target, a solid, or the
ground. If it touches nothing, it fizzles out at 25 m.

- **Damage:** a direct hit does 20 damage and a strong knockback. Anyone else within 2.5 m of
  the blast takes splash damage, up to 10 and less with distance, with a weaker knockback away
  from the blast. Walls shield from splash, and one explosion damages a target only once.
- **Cooldown:** 5 s, starting when the bolt is released and counted in game time, so pausing
  pauses it. A cast cancelled before the release costs nothing. The HUD shows
  `CONFRINGO [0]` with READY or the seconds left.
- **Rules:** casting isn't possible while jumping, crouching, blocking, or during a punch or
  kick. Melee is locked from the start of the cast until the release. Holding 0 or key repeat
  never casts twice.
- **Aim assist:** the bolt aims at the torso of the target nearest her facing within 45° and
  20 m. Without one, it flies straight ahead.
- **Tuning:** all values are in `src/combat/spells/Confringo.ts`.

Screenshots from the viewer are in `docs/confringo/`.

## Code (`src/`)

- `character/Malfoid.ts` – loads the model, locomotion, idle → annoyed state machine, blinking and
  facial expression weights.
- `character/AnimationController.ts` – clip cross-fades: locomotion (`idle`, `walk`, `run`,
  `turn`, `idle_annoyed`), `jump`, strikes and held poses (`crouch`, `block`).
- `character/CharacterController.ts` – key bindings and pause.
- `combat/moves.ts` – strikes (timing, damage, hitbox, effect) and the combo table.
- `combat/ComboSystem.ts` – input buffer, cancel windows, hit / block / miss, auto-facing.
- `combat/TrainingDummy.ts` – the training opponent: HP, guard, flinch / stagger / knockback / knockdown.
- `combat/CombatTarget.ts` – what any attack hits; `FighterTarget.ts` – a character as a target
  (health, blocking, reactions, disarm, defeat).
- `combat/ai/FighterAI.ts` – the opponent's behaviour (observe, approach, retreat, block, strike,
  cast, retrieve her wand; with an evasive style also circle, shield, dodge, counter, push;
  with a defensive style hold ground, guard against spells, meet a rush, heal; with a chaotic
  style roam, skip, get distracted, burst and pause, summon birds and copies; with a prodigy
  style read every cast, chain spells, steal a dropped wand, bind and follow up, and aim the
  plates where the opponent will be, learning her dodges);
  `combat/ai/difficulty.ts` – the Easy / Normal / Hard tuning of each opponent.
- `combat/spells/Expelliarmus.ts` – the disarming spell (Ginny's, and Malfoid's once learned);
  `Stupefy.ts`, `Ventus.ts` (+ its gust effect) – Cho's spells; `Impedimenta.ts` (the slow),
  `Depulso.ts` – Susan's; `Confundo.ts` (the confusion) and `Oppugno.ts` (the birds: the flock's
  homing and hits, and their look) – Luna's; `Petrificus.ts` (the body-bind), `Accio.ts` (a
  dropped wand to her hand: `Wand.summon`) and `Plates.ts` (the barrage: the wind-up, the
  straight launches, the shards) – Hermione's. A summoning spell (`SpellDef.summon`) has no bolt:
  `SpellSystem.onSummon` hands its release to the caster, `SpellSystem.onCast` its start and an
  interruption.
- `combat/Episkey.ts` – the healing charm (instant heal, cooldown, charges); `EpiskeyFx.ts` – its look;
  `SlowFx.ts` – the rings of a slow; `ConfusionFx.ts` – the stars of a confusion.
  `FighterTarget` carries the slow (`timeScale`), the confusion (`confused`; the controller
  reverses the directions) and Susan's Hufflepuff Resolve.
- `combat/Illusio.ts` – Luna's copies (and Malfoid's): their targets (any hit pops one), the shuffle as they
  appear, their wandering and mimicked casts. Copies are `Malfoid.makeTwin()`s of her model
  (shared geometry and textures).
- `combat/Protego.ts` – the shield (timing, perfect window, cooldown); `ProtegoFx.ts` – its look.
  A shield's owner takes over a reflected spell (`SpellSystem.adopt`).
- `game/opponents.ts` – the opponents as definitions (model, faces, spells, AI per difficulty,
  voice lines); `game/Opponent.ts` builds one in the game. The duel code names no opponent.
- `game/campaign.ts` – the campaign: the opponents in order, game over, the spells each one
  teaches, the saved run. `game/match.ts` – a campaign duel as a best-of-three match.
- `character/faces.ts` – Ginny's and Cho's expressions and speaking mouths. Besides shape keys a
  face may set `blush` (a cheek tint in the face shader) and `tears` (the base mesh's tear cards).
- `combat/spells/` – `SpellSystem.ts` (casting, cooldowns, aim assist, projectiles, damage),
  `Confringo.ts` (tuning), `Projectile.ts` + `collision.ts` (swept collision: no tunnelling),
  `SpellEmitter.ts` (where spells leave from: the wand tip),
  `ConfringoFx.ts` + `ExplosionEffect.ts` + `fx/` (pooled particles, glows, explosion; one pool
  per look, shared by every caster of that spell), `SpellFxSet.ts` (a caster's spells to their pools).
- `ui/CombatHud.ts` – combo banner, damage numbers, dummy HP, a cooldown slot per spell, round wins.
- `ui/DobbyCameo.ts` – Dobby's cameo: when he appears (`CameoTrigger`) and his pop-up in the corner.
- `ui/VolumeControl.ts` – the sound volume control (− / slider / +) on the start menu and the
  pause screen; remembered in the browser, with a short sample at the new level.
- `audio/duelVoices.ts` – the duel's opening and win lines and the speakers' lip movement
  (driven by `audio/envelope.ts`, the lines' loudness over time).
- `audio/Sfx.ts` – sound effects (Web Audio): each sound is a time slice of a file in
  `public/sfx/`, placed by distance and screen side; `audio/combatSounds.ts` – which sound plays
  for which event (punches, kicks, grunts on damage, Confringo, Expelliarmus, Protego's hum while
  Cho's shield is up, Stupefy's crackle, Ventus's rush of air, Impedimenta's swell, Episkey's chime, Dobby's "Toasty!", footsteps timed to
  the walk / run cycles' foot landings). The sound files are in `public/sfx/`; if one is missing
  the game just runs without it.
- `character/HairSway.ts` – damped-spring secondary motion on the hair's strand bones.
- `character/Wand.ts` – her wand (built at runtime), drawn from the sleeve to cast, the hand's
  grip, and the tip emitter.
- `character/ToonMaterials.ts` – cel shading and outlines (the hair is shaded as one smooth volume).
- `camera/CameraController.ts` – the follow camera (behind her, side-on in a duel, speaker
  close-ups; where an arena's walls keep the duel view from backing off, it keeps its height
  and widens its field of view, up to 60 deg); `scene/SceneManager.ts` – lights, shadows, the studio / arena lighting;
  `scene/arena.ts` – what the duel needs from an arena (spawn, light, collision, spell solids,
  camera limit); `scene/forest/` – the Forbidden Woods (`ForestArena.ts` adapts it);
  `scene/pitch/` – the Quidditch Pitch (`config.ts` the tunables, `structures.ts` the towers,
  grandstands, hoops and barrier, `landscape.ts` the land and sky, `trees.ts` the instanced
  conifers and broadleaves, `castle.ts` the castle on its crag, `textures.ts` the generated
  cloth and ground textures, `PitchArena.ts` collision, camera limit, light and the
  stadium-wide sun shadow); `scene/greenhouse/` – the Herbology Greenhouse (`config.ts` the
  tunables, `structure.ts` the plinth, iron frame, glass and floor, `plants.ts` the benches,
  pots, plants, planters, baskets and ivy, `GreenhouseArena.ts` collision, camera limit, light,
  the grounds outside and the drifting motes); `scene/ravenclaw/` – the Ravenclaw Common Room
  (`config.ts` the tunables, `textures.ts` the carpet, floorboards, painted dome and the night
  outside, `RavenclawArena.ts` the walls and windows, silks, bookcases, furniture, the statue,
  floating candles, collision, camera limit and light); `scene/greathall/` – the Great Hall
  (`config.ts` the tunables, `textures.ts` the flagstones and the night-sky ceiling,
  `GreatHallArena.ts` the walls and windows, the tables and their places (the plates:
  `takePlates` / `restock`), the dais and high table, the owl lectern, banners, candles,
  collision, the camera limit with its height over the tables, and light).

## Tests

```bash
npm test
```

Runs the logic tests in `tests/` with Node's test runner on an esbuild bundle: spells, Ginny's
AI and combat, the forest (generation, collision, geometry), sound triggers, the voice lines and
the campaign (order, spells learned, game over, best-of-three matches).
No browser or WebGL needed.

## Rebuilding the models

The characters are generated from purchased assets that are **not** in this repository. To rebuild it you
need, in the repo root: `base_character.blend` and `Gumroad_Anime_Female_BaseMesh/` (anime base
mesh), `Bell_Hair_01/` (hair) and `Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND/`
(uniform), plus Blender 4.5 (default path `~/.local/opt/blender-4.5.16-linux-x64/blender`,
override with `BLENDER=...`).

```bash
make model        # textures + build/malfoid.blend + public/models/malfoid.glb
make ginny        # Ginny: build/ginny.blend + public/models/ginny.glb (MF_CHAR=ginny)
make cho          # Cho: build/cho.blend + public/models/cho.glb (MF_CHAR=cho)
make susan        # Susan: build/susan.blend + public/models/susan.glb (MF_CHAR=susan)
make luna         # Luna: build/luna.blend + public/models/luna.glb (MF_CHAR=luna)
make hermione     # Hermione: build/hermione.blend + public/models/hermione.glb (MF_CHAR=hermione)
make help         # all targets (renders, dev, build, clean, ...)
```

Blender runs with 4 threads (`-t 4`).

### Pipeline (`tools/`)

- `textures/make_textures.py` – skin and face texture from the base mesh: pale skin preset, green
  irises, blonde brows, black lashes, blush and nose mark removed, scalp painted the hair's root tone.
- `textures/make_crest.py` – the Slytherin crest painted for the robe.
- `blender/malfoid/character.py` – everything that differs between Malfoid and Ginny (textures,
  face, hair, uniform colours, crest). Malfoid's profile reproduces her model bit for bit.
- `textures/make_crest_gryffindor.py` – Ginny's Gryffindor crest.
- `blender/build_head.py` – the build, in stages: face expression → hair + earrings → humanoid
  skeleton → uniform → animations → GLB export.
- `blender/malfoid/face.py` – resting expression (shape-key values) and the added face shape keys.
- `blender/malfoid/bust.py`, `hands.py`, `legs.py` – smaller bust, 10% smaller hands, 10% thinner
  legs.
- `blender/malfoid/assets.py` – the purchased hair (fitted to her head, crown flattened onto the
  skull and the sides slimmed towards the face to match the atlas, recoloured platinum, strand
  bones kept) and uniform (shirt, vest, tie, skirt, socks fitted to her body).
- `blender/malfoid/outfit2.py` – robe (black outside, green lining) with its hood, loafers and crest.
- `blender/malfoid/rig2.py` – standard humanoid skeleton with the base mesh's weights remapped,
  plus robe helper bones at the hips that the lower robe follows instead of the hips and thighs
  (they copy the thigh's swing up to 40° and ease off towards 70°, so high kicks don't fold the
  robe, and squash the robe when the hips drop so the hem stays above the floor).
- `blender/malfoid/anim2.py` – locomotion and idle clips; `combat.py` – combo openers and
  finishers, jump, crouch and block.
- `qa/` – screenshot tools that capture the face in the real viewer for side-by-side comparison
  with the design references.
  `qa/robe_folds.py` (run in Blender on `build/malfoid.blend`) measures how much of the lower
  robe folds over in each clip that moves the legs; all zeros is clean.

All body and face changes are **shape keys** on top of the original base mesh: its own geometry,
normals and authored shape keys are never modified.

| Shape key | Effect |
|---|---|
| `mf_bust_small` | bust projection reduced to 45% |
| `mf_hands_small` | hands 10% smaller (finger joints scaled to match) |
| `mf_legs_thin` | thighs and shins 10% thinner |
| `mf_cheek_slim` | slimmer cheeks |
| `mf_eyes_up` | eyes and brows ~5% higher |
| `mf_eyes_in` | eyes and brows 5% closer together |

`docs/integration/REPORT.md` describes how the purchased assets were fitted, with validation renders;
`docs/expression/` has the face comparisons against the design reference.

## License

Code: MIT (see `LICENSE`).
