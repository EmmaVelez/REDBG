# Fresh Audit — REDBG game-core card effects

Generated from `game-core/src/types.ts` effect unions. Status based on references in engine source (excluding tests).

## Test counts
- Test files: 24 (23 passed, 1 failed)
- Tests: 430 (427 passed, 3 failed)
- Failure: `cards.test.ts` expects 33 infected copies but 70 present (data drift, not engine).

## WeaponEffect
| kind | files referencing | status |
|---|---|---|
| plusDamagePerExtraWeapon | cards.test.ts, explore.test.ts, explore.ts | Implemented |
| plusDamageIfAmmoAbove | actions.ts, explore.test.ts, explore.ts | Implemented |
| grantExplores | actions.ts, cards.test.ts, explore.test.ts | Implemented |
| instantKillAtOrBelowHp | explore.ts | Implemented |
| plusDamagePerActionPlayedThisTurn | actions.ts | Implemented |
| plusDamageIfSelfHpAtLeast | actions.ts | Implemented |
| damageEqualsCurrentAmmo | actions.ts | Implemented |
| revealTopOfInventoryCostGate | actions.ts | Implemented |
| plusDamagePerKnifeUsed | abilities.test.ts, explore.ts | Implemented |
| plusDamageWhenUsingMultipleWeapons | actions.ts | Implemented |
| plusDamagePerOtherKnifeUsedThisTurn | explore.ts | Implemented |

## InfectedEffect
| kind | files referencing | status |
|---|---|---|
| shuffleBackIfNotDefeated | actions.test.ts, explore.test.ts, explore.ts, game.test.ts, game.ts, replay.test.ts | Implemented |
| skipNextTurnOfAPlayerOnDefeat | actions.ts | Implemented |
| noActionsNextTurnOfAPlayerOnDefeat | actions.ts, explore.test.ts | Implemented |
| plusDamagePerFull10AmmoOfAttacker | explore.test.ts, explore.ts | Implemented |
| trashHighestCostAttachedOnPartnerIfNotExactDefeat | NONE | Missing |
| plusHpAndDamagePerAttachedInfected | NONE | Missing |
| mustExploreNextTurnOnDefeat | NONE | Missing |
| buffOtherRevealedInfected | NONE | Missing |
| onKillGainAmmoX10ToMostDecorated | NONE | Missing |
| plusHpIfAttackedWithAnotherInfected | explore.ts | Implemented |

## ItemEffect
| kind | files referencing | status |
|---|---|---|
| healFixed20OrTrashWithSecondFor60 | actions.test.ts, actions.ts, cards.test.ts, cards.ts, explore.test.ts, validate.test.ts, validate.ts | Implemented |
| healToFull | actions.test.ts, actions.ts, cards.test.ts, validate.ts | Implemented |
| healSelfAndPartnerToFull | actions.ts | Implemented |
| plusMaxHp | actions.ts, cards.test.ts, game.test.ts, game.ts | Implemented |

## ActionEffect
| kind | files referencing | status |
|---|---|---|
| allWeaponsPlusDamageThisTurn | actions.test.ts, actions.ts, cards.test.ts, validate.test.ts | Implemented |
| recoverWeaponFromDiscardToHand | actions.test.ts, actions.ts, cards.test.ts, cards.ts | Implemented |
| moveHandCardToTopOfInventory | actions.test.ts, actions.ts, cards.test.ts, cards.ts | Implemented |
| trashHandCard | abilities.test.ts, abilities.ts, actions.test.ts, actions.ts, cards.test.ts, cards.ts | Implemented |
| negateWeaponCost40OrLessFromHand | actions.ts, cards.test.ts, cards.ts | Implemented |
| lookAtMansionTop | actions.test.ts, actions.ts, cards.test.ts, cards.ts | Implemented |
| trashUpToTwoFromDiscard | abilities.ts, actions.test.ts, actions.ts | Implemented |
| upgradeAmmoBy30Gold | abilities.ts, actions.ts, cards.ts | Implemented |
| stealRevealedWeaponsFromOpponentsTopCards | actions.test.ts, actions.ts, cards.ts | Implemented |

## TokenEffect
| kind | files referencing | status |
|---|---|---|
| gainWeaponAndTrashToken | actions.ts, cards.test.ts, game.test.ts | Implemented |

## CharacterAbility
| kind | files referencing | status |
|---|---|---|
| weaponPlusDamagePerInfectedFought | abilities.test.ts, abilities.ts, actions.test.ts, characters.test.ts, game.test.ts, validate.test.ts | Implemented |
| noHealingNoNonInfectedAttach | rules-faq.test.ts, validate.ts | Implemented |
| explosivesGoToDiscardInsteadOfTrash | abilities.test.ts, abilities.ts, characters.test.ts, rules-faq.test.ts, rules-faq.ts | Implemented |
| explosivesPlusDamage | abilities.test.ts, abilities.ts, rules-faq.test.ts, rules-faq.ts | Implemented |
| weaponTagPlusDamage | abilities.test.ts, abilities.ts, actions.test.ts, game.test.ts | Implemented |
| ammoReqReduction | abilities.test.ts, abilities.ts, actions.test.ts | Implemented |
| ammunitionBonus | abilities.test.ts, abilities.ts | Implemented |
| exploreGoldBonus | abilities.test.ts, abilities.ts, actions.ts | Implemented |
| actionBonus | abilities.ts, actions.test.ts, actions.ts | Implemented |
| trashEffectBonus | abilities.ts, actions.ts | Implemented |
| gainKnifeAtTurnStart | actions.test.ts, actions.ts, game.test.ts, game.ts | Implemented |
| exchangeHandWithInventoryTop | actions.test.ts, actions.ts, validate.ts | Implemented |
| plusDamageThisTurn | actions.test.ts, actions.ts, validate.test.ts, validate.ts | Implemented |
| revealMansionTopNoEffect | actions.test.ts, actions.ts, validate.ts | Implemented |
| trashFromHandAtWill | actions.test.ts, actions.ts, validate.ts | Implemented |
| pistolsTwicePerTurn | abilities.test.ts, validate.ts, weaponReuse.test.ts, weaponReuse.ts | Implemented |
| exchangeBuyForAction | actions.ts, validate.ts | Implemented |
| forceExploreOtherPlayer | abilities.test.ts, actions.ts, validate.ts | Implemented |
| trashRedirectToPlayerDiscard | actions.ts | Implemented |
| infectedDamageReduction | abilities.test.ts, abilities.ts, actions.ts | Implemented |
| weaponDamageReduction | abilities.test.ts, abilities.ts | Implemented |
| extraExploreAtTurnStart | abilities.test.ts, game.ts | Implemented |
| exploreDamagePerPlayerWithBigHand | abilities.test.ts, abilities.ts | Implemented |
| revealHandForDamageIfTwoTypes | abilities.test.ts, actions.ts, game.ts, validate.ts | Implemented |
| exploreBonusIfActionsInPlayArea | abilities.test.ts, abilities.ts | Implemented |
| skipTurnForSuperNextTurn | abilities.test.ts, actions.ts, game.ts | Implemented |
| giveOneCardToPlayerThenMaybeAnother | abilities.test.ts, actions.ts, game.ts, validate.ts | Implemented |
| damageRedirectToPartner | actions.ts | Implemented |
| singleWeaponLimiter | validate.ts | Implemented |
| generic | actions.test.ts, actions.ts, characters.test.ts, rules-faq.test.ts | No-op by design |
EOF