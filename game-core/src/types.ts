/**
 * @re/game-core — shared type contract.
 *
 * This file is THE contract every module conforms to. It is maintained by the
 * orchestrator; coder tasks must not edit it unless the task spec says so.
 *
 * Design principles:
 * - GameState is immutable-by-convention: the engine reducer returns a NEW state.
 * - Every state mutation is expressed as an Action, validated before applying.
 * - The action log + initial seed fully determine a game (replay/determinism).
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
  | "location"
  | "infected"
  | "infection";

export type CardZone =
  | "market"        // ammo-cost row available for purchase
  | "mansion"       // XP-cost deck (powerful cards)
  | "location"      // location deck / revealed locations row
  | "infectedDeck"  // face-down infected deck
  | "infectedRow"   // revealed infected in play (attackable)
  | "hand"
  | "playArea"      // in front of a player: characters, equipped weapons, items
  | "deck"
  | "discard"
  | "exile";        // removed-from-game (e.g. killed infected)

/** Where a card instance currently lives. */
export interface CardLocation {
  readonly zone: CardZone;
  /** Index within the zone's list (0-based). Meaningful for ordered zones. */
  readonly index: number;
  /** Owning seat, when the zone belongs to a player. */
  readonly seat?: number;
}

/**
 * Static card definition (the "card database" entry). Instances reference
 * definitions by cardId; runtime instance state lives in CardInstance.
 */
export interface CardDef {
  /** Stable unique id, e.g. "we-001". */
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  readonly set: "premier"; // expansions add ids here later
  /** Human-readable rules text. */
  readonly text: string;

  /** Cost in ammo (market purchases). */
  readonly ammoCost?: number;
  /** Cost in XP (mansion purchases). */
  readonly xpCost?: number;

  // -- weapon --
  /** Damage dealt when the weapon attacks (requires loaded ammo). */
  readonly damage?: number;
  /** How many ammo cards can be attached to this weapon. */
  readonly ammoCapacity?: number;
  /** Some weapons deal damage without ammo (e.g. combat knife = damage, no ammo). */
  readonly needsAmmo?: boolean;

  // -- infected --
  /** Infected hit points. */
  readonly hp?: number;
  /** XP awarded to the killer when this infected dies. */
  readonly xpReward?: number;
  /** Damage this infected deals when it attacks. */
  readonly attack?: number;
  /** True if this infected attacks players (vs. passive). */
  readonly attacker?: boolean;

  // -- character --
  /** Character starting hit points. */
  readonly characterHp?: number;
  /** Ability summaries by level (level 1 is the base character). */
  readonly levels?: ReadonlyArray<{ readonly level: number; readonly text: string }>;

  /** Card-specific keyword abilities the engine interprets. */
  readonly keywords?: readonly CardKeyword[];
}

export type CardKeyword =
  | "explorer"        // may look at/reorder location or mansion deck top
  | "reload"          // can attach ammo as part of another action
  | "attachable"      // item that attaches to a character
  | "counterattack"   // deals damage back when its owner is attacked
  | "infectionEffect" // infection card behavior
  ;

/**
 * A concrete card instance in a game. cardId points into the card database;
 * the rest is mutable-with-the-state runtime data.
 */
export interface CardInstance {
  /** Unique instance id (e.g. "we-001#3"). */
  readonly instanceId: string;
  readonly cardId: string;
  readonly location: CardLocation;
  /** Face-down / hidden from other players (deck, infectedDeck, ...). */
  readonly faceDown?: boolean;
  /** Damage currently on an infected in the row. */
  readonly damage?: number;
  /** Ammo instances attached to a weapon (instanceIds). */
  readonly attached?: readonly string[];
}

// ---------------------------------------------------------------------------
// Players & seats
// ---------------------------------------------------------------------------

export interface PlayerState {
  readonly seat: number;
  readonly name: string;
  readonly controller: "human" | "bot";
  /** Bot difficulty knob (0 = random-ish, higher = stronger). Ignored for humans. */
  readonly botLevel?: number;

  /** Character cards in play (instanceIds). Players start with one. */
  readonly characters: readonly string[];
  /** Current HP per character instanceId. */
  readonly hp: Readonly<Record<string, number>>;

  readonly ammo: number;
  readonly xp: number;

  readonly deck: readonly string[];      // instanceIds, top = index 0
  readonly hand: readonly string[];
  readonly discard: readonly string[];
  readonly playArea: readonly string[];

  readonly alive: boolean;
  /** XP total for scoring; also tracked separately from spendable XP. */
  readonly xpEarnedTotal: number;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Phase =
  | "setup"
  | "turnStart"     // start-of-turn effects, draw to hand size
  | "main"          // play cards, attack, buy, explore
  | "turnEnd"       // discard hand (unless retained), cleanup
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

  /** Market row: cards purchasable with ammo (refilled from marketDeck). */
  readonly marketRow: readonly string[];     // instanceIds
  readonly marketDeck: readonly string[];
  /** Mansion deck (XP purchases) and its revealed row, if the scenario uses one. */
  readonly mansionRow: readonly string[];
  readonly mansionDeck: readonly string[];

  readonly locationRow: readonly string[];
  readonly locationDeck: readonly string[];

  readonly infectedRow: readonly string[];
  readonly infectedDeck: readonly string[];
  /** Killed infected + used cards that are out of the game. */
  readonly exile: readonly string[];

  /** Every card instance, keyed by instanceId. */
  readonly cards: Readonly<Record<string, CardInstance>>;

  /** Winner seats once phase === "gameOver". Empty in progress. */
  readonly winners: readonly number[];
  /** Why the game ended. */
  readonly endReason?:
    | "infectedDeckEmpty"
    | "locationObjective"
    | "allPlayersDead";

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
  | { readonly type: "playCard"; readonly seat: number; readonly instanceId: string }
  | { readonly type: "attachAmmo"; readonly seat: number; readonly weaponInstanceId: string; readonly ammoInstanceId: string }
  | { readonly type: "attackInfected"; readonly seat: number; readonly attackerInstanceId: string; readonly targetInstanceId: string }
  | { readonly type: "buyFromMarket"; readonly seat: number; readonly instanceId: string }
  | { readonly type: "buyFromMansion"; readonly seat: number; readonly instanceId: string }
  | { readonly type: "exploreLocation"; readonly seat: number }
  | { readonly type: "useAbility"; readonly seat: number; readonly sourceInstanceId: string; readonly ability: string; readonly targets?: readonly string[] }
  | { readonly type: "endTurn"; readonly seat: number }
  | { readonly type: "chooseOption"; readonly seat: number; readonly promptId: string; readonly option: number };

export interface GameSetup {
  readonly seed: number;
  readonly players: ReadonlyArray<{
    readonly name: string;
    readonly controller: "human" | "bot";
    readonly botLevel?: number;
    /** Chosen character cardId; if omitted the engine offers/assigns one. */
    readonly characterCardId?: string;
  }>;
}

/**
 * When a played card requires a decision (targeting, optional effects), the
 * engine parks a prompt in state; clients answer with chooseOption.
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

/** State view sanitized for one seat (hides other hands/deck contents). */
export interface PlayerView {
  readonly seat: number;
  readonly state: GameState;
}
