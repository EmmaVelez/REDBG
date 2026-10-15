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
  | "infected";  // Mansion-only creatures

/** Zones a card instance can live in. */
export type CardZone =
  | "marketPile"   // a Resource Area pile (pileId identifies which)
  | "mansionDeck"  // face-down Mansion deck (top = index 0)
  | "hand"
  | "playArea"     // in front of a player this turn (played cards)
  | "attached"     // attached under a Character (defeated Infected trophies)
  | "inventory"    // player's deck (top = index 0)
  | "discard"
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
  readonly set: "premier";
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
  readonly weaponTags?: readonly WeaponTag[]; // e.g. "explosive" (Jill synergy)

  // -- infected --
  readonly hp?: number;
  /** Damage dealt to the exploring Character when NOT defeated. */
  readonly attack?: number;
  /** Decorations awarded when defeated. */
  readonly decorations?: number;
  /** Machine-readable effect keys (see InfectedEffect). */
  readonly infectedEffects?: readonly InfectedEffect[];

  // -- character --
  /** Starting AND maximum Health at Level 1. */
  readonly maxHp?: number;
  /** Decorations needed to reach Level 2. */
  readonly level2At?: number;
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
export type WeaponTag = "explosive" | "melee" | "gun";

export type WeaponEffect =
  | { readonly kind: "plusDamagePerExtraWeapon"; readonly amount: number }   // Burst-Fire Handgun: +20 when attacking with >1 weapon
  | { readonly kind: "plusDamageIfAmmoAbove"; readonly threshold: number; readonly amount: number } // Full-Bore MG: +30 if ammo > 100
  | { readonly kind: "grantExplores"; readonly amount: number };             // Pump-Action Shotgun: +1 Explore

export type InfectedEffect =
  | { readonly kind: "shuffleBackIfNotDefeated" }                            // Uroboros Aheri
  | { readonly kind: "skipNextTurnOfAPlayerOnDefeat" }                       // Executioner: on defeat, attacker chooses a player (Prompt) who skips their next turn
  | { readonly kind: "noActionsNextTurnOfAPlayerOnDefeat" }                  // Zombie (Female): on defeat, choose a player (Prompt); they can't play Actions next turn
  | { readonly kind: "plusDamagePerFull10AmmoOfAttacker"; readonly amount: number }; // Gatling Gun Majini: +5 per full 10 Ammo

export type ItemEffect =
  | { readonly kind: "healFixed20OrTrashWithSecondFor60" }                   // Green Herb
  | { readonly kind: "healToFull" }                                          // First Aid Spray
  | { readonly kind: "plusMaxHp20" };                                        // Yellow Herb (Mansion only)

export type ActionEffect =
  | { readonly kind: "allWeaponsPlusDamageThisTurn"; readonly amount: number } // Deadly Aim: +10
  | { readonly kind: "recoverWeaponFromDiscardToHand" }                      // Reload (choice via Prompt)
  | { readonly kind: "moveHandCardToTopOfInventory" }                        // Umbrella Corp (choice via Prompt)
  | { readonly kind: "trashHandCard" }                                       // Ominous Battle (choice via Prompt)
  | { readonly kind: "negateWeaponCost40OrLessFromHand" }                    // Struggle for Survival (reactive)
  | { readonly kind: "lookAtMansionTop"; readonly count: number };           // Mansion Foyer style peek (Prompt ordering)

export type TokenEffect =
  | { readonly kind: "gainWeaponAndTrashToken"; readonly weaponCardId: string }; // Rocket Launcher Case -> we-008, Gatling Gun Case -> we-007

export type CharacterAbility =
  | { readonly kind: "weaponPlusDamagePerInfectedFought"; readonly amount: number } // Chris L1: +5 per Infected being fought
  | { readonly kind: "noHealingNoNonInfectedAttach" }                              // Chris restriction
  | { readonly kind: "explosivesGoToDiscardInsteadOfTrash" }                        // Jill L2
  | { readonly kind: "generic"; readonly level: number };                           // fallback: text-only ability, engine treats as no-op (v1)

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
  /** Level 2 unlocks at level2At decorations. */
  readonly level: 1 | 2;

  /** Per-turn resource pools (reset at turn start; granted by played cards). */
  readonly turnAmmo: number;
  readonly turnGold: number;
  readonly actionsLeft: number;
  readonly buysLeft: number;
  readonly exploresLeft: number;
  /** Temporary per-turn combat bonus (Deadly Aim etc.). */
  readonly weaponDamageBonusThisTurn: number;

  /** Instance ids of defeated Infected attached under the Character (trophies). */
  readonly attached: readonly string[];

  readonly inventory: readonly string[]; // deck, top = index 0
  readonly hand: readonly string[];
  readonly discard: readonly string[];
  readonly playArea: readonly string[];

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

  /** Every card instance, keyed by instanceId. */
  readonly cards: Readonly<Record<string, CardInstance>>;

  /** Decisions awaiting a player (targeting, optional effects). */
  readonly prompts: readonly Prompt[];

  /** Winner seat(s) once phase === "gameOver". */
  readonly winners: readonly number[];
  readonly endReason?: "uroborosDefeated" | "allPlayersDead";

  /** All actions applied so far (for replay/audit). */
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
  | { readonly type: "explore"; readonly seat: number; readonly weapons: readonly string[]; readonly ammoCards: readonly string[]; readonly exploreCount: number }
  | { readonly type: "buy"; readonly seat: number; readonly pileId: string }
  | { readonly type: "useCharacterAbility"; readonly seat: number; readonly abilityIndex: number }
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
  }>;
  /** Scenario config (defaults to First Timer Story Mode). */
  readonly scenario?: "firstTimer";
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
