import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { setup } from './game';
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