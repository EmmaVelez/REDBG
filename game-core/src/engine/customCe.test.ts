import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { cardsForScenario, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { CUSTOM_CARDS, CE_CARD_IDS } from '../data/custom';

/**
 * CE mode (Manny, 2026-11-19): a lobby checkbox under Skill System. When on,
 * X = floor(Mansion deck size / 10) RANDOM cards from CE-001 .. CE-012 are
 * shuffled into the Mansion deck, and the deck is shuffled until no two of
 * them are in sequential order (adjacent slots) — the same spread rule the
 * Clock mode applies to Locations.
 *
 * X is measured BEFORE the CE cards are added, and the twelve defs are pulled
 * into the card pool by `cardsForScenario`. While the mode is on it owns the
 * CE cards, so the picker-driven custom-mansion pass skips them (otherwise all
 * twelve would land in the deck).
 */

function ceGame(seed: number, over: Partial<PlayerState> = {}, extraCustom: readonly string[] = []): GameState {
  const s = setup(
    {
      seed,
      players: [
        { name: 'A', controller: 'human', characterCardId: 'ch-002' },
        { name: 'B', controller: 'human', characterCardId: 'ch-003' },
      ],
      ceMode: true,
    },
    cardsForScenario('firstTimer', { ceMode: true, customCards: extraCustom.length > 0 ? extraCustom : undefined }),
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function ceInDeck(s: GameState): string[] {
  return s.mansionDeck.filter(id => CE_CARD_IDS.includes(s.cards[id]?.cardId ?? ''));
}

let counter = 0;
/** Put fresh instances of the given cards on TOP of the Mansion, in order. */
function stackTop(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cid => `${cid}#t${++counter}`);
  const cards = { ...s.cards };
  ids.forEach((id, i) => {
    cards[id] = { instanceId: id, cardId: cardIds[i]!, location: { zone: 'mansionDeck' as const, index: i } };
  });
  return { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] };
}

/** Replace seat 0's hand with fresh instances of the given card ids. */
function hand(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cid => `${cid}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0, seat: 0 } };
  }
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) };
}

describe('CE mode — setup', () => {
  it('cardsForScenario pulls all twelve CE defs in only when ceMode is on', () => {
    const withMode = cardsForScenario('firstTimer', { ceMode: true });
    for (const id of CE_CARD_IDS) expect(withMode.some(c => c.id === id)).toBe(true);
    const without = cardsForScenario('firstTimer');
    for (const id of CE_CARD_IDS) expect(without.some(c => c.id === id)).toBe(false);
  });

  it('adds X = floor(mansion size / 10) distinct CE cards, never adjacent', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = ceGame(seed);
      const ce = ceInDeck(s);
      const base = s.mansionDeck.length - ce.length;
      expect(ce.length).toBe(Math.floor(base / 10));
      expect(new Set(ce.map(id => s.cards[id]?.cardId)).size).toBe(ce.length);
      const isCe = new Set(ce);
      s.mansionDeck.forEach((id, i) => {
        if (i > 0) expect(isCe.has(id) && isCe.has(s.mansionDeck[i - 1]!)).toBe(false);
      });
    }
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(ceGame(1).mansionDeck)).toBe(JSON.stringify(ceGame(1).mansionDeck));
    expect(JSON.stringify(ceGame(1).mansionDeck)).not.toBe(JSON.stringify(ceGame(2).mansionDeck));
  });

  it('adds nothing when the mode is off (picker selection still works)', () => {
    const off = setup(
      {
        seed: 1,
        players: [
          { name: 'A', controller: 'human', characterCardId: 'ch-002' },
          { name: 'B', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer'),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(ceInDeck(off)).toEqual([]);

    const picked = setup(
      {
        seed: 1,
        players: [
          { name: 'A', controller: 'human', characterCardId: 'ch-002' },
          { name: 'B', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer', { customCards: ['ce-001', 'ce-002'] }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(new Set(ceInDeck(picked).map(id => picked.cards[id]?.cardId))).toEqual(new Set(['ce-001', 'ce-002']));
  });

  it('owns the CE cards while on: a picker selection does not add a second copy', () => {
    const s = ceGame(1, {}, ['ce-001']);
    const ce = ceInDeck(s);
    const base = s.mansionDeck.length - ce.length;
    expect(ce.length).toBe(Math.floor(base / 10));
  });

  it('composes with the Clock mode (both spread rules hold)', () => {
    const s = setup(
      {
        seed: 1,
        players: [
          { name: 'A', controller: 'human', characterCardId: 'ch-002' },
          { name: 'B', controller: 'human', characterCardId: 'ch-003' },
        ],
        clockMode: true,
        ceMode: true,
      },
      cardsForScenario('firstTimer', { clockMode: true, ceMode: true }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    const ce = ceInDeck(s);
    const locs = s.mansionDeck.filter(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'location');
    const base = s.mansionDeck.length - ce.length - locs.length;
    expect(ce.length).toBe(Math.floor(base / 10));
    expect(locs.length).toBe(Math.ceil(base / 15));
    const ceSet = new Set(ce);
    const locSet = new Set(locs);
    s.mansionDeck.forEach((id, i) => {
      if (i === 0) return;
      const prev = s.mansionDeck[i - 1]!;
      expect(ceSet.has(id) && ceSet.has(prev)).toBe(false);
      expect(locSet.has(id) && locSet.has(prev)).toBe(false);
    });
  });

  it('the CE cards are real mansion attachment events', () => {
    const s = ceGame(1);
    for (const id of ceInDeck(s)) {
      const def = s.cardDefs[s.cards[id]?.cardId ?? ''];
      expect(def?.type).toBe('event');
      expect(def?.set).toBe('custom');
    }
    // ce-012 has no attachmentMode, so it is not an attachment event; the rest are.
    expect(CUSTOM_CARDS.find(c => c.id === 'ce-012')?.attachmentMode).toBeUndefined();
  });
});

describe('CE mode — reveal', () => {
  it('a revealed CE event attaches to the Mansion like any other event card', () => {
    const s = hand(stackTop(ceGame(1, { turnAmmo: 50 }), ['ce-003']), ['we-009']);
    const [w1] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!], exploreCount: 1 });
    expect((out.mansionAttachments ?? []).some(id => out.cards[id]?.cardId === 'ce-003')).toBe(true);
    // The CE card left the deck; the next card is now on top.
    expect(out.mansionDeck.length).toBe(s.mansionDeck.length - 1);
  });
});
