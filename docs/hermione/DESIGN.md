# Hermione Granger — the Prodigy (design)

Campaign stage 5, after Luna Lovegood, and the last student before Harry. **Status: in
progress.** Her reward, Petrificus Totalus for Malfoid, is recorded here but not built yet.

Hermione is **the hardest student by a considerable margin**. She isn't chaotic like Luna or a
wall like Susan. She fights with precision: she reads Malfoid, exploits her cooldowns, her wand
and her recovery, and chains her spells. She's also the first opponent to **use the arena
itself as a weapon**: the Great Hall's dinner plates.

Her power must stay **fair**. Her strongest attacks need preparation, which leaves an opening,
and every attack can be dodged or blocked.

## Abilities

| Ability | Effect |
|---|---|
| **Oppugno: Plate Barrage** | **Wind-up:** she levitates 8 / 10 / 12 plates (by level) off the house tables. Hitting her during the wind-up interrupts the whole barrage: the plates drop and shatter. **Launch:** she fires them in rapid succession, fast and **straight**, with no homing after launch. **Aim:** she leads Malfoid's movement, and adapts: if Malfoid keeps dodging to one side, Hermione aims further that way. **Defence:** Protego blocks each plate, but a perfect parry reflects only one; the rest keep coming. **Impact:** each plate shatters into a few light fragments. |
| **Limited ammunition** | The plates come from the tables: the ones she uses leave the tables, and the tables are restocked between rounds. |
| **Expelliarmus** | Disarms Malfoid, especially when she exposes herself while casting. |
| **Accio** | Summons Malfoid's **dropped wand** into Hermione's free hand. Malfoid must close in and land a melee hit to make her drop it, then pick it up. Accio can be interrupted, and it has a cooldown before she can try another theft. |
| **Protego** | Blocks, and with excellent timing reflects, incoming spells. |
| **Petrificus Totalus** | A bolt that binds Malfoid's body. She goes rigid, arms at her sides, and **topples backwards like a plank** (not a ragdoll). She lies immobilised for about 2 s, then gets up with a short animation. There's no button-mashing. Dodge it or block it with Protego. |

## What makes her OP (and still fair)

- **She chains spells intelligently.** For example: Malfoid casts Confringo; Hermione
  perfect-parries it; Malfoid repositions; Hermione casts Petrificus Totalus; Malfoid falls; the
  plates rise.
- **She exploits:** Malfoid's cooldowns, wand possession (Expelliarmus, then Accio), distance,
  and recovery animations.
- **She is not an input reader.** Her reactions keep human timing, and her advantage is her
  choices.
- **Her weakness:** her strongest attacks need preparation. The barrage's wind-up and Accio can
  both be interrupted.
- **No instant kills:** a petrified Malfoid can't take the whole barrage. The bind opens the way
  to one follow-up, not twelve plates.

## Campaign reward

**Defeating Hermione unlocks Petrificus Totalus for Malfoid.** For now, like Susan's Episkey and
Luna's Illusio, it's recorded but not taught.

| Stage | Opponent | Spell unlocked |
|---|---|---|
| 1 | Ginny Weasley | Expelliarmus |
| 2 | Cho Chang | Protego |
| 3 | Susan Bones | Episkey |
| 4 | Luna Lovegood | Illusio |
| 5 | **Hermione Granger** | **Petrificus Totalus** |

## Arena

**The Great Hall**, generated in code:
- the four long house tables and their benches, physically present, set with plates and goblets;
- a spacious central aisle for the duel;
- floating candles;
- the enchanted ceiling.

## Appearance

The references are `Hermione/` (local, not committed):
- **Hair:** long, very voluminous, curly chestnut hair (#6B4A3A), half-up, with a dark clip at
  the back.
- **Face:** brown eyes, light freckles across the nose and cheeks.
- **Uniform:** Gryffindor (maroon and gold), with a grey V-neck vest and pleated skirt, dark
  grey knee socks and black loafers.

## Implementation requirements

- **Reuse:** the existing opponent architecture, combat systems, AI framework, spell effects and
  character pipeline.
- **Malfoid's model:** it changes only by added clips (the fall and the get-up).
- **Fairness:** readable, counterable attacks, with cooldowns and difficulty scaling.
- **Process:** follow `AGENTS.md`, including regression tests and checks in the real Three.js
  viewer.
