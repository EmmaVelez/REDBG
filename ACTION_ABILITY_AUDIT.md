# Action Ability Audit (REDBG game-core)

Action-card effect kinds defined in `game-core/src/types.ts` (`ActionEffect` union): **9 unique kinds**.

| # | Effect kind | actions.ts | Status |
|---|---|---|---|
| 1 | `allWeaponsPlusDamageThisTurn` | 1 | Implemented |
| 2 | `recoverWeaponFromDiscardToHand` | 1 | Implemented (prompt) |
| 3 | `moveHandCardToTopOfInventory` | 1 | Implemented (prompt) |
| 4 | `trashHandCard` | 1 | Implemented (prompt) |
| 5 | `negateWeaponCost40OrLessFromHand` | 0 (no-op) | No-op by design (reactive, v1) |
| 6 | `lookAtMansionTop` | 1 | Implemented (prompt) |
| 7 | `trashUpToTwoFromDiscard` | 1 | Implemented (prompt) |
| 8 | `upgradeAmmoBy30Gold` | 0 | Missing (no engine handling) |
| 9 | `stealRevealedWeaponsFromOpponentsTopCards` | 1 | Implemented (prompt) |

## Missing (no engine handling)

- `upgradeAmmoBy30Gold` (Item Management: ac-009) — referenced in data/AI/abilities bonus logic but no prompt/effect resolution in `actions.ts`.

## No-op by design

- `negateWeaponCost40OrLessFromHand` (Back to Back / Struggle for Survival) — reactive effect, v1 no-op with no prompt.

## Tests

Run `npm run test --workspace=game-core` (430 tests passing).
" path">
C:/Users/moralesem/Downloads/dev/REDBG/ACTION_ABILITY_AUDIT.md