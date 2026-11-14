# Susan Bones — the Hufflepuff Bulwark (design)

Campaign stage 3, after Cho Chang. **Status: planned** (design only; nothing of her is built yet).

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
| **Episkey** | Susan heals a portion of her HP. The cast takes time and can be interrupted. |
| **Hufflepuff Resolve** | Passive: greater resistance to staggering and knockdown. |

## Fighting style

- Slow, deliberate attacks with high defensive reliability.
- Blocks frequently, but has no perfect parry (that is Cho's speciality).
- Punishes Malfoid for blindly rushing into melee.
- Uses Impedimenta to interrupt aggression.
- Retreats briefly when injured to cast Episkey.
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

- **Spell rewards:** Ginny teaches Expelliarmus. Cho teaches nothing yet, because Malfoid's Protego is not built.
- **Campaign order:** the order in the code (`src/game/campaign.ts`) is still the earlier six-opponent one, without Susan and Voldemort. Updating it is a code change for a later PR.
