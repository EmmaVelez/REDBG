/**
 * @re/game-core — shared type contract (v2, aligned with the official Premier
 * Edition rulebook — see docs/rules/RULES-DIGEST.md).
 *
 * This file is THE contract every module conforms to. It is maintained by the
 * orchestrator; coder tasks must not edit it unless the task spec says so.
 *
 * Design principles:
 * - GameState is immutable-by-convention: the engine reducer returns a NEW state.
 * - Every state mutation is expressed as an Action, validated before applying.
 * - The action log + initial seed fully determine a game (replay/determinism).
 * - Scope: Story Mode, "First Timer" scenario. Other modes must stay addable
 *   (setup config + win-condition strategy) but are out of scope for v1.
 */

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type CardType =
  | "character"
  | "weapon"
  | "ammunition"
  | "item"
  | "action"
  | "token"      // Mansion-only cases (Rocket Launcher Case, Gatling Gun Case)
  | "infected"  // Mansion-only creatures
  | "event";    // Mansion-only events

/** Zones a card instance can live in. */
export type CardZone =
  | "marketPile"   // a Resource Area pile (pileId identifies which)
  | "mansionDeck"  // face-down Mansion deck (top = index 0)
  | "hand"
  | "playArea"     // in front of a player this turn (played cards)
  | "attached"     // attached under a Character (defeated Infected trophies)
  | "inventory"    // player's deck (top = index 0)
  | "discard"
  | "infectionDeck" // Outbreak: face-down Infection Deck
  | "removed";     // removed from the game

export interface CardLocation {
  readonly zone: CardZone;
  /** Index within the zone's list (0 = top for decks/piles). */
  readonly index: number;
  /** Owning seat, when the zone belongs to a player. */
  readonly seat?: number;
  /** Market pile id, when zone === "marketPile". */
  readonly pileId?: string;
}

/** Bonus icons printed on cards (granted for the turn when played). */
export interface CardBonuses {
  readonly cards?: number;     // +X Card(s): draw X
  readonly gold?: number;      // +X Gold
  readonly ammo?: number;      // +X Ammo
  readonly buys?: number;      // +X Buy(s)
  readonly actions?: number;   // +X Action(s)
  readonly explores?: number;  // +X Explore
}

/** Static card definition (the card database entry). */
export interface CardDef {
  /** Stable unique id matching the printed card number, e.g. "we-009". */
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  readonly set: 'premier' | 'promo' | 'alliance' | 'nightmare' | 'outbreak';
  /** Human-readable rules text (for UI + reference). */
  readonly text: string;
  /** Copies of this card in the game (used when building piles). */
  readonly copies: number;

  /** Cost to Buy from the Resource Area (Gold). Absent = not purchasable. */
  readonly cost?: number;

  /** Bonus icons (ammunition, some actions/weapons). */
  readonly bonuses?: CardBonuses;

  // -- weapon --
  /** Ammo required to use this weapon when Exploring. 0 = free (knives). */
  readonly ammoReq?: number;
  /** Damage this weapon contributes to an Explore. */
  readonly damage?: number;
  /** Machine-readable effect keys the engine interprets (see WeaponEffect). */
  readonly weaponEffects?: readonly WeaponEffect[];
  /** Ammo cap for X-machine-gun weapons (max ammo assignable). */
  readonly ammoCap?: number;
  /** X-weapon: ammo assigned = damage. */
  readonly xAmmo?: boolean;
  readonly weaponTags?: readonly WeaponTag[]; // e.g. "explosive" (Jill synergy)
  /** Weapon category type (e.g. "handgun", "shotgun") — used by Desperate Forces (AC-022). */
  readonly weaponType?: string;

  // -- infected --
  readonly hp?: number;
  /** Damage dealt to the exploring Character when NOT defeated. */
  readonly attack?: number;
  /** Decorations awarded when defeated. */
  readonly decorations?: number;
  /** Machine-readable effect keys (see InfectedEffect). */
  readonly infectedEffects?: readonly InfectedEffect[];
  /** Las Plagas infected flag (Alliance). */
  readonly plagas?: boolean;

  // -- character --
    /** Starting AND maximum Health at Level 1. */
    readonly maxHp?: number;
    /** Outbreak: base Damage this Character deals when Attacking (Infected
     *  Characters). 0 when absent (rulebook: all characters have base
     *  Damage 0 if not shown otherwise). */
    readonly baseDamage?: number;
    /** Decorations needed to reach Level 2. */
    readonly level2At?: number;
    /** Decorations needed to reach Level 1 (default 0; Krauser requires 1). */
    readonly level1At?: number;
  /** Ability text per level (level 1 first). */
  readonly levels?: ReadonlyArray<{ readonly level: number; readonly text: string }>;
  /** Machine-readable ability keys (see CharacterAbility). */
  readonly abilities?: readonly CharacterAbility[];

  // -- item / action / token: machine-readable effects --
  readonly itemEffects?: readonly ItemEffect[];
  readonly actionEffects?: readonly ActionEffect[];
  readonly tokenEffects?: readonly TokenEffect[];
}

/**
 * Machine-readable effects. The engine switches on these keys; card `text`
 * is only for display. Effects requiring choices resolve via Prompt.
 */
export type WeaponTag = "explosive" | "melee" | "gun" | "pistol" | "magnum" | "rifle" | "knife" | "shotgun" | "machineGun";

export type WeaponEffect =
  | {readonly kind: "plusDamagePerExtraWeapon"; readonly amount: number}   // Burst-Fire Handgun: +X when using multiple weapons
  | {readonly kind: "plusDamageIfAmmoAbove"; readonly threshold: number; readonly amount: number} // Full-Bore MG: +X if ammo > N
  | {readonly kind: "grantExplores"; readonly amount: number}             // Pump-Action/Trio Shotguns
  | {readonly kind: "instantKillAtOrBelowHp"; readonly hp: number}        // Automatic/Auto Shotguns  
  | {readonly kind: "plusDamagePerActionPlayedThisTurn"; readonly amount: number} // Semi-Automatic Rifle
  | {readonly kind: "plusDamageIfSelfHpAtLeast"; readonly hp: number; readonly amount: number} // Submission
  | {readonly kind: "damageEqualsCurrentAmmo"}                            // Gatling Gun: X = current Ammo
  | {readonly kind: "revealTopOfInventoryCostGate"; readonly threshold: number; readonly amount: number} // Bolt-Action Rifle
  | {readonly kind: "plusDamagePerKnifeUsed"; readonly amount: number}    // Survival Knife
  | {readonly kind: "plusDamageWhenUsingMultipleWeapons"; readonly amount: number} // Burst-Fire Handgun Alliance
  | {readonly kind: "plusDamagePerOtherKnifeUsedThisTurn"; readonly amount: number} // Survival Knife Alliance
  | { readonly kind: "gainCardsAndActions"; readonly cards: number; readonly actions: number } // Silver Ghost/Punisher
  | { readonly kind: "plusDamagePerAmmoInPlayArea"; readonly amount: number } // Mine Thrower
  | { readonly kind: "plusDamageIfInventoryAtLeast"; readonly threshold: number; readonly amount: number } // Broken Butterfly
  | { readonly kind: "choosePlayerDiscard"; readonly count: number } // Single Shot Rifle
  | { readonly kind: "allNonExploringPlayersDiscard"; readonly count: number } // Special Ops Rifle
  | { readonly kind: "gainGoldThisTurn"; readonly amount: number } // Machine Pistol
  | { readonly kind: "plusDamagePerWeaponTagInDiscard"; readonly tag: WeaponTag; readonly amount: number } // Gangster's Machine Gun
  | { readonly kind: "grantExploreAndSuppressLowHpInfected"; readonly hpThreshold: number; readonly trashAfterUse: boolean } // Flashbang
  | { readonly kind: "plusDamagePerInfectedBattled"; readonly amount: number } // Incendiary Grenade
  | { readonly kind: "plusDamagePerNonItemGainedThisTurn"; readonly amount: number } // WE-026 Standard Sidearm
  | { readonly kind: "plusDamagePerCardGainedThisTurn"; readonly amount: number } // WE-027 Samurai Edge
  | { readonly kind: "moveLowHpInfectedToMansionTop"; readonly hpThreshold: number } // WE-028 Stun Rod
  | { readonly kind: "plusDamageIfNightTime"; readonly amount: number }
  | { readonly kind: "trashAfterUse" }; // WE-031 Night Scope Rocket Launcher
export type InfectedEffect =
  | { readonly kind: "shuffleBackIfNotDefeated" }                            // Uroboros Aheri
  | { readonly kind: "skipNextTurnOfAPlayerOnDefeat" }                       // Executioner: on defeat, attacker chooses a player (Prompt) who skips their next turn
  | { readonly kind: "noActionsNextTurnOfAPlayerOnDefeat" }                  // Zombie (Female): on defeat, choose a player (Prompt); they can't play Actions next turn
  | { readonly kind: "plusDamagePerFull10AmmoOfAttacker"; readonly amount: number } // Gatling Gun Majini: +5 per full 10 Ammo
  | { readonly kind: "trashHighestCostAttachedOnPartnerIfNotExactDefeat" } // MA-036 Reaper
  | { readonly kind: "plusHpAndDamagePerAttachedInfected"; readonly amount: number } // MA-035 Los Illuminados Monk
  | { readonly kind: "mustExploreNextTurnOnDefeat" } // MA-030 Cephalo
  | { readonly kind: "buffOtherRevealedInfected"; readonly hp: number; readonly damage: number } // MA-029 Albert Wesker
  | { readonly kind: "onKillGainAmmoX10ToMostDecorated"; readonly count: number } // MA-025 Duvalia
  | { readonly kind: "plusHpIfAttackedWithAnotherInfected"; readonly amount: number } // MA-023 Infected Bat
  | { readonly kind: "onNotDefeatedGainAmmoAndShuffle"; readonly base: number; readonly perLevel: number } // Osmund Saddler
  | { readonly kind: "extraTurnOnDefeat" } // Bitores Mendez
  | { readonly kind: "onRevealWeaponDamagePenalty"; readonly amount: number } // Regenerator
  | { readonly kind: "onDefeatGainTopResourceCard" } // Jack Krauser
  | { readonly kind: "onRevealDamageToExploringCharacters"; readonly base: number; readonly perInventoryCard: number } // Militia Rocket Launcher
  | { readonly kind: "cannotBeDefeatedIfActionsAtLeast"; readonly count: number } // Novistador
  | { readonly kind: "onDefeatGainGoldAndBuy"; readonly gold: number; readonly buys: number } // Zombie Security Guard
  | { readonly kind: "cannotBeDefeatedIfInventoryAtMost"; readonly count: number } // Verdugo
  | { readonly kind: "onDefeatHealExploring"; readonly amount: number } // Ivy
  | { readonly kind: "onRevealBonusDamageIfCharacterDamaged"; readonly threshold: number; readonly amount: number } // Neptune
  | { readonly kind: "mostDecoratedLowersMaxHp"; readonly amount: number } // Hunter
  | { readonly kind: "onRevealHealthPenaltyIfMultipleWeapons"; readonly count: number; readonly amount: number } // Cerberus
  // --- Outbreak (MA-041..MA-053) ---
  | { readonly kind: "onRevealInfectionIncrease"; readonly threshold: number; readonly lowAmount: number; readonly highAmount: number } // MA-042 Yawn
  | { readonly kind: "onRevealAllInfectionIncrease"; readonly amount: number } // MA-043 Nemesis (2nd form)
  | { readonly kind: "onNotDefeatedInfectionIncrease"; readonly amount: number; readonly perLevel: number } // MA-041 Tyrant T-002, MA-046 Web Spinner
  | { readonly kind: "onNotDefeatedShuffleBack" } // MA-041 Tyrant T-002
  | { readonly kind: "onDefeatInfectionIncrease"; readonly amount: number; readonly toMansionBottom: boolean }; // MA-053 Lisa Trevor

export type ItemEffect =
  | { readonly kind: "healFixed20OrTrashWithSecondFor60" }                   // Green Herb
  | { readonly kind: "healToFull" }                                          // First Aid Spray
  | { readonly kind: "healSelfAndPartnerToFull" }                            // Red Herb IT-004
  | { readonly kind: "plusMaxHp"; readonly amount: number }                  // Yellow Herb (Mansion only): +amount max HP
  | { readonly kind: "attachThenRemoveForCardsAndGold"; readonly cards: number; readonly gold: number } // Treasure Map
  | { readonly kind: "gainGoldAndBuyThenRemove"; readonly gold: number; readonly buys: number }; // Hidden Treasure

export type ActionEffect =
  | { readonly kind: "allWeaponsPlusDamageThisTurn"; readonly amount: number } // Deadly Aim: +10
  | { readonly kind: "recoverWeaponFromDiscardToHand" }                      // Reload (choice via Prompt)
  | { readonly kind: "moveHandCardToTopOfInventory" }                        // Umbrella Corp (choice via Prompt)
  | { readonly kind: "trashHandCard" }                                       // Ominous Battle (choice via Prompt)
  | { readonly kind: "negateWeaponCost40OrLessFromHand" }                    // Struggle for Survival (reactive)
  | { readonly kind: "lookAtMansionTop"; readonly count: number }           // Mansion Foyer style peek (Prompt ordering)
  | { readonly kind: "trashUpToTwoFromDiscard" }                             // Shattered Memories (multi-choice)
  | { readonly kind: "upgradeAmmoBy30Gold" }                                 // Item Management: trash 1 Ammo from hand, gain one worth 30 Gold more
  | { readonly kind: "stealRevealedWeaponsFromOpponentsTopCards" }          // Master of Unlocking
  | { readonly kind: "prl412RevealAndAutoDefeatOrShuffle" } // P.R.L. 412
  // Nightmare action card stubs (NIGHTMARE_ACTION_EFFECTS.md)
  | { readonly kind: "gainAmmo"; readonly amount: number }
  | { readonly kind: "onExploreWeaponDamagePerDiscardCard"; readonly amount: number }
  | { readonly kind: "gainGoldAndAmmoPerInventoryCard"; readonly gold: number; readonly ammo: number }
  | { readonly kind: "discardInventoryUntilWeaponToHand" }
  | { readonly kind: "lookAtTopInventory"; readonly count: number }
  | { readonly kind: "trashOneOfLooked" }
  | { readonly kind: "returnRestTopOrBottomInAnyOrder" }
  | { readonly kind: "drawCardsPerInventoryDivisor"; readonly divisor: number }
  | { readonly kind: "gainCards"; readonly count: number }
  | { readonly kind: "discardInventory" }
  | { readonly kind: "chooseOtherPlayerRevealHand" }
  | { readonly kind: "chooseActionCardCostAtMost"; readonly maxCost: number }
  | { readonly kind: "discardChosen" }
  | { readonly kind: "copyBonusesAndEffectsTwice" }
  | { readonly kind: "gainActions"; readonly count: number }
  | { readonly kind: "gainAction"; readonly amount: number }
  | { readonly kind: "moveCardsFromDiscardToTopInventory"; readonly count: number; readonly owner: string }
  | { readonly kind: "damageCharacter"; readonly amount: number }
  | { readonly kind: "unlimitedActionsThisTurn" }
  | { readonly kind: "damagePerAdditionalAction"; readonly amount: number }
  | { readonly kind: "attachToCharacter" }
  | { readonly kind: "beginTurnTrashIfHealthAtMost"; readonly threshold: number }
  | { readonly kind: "elseDamageAndDraw"; readonly damage: number; readonly cards: number }
  | { readonly kind: "powerOfTVirus" } // AC-023
  | { readonly kind: "iHaveThis" } // AC-024
  | { readonly kind: "weskersSecret" } // AC-025
  | { readonly kind: "injection" } // AC-026
  | { readonly kind: "byAnyMeansNecessary" } // AC-027
  | { readonly kind: "higherPriorities" } // AC-028
  | { readonly kind: "returnedFavor" } // AC-030
  | { readonly kind: "partingWays" } // AC-029
  | { readonly kind: "gatheringDarkness" } // AC-031
  // --- Outbreak infection cards (IN-001..IN-007) ---
  | { readonly kind: "infectionActionsNextTurn"; readonly actions: number } // IN-001 Claw
  | { readonly kind: "virulentFrenzy" } // IN-002
  | { readonly kind: "bileVomit" } // IN-003
  | { readonly kind: "sloughArmor"; readonly amount: number } // IN-004 (reactive)
  | { readonly kind: "drag" } // IN-005
  | { readonly kind: "devour"; readonly heal: number } // IN-006
  | { readonly kind: "infectionIncrease"; readonly amount: number }; // IN-007

export type TokenEffect =
  | { readonly kind: "gainWeaponAndTrashToken"; readonly weaponCardId: string }; // Rocket Launcher Case -> we-008, Gatling Gun Case -> we-007

export type CharacterAbility =
  | { readonly kind: "weaponPlusDamagePerInfectedFought"; readonly amount: number; readonly level: 1 | 2 } // Chris L1: +5 per Infected being fought
  | { readonly kind: "noHealingNoNonInfectedAttach"; readonly level: 1 | 2 }                              // Chris restriction
  | { readonly kind: "explosivesGoToDiscardInsteadOfTrash"; readonly level: 1 | 2 }                       // Jill L2
  | { readonly kind: "explosivesPlusDamage"; readonly amount: number; readonly level: 1 | 2 }             // Jill L1: +amount per Explosive weapon used
  | { readonly kind: "weaponTagPlusDamage"; readonly tag: WeaponTag; readonly amount: number; readonly level: 1 | 2 } // Barry L2 magnums +20 dmg, Krauser L2 knives +5 dmg
  | { readonly kind: "ammoReqReduction"; readonly tag: WeaponTag; readonly amount: number; readonly level: 1 | 2 }     // Leon L1 pistols -10 ammoReq, Sheva L2 rifles -20 ammoReq
  | { readonly kind: "ammunitionBonus"; readonly ammoAmount: number; readonly goldAmount: number; readonly level: 1 | 2 } // Claire: +10 Ammo (L1) / +10 Gold (L2) per Ammo card
  | { readonly kind: "exploreGoldBonus"; readonly amount: number; readonly level: 1 | 2 }                 // Wesker L1: +Gold that turn whenever he Explores
  | { readonly kind: "actionBonus"; readonly amount: number; readonly level: 1 | 2 }                       // Ada L2: buys -> actions, action cards worth more
  | { readonly kind: "trashEffectBonus"; readonly amount: number; readonly level: 1 | 2 }                  // Rebecca L2: trash actions/effects worth more
    | { readonly kind: "gainKnifeAtTurnStart"; readonly level: 1 | 2 }                                       // Krauser L1: at beginning of turn, may gain 1 Knife weapon
    | { readonly kind: "exchangeHandWithInventoryTop"; readonly level: 1 | 2 }                               // Sheva L1: exchange 1 hand card with top of Inventory
    | { readonly kind: "plusDamageThisTurn"; readonly amount: number; readonly level: 1 | 2 }                // Barry L1: one weapon +5 damage this turn (once per turn)
    | { readonly kind: "revealMansionTopNoEffect"; readonly level: 1 | 2 }                                   // Ada L1: peek the Mansion top without engaging
    | { readonly kind: "trashFromHandAtWill"; readonly level: 1 | 2 }                                        // Rebecca L2: trash a card from hand whenever you please
  | { readonly kind: "pistolsTwicePerTurn"; readonly level: 1 | 2 }                                          // Leon L2: pistol weapons can be used twice per turn
  | { readonly kind: "exchangeBuyForAction"; readonly level: 1 | 2 }                                         // Ada L2: exchange your Buy for an additional Action
  | { readonly kind: "forceExploreOtherPlayer"; readonly level: 1 | 2 }                                      // Wesker L2: choose a player; +1 Explore and must Explore next turn
  | { readonly kind: "trashRedirectToPlayerDiscard"; readonly level: 1 | 2 }                                 // Rebecca L1: cards you trash via effects may go to other players' discard piles
  | { readonly kind: "infectedDamageReduction"; readonly amount: number; readonly level: 1 | 2 }             // PR-001 Chris L1: Infected deal -amount damage to him
  | { readonly kind: "weaponDamageReduction"; readonly amount: number; readonly level: 1 | 2 }               // PR-001 Chris L2: Weapons deal -amount damage to him (dormant until PvP exists)
  | { readonly kind: "extraExploreAtTurnStart"; readonly level: 1 | 2 }                                      // PR-001 Chris L2: +1 Explore at the beginning of the turn
  | { readonly kind: "exploreDamagePerPlayerWithBigHand"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 }   // PR-009 Rebecca L2: +amount per player with >threshold cards in hand while exploring
  | { readonly kind: "revealHighHpInfectedBonusDamage"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 }   // CH-034 Chris Nightmare: +amount damage this turn when revealing infected with HP >= threshold
  | { readonly kind: "revealHandForDamageIfTwoTypes"; readonly amount: number; readonly level: 1 | 2 }       // PR-010 Hunk L1: reveal hand; if >=2 different types, +amount damage this turn
  | { readonly kind: "exploreBonusIfActionsInPlayArea"; readonly amount: number; readonly minActions: number; readonly level: 1 | 2 }     // PR-010 Hunk L2: +amount explore damage with >=minActions actions in play area
  | { readonly kind: "skipTurnForSuperNextTurn"; readonly level: 1 | 2 }                                     // PR-002 Jill: skip turn & discard hand -> next turn +5 cards/+1 Buy/Action/Explore
  | { readonly kind: "giveOneCardToPlayerThenMaybeAnother"; readonly level: 1 | 2 }                          // PR-009 Rebecca L1: another player +1 card; if so, a player +1 card
  | { readonly kind: "giveOneCardToPlayerThenMaybeAnother"; readonly level: 1 | 2 }                          // PR-009 Rebecca L1: another player +1 card; if so, a player +1 card
  | { readonly kind: "damageRedirectToPartner"; readonly level: 1 | 2 }                                 // HUNK (Alliance) L1: takes damage for partner and redirects it to them
    | { readonly kind: "singleWeaponLimiter"; readonly level: 1 | 2 }                                   // Jack L1: can't use >1 weapon while limitation is active
      | { readonly kind: "generic"; readonly level: 1 | 2 }                                                  // fallback: text-only ability, engine treats as no-op (v1)
  | { readonly kind: "optionalSelfDamageForDamageThisTurn"; readonly damage: number; readonly amount: number; readonly level: 1 | 2 } // Sergei L1
  | { readonly kind: "exploreOnInfectedDefeat"; readonly amount: number; readonly level: 1 | 2 }            // Sergei L2
  | { readonly kind: "optionalPlusOneCardWithDiscardCondition"; readonly level: 1 | 2 }                    // Luis Sera L1
  | { readonly kind: "onDefeatMoveDiscardToInventoryBottom"; readonly level: 1 | 2 }                      // Luis Sera L2
  | { readonly kind: "goldOnFirstHealThisTurn"; readonly amount: number; readonly level: 1 | 2 }         // Josh Stone L1
  | { readonly kind: "weaponFromDiscardToHandAtTurnStartIfMaxHp"; readonly level: 1 | 2 }               // Josh Stone L2
  | { readonly kind: "weaponBuyCostReduction"; readonly amount: number; readonly level: 1 | 2 }         // Mikhail Victor L1: weapons cost amount less to buy
  | { readonly kind: "differentWeaponTypesDamageBonus"; readonly amount: number; readonly level: 1 | 2 }  // Mikhail Victor L2: while using weapons of different types, +amount damage
  | { readonly kind: "goldAtTurnStart"; readonly amount: number; readonly level: 1 | 2 }                      // Carlos Oliveira (Nightmare) L1: at turn start +amount gold
  | { readonly kind: "exploreOnBuyCardCostAtLeast"; readonly threshold: number; readonly amount: number; readonly level: 1 | 2 } // Carlos Oliveira (Nightmare) L2: on buy card cost >= threshold, +amount explore
  | { readonly kind: "trashCardFromDiscardOnInfectedDefeat"; readonly level: 1 | 2 } // Mysterious Mask (Nightmare) L1: on defeat infected, may trash a card from discard
  | { readonly kind: "discardActionCardFromHandForPlusTwoCards"; readonly level: 1 | 2 } // Mysterious Mask (Nightmare) L2: during turn, may discard one action card from hand for +2 cards
  | { readonly kind: "plusOneCardAtTurnStartIfSingleLowHpPlayer"; readonly hpThreshold: number; readonly level: 1 | 2 } // Albert Wesker (Nightmare) L1: at turn start, if only one other player's character has <=hpThreshold HP, may +1 card
  | { readonly kind: "choosePlayerToDiscardOneCardDuringTurn"; readonly level: 1 | 2 } // Albert Wesker (Nightmare) L2: during turn, may choose that player to discard one card
  | { readonly kind: "trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat"; readonly level: 1 | 2 } // Leon S. Kennedy (Nightmare) L1: on defeat infected, may trash card from discard then gain card costing up to 20 more
  | { readonly kind: "plusOneCardOnGainCard"; readonly level: 1 | 2 } // Leon S. Kennedy (Nightmare) L2: on gain card, +1 card
  | { readonly kind: "cardsOnDamageTakenDuringTurn"; readonly amount: number; readonly level: 1 | 2 } // Ada Wong (Nightmare) L1: during turn, if Ada takes damage, +amount cards
  | { readonly kind: "setHpToOnLethal"; readonly amount: number; readonly level: 1 | 2 } // Ada Wong (Nightmare) L2: when HP would be reduced to 0 or less, set to amount instead
  | { readonly kind: "discardCardToInventoryBottom"; readonly level: 1 | 2 } // Leon S. Kennedy (Alliance) L1: during turn, move one discard card to the bottom of the inventory
  | { readonly kind: "inventoryBottomToTop"; readonly level: 1 | 2 } // Leon S. Kennedy (Alliance) L2: during turn, move the bottom card of the inventory to the top
  | { readonly kind: "gainAmmoX10ForGold"; readonly amount: number; readonly level: 1 | 2 } // Billy Coen (Alliance) L1: during turn, gain one Ammo x10 and get +amount gold
  | { readonly kind: "discardToHandIfTenPlus"; readonly threshold: number; readonly level: 1 | 2 } // Billy Coen (Alliance) L2: during turn, if discard >= threshold, move one discard card to hand
  | { readonly kind: "plusDamagePerCardInHand"; readonly amount: number; readonly level: 1 | 2 } // Jack Krauser (Alliance) L2: +amount damage for every card in his hand
  | { readonly kind: "healAtTurnStart"; readonly amount: number; readonly level: 1 | 2 } // Steve Burnside (Alliance) L1: recover amount HP at the start of each turn
  | { readonly kind: "discardCardForHealAndDamage"; readonly cardId: string; readonly heal: number; readonly damage: number; readonly level: 1 | 2 } // Steve Burnside (Alliance) L2: discard the named card from hand -> heal and +damage this turn
  | { readonly kind: "singleWeaponAmmoDiscount"; readonly amount: number; readonly level: 1 | 2 } // Chris Redfield (Alliance) L1: -amount ammo requirement when using exactly one weapon
  | { readonly kind: "chosenWeaponTypeAmmoDiscount"; readonly amount: number; readonly level: 1 | 2 } // Chris Redfield (Alliance) L2: -amount ammo requirement for a chosen weapon type
  | { readonly kind: "partnerAttachedCountDamageBonus"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // Jill Valentine (Alliance) L1: +amount damage when exploring if her partner has <= threshold cards attached
  | { readonly kind: "offTurnFlashGrenadeLasPlagas"; readonly level: 1 | 2 } // Jill Valentine (Alliance) L2: on an opponent's Las Plagas reveal, may trash a Flash Grenade to defeat it
  | { readonly kind: "weaponCostCap"; readonly maxCost: number; readonly level: 1 | 2 } // Josh Stone (Alliance) L1: cannot use weapons costing maxCost or more
  | { readonly kind: "partnerAttachCapBonus"; readonly amount: number; readonly level: 1 | 2 } // Josh Stone (Alliance) L2: partner may attach amount extra cards
  | { readonly kind: "herbTrashDamageBonus"; readonly amount: number; readonly level: 1 | 2 } // Claire Redfield (Alliance) L1: +amount damage this turn when a Green/Red Herb is trashed
  | { readonly kind: "doubleDamageOnBothHerbs"; readonly level: 1 | 2 } // Claire Redfield (Alliance) L2: double all damage this turn when a Green and a Red Herb are both trashed
  | { readonly kind: "perfectExploreReward"; readonly level: 1 | 2 } // Carlos Oliveira (Alliance) L2: on a perfect explore (damage == health), take one discard card to hand
  // --- Outbreak characters ---
  | { readonly kind: "plusDamageIfTwoOrMoreWeapons"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // Mark Wilkins L1
  | { readonly kind: "exploreBonusIfAmmoAbove"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // Chris Redfield (Outbreak) L2
  | { readonly kind: "turnStartActionIfHpAtMost"; readonly threshold: number; readonly level: 1 | 2 } // Ada Wong (Outbreak) L1
  | { readonly kind: "baseDamageBonusIfHpAtMost"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // HUNK (Outbreak) L2
  | { readonly kind: "discardAnyForAmmo"; readonly amount: number; readonly level: 1 | 2 } // Chris Redfield (Outbreak) L1
  | { readonly kind: "turnStartDecreaseInfection"; readonly level: 1 | 2 } // Jill Valentine (Outbreak) L1
  | { readonly kind: "immuneToInfectionAtLevelZero"; readonly level: 1 | 2 } // Jill Valentine (Outbreak) L2
  | { readonly kind: "gainInfectionForGold"; readonly amount: number; readonly level: 1 | 2 } // Excella Gionne (Outbreak) L1
  | { readonly kind: "turnStartCardsIfInfectionAtLeast"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // Excella Gionne (Outbreak) L2
  | { readonly kind: "turnStartDamageForExplore"; readonly amount: number; readonly level: 1 | 2 } // HUNK (Outbreak) L1
  | { readonly kind: "turnStartRevealActionsForCards"; readonly level: 1 | 2 } // Ada Wong (Outbreak) L2
  | { readonly kind: "moveHandCardToTopOfInventory"; readonly level: 1 | 2 } // Leon S. Kennedy (Outbreak) L1
  | { readonly kind: "discardForActionFromDiscard"; readonly level: 1 | 2 } // Leon S. Kennedy (Outbreak) L2
  | { readonly kind: "gainSpecificWeaponIntoInventory"; readonly cardId: string; readonly level: 1 | 2 } // Kevin Ryman (Outbreak) L1
  | { readonly kind: "movePlayAreaWeaponToInventoryTop"; readonly tag: string; readonly level: 1 | 2 }; // Kevin Ryman (Outbreak) L2


// ---------------------------------------------------------------------------
// Card instances
// ---------------------------------------------------------------------------

/** A concrete card instance in a game. */
export interface CardInstance {
  /** Unique instance id, e.g. "we-009#3". */
  readonly instanceId: string;
  readonly cardId: string;
  readonly location: CardLocation;
}

// ---------------------------------------------------------------------------
// Market piles
// ---------------------------------------------------------------------------

/**
 * A Resource Area pile: face-up stack; Buy takes the TOP card. Combined piles
 * (e.g. Handgun + Burst-Fire Handgun) are pre-shuffled into one pile at setup.
 */
export interface MarketPile {
  readonly pileId: string;
  /** Instance ids, top = index 0. */
  readonly cards: readonly string[];
}

// ---------------------------------------------------------------------------
// Players & seats
// ---------------------------------------------------------------------------

export interface PlayerState {
  readonly seat: number;
  readonly name: string;
  readonly controller: "human" | "bot";
  readonly botLevel?: number;

  /** The Character card instance this player controls. */
  readonly characterInstanceId: string;
  readonly hp: number;
  readonly maxHp: number;
  /** Persistent victory currency. */
    readonly decorations: number;
    /** Highest tier unlocked: 0 = below L1 gate, 1 = L1, 2 = L2 (per-card gates). */
    readonly level: 0 | 1 | 2;

  /** Per-turn resource pools (reset at turn start; granted by played cards). */
  readonly turnAmmo: number;
  readonly turnGold: number;
  readonly actionsLeft: number;
  readonly buysLeft: number;
  readonly exploresLeft: number;
  /** Temporary per-turn combat bonus (Deadly Aim etc.). */
  readonly weaponDamageBonusThisTurn: number;
  /** Claire Redfield (Alliance) L2: multiplies all damage dealt this turn. */
  readonly damageMultiplierThisTurn?: number;
  /** Vengeful Intention etc: damage added per additional action played this turn. */
  readonly damagePerAdditionalActionThisTurn?: number;
  /** AC-022 Desperate Forces: chosen weapon types get +10 damage this turn. */
  readonly desperateForcesTypes?: readonly string[];
  /** Chris Redfield (Alliance) L2: weapon types with a reduced ammo requirement this turn. */
  readonly chrisAmmoDiscountTypes?: readonly string[];
  /** Skip the next turn entirely (Executioner). */
  readonly skipNextTurn?: boolean;
  /** Cannot play Actions next turn (Zombie Female). */
  readonly noActionsNextTurn?: boolean;
  readonly extraTurnPending?: boolean;
  /** Wesker L2: this player must Explore on their current turn (grants +1
   *  Explore at turn start; blocks endTurn until at least one explore). */
  readonly mustExplore?: boolean;
  /** Yellow Herb: amount of max-HP-heal owed at the start of this player's
   *  NEXT real turn (fallen from a herb attached via Explore gain). */
  readonly pendingHerbHeal?: number;
  /** Josh Stone L1: whether the first heal this turn has already fired. */
  readonly healedFirstTimeThisTurn?: boolean;
  /** PR-002 Jill: set when she skips a turn; her NEXT turn start grants the
   *  super-turn bonuses (+5 cards, +1 Buy/Action/Explore) and clears it. */
  readonly skipRewardPending?: boolean;

  /** Instance ids of defeated Infected attached under the Character (trophies). */
  readonly attached: readonly string[];

  /** Partner character instance id, if any. */
  readonly partnerInstanceId?: string;
  /** Cards attached to the partner (max 2 unless stated). */
  readonly partnerAttached?: readonly string[];
  /** Whether partner leads exploration this turn (shared explore). */
  readonly partnerLeading?: boolean;
  /** Partner health, tracked separately from main character. */
  readonly partnerHp?: number;
  readonly partnerMaxHp?: number;
  readonly inventory: readonly string[]; // deck, top = index 0
  readonly hand: readonly string[];
  readonly discard: readonly string[];
  readonly playArea: readonly string[];
  /** Instance ids of cards gained this turn (for WE-026 etc.). */
  readonly gainedThisTurn?: readonly string[];

  /** Outbreak: the face-up Infection cards next to this Character. The
   *  Infection Level IS the number of these cards (rulebook). */
  readonly infectionCards?: readonly string[];
  /** Outbreak: this seat has reanimated as an Infected Character. */
  readonly isInfectedCharacter?: boolean;
  /** Outbreak: the Character died of the Infection and will reanimate as an
   *  Infected Character when its next turn comes around. */
  readonly pendingReanimate?: boolean;
  /** Outbreak IN-001 Claw: cap on Actions next turn (default 1). */
  readonly actionsCapNextTurn?: number;
  /** Outbreak IN-005 Drag: this seat may not Attack the named seat next turn. */
  readonly cannotAttackSeatNextTurn?: number;
  /** Outbreak: this seat Explored the Mansion or Attacked an Infected
   *  Character this turn (suppresses the end-of-turn Infection increase). */
  readonly exploredOrAttackedThisTurn?: boolean;
  /** Face-down (recovering): revives on own turn with -20 maxHp, skips it. */
  readonly downed: boolean;
  /** Permanently dead (maxHp reached 0). */
  readonly dead: boolean;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Phase =
  | "setup"
  | "main"       // active player spends Action/Buy/Explore tokens in any order
  | "turnEnd"    // discard play area + hand, draw 5
  | "gameOver";

export interface GameState {
  /** Bumped on every applied action; used for sync/optimistic UI. */
  readonly version: number;
  readonly seed: number;
  /** Monotonic RNG state (seeded; advanced by every random draw). */
  readonly rngState: number;

  readonly phase: Phase;
  readonly activeSeat: number;
  readonly turnNumber: number;

  readonly seats: readonly PlayerState[];

  /** Resource Area: fixed piles keyed by pileId (18 in First Timer). */
  readonly marketPiles: Readonly<Record<string, MarketPile>>;

  /** Mansion deck, top = index 0 (Infected + tokens + Yellow Herbs). */
  readonly mansionDeck: readonly string[];
  /** Cards sent to the BOTTOM of the Mansion (undefeated Infected, declined cards). */
  readonly mansionBottom: readonly string[];

  /** Removed-from-game cards. */
  readonly removed: readonly string[];

  /** Outbreak: the Infection Deck (face down above the Mansion). */
  readonly infectionDeck?: readonly string[];
  /** Scenario win trigger: the game ends when this Infected is Defeated
   *  (Outbreak: Tyrant T-002, ma-041). */
  readonly endInfectedCardId?: string;

  /** Every card instance, keyed by instanceId. */
  readonly cards: Readonly<Record<string, CardInstance>>;

  /** Card database, keyed by cardId — the static defs the engine reads
   *  (cost, damage, ammoReq, effects). Populated at setup from the card
   *  data; kept in state so validate/apply are self-contained. */
  readonly cardDefs: Readonly<Record<string, CardDef>>;

  /** Decisions awaiting a player (targeting, optional effects). */
  readonly prompts: readonly Prompt[];

  /** Winner seat(s) once phase === "gameOver". */
  readonly winners: readonly number[];
  readonly endReason?: "uroborosDefeated" | "allPlayersDead";

  /** Reactive trash window (AC-018, Jill L2): pending off-turn reaction. */
  readonly reactiveTrashWindow?: {
    readonly kind: 'uroborosInjection' | 'jillFlashGrenade';
    readonly triggeringSeat: number;
    readonly revealedInstanceId: string;
  };
  /** Flash Grenade reactive defeat: instance ID of infected defeated by Flash Grenade. */
  readonly flashGrenadeDefeatedInstanceId?: string;
  /** Pending explore awaiting reactive responses (Las Plagas Flash Grenade). */
  readonly pendingExplore?: {
    readonly seat: number;
    readonly revealedInstanceId: string;
    readonly outcome: 'defeated' | 'notDefeated';
    readonly decorations: number;
    readonly damageTaken: number;
    readonly newPlayer: PlayerState;
    readonly mansionDeck: readonly string[];
    readonly mansionBottom: readonly string[];
    readonly rngState: number;
  };
  readonly log: readonly LoggedAction[];
}

export interface LoggedAction {
  readonly seq: number;
  readonly action: Action;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action = 
  | { readonly type: "startGame"; readonly setup: GameSetup } 
  | { readonly type: "playActionCard"; readonly seat: number; readonly instanceId: string } 
  | { readonly type: "playItem"; readonly seat: number; readonly instanceId: string } 
  | { readonly type: "playAmmo"; readonly seat: number; readonly instanceId: string } 
  | { readonly type: "explore"; readonly seat: number; readonly weapons: readonly string[]; readonly exploreCount: number; readonly ammoByWeapon?: Readonly<Record<string, number>> }
  /** Outbreak: spend 1 Explore to Attack another Character (instead of
   *  revealing the Mansion). Non-Infected attackers must name a weapon.
   *  Infected attackers deal their base Damage.
   */
  | { readonly type: "attack"; readonly seat: number; readonly targetSeat: number; readonly weaponInstanceId?: string; readonly infectionCardIds?: readonly string[] }
    | { readonly type: "playWeapon"; readonly seat: number; readonly instanceId: string } // move weapon from hand to play area for later explore
  | { readonly type: "buy"; readonly seat: number; readonly pileId: string }
  | { readonly type: "useCharacterAbility"; readonly seat: number; readonly abilityIndex: number }
  | { readonly type: "attachToPartner"; readonly seat: number; readonly instanceId: string; readonly replaceIndex?: 0 | 1 }
  | { readonly type: "chooseExploreLeader"; readonly seat: number; readonly leader: "main" | "partner" }
  | { readonly type: "endTurn"; readonly seat: number }
  | { readonly type: "chooseOption"; readonly seat: number; readonly promptId: string; readonly option: number };

export interface GameSetup {
  readonly seed: number;
  readonly players: ReadonlyArray<{
    readonly name: string;
    readonly controller: "human" | "bot";
    readonly botLevel?: number;
    /** Chosen character cardId; if omitted the engine deals randomly from the 10. */
    readonly characterCardId?: string;
    /** Partner character cardId (Alliance). */
    readonly partnerCharacterId?: string;
  }>;
  /** Scenario config (defaults to First Timer Story Mode). */
  readonly scenario?: "firstTimer" | "outbreak";
  /** Outbreak mode: infection levels, the Infection Deck and Infected
   *  Characters. Implied by scenario === 'outbreak'. */
  readonly outbreakMode?: boolean;
  /** Enable Partner Modification rules (Alliance expansion). */
  readonly partnerMode?: boolean;
}

/**
 * When a played card requires a decision, the engine parks a Prompt in state;
 * clients answer with chooseOption.
 */
export interface Prompt {
  readonly id: string;
  readonly seat: number;
  readonly text: string;
  readonly options: readonly string[];
  /** Machine-readable data the reducer needs to resolve this prompt
     *  (e.g. which card instance to move/trash). Optional. */
    readonly payload?: Readonly<Record<string, string | number>>;
}

// ---------------------------------------------------------------------------
// Engine surface (implemented by modules in later tasks)
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface Engine {
  /** Build the initial state from a GameSetup. */
  setup(setup: GameSetup): GameState;
  /** Validate an action against the state WITHOUT applying it. */
  validate(state: GameState, action: Action): ValidationResult;
  /** Apply a validated action; returns a NEW state (throws on invalid). */
  apply(state: GameState, action: Action): GameState;
  /** Every action currently legal for `seat` (used by AI + client UI). */
  legalActions(state: GameState, seat: number): readonly Action[];
  /** Prompts awaiting an answer in this state. */
  prompts(state: GameState): readonly Prompt[];
}

/** State view sanitized for one seat (hides other hands/inventory contents). */
export interface PlayerView {
  readonly seat: number;
  readonly state: GameState;
}
