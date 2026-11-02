# Character Ability Audit (REDBG game-core)

Character ability kinds defined in `game-core/src/types.ts` (`CharacterAbility` union): **30 unique kinds** (31 entries; `giveOneCardToPlayerThenMaybeAnother` duplicated).

| # | Ability kind | validate.ts | actions.ts | abilities.ts | characters.ts | enumerate.ts | Status |
|---|---|---|---|---|---|---|---|
| 1 | `weaponPlusDamagePerInfectedFought` | 0 | 0 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 2 | `noHealingNoNonInfectedAttach` | 1 | 0 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 3 | `explosivesGoToDiscardInsteadOfTrash` | 0 | 0 | 1 | 0 | 0 | Implemented (abilities.ts) |
| 4 | `explosivesPlusDamage` | 0 | 0 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 5 | `weaponTagPlusDamage` | 0 | 0 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 6 | `ammoReqReduction` | 0 | 0 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 7 | `ammunitionBonus` | 0 | 0 | 1 | 0 | 0 | Implemented (abilities.ts) |
| 8 | `exploreGoldBonus` | 0 | 2 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 9 | `actionBonus` | 0 | 2 | 3 | 0 | 0 | Implemented (abilities.ts) |
| 10 | `trashEffectBonus` | 0 | 2 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 11 | `gainKnifeAtTurnStart` | 0 | 1 | 0 | 0 | 1 | Partial (engine refs but no abilities.ts logic) |
| 12 | `exchangeHandWithInventoryTop` | 2 | 3 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 13 | `plusDamageThisTurn` | 1 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 14 | `revealMansionTopNoEffect` | 2 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 15 | `trashFromHandAtWill` | 2 | 4 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 16 | `pistolsTwicePerTurn` | 1 | 0 | 0 | 0 | 1 | Partial (engine refs but no abilities.ts logic) |
| 17 | `exchangeBuyForAction` | 1 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 18 | `forceExploreOtherPlayer` | 2 | 3 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 19 | `trashRedirectToPlayerDiscard` | 0 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 20 | `infectedDamageReduction` | 0 | 2 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 21 | `weaponDamageReduction` | 0 | 0 | 2 | 0 | 0 | Implemented (abilities.ts) |
| 22 | `extraExploreAtTurnStart` | 0 | 0 | 0 | 0 | 0 | Missing (no engine references anywhere) |
| 23 | `exploreDamagePerPlayerWithBigHand` | 0 | 0 | 1 | 0 | 0 | Implemented (abilities.ts) |
| 24 | `revealHandForDamageIfTwoTypes` | 1 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 25 | `exploreBonusIfActionsInPlayArea` | 0 | 0 | 1 | 0 | 0 | Implemented (abilities.ts) |
| 26 | `skipTurnForSuperNextTurn` | 0 | 1 | 0 | 0 | 1 | Partial (engine refs but no abilities.ts logic) |
| 27 | `giveOneCardToPlayerThenMaybeAnother` | 1 | 1 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 28 | `damageRedirectToPartner` | 0 | 2 | 0 | 0 | 0 | Partial (engine refs but no abilities.ts logic) |
| 29 | `singleWeaponLimiter` | 0 | 0 | 0 | 0 | 0 | Missing (no engine references anywhere) |
| 30 | `generic` | 0 | 1 | 0 | 0 | 0 | No-op fallback (by design) |

## Missing (no engine references anywhere)

- `extraExploreAtTurnStart`
- `singleWeaponLimiter`

## Partial (engine refs but no abilities.ts logic)

- `noHealingNoNonInfectedAttach`
- `gainKnifeAtTurnStart`
- `exchangeHandWithInventoryTop`
- `plusDamageThisTurn`
- `revealMansionTopNoEffect`
- `trashFromHandAtWill`
- `pistolsTwicePerTurn`
- `exchangeBuyForAction`
- `forceExploreOtherPlayer`
- `trashRedirectToPlayerDiscard`
- `revealHandForDamageIfTwoTypes`
- `skipTurnForSuperNextTurn`
- `giveOneCardToPlayerThenMaybeAnother`
- `damageRedirectToPartner`

## Tests

Run `npm run test --workspace=game-core`.
