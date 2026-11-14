# Luna Lovegood — the Chaos Caster (design)

Campaign stage 4, after Susan Bones. **Status: playable** (practice and campaign). Her reward,
Illusio for Malfoid, isn't built yet. What was built and how it was checked: [REPORT.md](REPORT.md).

Luna is an **illusion-and-disruption boss**, not another offensive spellcaster with a different
selection of damage projectiles. She is the most unpredictable opponent so far, but her
randomness affects her **decisions**, not whether her attacks can be anticipated or countered.

## Abilities

| Ability | Effect |
|---|---|
| **Confundo** | Temporarily reverses all directional movement controls (W/S and A/D), including while sprinting or dodging. About 2–3 s, with a clear "CONFUNDED!" indicator. Attack, block and spellcasting keys are unchanged. |
| **Illusio** (a non-canonical illusion charm) | Creates 2–3 false copies of Luna. The copies move independently and imitate her casting animations but deal no damage. Attacking a copy makes it disappear. The real Luna stays identifiable through subtle visual or behavioural clues, so this is a skill, not a guess. |
| **Expelliarmus** | The existing disarming mechanic: knocks Malfoid's wand away. |
| **Oppugno** | A small flock of magical birds briefly pursues and attacks Malfoid, damaging her through successive hits. Mechanically distinct from Confringo and the other bolts. Generated in code and lightweight; no elaborate flocking simulation. |
| **Distracted** (AI behaviour) | Now and then she becomes distracted, pauses her attacks or behaves strangely, giving Malfoid openings to counterattack. |

## Combat personality

- Erratic movement, circling and skipping.
- Irregular attack timing and unexpected spell combinations.
- Occasional bursts of aggression followed by inexplicable pauses.
- Strategic use of illusions to confuse targeting.
- Opportunistic Confundo and Expelliarmus.
- No healing, Reducto, Flipendo, Expecto Patronum or Conspiracy Frenzy.
- **Protego** (added on request, after the first build): she meets a spell she sees coming with
  the shield, now and then timed to reflect it.
- **Hitting a copy harms only the copy** (on request): a spell bursting on one never harms Luna.

## Campaign reward

**Defeating Luna unlocks Illusio for Malfoid, not Confundo.** Malfoid will be able to summon her
own illusory copies to confuse opponents, draw their attacks and create openings.

| Stage | Opponent | Spell unlocked |
|---|---|---|
| 1 | Ginny Weasley | Expelliarmus |
| 2 | Cho Chang | Protego |
| 3 | Susan Bones | Episkey |
| 4 | **Luna Lovegood** | **Illusio** |
| 5 | Hermione Granger | Petrificus Totalus |

For now, like Susan's Episkey, the reward is recorded but not taught. Malfoid's own Illusio
comes in a later change.

## Arena

The Ravenclaw common room: her house's tower room, built in code.

## Implementation requirements

- Reuse the existing opponent architecture, combat systems, AI framework, spell effects and
  character pipeline; don't duplicate what exists.
- Illusio's copies work with the existing targeting, collision, combat and AI systems.
- Readable, balanced and counterable abilities, with cooldowns and difficulty scaling.
- Follow `AGENTS.md`, including regression tests and checks in the real Three.js viewer.
