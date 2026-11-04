# Ability Audit (regenerated)

Counts = references in game-core/src/engine (actions, explore, turn, game, validate, abilities, characters). 0 = no engine reference (likely unimplemented).

## Zero-reference (likely missing)
allNonExploringPlayersDiscard, attachThenRemoveForCardsAndGold, cardsOnDamageTakenDuringTurn, choosePlayerDiscard, choosePlayerToDiscardOneCardDuringTurn, copyBonusesAndEffectsTwice, discardChosen, discardInventory, discardInventoryUntilWeaponToHand, drawCardsPerInventoryDivisor, extraTurnOnDefeat, gainAmmo, gainCards, gainCardsAndActions, gainGoldAndAmmoPerInventoryCard, gainGoldAndBuyThenRemove, gainGoldThisTurn, lookAtTopInventory, mostDecoratedLowersMaxHp, moveCardsFromDiscardToTopInventory, mustExploreNextTurnOnDefeat, onDefeatGainGoldAndBuy, onDefeatGainTopResourceCard, onDefeatHealExploring, onDefeatMoveDiscardToInventoryBottom, onRevealDamageToExploringCharacters, onRevealHealthPenaltyIfMultipleWeapons, returnRestTopOrBottomInAnyOrder, setHpToOnLethal, trashHighestCostAttachedOnPartnerIfNotExactDefeat, trashOneOfLooked, trashRedirectToPlayerDiscard, plus many infected on-reveal/defeat effects.

## Partial / low reference
See counts above; any ability with 1-2 refs but no apply logic is partial. Notably: trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat (Leon L1) still not wired into defeat flow.
