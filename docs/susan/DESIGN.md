# Susan Bones — the Hufflepuff Bulwark (design)

Campaign stage 3, after Cho Chang. **Status: playable** (practice and campaign); Malfoid's Episkey (the reward) is not built yet. What was built and how it was checked: [REPORT.md](REPORT.md).

Susan is the roster's defensive specialist: not particularly fast or aggressive, but stubborn,
disciplined and extremely hard to put down. Ginny pressures you and Cho evades you; Susan stands
her ground and makes you work for every hit.

She is also the first opponent who doesn't care about the romantic rivalry at all: she is simply
trying to put a stop to Malfoid's rampage.

She is the roster's **only Hufflepuff**: the one duel where Hufflepuff yellow and black is on
the other side.

## Abilities

| Ability | Effect |
|---|---|
| **Impedimenta** | Slows Malfoid's movement and attacks briefly, making reckless aggression dangerous. |
| **Depulso** | A powerful knockback spell that creates distance and interrupts combos. |
| **Episkey** | Susan heals a portion of her HP. Instantaneous: it leaves no opening. A cooldown keeps her from spamming it. |
| **Hufflepuff Resolve** | Passive: greater resistance to staggering and knockdown. |

## Fighting style

- Slow, deliberate attacks with high defensive reliability.
- Blocks frequently. She also uses Protego against spells, though she parries less than Cho (changed on request).
- Punishes Malfoid for blindly rushing into melee.
- Uses Impedimenta to interrupt aggression, and alternates it with Expelliarmus at range (added on request).
- Heals with Episkey when injured, where she stands (changed from retreating to cast it).
- Becomes more determined as her health drops, not more aggressive.

The challenge is breaking her defence and stopping her from recovering.

## Spell acquired: Episkey

*Healing charm. Reward for defeating Susan Bones.*

Malfoid restores a modest amount of HP with a short, interruptible casting animation. Initial
tuning:

- 25 HP restored per successful cast.
- A 1.5 s casting animation.
- Two charges per duel.
- Taking damage interrupts the cast without using a charge.
- No healing beyond maximum HP.

It gives Malfoid a new kind of tactical ability, unlike Ginny's Expelliarmus or Cho's Protego, and
it becomes particularly valuable in the later Bellatrix and Voldemort battles.

## The campaign with Susan

| Stage | Opponent | Combat challenge | Spell unlocked |
|---|---|---|---|
| 1 | Ginny Weasley | Aggressive, close-range fighter | Expelliarmus |
| 2 | Cho Chang | Evasion, counters, precision | Protego |
| 3 | Susan Bones | Defence, resilience, healing | Episkey |
| 4 | Luna Lovegood | Unpredictable, chaotic spellcasting | Confundo |
| 5 | Hermione Granger | Tactical, intelligent, versatile | Petrificus Totalus |
| 6 | Harry Potter | Superior duellist; scripted defeat | None |
| 7 | Bellatrix Lestrange | Cruel, relentless, uses Unforgivable Curses | None |
| 8 | Lord Voldemort | Final boss; lethal magic | None |

## What the game has today

- **Spell rewards:** Ginny teaches Expelliarmus and Cho teaches Protego. Susan teaches nothing yet, because Malfoid's Episkey is not built.
- **Campaign order:** the game follows the order above (`src/game/campaign.ts`). Susan is stage 3; after her the campaign shows Luna Lovegood as the next duel, marked coming soon.
- **Susan's reward:** beating her teaches nothing yet, because Malfoid's Episkey is not built (Susan's own Episkey is).
