# Plan: Engine changes to fully implement remaining Nightmare characters (CH-037..CH-043)

## Status of ability wiring (engine/abilities.ts + game.ts)

Already wired (no work):
- CH-037 Josh Stone L1 goldOnFirstHealThisTurn, L2 weaponFromDiscardToHandAtTurnStartIfMaxHp
- CH-038 Mikhail Victor L2 differentWeaponTypesDamageBonus
- CH-039 Carlos L1 goldAtTurnStart
- CH-040 Mysterious Mask L1 trashCardFromDiscardOnInfectedDefeat, L2 discardActionCardFromHandForPlusTwoCards
- CH-041 Wesker L1 plusOneCardAtTurnStartIfSingleLowHpPlayer
- CH-042 Leon L1 trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat, L2 plusOneCardOnGainCard  (verify)
- CH-043 Ada L1 cardsOnDamageTakenDuringTurn (verify) — L2 setHpToOnLethal unwired

## Unwired ability kinds to implement

1. **weaponBuyCostReduction** (CH-038 Mikhail L1, amount 10)
   - Where: market buy cost calculation in game.ts (buyCard action).
   - Change: when player's character has this ability at level, subtract amount from weapon card buy cost (min 0).
   - Hook: buyCard cost check & gold deduction.

2. **exploreOnBuyCardCostAtLeast** (CH-039 Carlos L2, threshold 80, amount 1)
   - Where: buyCard action handler.
   - Change: after a successful buy where card cost >= threshold, grant amount exploresLeft.

3. **choosePlayerToDiscardOneCardDuringTurn** (CH-041 Wesker L2)
   - Where: new action kind 'choosePlayerDiscardOne' or reuse choosePlayerDiscard.
   - Change: during player's turn, prompt to pick a player (the one identified at L1? or any?) and force discard 1 card. Needs target player tracking from L1.
   - State: store `weskerTargetSeat` on PlayerState when L1 condition met.

4. **plusOneCardOnGainCard** (CH-042 Leon L2)
   - Where: card-gain pipeline (gainCard helper).
   - Change: when a card is gained by a player with this ability at level, draw +1 card (hand).

5. **cardsOnDamageTakenDuringTurn** (CH-043 Ada L1, amount 2)
   - Where: damage application path (applyDamageToCharacter).
   - Change: if damage > 0 to Ada during her own turn, draw amount cards.

6. **setHpToOnLethal** (CH-043 Ada L2, amount 10)
   - Where: damage application / death check.
   - Change: when Ada's HP would drop to <=0, set to amount instead (once? always while ability active). Prevent defeat.

## Implementation order (suggested)
1. weaponBuyCostReduction (isolated buy path)
2. exploreOnBuyCardCostAtLeast (same buy path)
3. plusOneCardOnGainCard (gain pipeline)
4. cardsOnDamageTakenDuringTurn + setHpToOnLethal (damage path)
5. choosePlayerToDiscardOneCardDuringTurn (depends on L1 target tracking + new action)

## Tests
- Add unit tests in game-core for each ability (mirroring existing character tests).
- Run `npm test` in game-core.

## Verification
- tsc + vitest green in game-core.
