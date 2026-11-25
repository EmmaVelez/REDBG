import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { setup, startTurn, checkWin } from './game';
import { applyAction } from './actions';
import {
  cardsForScenario,
  pilesForScenario,
  FIRST_TIMER_PILES,
  PREMIER_CARDS,
  STANDARD_MANSION_DECK,
  INFECTION_CARD_IDS,
  INFECTION_ACTION_PILES,
} from '../data/cards';
import { OUTBREAK_MANSION } from '../data/cards';
import { OUTBREAK_CARDS } from '../data/outbreak';

/**
 * INFECTION opt-in game mode (Manny ruling 2026-11-23): the Outbreak mansion
 * cards, three action piles and the face-down Infection Deck join ANY
 * scenario, while the scenario keeps its own win condition.
 */

const PLAYERS = [
  { name: 'A', controller: 'human' as const, characterCardId: 'ch-001' },
  { name: 'B', controller: 'human' as const, characterCardId: 'ch-002' },
];

function MansionInfGame(): GameState {
  return setup(
    { seed: 11, players: PLAYERS, infectionMode: true },
    cardsForScenario('firstTimer', { infectionMode: true }),
    pilesForScenario('firstTimer', { infectionMode: true }),
    STANDARD_MANSION_DECK,
  );
}

function zoneIds(s: GameState, zone: string, pileId?: string): readonly string[] {
  if (zone === 'mansionDeck') return s.mansionDeck;
  if (zone === 'infectionDeck') return s.infectionDeck ?? [];
  const pile = s.marketPiles[pileId ?? ''];
  return pile?.cards ?? [];
}

function cardIdOf(s: GameState, instanceId: string): string | undefined {
  return s.cards[instanceId]?.cardId;
}

describe('INFECTION game mode', () => {
  it('adds exactly the listed card defs to the pool, and nothing when off', () => {
    const on = cardsForScenario('firstTimer', { infectionMode: true });
    for (const id of INFECTION_CARD_IDS) {
      expect(on.some(c => c.id === id), id).toBe(true);
    }
    // Every added def really is an Outbreak card.
    const added = on.filter(c => INFECTION_CARD_IDS.includes(c.id));
    expect(added.every(c => c.set === 'outbreak')).toBe(true);

    const off = cardsForScenario('firstTimer');
    expect(off.some(c => INFECTION_CARD_IDS.includes(c.id))).toBe(false);
  });

  it('adds the three action cards as individual Resource Area piles', () => {
    const piles = pilesForScenario('firstTimer', { infectionMode: true });
    for (const spec of INFECTION_ACTION_PILES) {
      const pile = piles.find(p => p.pileId === spec.pileId);
      expect(pile, spec.pileId).toBeDefined();
      expect(pile!.cardIds).toEqual(spec.cardIds);
    }
    // 5 copies each, matching the printed `copies`.
    const s = MansionInfGame();
    for (const spec of INFECTION_ACTION_PILES) {
      expect(zoneIds(s, 'marketPile', spec.pileId)).toHaveLength(5);
    }
  });

  it('shuffles every listed mansion card into the Mansion at the listed count', () => {
    const s = MansionInfGame();
    for (const mc of OUTBREAK_MANSION) {
      const n = s.mansionDeck.filter(id => cardIdOf(s, id) === mc.cardId).length;
      expect(n, mc.cardId).toBe(mc.count);
    }
    // The defs must exist or the engine could not resolve them.
    for (const mc of OUTBREAK_MANSION) {
      expect(s.cardDefs[mc.cardId], mc.cardId).toBeDefined();
    }
  });

  it('builds the Infection Deck from the six listed infection cards', () => {
    const s = MansionInfGame();
    expect(s.infectionDeck).toBeDefined();
    const counts = new Map<string, number>();
    for (const id of s.infectionDeck ?? []) {
      const cid = cardIdOf(s, id);
      if (cid === undefined) continue;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }
    // Manny's list (IN-001..IN-006): in-007 stays out of the mode.
    const expected = new Map<string, number>();
    for (const c of OUTBREAK_CARDS) {
      if (c.id.startsWith('in-') && INFECTION_CARD_IDS.includes(c.id)) {
        expected.set(c.id, c.copies);
      }
    }
    expect(Object.fromEntries([...counts.entries()].sort())).toEqual(
      Object.fromEntries([...expected.entries()].sort()),
    );
    // Every infection card is registered in the deck zone.
    for (const id of s.infectionDeck ?? []) {
      expect(s.cards[id]?.location.zone).toBe('infectionDeck');
    }
  });

  it('turns on infection levels but keeps the scenario win condition', () => {
    const s = MansionInfGame();
    expect(s.seats[0]?.infectionCards).toEqual([]);
    expect(s.seats[0]?.isInfectedCharacter).toBe(false);
    expect(s.seats[0]?.exploredOrAttackedThisTurn).toBe(false);
    // NOT the Outbreak boss win: MA-041 is just another infected here.
    expect(s.endInfectedCardId).toBeUndefined();
  });

  it('leaves the OFF path byte-identical (no infection deck, no MA-04x)', () => {
    const s = setup(
      { seed: 11, players: PLAYERS },
      cardsForScenario('firstTimer'),
      pilesForScenario('firstTimer'),
      STANDARD_MANSION_DECK,
    );
    expect(s.infectionDeck).toBeUndefined();
    expect(s.seats[0]?.infectionCards).toBeUndefined();
    expect(s.mansionDeck.some(id => (cardIdOf(s, id) ?? '').startsWith('ma-04'))).toBe(false);
    expect(Object.keys(s.marketPiles).some(k => k.startsWith('action-infection') || k === 'action-tvirus' || k === 'action-by-any-means')).toBe(false);
  });

  it('is idempotent on the Outbreak scenario (no doubled supply)', () => {
    const s = setup(
      { seed: 11, players: PLAYERS, scenario: 'outbreak', infectionMode: true },
      cardsForScenario('outbreak', { infectionMode: true }),
      pilesForScenario('outbreak', { infectionMode: true }),
      OUTBREAK_MANSION,
    );
    for (const mc of OUTBREAK_MANSION) {
      const n = s.mansionDeck.filter(id => cardIdOf(s, id) === mc.cardId).length;
      expect(n, mc.cardId).toBe(mc.count);
    }
    // ac-023 / ac-026 were already piled by OUTBREAK_PILES; only ac-027 is new.
    const piles = pilesForScenario('outbreak', { infectionMode: true });
    expect(piles.filter(p => p.cardIds.includes('ac-023'))).toHaveLength(1);
    expect(piles.filter(p => p.cardIds.includes('ac-026'))).toHaveLength(1);
    expect(piles.filter(p => p.cardIds.includes('ac-027'))).toHaveLength(1);
  });

  it('does not duplicate the mansion cards on a kitchen-sink scenario either', () => {
    // No explicit mansion list: the fallback pass already sweeps every
    // mansion-eligible card from the pool, so the INFECTION block must skip.
    const s = setup(
      { seed: 11, players: PLAYERS, infectionMode: true },
      cardsForScenario('firstTimer', { infectionMode: true }),
      pilesForScenario('firstTimer', { infectionMode: true }),
    );
    for (const mc of OUTBREAK_MANSION) {
      const n = s.mansionDeck.filter(id => cardIdOf(s, id) === mc.cardId).length;
      expect(n, mc.cardId).toBe(mc.count);
    }
    // No instance may appear twice — that is what a failed guard would produce.
    expect(new Set(s.mansionDeck).size).toBe(s.mansionDeck.length);
  });
});

describe('INFECTION reanimation ("Becoming the Infected")', () => {
  /** A seat that died physically while holding MAX infection counters. */
  function deadWithCounters(count: number): GameState {
    const s = MansionInfGame();
    const cards = { ...s.cards };
    const infectionCards: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `in-001#dead${i}`;
      cards[id] = { instanceId: id, cardId: 'in-001', location: { zone: 'hand' as const, index: 0 } };
      infectionCards.push(id);
    }
    return {
      ...s,
      cards,
      seats: s.seats.map((st, i) =>
        i === 0
          ? { ...st, dead: true, hp: 0, hand: [], discard: [], pendingReanimate: undefined, infectionCards }
          : st),
    };
  }

  it('marks a physically dead seat with 10 counters to reanimate', () => {
    const s = { ...deadWithCounters(10), activeSeat: 1 };
    const after = applyAction(s, { type: 'endTurn', seat: 1 });
    expect(after.seats[0]!.pendingReanimate).toBe(true);
    // and the seat is still dead until its zombie turn converts it
    expect(after.seats[0]!.dead).toBe(true);
  });

  it('does NOT reanimate a seat with fewer than 10 counters', () => {
    const s = { ...deadWithCounters(9), activeSeat: 1 };
    const after = applyAction(s, { type: 'endTurn', seat: 1 });
    expect(after.seats[0]!.pendingReanimate).toBeUndefined();
    expect(after.seats[0]!.dead).toBe(true);
  });

  it('converts the pending seat into a random Infected Character on its turn', () => {
    const s = { ...deadWithCounters(10), activeSeat: 1 };
    const after = applyAction(s, { type: 'endTurn', seat: 1 });
    const zombieTurn = startTurn({ ...after, activeSeat: 0 });
    const zombie = zombieTurn.seats[0]!;
    expect(zombie.dead).toBe(false);
    expect(zombie.isInfectedCharacter).toBe(true);
    expect(zombie.pendingReanimate).toBeUndefined();
    const zid = zombieTurn.cards[zombie.characterInstanceId]?.cardId;
    expect(['ch-031', 'ch-032', 'ch-033']).toContain(zid);
    // the Outbreak zombie def is registered even though the base-scenario pool
    // never contained ch-031..033 — full zombie stats, not a 100-HP stub
    const zDef = zombieTurn.cardDefs[zid ?? ''];
    expect(zDef?.type).toBe('character');
    expect(zDef?.maxHp).toBeGreaterThan(100);
    // zombies get no actions or buys — only their explore/attack
    expect(zombie.actionsLeft).toBe(0);
    expect(zombie.exploresLeft).toBe(1);
  });

  it('conversion conserves infection counters gained while dead-pending', () => {
    // The seat died of the Infection (10 counters folded into its pile via
    // reanimateAsInfected) but effects can STILL grant it fresh Infection
    // counters while it waits for its zombie turn (gainInfections does not
    // check dead/pending). The conversion must carry those too — it previously
    // folded only inventory/hand/playArea/discard, dropping the strays into
    // registered-but-zone-less orphans (outbreak soak conservation failure).
    const s = deadWithCounters(10);
    const cards = { ...s.cards };
    cards['in-001#stray1'] = { instanceId: 'in-001#stray1', cardId: 'in-001', location: { zone: 'hand' as const, index: 0 } };
    cards['in-001#stray2'] = { instanceId: 'in-001#stray2', cardId: 'in-001', location: { zone: 'hand' as const, index: 0 } };
    const pending = {
      ...s,
      cards,
      seats: s.seats.map((st, i) =>
        i === 0
          ? { ...st, pendingReanimate: true as const, infectionCards: [...(st.infectionCards ?? []), 'in-001#stray1', 'in-001#stray2'] }
          : st),
    };
    const zombieTurn = startTurn(pending);
    const zombie = zombieTurn.seats[0]!;
    expect(zombie.isInfectedCharacter).toBe(true);
    const owned = new Set([...zombie.hand, ...zombie.inventory, ...zombie.discard, ...zombie.playArea, ...zombie.attached, ...(zombie.infectionCards ?? [])]);
    expect(owned.has('in-001#stray1')).toBe(true);
    expect(owned.has('in-001#stray2')).toBe(true);
    // and all ten original counters that were folded into the pile are present too
    for (let i = 0; i < 10; i++) {
      expect(owned.has(`in-001#dead${i}`)).toBe(true);
    }
  });

  it('the turn cycle reaches a pendingReanimate seat (its zombie turn comes up)', () => {
    // Simulate the state right after the level-10 mark: seat 0 dead + pending,
    // seat 1 alive and active.
    const pending = { ...deadWithCounters(10), activeSeat: 1 };
    const p0 = pending.seats[0]!;
    const withPending = {
      ...pending,
      seats: pending.seats.map((st, i) => (i === 0 ? { ...st, pendingReanimate: true } : st)),
    };
    void p0;
    const afterEnd = applyAction(withPending, { type: 'endTurn', seat: 1 });
    expect(afterEnd.activeSeat).toBe(0);
    const zombieTurn = startTurn(afterEnd);
    expect(zombieTurn.seats[0]!.isInfectedCharacter).toBe(true);
    expect(zombieTurn.seats[0]!.dead).toBe(false);
  });

  it('a pending reanimation keeps the game alive; plain all-dead ends it', () => {
    let s = deadWithCounters(10);
    s = {
      ...s,
      seats: s.seats.map((st, i) => (i === 0 ? { ...st, pendingReanimate: true } : st)),
    };
    // only the pending seat remains (seat 1 dead too) — still not game over
    const allDeadPending = {
      ...s,
      seats: s.seats.map(st => ({ ...st, dead: true, hp: 0 })),
    };
    expect(checkWin(allDeadPending).gameOver).toBe(false);
    const allDeadPlain = {
      ...allDeadPending,
      seats: allDeadPending.seats.map(st => ({ ...st, pendingReanimate: undefined })),
    };
    expect(checkWin(allDeadPlain).gameOver).toBe(true);
    expect(checkWin(allDeadPlain).endReason).toBe('allPlayersDead');
  });
});
