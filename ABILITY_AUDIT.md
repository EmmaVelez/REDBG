# Ability Audit (regenerated 2026-11-06)

Counts = references in `game-core/src/engine` non-test files. 0 = no engine
reference (likely unimplemented). Caveat: a hit only proves the kind is
*referenced* somewhere in the engine — a helper that is never called from the
apply flow still counts as implemented here, so treat "0 refs" as the reliable
signal and "implemented" as "at least wired to a helper".

`generic` is the intentional text-only fallback (a card whose effect the
engine does not model), not a gap.

## CharacterAbility — 49 kinds, 1 zero-ref
`generic` (intentional fallback)

Every character ability that carries a machine-readable kind is now consumed by
the engine, including the four Nightmare abilities implemented 2026-11-06:
`cardsOnDamageTakenDuringTurn`, `setHpToOnLethal`,
`onDefeatMoveDiscardToInventoryBottom`, `choosePlayerToDiscardOneCardDuringTurn`.
21 character cards still carry NO abilities at all (8 Alliance + 13 Outbreak) —
that is a data gap, not an engine gap.

## WeaponEffect — 25 kinds, 5 zero-ref
gainCardsAndActions, choosePlayerDiscard, allNonExploringPlayersDiscard, gainGoldThisTurn, moveLowHpInfectedToMansionTop

## InfectedEffect — 22 kinds, 9 zero-ref
trashHighestCostAttachedOnPartnerIfNotExactDefeat, mustExploreNextTurnOnDefeat, onKillGainAmmoX10ToMostDecorated, extraTurnOnDefeat, onDefeatGainTopResourceCard, onRevealDamageToExploringCharacters, onDefeatGainGoldAndBuy, onDefeatHealExploring, mostDecoratedLowersMaxHp

## ItemEffect — 6 kinds, 2 zero-ref
attachThenRemoveForCardsAndGold, gainGoldAndBuyThenRemove

## ActionEffect — 39 kinds, 17 zero-ref
prl412RevealAndAutoDefeatOrShuffle, gainAmmo, gainGoldAndAmmoPerInventoryCard, discardInventoryUntilWeaponToHand, lookAtTopInventory, trashOneOfLooked, returnRestTopOrBottomInAnyOrder, drawCardsPerInventoryDivisor, discardInventory, discardChosen, copyBonusesAndEffectsTwice, gainAction, powerOfTVirus, iHaveThis, injection, byAnyMeansNecessary, higherPriorities

## TokenEffect — 1 kind, 0 zero-ref
