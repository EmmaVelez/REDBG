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
  | "event"     // Mansion-only events
  | "skill"     // Mercenaries Skill System (SK-001..SK-030)
  | "location"  // Fan "Locations" line: GLOBAL / 1X / investment room cards
  | "counter";  // Unofficial Expansion: shared-supply counters (Poison)

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
  | "skillArea" // Mercenaries: Skill cards in a player's Skill Area
  | "supply"      // Unofficial Expansion: shared counter supply by the board
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
  readonly set: 'premier' | 'promo' | 'alliance' | 'nightmare' | 'outbreak' | 'mercenaries' | 'custom';
  /** Human-readable rules text (for UI + reference). */
  readonly text: string;
  /** Copies of this card in the game (used when building piles). */
  readonly copies: number;

  /** Cost to Buy from the Resource Area (Gold). Absent = not purchasable. */
  readonly cost?: number;

  /** Marked as a Mansion card: placed in the Mansion deck when the card is
   *  added to a game (custom cards are always included in the Mansion deck
   *  if they have this flag set). */
  readonly mansion?: boolean;

  /** Bonus icons (ammunition, some actions/weapons). */
  readonly bonuses?: CardBonuses;
  /** Extra printed abilities for Ammunition cards (Mercenaries AM-005..007).
   *  Distinct from `bonuses`, which fire on PLAY. */
  readonly ammoEffects?: readonly AmmoEffect[];
  /** Other cards this one needs in the def pool to function. `cardsForScenario`
   *  pulls these in even when the room only ticked this card. A fan card may
   *  name an OFFICIAL card here (B4MC-CH-005 -> we-028 Stun Rod). */
  readonly dependencies?: readonly string[];

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
  /** Rulebook: "This card cannot be attached to characters." The engine
   *  refuses to attach it (WE-030 Hand Cannon). */
  readonly cannotAttach?: boolean;
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

  // -- location (fan "Locations" line) --
  /** GLOBAL = active for everyone on reveal; 1X = a one-shot buy; otherwise
   *  INVEST: a player spends a Buy + gold to place an investment cube. */
  readonly locationKind?: 'global' | 'onex' | 'invest';
  /** Investment price(s), left to right: the 1st cube costs costs[0], the 2nd
   *  costs costs[1]. Absent on GLOBAL and 1X cards. */
  readonly locationCosts?: readonly number[];
  /** 1X: the gold cost of one use. */
  readonly locationCost?: number;
  /** 1X locations: how many times per turn this seat may pay for it. */
  readonly locationMaxPerTurn?: number;
  /** Machine-readable "On Reveal" effect (fires when the card is revealed). */
  readonly locationRevealEffects?: readonly LocationEffect[];
  /** Machine-readable "When scoring" effect (feeds the end-game ranking). */
  readonly locationScoreEffects?: readonly LocationScoreEffect[];
  /** Ongoing investment effects, unlocked per cube (GLOBAL cards use these
   *  with no cubes). */
  readonly locationInvestEffects?: readonly LocationEffect[];
  /** A location may carry several investment levels (one per price). */
  readonly locationLevels?: ReadonlyArray<{ readonly cubes: number; readonly text: string }>;

  // -- skill (Mercenaries Skill System) --
  /** XP that must sit on this Skill before its effect is usable. */
  readonly skillXp?: number;
  /** Skill family name, e.g. "Extension" (grouping/display). */
  readonly skillFamily?: string;
  /** Skill level 1-3. */
  readonly skillLevel?: number;
  /** Machine-readable effect keys (see SkillEffect). */
  readonly skillEffects?: readonly SkillEffect[];

  // -- counter (Unofficial Expansion) --
  /** Machine-readable effect keys (see CounterEffect). */
  readonly counterEffects?: readonly CounterEffect[];

  /** Attachment event cards: mode 1 = single attachment (new replaces old),
   *  mode 2 = multiple attachments allowed. */
  readonly attachmentMode?: 1 | 2;
  /** Machine-readable effect keys for attachment cards (see AttachmentEffect). */
  readonly attachmentEffects?: readonly AttachmentEffect[];
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
  // Gatling Gun (we-007) is an `xAmmo` weapon instead: its damage IS the Ammo
  // the player allocates, so it has no static damage effect.
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
  | { readonly kind: "trashAfterUse" } // WE-031 Night Scope Rocket Launcher
  // --- Mercenaries weapons (WE-043..WE-050) ---
  | { readonly kind: "payAmmoForDamage"; readonly ammoCost: number; readonly amount: number } // WE-043 Ibex Standard: pay N Ammo -> +amount damage this turn
  | { readonly kind: "onDefeatMoveDiscardOrHandToPlayerDiscard" } // WE-044 Custom Pump-Action Shotgun
  | { readonly kind: "onDefeatGainXp"; readonly amount: number } // WE-045 Custom Full-Bore Machine Gun
  | { readonly kind: "removeXpForDamage"; readonly perXp: number } // WE-046 Custom Lightning Hawk
  | { readonly kind: "plusDamageIfCharacterXpAtLeast"; readonly threshold: number; readonly amount: number } // WE-047 Custom Bolt-Action Rifle
  | { readonly kind: "plusDamageIfNoActionsInPlayArea"; readonly amount: number } // WE-048 Hunting Bow
  | { readonly kind: "cannotPlayActionsWhileInPlayArea" } // WE-048 Hunting Bow
  | { readonly kind: "selfPlusDamageTrashAtTurnEnd"; readonly amount: number } // WE-049 Custom Standard Sidearm
  | { readonly kind: "onDefeatOptionalGoldTrashAtTurnEnd"; readonly amount: number } // WE-050 Reliable Blade
  // --- Outbreak / Premiere rules-text gaps ---
  | { readonly kind: "explosivesToDiscardInsteadOfTrash" } // WE-018/we-018g Grenade Launcher
  | { readonly kind: "revealFromMansionBottom" } // WE-019 Telescopic Sight Rifle
  | { readonly kind: "discardPistolsForDamage"; readonly amount: number } // WE-025 Blowback Pistol
  | { readonly kind: "trashAmmoFromPlayAreaOnUse"; readonly count: number } // WE-030 Hand Cannon
  // --- Unofficial Expansion (EX-002 Special Rocket Launcher) ---
  | { readonly kind: "attachOnGainDefeatInfectedAtOrAboveHp"; readonly hp: number } // EX-002: attach on gain; auto-defeat the next Infected with hp >= N revealed while exploring, then remove
  // --- Custom weapons (CW-005..) ---
  | { readonly kind: "plusDamageIfRevealedInfectedHpAtLeast"; readonly threshold: number; readonly amount: number } // CW-005 Combat Knife: +N damage when infected with >= threshold HP is revealed
  | { readonly kind: "optionalSelfDamageForDamageAndType"; readonly damage: number; readonly amount: number; readonly type: WeaponTag } // CW-013 Pump-Action: take N damage to gain +amount damage and the type
  | { readonly kind: "playFromDiscardOnExplore" } // CW-006 Kukri: may play from discard when exploring
  // --- Custom melee weapons (CW-022..) ---
  | { readonly kind: "plusDamagePerOtherMeleeUsedThisTurn"; readonly amount: number } // CW-024 Haymaker: +N damage per other Melee weapon used this turn
  | { readonly kind: "discardInventoryUntilMeleeWeapon" } // CW-023 Combo Punch: discard from inventory top until a Melee weapon is discarded, move it to hand
  | { readonly kind: "gainCardsThisTurn"; readonly amount: number } // CW-022 High Kick: +N cards this turn when used
  // --- Zombicide-style fan weapon set (CW-025..CW-033) ---
  | { readonly kind: "recallToInventoryTopAtTurnEnd" } // CW-025 Elephant Killer: unused at end of turn -> top of Inventory
  | { readonly kind: "usableTwicePerTurn" } // CW-026 Low Recoil Revolver: this Weapon can be used twice
  | { readonly kind: "plusDamagePerAdditionalInfectedBattled"; readonly amount: number } // CW-027: +N per Infected beyond the first
  | { readonly kind: "armLauncherForAllRevealed"; readonly amount: number } // CW-028: mode - deal N to all Revealed, no weapon Damage
  | { readonly kind: "trashAmmoFromPlayForDamage" } // CW-029 Sawed-Off Double Barrel: trash 1 Ammo from play -> +X damage
  | { readonly kind: "dealDamageToTwoInfected" } // CW-030 Akimbo Flintlock Pistols: its Damage to two different Infected
  | { readonly kind: "plusDamageIfInfectedBattledAtLeast"; readonly threshold: number; readonly amount: number } // CW-031: +N when Battling `threshold`+ Infected
  | { readonly kind: "moveFromDiscardToHandAtTurnStart" } // CW-032 Combat Knife w/ Chain: recycle from Discard at turn start
  | { readonly kind: "cannotUseWithNonExplosiveWeapons" } // CW-033 Semi-Auto Sniper Rifle: no other non-Explosive weapon
  // --- Fan "JP 2025" weapon set (CW-034..) ---
  | { readonly kind: "armedCoinFlipDefeatNextInfected" } // CW-034 Crossbow: the next Infected Revealed this turn is coin-flipped; heads = defeated + 1 Explore
  | { readonly kind: "payXpForFirstRevealedBuff" } // CW-035 Scoped Colt Anaconda: pay XP before Exploring; the first Infected Revealed gets +1 Decoration, +5 Health, +5 Damage per XP
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
  | { readonly kind: "onDefeatInfectionIncrease"; readonly amount: number; readonly toMansionBottom: boolean } // MA-053 Lisa Trevor
  // --- Mercenaries infected (MA-073..MA-098) ---
  | { readonly kind: "onDefeatChoosePlayerGainAmmoX10"; readonly count: number } // MA-073 Town Majini
  | { readonly kind: "onDefeatChoosePlayerTrashHandForAmmoX10" } // MA-074 Town Majini (Shovel)
  | { readonly kind: "onNotDefeatedReduceAllMaxHpIfPilesBelow"; readonly pileThreshold: number; readonly amount: number } // MA-075 Giant Majini
  | { readonly kind: "onRevealEachPlayerRemovesSkillXp"; readonly amount: number } // MA-076 Base Majini (Gun)
  | { readonly kind: "zeroDecorationsInComboPile" } // MA-077 Chicken (dormant: no Combo Pile in Story Mode)
  | { readonly kind: "onNotDefeatedMoveHighestDecorationAttachedToBottomThenShuffle" } // MA-078 Red Executioner
  | { readonly kind: "onNotDefeatedExploringPlayerGainsAmmoX10"; readonly count: number } // MA-079 Big Man Majini
  | { readonly kind: "onRevealLowestDecorationPlayersMoveDiscardToHighest"; readonly count: number } // MA-080 Chainsaw Majini
  | { readonly kind: "onRevealZeroDamageOfLowestAmmoReqWeapon" } // MA-081 Los Illuminados (Shield)
  | { readonly kind: "onNotDefeatedTrashTopInventory"; readonly count: number } // MA-082 J.J.
  | { readonly kind: "onRevealPlusHpPerSameNameAttached"; readonly amount: number } // MA-083 Los Ganados (Male)
  | { readonly kind: "onRevealPlusHpPerAttachedToExploring"; readonly amount: number } // MA-084 Los Ganados (Female)
  | { readonly kind: "onRevealDamagePenaltyIfCharacterXpAtLeast"; readonly threshold: number; readonly amount: number } // MA-085 Adjule
  | { readonly kind: "onRevealEachPlayerPassesHandCardLeft"; readonly count: number } // MA-086 Los Illuminados (Scythe)
  | { readonly kind: "onDefeatMoveResourceCardToOpponentDiscard" } // MA-088 Tribal Majini (Bow)
  | { readonly kind: "onRevealEachPlayerRemovesResourcePileTop" } // MA-089 / MA-091
  | { readonly kind: "onNotDefeatedTrashUsedWeaponCostAtMost"; readonly maxCost: number } // MA-090 Tribal Majini (Shield)
  | { readonly kind: "onRevealAllPlayersGainLowestCostResource" } // MA-092 Town Majini (Motorcycle)
  | { readonly kind: "onDefeatDrawCardAtEndOfTurn"; readonly count: number } // MA-093 Los Ganados (Handscythe)
  | { readonly kind: "onDefeatTrashCardFromAnyDiscard" } // MA-094 Los Ganados (Pitchfork)
  | { readonly kind: "onDefeatGiveDamageToAnyCharacter"; readonly amount: number } // MA-096 Los Illuminados (Bow)
  | { readonly kind: "onDefeatMoveHandOrDiscardToPlayerDiscard" } // MA-098 Base Majini (Shield)
  // --- Outbreak rules-text gaps (MA-045..MA-049) ---
  | { readonly kind: "onRevealFlatDamageToExploringCharacters"; readonly amount: number } // MA-045 Wasp
  | { readonly kind: "reduceLevel2DecorationRequirement"; readonly amount: number } // MA-047 Reinforced Zombie
  | { readonly kind: "onRevealBonusIfZombieAttached"; readonly hp: number; readonly damage: number } // MA-048 Crimson Head
  | { readonly kind: "onRevealZeroAmmoWeaponsDealNoDamage" } // MA-049 Reinforced Licker
  // --- Custom card line (MX-001..) ---
  | { readonly kind: "onNotDefeatedInsertIntoMansionAt"; readonly position: number } // MX-001 Mr. X
  | { readonly kind: "onRevealRevealNextMansionCard" } // CI-002 Infected Crow: reveal the next Mansion card; an Infected joins the battle, anything else is shuffled back
  | { readonly kind: "onRevealFlatDamageToNonExploringCharacters"; readonly amount: number } // MA-025 NYX
  // --- Custom card line: CI-009 / MA-000 (Rachael Foley) ---
  | { readonly kind: "onRevealDamageReductionPerAmmoX10InDiscard"; readonly amount: number } // CI-009: takes `amount` less damage per "Ammo x10" in the exploring player's discard pile
  | { readonly kind: "onDefeatShuffleCardIntoMansion"; readonly cardId: string } // CI-009: on defeat, shuffle a fresh copy of `cardId` into the Mansion
  | { readonly kind: "onRevealRollD6ForEffect" } // TUA-001 Tyrant Ultimate Abyss: roll d6 on reveal for random effect
  | { readonly kind: "onDefeatShuffleBackIfDamageAtMost"; readonly maxDamage: number } // MA-000 (ooze): defeated with <= maxDamage -> shuffled back into the Mansion instead of attached
  // --- Custom card line: CI-001 / CI-003 (Oscar, Saddler) ---
  | { readonly kind: "onNotDefeatedTrashHighestDamageUsedWeapons" } // CI-001 Oscar: on not-defeated, trash the highest-Damage Weapon(s) the exploring Character is using
  | { readonly kind: "onRevealEachPlayerGainsAmmoX10"; readonly count: number } // CI-003 Saddler (First Encounter): on reveal, every player gains `count` "Ammo x10"
  // --- Custom card line: CI-010 / CI-011 (James Marcus, Queen Leech) ---
  | { readonly kind: "onRevealChoosePlayerMustUseAllExploresNextTurn" } // CI-010: on reveal the exploring player picks a player who must spend their whole Explore pool next turn
  | { readonly kind: "onRevealHpEqualsExploringCharacterMaxHp" } // CI-011: its Health IS the leading exploring Character's Maximum Health
  // --- Unofficial Expansion (EX-006/EX-008) ---
  | { readonly kind: "onNotDefeatedAttachCounter"; readonly counterCardId: string } // EX-006 Web Spinner / EX-008 Yawn: attach a Poison counter to the exploring Character

export type ItemEffect =
  | { readonly kind: "healFixed20OrTrashWithSecondFor60" }                   // Green Herb
  | { readonly kind: "healToFull" }                                          // First Aid Spray
  | { readonly kind: "healSelfAndPartnerToFull" }                            // Red Herb IT-004
  | { readonly kind: "plusMaxHp"; readonly amount: number }                  // Yellow Herb (Mansion only): +amount max HP
  | { readonly kind: "attachThenRemoveForCardsAndGold"; readonly cards: number; readonly gold: number } // Treasure Map
  | { readonly kind: "gainGoldAndBuyThenRemove"; readonly gold: number; readonly buys: number } // Hidden Treasure
  // --- Outbreak items (MA-054o..MA-055o) ---
  | { readonly kind: "attachAndPreventDamageByMovingToMansionBottom" } // MA-054o Kevlar Jacket
  | { readonly kind: "antivirusReduceInfectionOrRemove"; readonly threshold: number; readonly amount: number } // MA-055o Antivirus
  // --- Unofficial Expansion (EX-007 Blue Herb) ---
  | { readonly kind: "returnToMarketAndRemoveCounters" } // EX-007: return this card to its own market pile; remove all Poison counters from your Characters
  | { readonly kind: "gainWeaponFromMarket"; readonly costLimit: number } // Antique Coin IT-000: gain one weapon from the Resource Area with cost <= Antique Coin's cost

export type ActionEffect =
  | { readonly kind: "allWeaponsPlusDamageThisTurn"; readonly amount: number } // Deadly Aim: +10
  | { readonly kind: "recoverWeaponFromDiscardToHand" }                      // Reload (choice via Prompt)
  | { readonly kind: "moveHandCardToTopOfInventory" }                        // Umbrella Corp (choice via Prompt)
  | { readonly kind: "trashHandCard" }                                       // Ominous Battle (choice via Prompt)
  | { readonly kind: "negateWeaponCost40OrLessFromHand" }                    // Struggle for Survival (reactive)
  | { readonly kind: "lookAtMansionTop"; readonly count: number }           // Mansion Foyer style peek (Prompt ordering)
  | { readonly kind: "trashFromHandAtTurnStartPeekMansionTop" }   // CV-001 Cover-up: may trash from hand at any turn start to peek the Mansion top and move it to the bottom
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
  /** CAC-010 Onslaught: attach, then at the start of the turn apply this
   *  card's bonus icons, deal +amount Damage this turn, then discard. */
  | { readonly kind: "attachToCharacterAndBeginTurnBonus"; readonly amount: number }
  /** CAC-005 Combat Medic: the first time you Gain a card this turn, you
   *  may Heal a Character by `amount`. */
  | { readonly kind: "healOnFirstGainThisTurn"; readonly amount: number }
  /** CAC-001 Can't Let Go: trash up to `max` from hand or discard; if the
   *  discard is empty afterwards, trash this card and gain `draw` cards. */
  | { readonly kind: "trashUpToFromHandOrDiscard"; readonly max: number; readonly draw: number }
  /** CAC-008 Gather Intel: +amount Damage per `per` Infected attached. */
  | { readonly kind: "weaponDamagePerAttachedInfected"; readonly amount: number; readonly per: number }
  /** CAC-009 Welcome to the Club: flat +amount, or +highAmount while
   *  battling an Infected with at least `hpThreshold` Health. */
  | { readonly kind: "allWeaponsDamageThisTurn"; readonly amount: number; readonly highAmount?: number; readonly hpThreshold?: number }
  /** CAC-004 Resupply: the next Item gained this turn goes to Hand. */
  | { readonly kind: "nextItemGoesToHand" }
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
  | { readonly kind: "gainedCardsGoToHand" } // AC-021 Gathering Forces: gains route to hand this turn
  // --- Outbreak infection cards (IN-001..IN-007) ---
  | { readonly kind: "infectionActionsNextTurn"; readonly actions: number } // IN-001 Claw
  | { readonly kind: "virulentFrenzy" } // IN-002
  | { readonly kind: "bileVomit" } // IN-003
  | { readonly kind: "sloughArmor"; readonly amount: number } // IN-004 (reactive)
  | { readonly kind: "drag" } // IN-005
  | { readonly kind: "devour"; readonly heal: number } // IN-006
  | { readonly kind: "infectionIncrease"; readonly amount: number } // IN-007
  // --- Mercenaries actions (AC-042..AC-051) ---
  | { readonly kind: "reactiveFightOrFlight" } // AC-042: on reveal, trash from hand to move the Infected to the Mansion bottom
  | { readonly kind: "choosePlayerDiscardWeaponForDamage" } // AC-043 The Mercenaries
  | { readonly kind: "discardTwoThenTrashOneFromHand" } // AC-044 Boundless Battlefield
  | { readonly kind: "choosePlayerForCoupDeGrace"; readonly perXp: number; readonly maxAmount: number } // AC-045 Coup de Grâce
  | { readonly kind: "choosePlayerForBackstab" } // AC-048 Backstab
  | { readonly kind: "trashTwoFromHandForGoldIfSameType"; readonly amount: number } // AC-047 Anticipation
  | { readonly kind: "moveHandToInventoryBottomAndDraw" } // AC-049 Battle Hardened
  | { readonly kind: "removeXpForCard" } // AC-049 Battle Hardened (optional second half)
  | { readonly kind: "reactiveResuscitate" } // AC-050: on lethal damage, trash to set the Character's Health to 10
  | { readonly kind: "discardInventoryUntilWeaponForDamage"; readonly amount: number } // AC-051 Tear Gas
  // --- Custom actions ---
  | { readonly kind: "storyModeBossShuffleToTop10" } // AH-001 Abandon All Hope: during this turn, if Boss revealed & not defeated, can shuffle to top 10
  | { readonly kind: "attachAndRestrictWeapons"; readonly maxNonMelee: number } // CQ-001 Close Quarters Combat: attach, restrict non-Melee/Knife weapons, +1 card on Melee/Knife play, discard at turn start
  | { readonly kind: "lookAtMansionTop3AndReorder" } // AC-003 The Ecliptic Express: look at top 3 mansion, reorder, must explore
  | { readonly kind: "rollD6ForDamageEffect" } // AC-003 Unknown Odds: roll d6 for damage/heal effect
  | { readonly kind: "otherPlayersDrawCard" } // AC-003 Member of S.T.A.R.S: every other player draws +1 card
  | { readonly kind: "martialArtsChoice" } // AC-000 Martial Arts: choose +10 damage to Knife/Melee this turn OR attach for double damage at turn start
  | { readonly kind: "tacticalAdvanceChooseType" } // AC-003 Tactical Advance: choose weapon type for +5 damage (+10 for Melee/Knife)
  | { readonly kind: "mysteriousFindRoll" } // AC-003 Mysterious Find: roll d6 for cards/ammo/gold
  // --- Fan "JP 2025" action set (CAC-003..) ---
  | { readonly kind: "choosePlayerDrawCard" } // CAC-014 Global Battle: another player gets +1 card (Prompt)
  | { readonly kind: "weaponsGainedGoToPlayArea" } // CAC-015 This Shit Ends Now!: gains route to the Play Area; first gets +10 Damage
  | { readonly kind: "discardSelfFromPlayForWeaponFromDiscard" } // CAC-016 Take Them Down!: discard this Action from the Play Area -> move 1 Weapon from Discard to Hand
  | { readonly kind: "endOfTurnPeekAndGiveHand" } // CAC-013 From Bad to Worse: at end of turn, look at another Player's Hand, they Discard 1, this card goes into their Hand
  | { readonly kind: "trashHandAndDiscardForMarketCard" } // CAC-003 Change of Outfit: trash 1 from hand + 1 from discard, gain a Resource Area card up to the combined cost

/**
 * Fan "Locations" line effects.
 *
 * Three card kinds share these:
 *  - GLOBAL: `reveal` fires for everyone when the card is revealed; `score`
 *    feeds the end-game ranking; `ongoing` is always active while revealed.
 *  - 1X: `once` fires on each paid use (a Buy + gold, repeatable while gold and
 *    Buys last, unless `oncePerTurn`).
 *  - INVEST: `ongoing` is active while the seat has at least one cube; the
 *    effect may declare `cubes` to require a deeper investment.
 */
export type LocationEffect =
  // --- reveal ---
  | { readonly kind: 'revealGainHealth'; readonly amount: number }
  | { readonly kind: 'revealTurnTopMansionCardFaceUp' }
  | { readonly kind: 'revealEachOtherPlayerRevealsHandAndDiscard' }
  | { readonly kind: 'revealEachOtherPlayerMayDrawAndGainXp' }
  | { readonly kind: 'revealLoseHealth'; readonly amount: number }
  /** Lounge: the revealing seat's top attached Infected and all its counters
   *  leave play (removed from the game). */
  | { readonly kind: 'revealRemoveInfectionAndCounters' }
  /** Mirror Corridor: Infected revealed THIS turn get −amount Health, min 5. */
  | { readonly kind: 'revealInfectedHpReductionThisTurn'; readonly amount: number; readonly min: number }
  /** Terrace: every living player may take one item from the Resource Area. */
  | { readonly kind: 'revealEachPlayerMayGainItem' }
  /** Tiger Statue Room: every living player may discard a card for 1 XP. */
  | { readonly kind: 'revealEachPlayerMayDiscardForXp'; readonly xp: number }
  /** Trevor's Tomb: every living player may pay XP to remove one of their own infections. */
  | { readonly kind: 'revealEachPlayerMayPayXpToRemoveInfection'; readonly xp: number }
  /** Attic Landing: Infected revealed this turn get +amount Health. */
  | { readonly kind: 'revealInfectedHpBonusThisTurn'; readonly amount: number }
  /** Attic Landing: Infected revealed this turn get +amount Health. */
  | { readonly kind: 'revealInfectedHpBonusThisTurn'; readonly amount: number }
  // --- ongoing / investment ---
  | { readonly kind: 'ongoingGainHealthOnReveal'; readonly amount: number }
  | { readonly kind: 'ongoingTrashOnSecondCardGain' }
  /** Lord Spencer's Study: the investor gains 1 XP whenever they trash a card. */
  | { readonly kind: 'ongoingGainXpOnTrash'; readonly amount: number }
  /** Terrace: the first action card the investor gains from a market pile each
   *  turn may be played straight away (spends 1 Action). */
  | { readonly kind: 'ongoingFreePlayFirstActionGained' }
  /** Tiger Statue Room: cards cost `amount` less gold on the investor's turn. */
  | { readonly kind: 'ongoingBuyCostReduction'; readonly amount: number }
  | { readonly kind: 'ongoingRepeatFirstActionPlayed' }
  | { readonly kind: 'ongoingDrawAtTurnEnd'; readonly count: number; /** GLOBAL cards: 'revealer' limits this to the seat that revealed it. */
    readonly scope?: 'all' | 'revealer' }
  // --- 1X (paid use) ---
  | { readonly kind: 'onexGainAmmoAndDamagePerCardGained'; readonly ammo: number; readonly damage: number }
  /** Underground Passage: this 1X is the trash-and-upgrade chain. */
  | { readonly kind: 'passageUpgrade' }
  /** Armor Room: look through the discard, take one ammo + one action + one
   *  weapon onto the TOP of the Inventory, and gain `xp` XP. */
  | { readonly kind: 'onexLookThroughDiscard'; readonly xp: number }
  /** Attic Landing: +1 Buy and gain a `ammo` ammo card. */
  | { readonly kind: 'onexGainBuyAndAmmo'; readonly ammo: number }
  /** Attic: trash an action from hand, gain an action costing up to `maxCost`. */
  | { readonly kind: 'atticUpgrade'; readonly maxCost: number }
  /** Art Supply Room: after this turn, fold Inventory + discard into hand,
   *  trash up to `trash` cards, shuffle the hand into the Inventory, draw `draw`. */
  | { readonly kind: 'postTurnCleanup'; readonly trash: number; readonly draw: number }
  /** Bar: this 1X puts an XP token on a Resource Area pile. */
  | { readonly kind: 'onexAddXpTokenToPile' }
  /** Bedroom: the revealing seat may not reveal Mansion cards this turn. */
  | { readonly kind: 'revealBlockMansionRevealThisTurn' }
  /** Bedroom: gain `ammoCount` Ammo x`ammo` cards, then choose a card up to `maxCost`. */
  | { readonly kind: 'onexGainAmmoAndChooseCard'; readonly ammo: number; readonly ammoCount: number; readonly maxCost: number };

/** "When scoring" effects: converted into Decorations at game end. */
export type LocationScoreEffect =
  | { readonly kind: 'scorePerAmmoSet'; readonly perSet: number }
  | { readonly kind: 'scorePerWeaponTypeMajority'; readonly perType: number }
  | { readonly kind: 'scorePerXp'; readonly perXp: number }
  | { readonly kind: 'scorePerDistinctInventoryName'; readonly perName: number }
  | { readonly kind: 'scorePerDuplicateActionName'; readonly perName: number }
  | { readonly kind: 'scoreLowHpInfectedWorth'; readonly hpThreshold: number; readonly decorations: number }
  /** Lounge: per card the seat holds that came from a now-empty supply pile. */
  | { readonly kind: 'scorePerCardFromEmptyPile'; readonly perCard: number }
  /** Mansion Bathroom: per copy of the 2nd most common weapon card name held. */
  | { readonly kind: 'scorePerCopyOfSecondMostCommonWeapon'; readonly perCopy: number }
  /** Materials Room: −1 per Inventory card beyond `freeCards` (a penalty). */
  | { readonly kind: 'scorePenaltyPerInventoryOver'; readonly freeCards: number; readonly perCard: number }
  /** Mirror Corridor: −1 per Inventory card the seat holds exactly one copy of. */
  | { readonly kind: 'scorePenaltyPerSingletonInInventory'; readonly perCard: number };

export type TokenEffect =
  | { readonly kind: "gainWeaponAndTrashToken"; readonly weaponCardId: string } // Rocket Launcher Case -> we-008, Gatling Gun Case -> we-007
  // --- Unofficial Expansion (EX-001/003/004) ---
  | { readonly kind: "gainCardAndRemoveToken"; readonly cardId: string } // EX-001 -> ex-002, EX-004 -> ex-005
  | { readonly kind: "gainAnyWeaponAndRemoveToken" }; // EX-003: choose any weapon from the Resource Area

/** Ammunition card effects (Mercenaries AM-005..AM-007). The basic ammo bonus
 *  icons still fire on PLAY (`bonuses`); these are the extra printed abilities. */
export type AmmoEffect =
  /** AM-005: "When you Trash this card, you get +10 Gold during this turn." */
  | { readonly kind: "gainGoldWhenTrashed"; readonly amount: number }
  /** AM-006: "When you Defeat an Infected, if this Ammunition is in your Play
   *  Area, you can Trash it and gain 1 'Ammo x30'. This type of effect can only
   *  be applied once during your turn." */
  | { readonly kind: "onDefeatTrashForAmmoX30" }
  /** AM-007: "At the end of your turn, if this card is in your Play Area and
   *  you did not Explore during this turn, you can move this Ammunition to the
   *  top of your Inventory." */
  | { readonly kind: "recycleToInventoryTopAtTurnEndIfDidNotExplore" };

/** Unofficial Expansion counters — cards kept in the shared board supply and
 *  attached to a Character (Poison). Max one of each counter per Character. */
export type CounterEffect =
  | { readonly kind: "damageAtTurnStart"; readonly amount: number }; // EX-009 Poison: 5 damage at the start of the attached Character's turns

/** Mansion attachment event effects — ongoing rules applied while the card
 *  is attached to the mansion. Trigger points are handled by the engine. */
export type AttachmentEffect =
  | { readonly kind: "trashTopInventoryAtTurnEnd"; readonly count: number; readonly removeAfter: number } // Rampage: trash top inventory card at end of each player's turn; remove after N trashes
  | { readonly kind: "plusDamageForWeaponTag"; readonly tag: WeaponTag; readonly amount: number } // Close Combat: Knife +10, Melee +5
  | { readonly kind: "mustExploreIfAble" } // Close Combat: all players must Explore if able
  | { readonly kind: "healAndAmmoAtTurnStart"; readonly heal: number; readonly ammo: number } // Save Room: heal 10, +10 ammo at turn start
  | { readonly kind: "freePistolTrashAtEnd" } // Low on Ammo: pistols cost 0 ammo but are trashed at end of turn
  | { readonly kind: "reduceAmmoBonus"; readonly amount: number } // Low on Ammo: ammunition cards grant N less ammo
  | { readonly kind: "trashDiscardOnInfectedDefeat" } // Ecliptic Express: when defeating an infected, may trash a discard card
  | { readonly kind: "plusExploreAndMustExploreOrDamage"; readonly explores: number; readonly damage: number } // Infected Horde: +N explore, must explore or take N damage
  | { readonly kind: "actionsCapAndRemoveOnDowned"; readonly actions: number } // Final Action: cap actions at N, remove when character loses all health
  | { readonly kind: "plusHpForLowHpInfected"; readonly hpThreshold: number; readonly bonus: number } // Virus Mutates: infected with <=N hp get +bonus hp
  | { readonly kind: "bonusXpPerExplore"; readonly amount: number } // Virus Mutates: players gain N extra XP for exploring
  | { readonly kind: "shotgunTwicePerTurn" } // The Maze: shotgun weapons can be used twice per turn
  | { readonly kind: "damagePenaltyForMultipleActions"; readonly actions: number; readonly penalty: number } // The Maze: if play area has >N actions, weapons get -penalty damage
  | { readonly kind: "survivalHorrorDieRoll" } // Survival Horror: before exploring, roll d6 and apply result
  | { readonly kind: "shortSupplysHealPrevention" } // Short Supplys: prevent half healing (rounded down), deal that much extra damage
;

/**
 * Mercenaries Skill System effects. A Skill is active once the XP on it reaches
 * its `skillXp`; effects with "can" in the card text are MANUAL (once per turn),
 * the rest are passive/triggered. The engine switches on these kinds.
 */
export type SkillEffect =
  | { readonly kind: "extensionAmmoAtTurnStart"; readonly infectedAttached: number; readonly decorations: number; readonly amount: number } // SK-001
  | { readonly kind: "extensionDamageAndHealAtTurnStart"; readonly infectedAttached: number; readonly decorations: number; readonly damage: number; readonly heal: number } // SK-002
  | { readonly kind: "extensionExploreAtTurnStart"; readonly infectedAttached: number; readonly decorations: number } // SK-003
  | { readonly kind: "healAmountBonus"; readonly amount: number } // SK-004
  | { readonly kind: "healTrashFromDiscard" } // SK-005
  | { readonly kind: "healAtTurnStartOrElseExplore"; readonly heal: number } // SK-006
  | { readonly kind: "lethalDamageReplacement"; readonly amount: number } // SK-007
  | { readonly kind: "negateDamageRemoveXp" } // SK-008 (manual)
  | { readonly kind: "copyActivatedSkills" } // SK-009
  | { readonly kind: "negateInfectedEffectRemoveXp" } // SK-010 (manual/reactive)
  | { readonly kind: "damageReduction"; readonly amount: number } // SK-011
  | { readonly kind: "redirectInfectedEffectRemoveXp" } // SK-012 (manual/reactive)
  | { readonly kind: "selfDamageForCardsAndAction"; readonly damage: number; readonly cards: number; readonly actions: number } // SK-013 (manual)
  | { readonly kind: "selfDamageForTrashDiscard"; readonly damage: number; readonly count: number } // SK-014 (manual)
  | { readonly kind: "exploreBonusDamagePerCharacterDamage" } // SK-015 (manual, explore)
  | { readonly kind: "trashAmmoForAmmo"; readonly maxCost: number } // SK-016 (manual)
  | { readonly kind: "turnStartGoldAndAmmo"; readonly gold: number; readonly ammo: number } // SK-017
  | { readonly kind: "movePlayAreaWeaponToInventoryTop" } // SK-018 (manual)
  | { readonly kind: "nameWeaponTypeAmmoDiscount"; readonly amount: number } // SK-019 (manual)
  | { readonly kind: "exploreAllWeaponsPlusDamage"; readonly amount: number } // SK-020
  | { readonly kind: "exploreDuplicateWeaponEffect" } // SK-021 (manual, explore)
  | { readonly kind: "giantKillingReduceDamage"; readonly hpThreshold: number } // SK-022
  | { readonly kind: "giantKillingPlusDamage"; readonly hpThreshold: number; readonly amount: number } // SK-023 (manual, explore)
  | { readonly kind: "giantKillingAllWeaponsPlusDamage"; readonly hpThreshold: number; readonly amount: number } // SK-024 (manual, explore)
  | { readonly kind: "xpOnDefeatHighDecoration"; readonly decorations: number } // SK-025
  | { readonly kind: "removeXpForTrashHand" } // SK-026 (manual)
  | { readonly kind: "removeXpForWeaponDamage"; readonly perXp: number } // SK-027 (manual, explore)
  | { readonly kind: "pistolAmmoDiscount"; readonly amount: number } // SK-028
  | { readonly kind: "revealPistolsForExplore"; readonly count: number } // SK-029 (manual, turn start)
  | { readonly kind: "explorePistolPlusDamage"; readonly amount: number } // SK-030
  | { readonly kind: "exploreExplosivePlusDamage"; readonly amount: number } // SK-034 Bomber LV.1: +amount to "Explosive" weapons on Explore
  | { readonly kind: "explosiveExtraUse"; readonly count: number } // SK-035 Bomber LV.2: "Explosive" weapons can be used `count` more time(s) before being Trashed
  | { readonly kind: "exploreExplosiveDamageToAllRevealed" }; // SK-036 Bomber LV.3: "Explosive" weapons deal damage to all Revealed Infected

export type CharacterAbility =
  | { readonly kind: "weaponPlusDamagePerInfectedFought"; readonly amount: number; readonly level: 1 | 2 } // Chris L1: +5 per Infected being fought
  | { readonly kind: "noHealingNoNonInfectedAttach"; readonly level: 1 | 2 }                              // Chris restriction
  | { readonly kind: "explosivesGoToDiscardInsteadOfTrash"; readonly level: 1 | 2 }                       // Jill L2
  /** Fan character (Leon, JP print): once per round, when another Player
   *  trashes a card, put that card into your Hand. */
  | { readonly kind: "takeTrashedCardFromOtherPlayerOncePerRound"; readonly level: 1 | 2 }
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
  | { readonly kind: "weaponBuyCostReduction"; readonly amount: number; readonly tag?: WeaponTag; readonly level: 1 | 2 } // Mikhail Victor L1, Billy L1 (tag-scoped): weapons cost amount less to buy
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
  // --- Custom character: Albert Wesker (AW-001) ---
  | { readonly kind: "drawOncePerTurnIfDamaged"; readonly level: 0 | 1 | 2 } // AW-001 Albert Wesker L0: once per turn, if HP < maxHP, draw +1 card
  | { readonly kind: "allDamageReduction"; readonly amount: number; readonly level: 1 | 2 } // AW-001 Albert Wesker L1: all damage received reduced by amount
  | { readonly kind: "exploreDamageIfHpAtMost"; readonly amount: number; readonly hpThreshold: number; readonly level: 1 | 2 } // AW-001 Albert Wesker L2: when exploring, if HP <= threshold, +amount damage this turn
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
  | { readonly kind: "movePlayAreaWeaponToInventoryTop"; readonly tag: string; readonly level: 1 | 2 } // Kevin Ryman (Outbreak) L2
  | { readonly kind: "discardWeaponToCopyEffects"; readonly level: 1 | 2 } // David King (Outbreak) L1
  | { readonly kind: "knifeFromDiscardForExplore"; readonly level: 1 | 2 } // David King (Outbreak) L2
  | { readonly kind: "turnStartDiscardForInfection"; readonly level: 1 | 2 } // Rebecca Chambers (Outbreak) L1
  | { readonly kind: "drawWhenOtherInfectionDecreases"; readonly level: 1 | 2 } // Rebecca Chambers (Outbreak) L2
  // Outbreak Infected Characters (reanimated players)
  | { readonly kind: "zombieAAoEOnAttack"; readonly amount: number; readonly level: 1 | 2 } // CH-031 Zombie A: other non-infected characters take damage when it attacks
  | { readonly kind: "zombieBInfectionIncrease"; readonly level: 1 | 2 } // CH-032 Zombie B: trash an infection card to raise a character's level by 1 more
  | { readonly kind: "zombieCTurnStartInfectionSwap"; readonly level: 1 | 2 } // CH-033 Zombie C: swap a hand infection card with the top of the Infection Deck
  // --- Mercenaries characters (CH-044..CH-051) ---
  | { readonly kind: "turnStartLowestDecorationsDamage"; readonly amount: number; readonly level: 1 | 2 } // CH-044 Jack Krauser: +amount damage this turn when tied for lowest Decorations
  | { readonly kind: "damageReductionForAmmo"; readonly amount: number; readonly level: 1 | 2 } // CH-045 HUNK: -amount damage taken; when he takes damage, gain 1 "Ammo x10"
  | { readonly kind: "turnStartBuyForAmmoDiscount"; readonly amount: number; readonly level: 1 | 2 } // CH-046 Claire: -1 Buy -> all weapons -amount Ammo this turn
  | { readonly kind: "onDefeatTrashFromDiscardOrHand"; readonly level: 1 | 2 } // CH-047 Chris: on defeat, may Trash 1 card from Discard or Hand
  | { readonly kind: "choosePlayerIncreaseAmmoReqNextTurn"; readonly amount: number; readonly level: 1 | 2 } // CH-048 Jill: a player's weapons cost +amount Ammo next turn
  | { readonly kind: "exploreDamageReductionPerHandCard"; readonly amount: number; readonly level: 1 | 2 } // CH-049 Wesker: while exploring, -amount damage per card in hand
  | { readonly kind: "buyRedirectToPlayerDiscard"; readonly level: 1 | 2 } // CH-050 Rebecca: on buy, may move the bought card to another player's discard
  | { readonly kind: "onDefeatChainLowerHp"; readonly hpThreshold: number; readonly level: 1 | 2 } // CH-051 Barry: chain-defeat lower-HP infected from the Mansion top
  // --- Custom characters (CU-001..) ---
  | { readonly kind: "revealInventoryTopForAction"; readonly level: 1 | 2 } // CU-001 Ricardo Irving L1: reveal the top of your Inventory; an Action there moves to your hand
  | { readonly kind: "damageReductionAndGiveDamage"; readonly threshold: number; readonly reduction: number; readonly give: number; readonly level: 1 | 2 } // CU-001 Ricardo Irving L2
  // --- Fan characters (LK-001..) ---
  | { readonly kind: "plusDamagePerPistolUsed"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 } // LK-001 Leon L1: +amount per pistol when using threshold+ pistols
  | { readonly kind: "playAreaCardsArePistols"; readonly level: 1 | 2 } // LK-001 Leon L2: all cards in your play area are also labeled as pistol
  | { readonly kind: "plusBuyPassive"; readonly amount: number; readonly level: 1 | 2 } // CR-001 Claire L1: +amount Buy
  | { readonly kind: "turnStartActionsForBuy"; readonly actions: number; readonly buy: number; readonly level: 1 | 2 } // CR-001 Claire L2: at turn start, may get +actions Actions and -buy Buy
  | { readonly kind: "healOnDefeatWithWeaponTag"; readonly tag: WeaponTag; readonly heal: number; readonly level: 1 | 2 } // CC-001 Claire L2: heal when defeating an Infected with a weapon of that tag
  // --- Fan characters (FCH-008..) ---
  | { readonly kind: "cannotUseWeapons"; readonly level: 1 | 2 } // FCH-008 Sherry: she cannot use Weapons
  | { readonly kind: "forceAllyExploreWithSupport"; readonly level: 1 | 2 } // FCH-008 Sherry: once per turn, force another Player to Explore with her
  | { readonly kind: "cannotBePartner"; readonly level: 1 | 2 } // FCH-008 Sherry: she can only ever be a Main character
  // --- Fan characters (RC-001..) ---
  | { readonly kind: "turnStartDrawThenDiscardCard"; readonly draw?: number; readonly discard?: number; readonly level: 1 | 2 } // RC-001 Rebecca L1 (1/1) / fr-001 Francis L2 (2/2): at turn start, may draw N and discard N
  // --- Custom characters fr-001 (Francis) / lo-001 (Louis) ---
  | { readonly kind: "plusDamageIfEmptyHand"; readonly amount: number; readonly level: 1 | 2 } // fr-001 L1: no cards in hand -> one weapon gets +amount (flat explore bonus)
  | { readonly kind: "moveMansionBottomToTop"; readonly level: 1 | 2 } // lo-001 L1: manual once/turn — move the Mansion's bottom card to the top
  // --- Custom characters zo-001 (Zoey) / bo-001 (Bill Overbeck) ---
  | { readonly kind: "cannotUseWeaponTag"; readonly tag: WeaponTag; readonly level: 1 | 2 } // zo-001 L1: never able to use weapons with this tag (shotgun)
  | { readonly kind: "extraDamageTakenWhenNotDefeated"; readonly amount: number; readonly level: 1 | 2 } // bo-001 L1: +amount damage taken when an explore does not defeat the Infected
  | { readonly kind: "plusDamagePerUnusedAction"; readonly amount: number; readonly level: 1 | 2 } // bo-001 L2: +amount Damage for every unused Action during the turn
  | { readonly kind: "goldWhenDiscardingAtTurnStart"; readonly amount: number; readonly level: 1 | 2 } // RC-001 Rebecca L2: when discarding due to card effect during turn, gain +amount gold
  | { readonly kind: "healIfDidNotExplore"; readonly amount: number; readonly level: 1 | 2 } // RC-002 Rebecca L1: if didn't explore this turn, heal N at end of turn
  | { readonly kind: "plusDamageForWeaponTag"; readonly tag: WeaponTag; readonly amount: number; readonly level: 1 | 2 } // RC-002 Rebecca L2: Machine Gun weapons get +N damage
  | { readonly kind: "drawFromInventoryOncePerTurn"; readonly level: 1 | 2 } // FCH-001 Carlos L1: once per turn, draw from inventory; weapon/ammo to hand, else discard
  | { readonly kind: "searchDiscardForAmmoAtTurnStart"; readonly level: 1 | 2 } // FCH-001 Carlos L2: at turn start, search discard for an Ammo card to hand
  | { readonly kind: "plusDamageForWeaponTagIfAmmoAbove"; readonly tag: WeaponTag; readonly threshold: number; readonly amount: number; readonly level: 1 | 2 } // FCH-002 HUNK L2: +amount to tag weapons while turn Ammo > threshold
  // --- Fan characters (JM-001..) ---
  | { readonly kind: "trashTopFromDiscardOnBigHit"; readonly threshold: number; readonly count: number; readonly level: 1 | 2 } // JM-001 Jake Muller L1: when he takes more than `threshold` Damage, Trash the top `count` cards of his Discard Pile
  | { readonly kind: "plusDecorationOnDefeatHighHp"; readonly threshold: number; readonly amount: number; readonly level: 1 | 2 } // JM-001 Jake Muller L2: +amount Decorations for each Infected with more than `threshold` Health he defeats
  // --- Fan characters (CH-000..) ---
  | { readonly kind: "turnStartPlusExploreRequiresTwoExplores"; readonly level: 1 | 2 } // CH-000 Rachael Foley L1: turn-start choice of +1 Explore, owing 2 Explores this turn
  | { readonly kind: "exploreDamageIfNoPartnerLowHp"; readonly amount: number; readonly hpThreshold: number; readonly level: 1 | 2 } // CH-000 Rachael Foley L2: on Explore, +amount damage this turn when she has no Partner and Health <= hpThreshold
  // --- Fan characters (B4MC-CH-007..009: Chris Redfield prints) ---
  | { readonly kind: "infectedDamageReductionOncePerRoundGainAmmo"; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-007 Chris L1: once per round, the first Infected Damage he takes on his turn is lowered by amount; he gains one "Ammo x10"
  | { readonly kind: "drawCardOnTrashOncePerTurn"; readonly level: 1 | 2 } // B4MC-CH-007 Chris L2: once during your turn, when you Trash a card, get +1 card
  | { readonly kind: "turnDamageIfInfectedDealtDamageThisRound"; readonly amount: number; readonly downedAmount: number; readonly level: 1 | 2 } // B4MC-CH-008 Chris L1: +amount Damage this turn once an Infected has dealt Damage this round; +downedAmount instead while a Character is face down
  | { readonly kind: "notDefeatedInfectedToMansionTopOncePerRound"; readonly level: 1 | 2 } // B4MC-CH-008 Chris L2: once per round, an Infected that is not Defeated on his turn goes on top of the Mansion
  | { readonly kind: "turnStartPlusExploreRequiresTwoExploresAndDamage"; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-009 Chris: turn-start choice of +1 Explore and +amount Damage, owing 2 Explores this turn
  // --- Fan characters (B4MC-CH-004..006, Sherry Birkin) ---
  | { readonly kind: "damagePerCharacterHealedThisTurn"; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-004 L2: +amount Damage per Character healed this turn
  | { readonly kind: "stunRodCharge"; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-005 L1: pay 1 Action; this turn her Stun Rod explores get +amount Damage
  | { readonly kind: "exploreBonusIfFullHp"; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-005 L2: on Explore, +amount Damage this turn while she is at full Health
  | { readonly kind: "healAtTurnStartOrElseDamageThisTurn"; readonly heal: number; readonly amount: number; readonly level: 1 | 2 } // B4MC-CH-006 L1: heal at turn start, or +amount Damage if already full
  // --- Official custom print ch-005q (Jill Valentine, tactical costume) ---
  | { readonly kind: "plusDamagePerActionDiscardedThisTurn"; readonly amount: number; readonly level: 1 | 2 } // ch-005q L1: +amount Damage per Action card SHE discards this turn (played ones don't count)
  | { readonly kind: "endOfTurnKeepUpToAndDrawTo"; readonly keep: number; readonly handSize: number; readonly level: 1 | 2 } // ch-005q L2: end of turn keep up to N hand cards, draw back to hand size
  // --- Custom official print (ch-005p, Jill Valentine Pirate) ---
  | { readonly kind: "plusDamageForWeaponTags"; readonly tags: readonly WeaponTag[]; readonly amount: number; readonly level: 1 | 2 } // ch-005p Jill Valentine L1: all "Pistol" and "Machine Gun" Weapons get +N Damage
  | { readonly kind: "trashCardToNegateDamage"; readonly level: 1 | 2 } // ch-005p Jill Valentine L2
  // --- Fan characters: Helena Harper (JP 2025, CH-016/017/018) ---
  /** CH-016 L1: attach a card from hand to her face down; a previously
   *  attached card moves to hand. */
  | { readonly kind: "attachCardFaceDownToCharacter"; readonly level: 1 | 2 }
  /** CH-017 L2: once per round, when an Infected with 50+ Health is
   *  revealed, may discard a card for +amount Damage this turn. */
  | { readonly kind: "revealHighHpDiscardForDamage"; readonly amount: number; readonly threshold: number; readonly level: 1 | 2 }
  /** CH-018: during your turn, if her Health is at most `hpThreshold`,
   *  you may get +1 card (once per turn). */
  | { readonly kind: "drawOncePerTurnIfHpAtMost"; readonly hpThreshold: number; readonly level: 1 | 2 }
  /** CH-016 L2: when you Defeat an Infected, choose a Player; they get +1 card. */
  | { readonly kind: "choosePlayerOnDefeatForCard"; readonly level: 1 | 2 } // ch-005p Jill Valentine L2: when she would take any Damage, may Trash 1 card to negate the Damage


// ---------------------------------------------------------------------------
// Card instances
// ---------------------------------------------------------------------------

/** A concrete card instance in a game. */
export interface CardInstance {
  /** Unique instance id, e.g. "we-009#3". */
  readonly instanceId: string;
  readonly cardId: string;
  readonly location: CardLocation;
  /** Mercenaries: XP currently moved onto this Skill card. */
  readonly xp?: number;
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
export type TargetReason =
  | 'forcedExplore'          // FCH-008 Sherry: forced the target to Explore with her right now
  | 'mustExploreNextTurn'    // Wesker L2 / MA-030 Cephalo: the target must Explore on their next turn
  | 'mustUseAllExploresNextTurn' // CI-010 James Marcus: the target must spend their WHOLE Explore pool next turn
  | 'backstab'               // AC-048 Backstab: the target loses 1 XP from a Skill to the attacker
  | 'ammoReqNextTurn'        // CH-048 Jill (Mercenaries): the target's weapons cost more Ammo next turn
  | 'revealHand';            // Mind Control: the target's hand was revealed

/** One off-turn targeting event, recorded on the TARGET's seat so their
 *  client can announce it ("Sherry Birkin is forcing you to explore"). */
export interface TargetedNotice {
  /** Seat of the player / effect that targeted them. */
  readonly seat: number;
  readonly reason: TargetReason;
}


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
  /** AC-000 Martial Arts: +10 damage to Knife/Melee weapons this turn (option 1). */
  readonly knifeMeleeDamageBonusThisTurn?: number;
  /** AC-003 Tactical Advance: chosen weapon type for bonus damage this turn. */
  readonly tacticalAdvanceType?: string;
  /** AC-003 Tactical Advance: bonus damage amount for chosen type. */
  readonly tacticalAdvanceBonus?: number;
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
  /** Rachael Foley (CH-000) L1: Explores still owed THIS turn. Set to 2 when
   *  she takes the turn-start +1 Explore; each explore decrements it; endTurn
   *  is blocked while it is > 0 and the seat can still explore. */
  readonly exploresRequiredThisTurn?: number;
  /** CI-010 James Marcus: this player was nominated on reveal and must spend
   *  their WHOLE Explore pool on their next turn. Consumed at that turn's
   *  start, where it becomes `exploresRequiredThisTurn = exploresLeft`. */
  readonly mustUseAllExploresNextTurn?: boolean;
  /** B4MC Chris cards: once-per-round ability keys already used this
   *  round. Cleared for every seat when the turn circles back to the
   *  first living player (a new round). */
  /** Once-per-round / once-per-turn latches. A number value means
   *  "used on this turn number" (see drawOncePerTurnIfHpAtMost). */
  readonly roundUsedAbilities?: Readonly<Record<string, boolean | number>>;
  /** Off-turn targeting notices: who used a card or ability against this seat
   *  while it was NOT their turn (now rendered as a board banner so the
   *  viewing player knows they were targeted). Cleared at the start of the
   *  seat's own turn. */
  readonly targetedBy?: readonly TargetedNotice[];
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

  /** Unofficial Expansion: counter instances attached to this Character
   *  (Poison). Kept separate from `attached` so trophy/Decoration math is
   *  untouched; max one of each counter per Character. */
  readonly counters?: readonly string[];

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
  /** AC-021 Gathering Forces: cards gained this turn go to hand, not discard.
   *  Set when the card is played; cleared at the start of the next turn. */
  readonly gainedCardsGoToHand?: boolean;

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
  /** Outbreak David King L1: effect text copied from a discarded weapon onto
   *  another weapon, for this turn's explore. */
  readonly copiedWeaponEffects?: { readonly instanceId: string; readonly effects: readonly WeaponEffect[] };
  /** Outbreak: this seat Explored the Mansion or Attacked an Infected
   *  Character this turn (suppresses the end-of-turn Infection increase). */
  readonly exploredOrAttackedThisTurn?: boolean;
  /** Face-down (recovering): revives on own turn with -20 maxHp, skips it. */
  readonly downed: boolean;
  /** Permanently dead (maxHp reached 0). */
  readonly dead: boolean;

  /** Mercenaries Skill System: XP on the Character (moved onto Skills to activate them). */
  readonly xp?: number;
  /** Mercenaries Skill System: Skill cards in the Skill Area (instance ids. */
  readonly skills?: readonly string[];
  /** Mercenaries + Partner Modification: the single Skill assigned to the
   *  partner Character ("each Character a Player controls can only have 1
   *  Skill"). Absent when the partner holds no Skill or partner mode is off. */
  readonly partnerSkillId?: string;
  /** Mercenaries: explore-time "can" Skills declared this turn (consumed by the
   *  next explore, then cleared). */
  readonly pendingSkillEffects?: readonly PendingSkillEffect[];
  /** Mercenaries: weapon types chosen via Weapon Master LV.1 this turn. */
  readonly skillAmmoDiscountTypes?: readonly string[];

  // --- Mercenaries expansion (characters / weapons / actions) ---
  /** Claire Redfield (Mercenaries) L1: all weapons require this much less
   *  Ammo this turn (bought with -1 Buy at turn start). */
  readonly allWeaponsAmmoDiscountThisTurn?: number;
  /** Jill Valentine (Mercenaries) L1: this player's weapons require this much
   *  MORE Ammo on their NEXT turn (set by another player's ability). */
  readonly ammoReqIncreaseNextTurn?: number;
  /** Jill Valentine (Mercenaries) L1: the increase in force for THIS turn
   *  (derived from ammoReqIncreaseNextTurn at turn start, then cleared). */
  readonly ammoReqIncreaseThisTurn?: number;
  /** ch-005q Jill L1: Action cards THIS seat discarded this turn (diff-counted
   *  per action; played cards go to the play area and never count). Reset at
   *  turn start. Damage = ability amount x this count. */
  readonly actionsDiscardedThisTurn?: number;
  /** ch-005q Jill L2: the card instances she chose to keep while the end-of-
   *  turn retention prompt is open; undefined = prompt not raised yet. */
  readonly pendingKeepEndOfTurn?: readonly string[];
  /** Per-weapon damage bonuses this turn (Ibex Standard, Lightning Hawk,
   *  Custom Standard Sidearm, Coup de Grâce, ...). Keyed by instance id. */
  readonly weaponDamageBonusById?: Readonly<Record<string, number>>;
  /** Weapons that will be Trashed at the end of this turn (Custom Standard
   *  Sidearm, Reliable Blade). */
  readonly trashAtEndOfTurn?: readonly string[];
  /** Weapon instances whose manual ("can") effect already fired this turn. */
  readonly usedWeaponEffectsThisTurn?: readonly string[];
  /** CW-028 Machine Gun w/ Launcher: the instance armed this turn for the
   *  "deal N to all Revealed Infected, no weapon Damage" mode. Cleared at the
   *  start of the next turn. */
  readonly armedLauncherInstanceId?: string;
  /** MA-093 Los Ganados (Handscythe): extra cards drawn at end of turn. */
  readonly pendingEndOfTurnDraws?: number;
  /** CAC-005 Combat Medic: the first-gain heal has been used this turn. */
  readonly cac005HealUsedThisTurn?: boolean;
  /** CAC-004 Resupply: the next Item gain routes to Hand this turn. */
  readonly nextItemToHand?: boolean;
  /** CH-017 L2: the reveal-time +10 Damage is armed for this explore. */
  readonly helenaRevealBonus?: number;

  /** AC-048 Backstab: the chosen target player, resolved on the next explore. */
  readonly pendingBackstab?: { readonly targetSeat: number };
  /** AC-045 Coup de Grâce: the chosen weapon + bonus for this turn's explores. */
  readonly pendingCoupDeGrace?: { readonly weaponInstanceId: string; readonly amount: number };
  /** AM-006: the "Trash this Ammunition to gain 1 Ammo x10" on-defeat effect
   *  has already been used this turn ("this type of effect can only be applied
   *  once during your turn"). Cleared at the start of the player's next turn. */
  readonly ammoX10UpgradeUsedThisTurn?: boolean;
  /** End-of-turn recall choices (AM-007 Ammo x30, CW-025 Elephant Killer):
   *  copies this seat DECLINED to recycle at the end of this turn. Without it
   *  the end-of-turn prompt re-offers the same card forever. */
  readonly recallDeclined?: readonly string[];
  /** B4MC-CH-005 L1: the "pay 1 Action to charge" Stun Rod effect is active for
   *  the rest of this turn (her Stun Rod explores get +10 Damage). */
  readonly stunRodCharged?: boolean;
  /** CAC-015 This Shit Ends Now!: while set, Weapons GAINED this turn go into
   *  the Play Area instead of the discard. Cleared at the start of the next turn. */
  readonly weaponsGainedGoToPlayArea?: boolean;
  /** CAC-015: the instance id of the first Weapon routed to the Play Area by
   *  that effect — it gets +amount Damage this turn. */
  readonly firstWeaponToPlayAreaInstanceId?: string;
  /** CAC-015: the +Damage amount for `firstWeaponToPlayAreaInstanceId`. */
  readonly firstWeaponToPlayAreaBonus?: number;
  /** CW-034 Crossbow: armed this turn. The NEXT Infected Revealed is
   *  coin-flipped — heads defeats it immediately and grants +1 Explore. */
  readonly armedCrossbowInstanceId?: string;
  /** CW-035 Scoped Colt Anaconda: XP paid this turn, buffing the first Infected
   *  Revealed (+1 Decoration, +5 Health, +5 Damage per XP). */
  readonly scopedMagnumXp?: number;
  /** CAC-013 From Bad to Worse: the pending end-of-turn target choice. */
  readonly pendingFromBadToWorse?: { readonly step: 'choosePlayer' | 'targetDiscards'; readonly actionInstanceId: string; readonly targetSeat?: number };
  /** CAC-003 Change of Outfit: the two cards chosen to trash, awaiting the
   *  Resource Area gain. `handId` comes from the hand, `discardId` from the
   *  Discard Pile. */
  readonly pendingChangeOfOutfit?: { readonly handId: string; readonly discardId: string };
  /** LOC-002 Arklay Laboratory: its "+10 damage per card gained this turn on
   *  the first explore" is armed once the ammo is actually gained. Cleared at
   *  turn start and after the explore that consumes it. */
  readonly arklayArmed?: boolean;
  /** Fan Locations (1X): which location instances this seat has already paid
   *  for this turn — enforces a card's "Max: once per turn". */
  readonly locationUsesThisTurn?: readonly string[];
  /** Fan Location (Terrace): the free play of the first action card gained
   *  from a market pile is still unused this turn. */
  readonly freeActionPlayAvailable?: boolean;
  /** Fan Location (Terrace): an action card just bought that should be
   *  played immediately and for free. Consumed by applyAction. */
  readonly pendingFreeActionInstanceId?: string;
  /** Fan Location (Trevor's Tomb): the first action card played this turn
   *  still has its free repeat outstanding. */
  readonly pendingRepeatInstanceId?: string;
  /** Fan Location (Underground Passage): an action card set aside to be
   *  played automatically at the start of the seat's next turn. */
  readonly setAsideActionInstanceId?: string;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Phase =
  | "setup"
  | "skillDraft" // Mercenaries: opening Skill draft (pick 1 / pass left x5, keep 3)
  | "main"       // active player spends Action/Buy/Explore tokens in any order
  | "turnEnd"    // discard play area + hand, draw 5
  | "gameOver";

/** Mercenaries: an explore-time "can" Skill declared before the explore and
 *  consumed by it (Giant Killing LV.2/3, Reversal LV.3, Weapon Master LV.3,
 *  Maximizer LV.3). */
export type PendingSkillEffect =
  | { readonly kind: 'giantKillingPlusDamage'; readonly amount: number }
  | { readonly kind: 'giantKillingAllWeaponsPlusDamage'; readonly amount: number }
  | { readonly kind: 'reversalBonusPerCharacterDamage' }
  | { readonly kind: 'duplicateWeaponEffect'; readonly weaponInstanceId: string }
  | { readonly kind: 'removeXpForWeaponDamage'; readonly weaponInstanceId: string; readonly amount: number }
  // Reactive Mercenaries Skills (SK-008 Luck LV.2, SK-010 Toughness LV.1,
  // SK-012 Toughness LV.3). The engine cannot interrupt a resolved combat, so
  // these are DECLARED during the player's turn (useSkill) and consumed by the
  // next qualifying event; the Skill's XP is removed when the reaction fires.
  | { readonly kind: 'negateNextDamage'; readonly skillInstanceId: string }
  | { readonly kind: 'negateNextInfectedEffect'; readonly skillInstanceId: string }
  | { readonly kind: 'redirectNextInfectedEffect'; readonly skillInstanceId: string; readonly targetSeat: number };

/** Mercenaries opening draft: 5 cards each, pick 1 and pass left for 5 rounds,
 *  then keep 3 of the 5 chosen. Driven entirely by chooseOption prompts. */
export interface SkillDraftState {
  /** Face-down Skill cards not yet dealt. */
  readonly deck: readonly string[];
  /** Current hand per seat (the cards being drafted this round). */
  readonly hands: Readonly<Record<number, readonly string[]>>;
  /** Cards each seat has chosen so far. */
  readonly kept: Readonly<Record<number, readonly string[]>>;
  /** Cards each seat will pass left at the end of the round. */
  readonly pendingPass: Readonly<Record<number, readonly string[]>>;
  /** 0-based round (0..4); each round the hands shrink by one. */
  readonly round: number;
  /** Seat whose pick is pending. */
  readonly pickSeat: number;
  /** 'pick' = pick 1 of hand; 'keep' = keep 3 of the 5 chosen. */
  readonly step: 'pick' | 'keep';
  /** Seat whose keep-pick is pending. */
  readonly keepSeat: number;
  /** How many cards the current keep seat has already kept (0..keepTarget). */
  readonly keepPicks: number;
  /** Final kept cards per seat (filled during the keep step). */
  readonly final: Readonly<Record<number, readonly string[]>>;
  /** Cards to keep: 3 normally, 2 with the Partner Modification ("each
   *  Character a Player controls can only have 1 Skill"). */
  readonly keepTarget: number;
}

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

  /** Mansion deck, top = index 0 (Infected + tokens + Yellow Herbs). Cards
   *  sent to the bottom are appended to the END of this same list. */
  readonly mansionDeck: readonly string[];

  /** Fan "Locations": face-down location deck, top = index 0. A location on
   *  top is revealed (flipped face-up) the next time the Mansion is explored;
   *  its On Reveal effect fires at that moment. */
  readonly locationDeck?: readonly string[];

  /** Mirror Corridor (fan Location): Infected revealed while this is set have
   *  their Health reduced to `max(min, hp − amount)`, for THIS turn only. */
  readonly infectedHpReductionThisTurn?: { readonly amount: number; readonly min: number };
  /** Fan Location (Attic Landing): Infected revealed this turn get +amount Health. */
  readonly infectedHpBonusThisTurn?: number;
  /** END-OF-TURN PHASE: the seat that must resolve its post-turn choice
   *  before the next turn starts (Art Supply Room's trash). */
  readonly pendingEndPhaseSeat?: number;
  /** Cards the seat has already chosen to trash in this phase. */
  readonly postTurnTrashIds?: readonly string[];
  /** Fan Location (Bar): Resource Area piles carrying an XP token. */
  readonly xpTokens?: readonly string[];
  /** Fan Location (Bedroom): the seat that may not reveal Mansion cards
   *  this turn (the card says "You", so it is seat-scoped). */
  readonly mansionRevealBlockedSeat?: number;

  /** Revealed locations, in reveal order. `cubes` maps seat -> number of
   *  investment cubes on that card (GLOBAL / 1X cards carry none). */
  readonly locations?: ReadonlyArray<{
    readonly instanceId: string;
    readonly cubes: Readonly<Record<number, number>>;
    /** Seat that revealed it — GLOBAL cards may scope an effect to this seat. */
    readonly revealedBy?: number;
  }>;

  /** Removed-from-game cards. */
  readonly removed: readonly string[];

  /** EV-002 Nemesis Pursuit: while set, every Infected battled this turn gets
   *  +hp Health and +attack Damage. Set when the event is revealed, cleared at
   *  the start of the next turn. */
  readonly infectedBuffThisTurn?: {
    readonly hp: number;
    readonly attack: number;
  };

  /** AH-001 Abandon All Hope: when true, if the Boss (endInfectedCardId) is
   *  revealed while Exploring and not Defeated, player can shuffle it into
   *  top 10 of Mansion instead of normal disposition. Cleared at turn end. */
  readonly storyModeBossShuffleActive?: boolean;

  /** CE-004 Survival Horror: true when the d6 has been rolled this turn.
   *  Prevents re-rolling when the explore action is re-dispatched after the
   *  prompt is resolved. Cleared at turn start. */
  readonly survivalHorrorRolledThisTurn?: boolean;

  /** TUA-001 Tyrant Ultimate Abyss: weapon types disabled this turn (set by
   *  the d6 roll on reveal). Cleared at turn start. */
  readonly disabledWeaponTypesThisTurn?: ReadonlyArray<string>;

  /** Track which start-of-turn abilities have been used this turn.
   *  Key: ability kind string (e.g. 'turnStartDrawThenDiscardCard').
   *  Prevents the same ability from being used again via the action button.
   *  Cleared at turn start. */
  readonly usedStartOfTurnAbilities?: Readonly<Record<string, boolean>>;

  /** B4MC CH-008 Chris L1: an Infected has dealt Damage since the round
   *  began (the turn circled back to the first living player). Cleared at
   *  each new round. */
  readonly infectedDamageThisRound?: boolean;

  /** B4MC-CH-004 L2: the Characters healed so far THIS turn, keyed
   *  `<seat>:<main|partner>` so a Character healed twice still counts once.
   *  Tracked by diffing Health before/after an action and at turn start.
   *  Cleared at turn start. */
  readonly healedCharactersThisTurn?: readonly string[];

  /** Unofficial Expansion: the shared counter supply by the board (instance
   *  ids). A counter cycles between here and a Character's `counters`; when
   *  the Character dies it returns here ("return to the Resource Area"). */
  readonly supply?: readonly string[];

  /** Mansion attachment event cards currently active (instance ids). Mode 1
   *  holds at most 1 card (new replaces old); mode 2 allows multiple. */
  readonly mansionAttachments?: readonly string[];
  /** Mansion attachment mode: 1 = single (new replaces old), 2 = multiple allowed.
   *  Set from room config; overrides per-card attachmentMode. */
  readonly mansionAttachmentMode?: 1 | 2;
  /** Per-attachment trash counters (for effects like Rampage that remove
   *  themselves after trashing N cards). Keyed by attachment instance id. */
  readonly attachmentTrashCounts?: Readonly<Record<string, number>>;

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
  readonly endReason?: "uroborosDefeated" | "allPlayersDead" | "sherryLastAlive";

  /** Reactive trash window (AC-018, Jill L2, AC-042): pending off-turn reaction. */
  readonly reactiveTrashWindow?: {
    readonly kind: 'uroborosInjection' | 'jillFlashGrenade' | 'fightOrFlight';
    readonly triggeringSeat: number;
    readonly revealedInstanceId: string;
  };
  /** AC-050 Resuscitate: a Character was saved from a lethal hit and is at 10
   *  HP pending a Resuscitate holder's decision; `downSnapshot` is the state to
   *  restore if nobody trashes the card. */
  readonly pendingResuscitate?: {
    readonly seat: number;
  };
  /** Flash Grenade reactive defeat: instance ID of infected defeated by Flash Grenade. */
  readonly flashGrenadeDefeatedInstanceId?: string;
  /** Pending explore awaiting reactive responses (Las Plagas Flash Grenade). */
  readonly pendingExplore?: {
    readonly seat: number;
    readonly revealedInstanceId: string;
    readonly outcome: 'defeated' | 'notDefeated';
    readonly decorations: number;
    /** Decorations gained from the defeated Infected (applied on resolution). */
    readonly decorationDelta: number;
    readonly damageTaken: number;
    readonly newPlayer: PlayerState;
    readonly mansionDeck: readonly string[];
    readonly rngState: number;
    /** AC-042 Fight or Flight: the exploring player's pre-explore state, used to
     *  cancel the explore when the revealed Infected is stronger. */
    readonly prePlayer?: PlayerState;
    /** AC-042: the exploring Character's Health at reveal time. When the
     *  revealed Infected's Health exceeds this, the explore is cancelled. */
    readonly revealHpThreshold?: number;
    /** The weapons the exploring player used, so a deferred resolution can
     *  still apply "on defeat with weapon tag" abilities. */
    readonly weaponIds?: readonly string[];
  };
  readonly log: readonly LoggedAction[];

  /** Mercenaries Skill System: master toggle for this game. */
  readonly skillSystem?: boolean;
  /** Mercenaries: face-down Skill deck remaining in the opening draft. */
  readonly skillDeck?: readonly string[];
  /** Mercenaries: the opening draft in progress (phase === "skillDraft"). */
  readonly skillDraft?: SkillDraftState;
}

/** Where an ability/effect revealed a card from, for the client's reveal overlay. */
export type CardRevealPile =
  | 'mansion'
  | 'inventory'
  | 'hand'
  | 'discard'
  | 'market'
  | 'deck';

/**
 * ENGINE-FILLED: one card an ability or effect revealed during an action.
 *
 * Attached to the action's log entry so the client can pause and show the
 * card. A peek (Ada's Mansion look, the PDA, Master of Unlocking, …) leaves
 * the card in its pile, so there is NO zone diff for the client to observe —
 * the engine has to hand the reveal over explicitly.
 */
export interface CardReveal {
  readonly instanceId: string;
  readonly pile: CardRevealPile;
  /** Seat whose pile the card came from (defaults to the acting seat). */
  readonly ownerSeat?: number;
}

export interface LoggedAction {
  readonly seq: number;
  readonly action: Action;
  /** ENGINE-FILLED, never client-sent: cards this action revealed through an
   *  ability or effect. Absent on logs written before this field existed. */
  readonly reveals?: readonly CardReveal[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action = 
  | { readonly type: "startGame"; readonly setup: GameSetup } 
  | { readonly type: "playActionCard"; readonly seat: number; readonly instanceId: string; readonly isFreeRepeat?: boolean }
  | { readonly type: "playItem"; readonly seat: number; readonly instanceId: string; readonly healTarget?: "main" | "partner" }
  | { readonly type: "playAmmo"; readonly seat: number; readonly instanceId: string } 
  | { readonly type: "explore"; readonly seat: number; readonly weapons: readonly string[]; readonly exploreCount: number; readonly ammoByWeapon?: Readonly<Record<string, number>>; readonly discardedPistols?: readonly string[]; readonly leader?: "main" | "partner"; /** FCH-008 Sherry: the seat whose ability forced this explore (absent for a normal explore). */ readonly forcedBy?: number; /** ENGINE-FILLED, never client-sent: the instance ids this explore revealed, in reveal order. A CI-002 Crow chain or a MA-039 / MA-072 expansion reveals more cards than `exploreCount`, and the client cannot recover the extra ones from the deck diff — returned cards are shuffled back in, so they look like ordinary deck cards. Absent on logs written before this field existed (the client falls back to the top-`exploreCount` prefix). */ readonly revealedInstanceIds?: readonly string[] }
  /** Outbreak: spend 1 Explore to Attack another Character (instead of
   *  revealing the Mansion). Non-Infected attackers must name a weapon.
   *  Infected attackers deal their base Damage.
   */
  | { readonly type: "attack"; readonly seat: number; readonly targetSeat: number; readonly weaponInstanceId?: string; readonly infectionCardIds?: readonly string[] }
    | { readonly type: "playWeapon"; readonly seat: number; readonly instanceId: string } // move weapon from hand to play area for later explore
  | { readonly type: "buy"; readonly seat: number; readonly pileId: string; readonly instanceId?: string }
  | { readonly type: "useCharacterAbility"; readonly seat: number; readonly abilityIndex: number; readonly character?: "main" | "partner" }
  | { readonly type: "attachToPartner"; readonly seat: number; readonly instanceId: string; readonly replaceIndex?: 0 | 1 }
  /** Alliance: human seats get ONE guided action that raises a card prompt (and,
   *  when the Partner is full, a slot prompt) instead of a button per legal card.
   *  Bots keep the direct `attachToPartner` actions. */
  | { readonly type: "attachToPartnerStart"; readonly seat: number }
  | { readonly type: "chooseExploreLeader"; readonly seat: number; readonly leader: "main" | "partner" }
  | { readonly type: "endTurn"; readonly seat: number }
  /** Mercenaries: activate a manual ("can") weapon effect (free action). */
  | { readonly type: "useWeaponAbility"; readonly seat: number; readonly instanceId: string }
  /** Fan action CAC-016 Take Them Down!: discard this Action from the Play
   *  Area to move 1 Weapon from the Discard Pile to the Hand (free action). */
  | { readonly type: "useActionAbility"; readonly seat: number; readonly instanceId: string }
  /** Fan weapon CW-035 Scoped Colt Anaconda: pay N XP before Exploring to buff
   *  the first Infected Revealed this turn (free action). */
  | { readonly type: "usePreExploreXpAbility"; readonly seat: number; readonly instanceId: string; readonly amount: number }
  /** Fan Locations: invest in a GLOBAL-less location (spend 1 Buy + gold, place
   *  an investment cube). */
  | { readonly type: "investLocation"; readonly seat: number; readonly instanceId: string }
  /** Fan Locations: pay a 1X location's cost for a one-shot effect. */
  | { readonly type: "useLocation"; readonly seat: number; readonly instanceId: string }
  /** Fan Location (Underground Passage): start the trash-and-upgrade chain. */
  | { readonly type: "passageStart"; readonly seat: number }
  /** Fan Location (Underground Passage): the action to trash. */
  | { readonly type: "passageChooseAction"; readonly seat: number; readonly instanceId: string }
  /** Fan Location (Underground Passage): the replacement to set aside. */
  | { readonly type: "passageChooseGain"; readonly seat: number; readonly instanceId: string }
  /** Fan Location (Attic): trash an action from hand for a better one. */
  | { readonly type: "atticStart"; readonly seat: number }
  | { readonly type: "atticChooseAction"; readonly seat: number; readonly instanceId: string }
  | { readonly type: "atticChooseGain"; readonly seat: number; readonly instanceId: string }
  /** END-OF-TURN PHASE: pick one more card to trash, or finish. */
  | { readonly type: "postTurnTrashChoose"; readonly seat: number; readonly instanceId: string }
  /** CH-016 L1: attach a hand card to the Character face down. */
  | { readonly type: "attachCardFaceDown"; readonly seat: number; readonly instanceId: string }
  /** CH-017 L2: the reveal-time discard choice. */
  | { readonly type: "helenaRevealChoice"; readonly seat: number; readonly instanceId: string }
  /** Mercenaries: move XP from the Character onto one of its Skills (free action). */
  | { readonly type: "moveXp"; readonly seat: number; readonly skillInstanceId: string; readonly amount: number }
  /** Mercenaries: activate a manual ("can") Skill effect (free action, once per turn). */
  | { readonly type: "useSkill"; readonly seat: number; readonly skillInstanceId: string }
  | { readonly type: "removeAttachedItem"; readonly seat: number; readonly instanceId: string } 
  | { readonly type: "chooseOption"; readonly seat: number; readonly promptId: string; readonly option: number }
  /** Outbreak/Mercenaries: supplementary log entry emitted by applyOutbreakHooks — records which mansion card was revealed during an explore. */
  | { readonly type: "exploreReveal"; readonly seat: number; readonly instanceId: string; readonly name: string;
    /** How the fight resolved, for the log: defeated / removed / not defeated. */
    readonly outcome?: "defeated" | "removed" | "notDefeated";
    /** Damage the EXPLORING seat took from this reveal (0 when defeated). */
    readonly damageTaken?: number };


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
  /** Enable the Mercenaries Skill System (Skill cards, XP, draft). */
  readonly skillSystem?: boolean;
  /** Mansion attachment mode: 1 = single (new replaces old), 2 = multiple allowed. */
  readonly mansionAttachmentMode?: 1 | 2;
  /** Mercenaries Basic Resources: the starting deck uses the Mercenaries printings
   *  (am-005 / we-049 / we-050), matching the swapped Resource Area. */
  readonly mercenariesBasicResources?: boolean;
  /** Fan Locations: deal the location cards into the face-down location deck
   *  on top of the Mansion. Opt-in — the user introduces the rule separately. */
  readonly locationsMode?: boolean;
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
