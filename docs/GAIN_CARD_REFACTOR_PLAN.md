# Plan: Centralize Card-Gaining into a `gainCard` Engine Function

## Goal

Introduce a single pure engine function `gainCard(state, seat, cardId, destination, reason?)`
that all card-acquisition paths (buy, gain from market, token effects, ability prompts,
explore rewards, level-up grants) route through, so that "on gain card" hooks
(e.g. Leon Nightmare L2 `plusOneCardOnGainCard`, `gatheringCardsGoToHand`) fire in
one place instead of being scattered across `actions.ts`.

## Why

- Currently cards are gained in many ad-hoc spots: `actions.ts` (upgradeAmmoBy30Gold,
  turn-start knife prompt, market buy, token effects), `explore.ts` (yellow herb,
  rocket launcher case), `characters.ts` (level grants), `abilities.ts`.
- Hook abilities like `plusOneCardOnGainCard` (Leon L2) and Alliance
  "gained cards go to hand" (ac-021 Gathering Forces) need a single interception
  point; otherwise each new gain path must remember to re-implement hooks, leading
  to missed triggers (current bug surface).
- A central function also standardizes instance-id generation, destination routing
  (discard vs hand vs top of inventory), and event emission for replay/viewer.

## Scope

In scope:
- New `gainCard` in `game-core/src/engine/gainCard.ts` (+ tests).
- Migrate existing gain sites to call it.
- Hook dispatch: character abilities + card effects that react to a gain.
- Update replay log + viewer sanitization if new fields added.

Out of scope:
- Changing buy/gain rules or costs.
- New card data.

## Proposed API

```ts
export type GainDestination = 'discard' | 'hand' | 'topInventory' | 'bottomInventory';

export interface GainCardRequest {
  readonly seat: number;
  readonly cardId: string;
  readonly destination?: GainDestination; // default 'discard' (base rules)
  readonly count?: number;               // default 1; >1 gains N copies
  readonly reason?: string;             // 'buy' | 'token' | 'ability' | 'level' | 'explore' | 'turnStart'
  readonly forceHand?: boolean;          // override for "gained cards go to hand" effects
}

export function gainCard(state: GameState, req: GainCardRequest): GameState;
```

Pure, immutable, returns new state. Internally:
1. Resolve destination (apply `gatheringCardsGoToHand`-style modifiers).
2. Generate instance ids using `nextBase.version` (existing convention
   `${cardId}#g${version}-${seat}`).
3. Insert card instances into `state.cards` with correct location.
4. Update the player's zone arrays (hand/discard/inventory) per destination.
5. Apply post-gain hooks:
   - `plusOneCardOnGainCard` (Leon L2): gain one extra card (recursive via gainCard
     with reason 'hook', guarded to depth 1 to avoid infinite loops).
   - `gatheringCardsGoToHand` (ac-021): already handled by destination routing;
     flag cleared after turn.
6. Emit a `GainCardEvent` into `state.log` for replay/viewer.

## Integration points (migration order)

1. `actions.ts` market buy path.
2. `actions.ts` `upgradeAmmoBy30Gold`.
3. `actions.ts` turn-start knife prompt resolution (L1 Krauser etc.).
4. `explore.ts` yellow herb / rocket launcher case / gatling gun case.
5. `characters.ts` level-grant cards.
6. `abilities.ts` token effects that grant cards (ac-037 A Gift?, ac-040, ma-* cases).
7. `turn.ts` end-of-turn "gain cards" effects.

Each migration replaces inline instance-id/zone mutation with a `gainCard` call and
removes duplicated logic. Keep behavior identical; tests must still pass.

## Hook registration

Hooks are declared as character abilities (`plusOneCardOnGainCard`) and as
transient turn flags (`gainedCardsGoToHand`). `gainCard` consults:
- `abilities.ts` helpers `plusOneCardOnGainCard(abilitiesForSeat)`.
- `state.turnFlags[seat].gainedCardsGoToHand`.

Hook recursion guard: a `hookDepth` counter on the request (internal, not in public
type) capped at 1 for plusOneCard, and hooks never re-trigger themselves.

## Files to touch

- NEW `game-core/src/engine/gainCard.ts`
- NEW `game-core/src/engine/gainCard.test.ts`
- `game-core/src/engine/actions.ts` (migrate)
- `game-core/src/engine/explore.ts` (migrate)
- `game-core/src/engine/characters.ts` (migrate)
- `game-core/src/engine/abilities.ts` (hook helpers already exist; add dispatcher)
- `game-core/src/types.ts` (GainCardEvent, TurnFlags if missing)
- `game-core/src/engine/replay.ts` (log event)
- `game-core/src/engine/view.ts` (sanitize)

## Tests

- Unit: gainCard to discard/hand/topInventory, count>1, instance id format.
- Hook: Leon L2 gains +1 card on any gain (including chained gains from hooks
  not re-triggering).
- Gathering Forces: gained cards route to hand during the turn.
- Regression: all existing actions/explore/abilities tests pass unchanged.
- Replay: round-trip gain events reproduce state.

## Risks / pitfalls

- Instance id collisions if two gains in same version; mitigate with a per-call
  counter suffix (existing `#g${version}-${seat}` plus index).
- Hook infinite loops; guard with hookDepth cap and "reason !== 'hook'" for
  re-triggering plusOneCard (only base gains trigger it).
- Destination override must not break cards that explicitly say "to hand" vs
  "to discard"; pass explicit destination from call sites, modifiers only
  upgrade discard->hand when flag set.
- View sanitization: gained card ids are already in `cards` map; no new secret
  info, but log events must be seat-aware.

## Acceptance criteria

- Single `gainCard` is the only writer of "new gained card instances" outside
  of initial deal/setup.
- Leon L2 +1 card fires for buys, token gains, and ability gains.
- All existing tests green (game-core, server).
- No behavior change in golden replay fixtures.
