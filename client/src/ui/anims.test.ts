import { describe, expect, it } from 'vitest';
import type { GameState } from '@re/game-core';
import { detectReveal, diffCardMoves } from './anims';
import { flightPath } from './CardFlightLayer';

/** Minimal GameState-shaped fixture with the zones animation cares about. */
function makeState(over: {
  seats?: ReadonlyArray<{
    seat: number;
    hand?: readonly string[];
    inventory?: readonly string[];
    discard?: readonly string[];
    playArea?: readonly string[];
    attached?: readonly string[];
  }>;
  marketPiles?: Readonly<Record<string, { readonly pileId: string; readonly cards: readonly string[] }>>;
  mansionDeck?: readonly string[];
  mansionBottom?: readonly string[];
  removed?: readonly string[];
  version?: number;
  log?: ReadonlyArray<{ seq: number; action: Record<string, unknown> }>;
}): GameState {
  return {
    version: over.version ?? 1,
    seed: 1,
    rngState: 1,
    phase: 'main',
    activeSeat: 0,
    turnNumber: 1,
    seats: (over.seats ?? []).map(s => ({
      seat: s.seat,
      name: `p${s.seat}`,
      controller: 'human' as const,
      characterInstanceId: '',
      hp: 100,
      maxHp: 100,
      decorations: 0,
      level: 0 as const,
      turnAmmo: 0,
      turnGold: 0,
      actionsLeft: 1,
      buysLeft: 1,
      exploresLeft: 1,
      weaponDamageBonusThisTurn: 0,
      attached: s.attached ?? [],
      inventory: s.inventory ?? [],
      hand: s.hand ?? [],
      discard: s.discard ?? [],
      playArea: s.playArea ?? [],
      downed: false,
      dead: false,
    })),
    marketPiles: over.marketPiles ?? {},
    mansionDeck: over.mansionDeck ?? [],
    mansionBottom: over.mansionBottom ?? [],
    removed: over.removed ?? [],
    cards: {},
    cardDefs: {},
    prompts: [],
    winners: [],
    log: (over.log ?? []).map(e => ({ seq: e.seq, action: e.action as never })),
  };
}

describe('diffCardMoves', () => {
  it('reports a card played from hand to the play area', () => {
    const prev = makeState({ seats: [{ seat: 0, hand: ['a1#1'] }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, playArea: ['a1#1'] }] });
    const moves = diffCardMoves(prev, next);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ instanceId: 'a1#1', fromZone: 'hand', toZone: 'play', faceDown: false });
  });

  it('reports a buy from a market pile into hand', () => {
    const prev = makeState({
      marketPiles: { 'we-009': { pileId: 'we-009', cards: ['we-009#1', 'we-009#2'] } },
    });
    const next = makeState({
      version: 2,
      marketPiles: { 'we-009': { pileId: 'we-009', cards: ['we-009#2'] } },
      seats: [{ seat: 0, hand: ['we-009#1'] }],
    });
    const moves = diffCardMoves(prev, next);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      instanceId: 'we-009#1',
      fromZone: 'market',
      fromPileId: 'we-009',
      toZone: 'hand',
      faceDown: false,
    });
  });

  it('marks draws from the deck as face-down', () => {
    const prev = makeState({ seats: [{ seat: 0, inventory: ['am1#1', 'am1#2'] }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, inventory: ['am1#2'], hand: ['am1#1'] }] });
    const moves = diffCardMoves(prev, next);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromZone: 'deck', toZone: 'hand', faceDown: true });
  });

  it('reports an explore: mansion deck -> attached', () => {
    const prev = makeState({ mansionDeck: ['ma-001#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#1'] }],
    });
    const moves = diffCardMoves(prev, next);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromZone: 'mansion', toZone: 'attached', faceDown: true });
  });

  it('skips sanitized hidden-* cards (other players)', () => {
    const prev = makeState({ seats: [{ seat: 1, hand: ['hidden-0'] }, { seat: 0 }] });
    const next = makeState({ version: 2, seats: [{ seat: 1, playArea: ['hidden-0'] }, { seat: 0 }] });
    expect(diffCardMoves(prev, next)).toHaveLength(0);
  });

  it('returns nothing when nothing moved and respects the cap', () => {
    const prev = makeState({ seats: [{ seat: 0, hand: ['a1#1'] }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, hand: ['a1#1'] }] });
    expect(diffCardMoves(prev, next)).toHaveLength(0);

    const manyPrev = makeState({ seats: [{ seat: 0, hand: ['a1#1', 'a2#1', 'a3#1'] }] });
    const manyNext = makeState({ version: 2, seats: [{ seat: 0, playArea: ['a1#1', 'a2#1', 'a3#1'] }] });
    expect(diffCardMoves(manyPrev, manyNext, 2)).toHaveLength(2);
  });
});

describe('detectReveal', () => {
  const exploreLog = [{ seq: 1, action: { type: 'explore' as const, seat: 0 } }];

  it('detects a defeated Infected: mansion -> attached', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#7'] }],
      log: exploreLog,
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'ma-001#7', outcomeZone: 'attached' });
  });

  it('detects an escaped Infected: mansion -> mansionBottom', () => {
    const prev = makeState({ mansionDeck: ['ma-002#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      mansionBottom: ['ma-002#7'],
      seats: [{ seat: 0 }],
      log: exploreLog,
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'ma-002#7', outcomeZone: 'mansionBottom' });
  });

  it('ignores another player exploring', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }, { seat: 1 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0 }, { seat: 1, attached: ['ma-001#7'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 1 } }],
    });
    expect(detectReveal(prev, next, 0)).toBeNull();
  });

  it('ignores a non-explore action that moves a mansion card (reshuffle)', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      mansionBottom: ['ma-001#7'],
      seats: [{ seat: 0 }],
      log: [{ seq: 1, action: { type: 'buy' as const, seat: 0, pileId: 'we-001' as const } }],
    });
    expect(detectReveal(prev, next, 0)).toBeNull();
  });

  it('returns null when the newest action is not an explore', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#7'] }],
      log: [],
    });
    expect(detectReveal(prev, next, 0)).toBeNull();
  });
});

describe('flightPath', () => {
  it('positions the flying card at the source and translates to the target', () => {
    // source rect center (300, 200), target rect center (400, 500), base 96
    const path = flightPath({ x: 300, y: 200 }, { x: 400, y: 500 });
    // start = center - base/2 so the card centers on the source
    expect(path.from).toEqual({ x: 252, y: 152 });
    expect(path.dx).toBe(100);
    expect(path.dy).toBe(300);
  });

  it('produces zero translation for overlapping zones', () => {
    const path = flightPath({ x: 100, y: 100 }, { x: 100, y: 100 });
    expect(path.dx).toBe(0);
    expect(path.dy).toBe(0);
  });
});