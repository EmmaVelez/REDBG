# Alliance Action Card Audit (REDBG game-core)

Alliance action cards (in `game-core/src/data/alliance.ts`, type `action`): **16 cards**.
None define an `actionEffects` entry, so their bonus text is applied via `sumBonuses`, but every card-specific non-bonus effect is unimplemented in `actions.ts`.

## Cards

| id | name | bonuses implemented | text effect | status |
|---|---|---|---|---|
| ac-013 | Partners | ammo +20, actions +2 | attach to partner; +1 action next turn if attached | Missing |
| ac-014 | Star-Crossed Duo | cards +2, buys +1 | attach to partner; partner weapon +10 dmg when partner leading | Missing |
| ac-015 | Great Ambition | gold +10, actions +1 | +2 cards if no partner | Implemented (conditional) |
| ac-016 | Archrival | cards +2 | all players discard partners to <=1 attached | Missing |
| ac-017 | Fierce Battle | cards +4 | choose player +1 card | Missing |
| ac-018 | Uroboros Injection | actions +2, buys +1 | reactive trash to +20 HP to revealed infected | Missing |
| ac-019 | Quirck of Fate | actions +1 | trash hand card then draw | Missing |
| ac-020 | Cornered | (none) | attach to partner; 2 attached -> trash both and gain 3 cards <=100 gold | Missing |
| ac-021 | Gathering Forces | gold +20, actions +1, buys +1 | gained cards go to hand | Missing |
| ac-022 | Desperate Forces | ammo +20, actions +1 | choose weapon type +10 dmg | Missing |
| ac-032 | Silver Ghost | cards +1, actions +1 | none extra | Implemented (bonuses only) |
| ac-033 | Punisher | cards +2, actions +1 | none extra | Implemented (bonuses only) |
| ac-040 | Flashbang | explores +1 | non-explosive infected deal 0 dmg | Missing |
| ac-050 | Mercenaries Item | gold +20 | none extra | Implemented (bonuses only) |

## Summary

- Implemented (bonuses only, no special effect): 3 (ac-032, ac-033, ac-050)
- Missing special effects: 13

## Tests

Run `npm run test` in `game-core/`.
