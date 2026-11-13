import { describe, expect, it } from 'vitest';
import type { GameState } from '@re/game-core';
import { detectPlayerDowned, detectReveal, detectReveals, diffCardMoves } from './anims';
import { flightPath, splitFlightPhases } from './CardFlightLayer';

/** Minimal GameState-shaped fixture with the zones animation cares about. */
function makeState(over: {
  seats?: ReadonlyArray<{
    seat: number;
    hand?: readonly string[];
    inventory?: readonly string[];
    discard?: readonly string[];
    playArea?: readonly string[];
    attached?: readonly string[];
    hp?: number;
    downed?: boolean;
    dead?: boolean;
  }>;
  marketPiles?: Readonly<Record<string, { readonly pileId: string; readonly cards: readonly string[] }>>;
  mansionDeck?: readonly string[];
  removed?: readonly string[];
  version?: number;
  log?: ReadonlyArray<{ seq: number; action: Record<string, unknown> }>;
  prompts?: ReadonlyArray<{ id: string; seat: number; text: string; options: readonly string[]; payload?: Readonly<Record<string, string>> }>;
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
      hp: s.hp ?? 100,
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
      downed: s.downed ?? false,
      dead: s.dead ?? false,
    })),
    marketPiles: over.marketPiles ?? {},
    mansionDeck: over.mansionDeck ?? [],
    removed: over.removed ?? [],
    cards: {},
    cardDefs: {},
    prompts: (over.prompts ?? []) as never,
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
  const exploreLog = [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[] } }];

  it('detects a defeated Infected: mansion -> attached', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#7'] }],
      log: exploreLog,
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'ma-001#7', outcomeZone: 'attached', explorerSeat: 0, damage: 0, weapons: [] });
  });

  it('detects an escaped Infected: mansion -> the bottom of the deck', () => {
    const prev = makeState({ mansionDeck: ['ma-002#7', 'x1', 'x2'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['x1', 'x2', 'ma-002#7'],
      seats: [{ seat: 0 }],
      log: exploreLog,
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'ma-002#7', outcomeZone: 'mansion', explorerSeat: 0, damage: 0, weapons: [] });
  });

  it('captures the weapon ids used for the explore', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#7'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: ['we-004#1', 'we-005#1'] as readonly string[] } }],
    });
    const reveal = detectReveal(prev, next, 0);
    expect(reveal?.weapons).toEqual(['we-004#1', 'we-005#1']);
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
      mansionDeck: ['ma-001#7'],
      seats: [{ seat: 0 }],
      log: [{ seq: 1, action: { type: 'buy' as const, seat: 0, pileId: 'we-001' as const } }],
    });
    expect(detectReveal(prev, next, 0)).toBeNull();
  });

  it('detects a re-inserted Infected: revealed from the deck and put back in it', () => {
    const prev = makeState({ mansionDeck: ['mx-001#1', 'a1', 'b1', 'c1', 'd1', 'e1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['a1', 'b1', 'c1', 'd1', 'mx-001#1', 'e1'],
      seats: [{ seat: 0 }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 1 } }],
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'mx-001#1', outcomeZone: 'mansion', explorerSeat: 0, damage: 0, weapons: [] });
  });

  it('detects a re-inserted Infected even when it lands back on top', () => {
    const prev = makeState({ mansionDeck: ['mx-001#1', 'a1', 'b1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['mx-001#1', 'a1', 'b1'],
      seats: [{ seat: 0 }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 1 } }],
    });
    expect(detectReveal(prev, next, 0)?.outcomeZone).toBe('mansion');
  });

  it('reports EVERY revealed card of a multi-explore, in reveal order', () => {
    const prev = makeState({ mansionDeck: ['mx-001#1', 'ma-001#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['mx-001#1'],
      seats: [{ seat: 0, attached: ['ma-001#1'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 2 } }],
    });
    // The top card (mx-001) is revealed first and re-inserted; the second
    // (ma-001) is defeated and attached. Both are reported, in that order.
    expect(detectReveals(prev, next, 0).map(r => [r.instanceId, r.outcomeZone])).toEqual([
      ['mx-001#1', 'mansion'],
      ['ma-001#1', 'attached'],
    ]);
    // The single-card view stays the first revealed card.
    expect(detectReveal(prev, next, 0)?.instanceId).toBe('mx-001#1');
  });

  it('reports EVERY card of a Crow chain from the engine reveal list, in order', () => {
    // The chained card was returned to the deck, so the deck diff alone
    // cannot tell it apart from an unrevealed card. The engine records the
    // exact revealed set on the logged action; the client must step through
    // all of them (the Crow first, then the card it revealed).
    const prev = makeState({ mansionDeck: ['ci-002#1', 'ma-006#1', 'ma-007#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['ma-007#1', 'ci-002#1', 'ma-006#1'],
      seats: [{ seat: 0 }],
      log: [{
        seq: 1,
        action: {
          type: 'explore' as const,
          seat: 0,
          weapons: [] as readonly string[],
          exploreCount: 1,
          revealedInstanceIds: ['ci-002#1', 'ma-006#1'],
        },
      }],
    });
    expect(detectReveals(prev, next, 0).map(r => [r.instanceId, r.outcomeZone])).toEqual([
      ['ci-002#1', 'mansion'],
      ['ma-006#1', 'mansion'],
    ]);
  });

  it('pairs a defeated chained card with the re-inserted Crow', () => {
    const prev = makeState({ mansionDeck: ['ci-002#1', 'ma-006#1', 'ma-007#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['ma-007#1', 'ci-002#1'],
      seats: [{ seat: 0, attached: ['ma-006#1'] }],
      log: [{
        seq: 1,
        action: {
          type: 'explore' as const,
          seat: 0,
          weapons: [] as readonly string[],
          exploreCount: 1,
          revealedInstanceIds: ['ci-002#1', 'ma-006#1'],
        },
      }],
    });
    expect(detectReveals(prev, next, 0).map(r => [r.instanceId, r.outcomeZone])).toEqual([
      ['ci-002#1', 'mansion'],
      ['ma-006#1', 'attached'],
    ]);
  });

  it('reports several defeated Infected from one multi-explore, top card first', () => {
    const prev = makeState({ mansionDeck: ['ma-001#1', 'ma-002#1', 'ma-003#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['ma-003#1'],
      seats: [{ seat: 0, attached: ['ma-001#1', 'ma-002#1'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 2 } }],
    });
    expect(detectReveals(prev, next, 0).map(r => r.instanceId)).toEqual(['ma-001#1', 'ma-002#1']);
    expect(detectReveals(prev, next, 0).every(r => r.outcomeZone === 'attached')).toBe(true);
  });

  it('detects a NON-Infected reveal parked in limbo behind its prompt', () => {
    // The engine removes a revealed non-Infected card from the deck and parks
    // it in NO zone while its Take / Send-to-bottom prompt is open.
    const prev = makeState({ mansionDeck: ['it-002#1', 'ma-001#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['ma-001#1'],
      seats: [{ seat: 0 }],
      prompts: [
        { id: 'p1', seat: 0, text: 'Take it or send it to the bottom?', options: ['Take', 'Send to bottom of Mansion'], payload: { kind: 'takeOrBottom', instanceId: 'it-002#1' } },
      ],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 1 } }],
    });
    expect(detectReveals(prev, next, 0)).toEqual([
      { instanceId: 'it-002#1', outcomeZone: 'pending', explorerSeat: 0, damage: 0, weapons: [] },
    ]);
  });

  it('reports a non-Infected reveal after the Infected it was revealed with', () => {
    const prev = makeState({ mansionDeck: ['ma-001#1', 'it-002#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0, attached: ['ma-001#1'] }],
      prompts: [
        { id: 'p1', seat: 0, text: 'Take it or send it to the bottom?', options: ['Take', 'Send to bottom of Mansion'], payload: { kind: 'takeOrBottom', instanceId: 'it-002#1' } },
      ],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 2 } }],
    });
    expect(detectReveals(prev, next, 0).map(r => [r.instanceId, r.outcomeZone])).toEqual([
      ['ma-001#1', 'attached'],
      ['it-002#1', 'pending'],
    ]);
  });

  it('does not report a card that merely shifted up when the revealed card left', () => {
    const prev = makeState({ mansionDeck: ['ma-001#1', 'ma-002#1'], seats: [{ seat: 0 }] });
    const next = makeState({
      version: 2,
      mansionDeck: ['ma-002#1', 'ma-001#1'],
      seats: [{ seat: 0 }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 0, weapons: [] as readonly string[], exploreCount: 1 } }],
    });
    expect(detectReveal(prev, next, 0)).toEqual({ instanceId: 'ma-001#1', outcomeZone: 'mansion', explorerSeat: 0, damage: 0, weapons: [] });
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

  it('detects a forced explore (Sherry) for the exploring seat', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }, { seat: 1 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0 }, { seat: 1, attached: ['ma-001#7'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 1, weapons: [] as readonly string[], exploreCount: 1, forcedBy: 0 } }],
    });
    expect(detectReveal(prev, next, 1)).toEqual({
      instanceId: 'ma-001#7', outcomeZone: 'attached', explorerSeat: 1, damage: 0, weapons: [],
    });
  });

  it('detects a forced explore (Sherry) for the seat that forced it', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }, { seat: 1 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0 }, { seat: 1, attached: ['ma-001#7'] }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 1, weapons: [] as readonly string[], exploreCount: 1, forcedBy: 0 } }],
    });
    expect(detectReveal(prev, next, 0)?.instanceId).toBe('ma-001#7');
  });

  it('does not report a forced explore to an unrelated seat', () => {
    const prev = makeState({ mansionDeck: ['ma-001#7'], seats: [{ seat: 0 }, { seat: 1 }, { seat: 2 }] });
    const next = makeState({
      version: 2,
      mansionDeck: [],
      seats: [{ seat: 0 }, { seat: 1, attached: ['ma-001#7'] }, { seat: 2 }],
      log: [{ seq: 1, action: { type: 'explore' as const, seat: 1, weapons: [] as readonly string[], exploreCount: 1, forcedBy: 0 } }],
    });
    expect(detectReveal(prev, next, 2)).toBeNull();
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

describe('splitFlightPhases', () => {
  const reshuffleMove = { instanceId: 'd1', fromZone: 'discard' as const, toZone: 'deck' as const, faceDown: true };
  const drawMove = { instanceId: 'c1', fromZone: 'deck' as const, toZone: 'hand' as const, faceDown: true };

  it('puts the reshuffle (discard->deck) in phase 1 and draws in phase 2', () => {
    const { reshuffle, rest } = splitFlightPhases([drawMove, reshuffleMove, drawMove]);
    expect(reshuffle).toEqual([reshuffleMove]);
    expect(rest).toEqual([drawMove, drawMove]);
  });

  it('returns everything as rest when there is no reshuffle', () => {
    const { reshuffle, rest } = splitFlightPhases([drawMove]);
    expect(reshuffle).toHaveLength(0);
    expect(rest).toEqual([drawMove]);
  });
});

describe('detectPlayerDowned', () => {
  it('detects downed when own HP drops to zero this step', () => {
    const prev = makeState({ seats: [{ seat: 0, hp: 40 }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, hp: 0, downed: true }] });
    expect(detectPlayerDowned(prev, next, 0)).toBe('downed');
  });

  it('detects permanent death when the dead flag flips', () => {
    const prev = makeState({ seats: [{ seat: 0, hp: 0, downed: true }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, hp: 0, dead: true }] });
    expect(detectPlayerDowned(prev, next, 0)).toBe('dead');
  });

  it('ignores other players losing HP', () => {
    const prev = makeState({ seats: [{ seat: 0 }, { seat: 1, hp: 40 }] });
    const next = makeState({ version: 2, seats: [{ seat: 0 }, { seat: 1, hp: 0, downed: true }] });
    expect(detectPlayerDowned(prev, next, 0)).toBeNull();
  });

  it('does not retrigger while already downed', () => {
    const prev = makeState({ seats: [{ seat: 0, hp: 0, downed: true }] });
    const next = makeState({ version: 2, seats: [{ seat: 0, hp: 0, downed: true }] });
    expect(detectPlayerDowned(prev, next, 0)).toBeNull();
  });
});