# Susan Bones — the Hufflepuff Bulwark (design)

Campaign stage 3, after Cho Chang. **Status: playable** (practice and campaign). Beating her teaches Malfoid **Impedimenta** (key 3). What was built and how it was checked: [REPORT.md](REPORT.md).

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
| **Episkey** | **Removed** (on request, after the stun-lock fix: on Hard her healing made her a wall). It was: Susan heals a portion of her HP, instantaneously, with a cooldown. |
| **Hufflepuff Resolve** | Passive: greater resistance to staggering and knockdown. |

## Fighting style

- Slow, deliberate attacks with high defensive reliability.
- Blocks frequently. She also uses Protego against spells, though she parries less than Cho (changed on request).
- Punishes Malfoid for blindly rushing into melee.
- Uses Impedimenta to interrupt aggression, and alternates it with Expelliarmus at range (added on request).
- ~~Heals with Episkey when injured~~: removed on request (she no longer heals).
- Becomes more determined as her health drops, not more aggressive.

The challenge is breaking her defence and stopping her from recovering.

## Spell acquired: Impedimenta

*The Impediment Jinx. Reward for defeating Susan Bones* (changed on request: it was Episkey, which was
never built, and Susan no longer heals).

Malfoid casts Susan's own slowing bolt (key 3): 4 damage, and the target slowed to 55 % for 2.5 s:
her movement, strikes, casts and reactions. Malfoid's has a 10 s cooldown (Susan's: 6 s). It's
aimed at the fight that follows: slowed, Hermione's plate barrage takes about twice as long to
rise, an opening to hit her and drop it. Tuning: `MALFOID_IMPEDIMENTA` in
`src/combat/spells/Impedimenta.ts`.

(The Episkey design, kept for a later reward: 25 HP per cast, a 1.5 s interruptible cast, two
charges per duel, no healing beyond maximum HP. The charm is in `src/combat/Episkey.ts`.)

## The campaign with Susan

| Stage | Opponent | Combat challenge | Spell unlocked |
|---|---|---|---|
| 1 | Ginny Weasley | Aggressive, close-range fighter | Expelliarmus |
| 2 | Cho Chang | Evasion, counters, precision | Protego |
| 3 | Susan Bones | Defence, resilience | Impedimenta |
| 4 | Luna Lovegood | Unpredictable, chaotic spellcasting | Confundo |
| 5 | Hermione Granger | Tactical, intelligent, versatile | – |
| 6 | Harry Potter | Superior duellist; scripted defeat | None |
| 7 | Bellatrix Lestrange | Cruel, relentless, uses Unforgivable Curses | None |
| 8 | Lord Voldemort | Final boss; lethal magic | None |

## What the game has today

- **Spell rewards:** Ginny teaches Expelliarmus and Cho teaches Protego. Susan teaches nothing yet, because Malfoid's Episkey is not built.
- **Campaign order:** the game follows the order above (`src/game/campaign.ts`). Susan is stage 3; after her the campaign shows Luna Lovegood as the next duel, marked coming soon.
- **Susan's reward:** beating her teaches nothing yet, because Malfoid's Episkey is not built. Susan herself no longer heals (removed on request).
