import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { resolveAllyExplore } from './allyExplore';
import { cardsForScenario, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { CUSTOM_CARDS } from '../data/custom';

/**
 * "The House with a Clock in Its Walls" game mode (Manny, 2026-11-19):
 * X = ceil(Mansion deck size / 15) RANDOM Locations are shuffled into the
 * Mansion deck (never two adjacent at setup). An Explore that draws one puts
 * it into play IMMEDIATELY — standard reveal, On Reveal fires for everyone —
 * and reveals the next card instead. Locations never consume Explore slots
 * (single OR multi). RULING: unlike Usher mode, On Reveal effects DO fire.
 *
 * Fixtures pin ch-002 Leon (80 HP) / ch-003 Claire (70 HP), both level 0 at
 * 0 Decorations, so no character ability interferes. ma-001 Majini: 20 HP /
 * 10 attack. we-009 Handgun: 10 damage / 20 Ammo.
 */

const LOC_IDS = CUSTOM_CARDS.filter(c => c.type === 'location').map(c => c.id);

function clockGame(seed: number, over: Partial<PlayerState> = {}, extraCustom: readonly string[] = []): GameState {
  const s = setup(
    {
      seed,
      players: [
        { name: 'A', controller: 'human', characterCardId: 'ch-002' },
        { name: 'B', controller: 'human', characterCardId: 'ch-003' },
      ],
      clockMode: true,
    },
    cardsForScenario('firstTimer', { clockMode: true, customCards: extraCustom.length > 0 ? extraCustom : undefined }),
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
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

function locsInDeck(s: GameState): string[] {
  return s.mansionDeck.filter(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'location');
}

function revealedOf(s: GameState): readonly string[] {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const a = s.log[i]!.action;
    if (a.type === 'explore') return a.revealedInstanceIds ?? [];
  }
  return [];
}

const hpDown = (s: GameState, amount: number): GameState =>
  ({ ...s, seats: s.seats.map(p => ({ ...p, hp: p.maxHp - amount })) });

describe('Clock in Its Walls — setup', () => {
  it('cardsForScenario pulls EVERY Location def in only when clockMode is on', () => {
    const withMode = cardsForScenario('firstTimer', { clockMode: true });
    for (const id of LOC_IDS) expect(withMode.some(c => c.id === id)).toBe(true);
    const without = cardsForScenario('firstTimer');
    for (const id of LOC_IDS) expect(without.some(c => c.id === id)).toBe(false);
  });

  it('adds X = ceil(mansion size / 15) distinct Locations, never adjacent', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = clockGame(seed);
      const locs = locsInDeck(s);
      const base = s.mansionDeck.length - locs.length;
      expect(locs.length).toBe(Math.ceil(base / 15));
      expect(new Set(locs.map(id => s.cards[id]?.cardId)).size).toBe(locs.length);
      const isLoc = new Set(locs);
      s.mansionDeck.forEach((id, i) => {
        if (i > 0) expect(isLoc.has(id) && isLoc.has(s.mansionDeck[i - 1]!)).toBe(false);
      });
      expect(s.locations ?? []).toEqual([]);
      expect(s.locationDeck).toBeUndefined();
    }
  });

  it('is deterministic per seed', () => {
    expect(JSON.stringify(clockGame(1).mansionDeck)).toBe(JSON.stringify(clockGame(1).mansionDeck));
    expect(JSON.stringify(clockGame(1).mansionDeck)).not.toBe(JSON.stringify(clockGame(2).mansionDeck));
  });

  it('composes with Usher mode (3 on the board + X in the deck)', () => {
    const s = setup(
      {
        seed: 1,
        players: [
          { name: 'A', controller: 'human', characterCardId: 'ch-002' },
          { name: 'B', controller: 'human', characterCardId: 'ch-003' },
        ],
        usherMode: true,
        clockMode: true,
      },
      cardsForScenario('firstTimer', { usherMode: true, clockMode: true }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(s.locations?.length).toBe(3);
    const locs = locsInDeck(s);
    expect(locs.length).toBe(Math.ceil((s.mansionDeck.length - locs.length) / 15));
  });
});

describe('Clock in Its Walls — explore replacement', () => {
  it('single Explore: the Location enters play, On Reveal fires, the battle still happens', () => {
    const base = hpDown(clockGame(1, { turnAmmo: 50 }), 20);
    const s = hand(stackTop(base, ['loc-001', 'ma-001']), ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    // Library entered play, revealed by the explorer.
    const loc = (out.locations ?? []).find(l => out.cards[l.instanceId]?.cardId === 'loc-001');
    expect(loc?.revealedBy).toBe(0);
    // On Reveal +10 Health landed on the FINAL seats (both were 20 below max).
    expect(out.seats[0]?.hp).toBe(70); // 80 - 20 + 10
    expect(out.seats[1]?.hp).toBe(60); // 70 - 20 + 10
    // The 20-HP Majini was defeated by the two Handguns (10 + 10).
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(true);
    // ONE Explore consumed; TWO cards left the deck (Location + Majini).
    expect(out.seats[0]?.exploresLeft).toBe(s.seats[0]!.exploresLeft - 1);
    expect(out.mansionDeck.length).toBe(s.mansionDeck.length - 2);
    expect(revealedOf(out).some(id => out.cards[id]?.cardId === 'loc-001')).toBe(false);
  });

  it('multi Explore: a Location in the reveal set is replaced by another card', () => {
    const base = hpDown(clockGame(1, { turnAmmo: 50, exploresLeft: 2 }), 20);
    const s = hand(stackTop(base, ['loc-008', 'ma-001', 'ma-001']), ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 2 });
    // Both revealed cards are Majini — the Lesson Space was replaced.
    const revealed = revealedOf(out);
    expect(revealed.length).toBe(2);
    for (const id of revealed) expect(out.cards[id]?.cardId).toBe('ma-001');
    expect((out.locations ?? []).some(l => out.cards[l.instanceId]?.cardId === 'loc-008')).toBe(true);
    // 20 damage < 40 combined HP: both Majini survive and deal 10 + 10;
    // Lesson Space's On Reveal then costs every player 5 Health.
    expect(out.seats[0]?.hp).toBe(35); // 80 - 20 - 20 - 5
    expect(out.seats[1]?.hp).toBe(45); // 70 - 20 - 5
    // Only the Location left the deck (undefeated Infected go to the bottom).
    expect(out.mansionDeck.length).toBe(s.mansionDeck.length - 1);
    expect(out.seats[0]?.exploresLeft).toBe(0);
  });

  it('a Crow chain skips Locations too (chained draw is replaced)', () => {
    const base = clockGame(1, { turnAmmo: 50 }, ['ci-002']);
    const s = hand(stackTop(base, ['ci-002', 'loc-001', 'ma-001']), ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    const revealed = revealedOf(out);
    expect(revealed.length).toBe(2);
    expect(out.cards[revealed[0]!]?.cardId).toBe('ci-002');
    expect(out.cards[revealed[1]!]?.cardId).toBe('ma-001');
    expect((out.locations ?? []).some(l => out.cards[l.instanceId]?.cardId === 'loc-001')).toBe(true);
  });

  it('Mirror Corridor reduces the Health of the Infected revealed AFTER it (combat timing)', () => {
    const base = clockGame(1, { turnAmmo: 50 });
    const s = hand(stackTop(base, ['loc-013', 'ma-001']), ['we-009']);
    const [w1] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!], exploreCount: 1 });
    // Majini 20 - 10 (Mirror Corridor) = 10 HP; one Handgun (10) defeats it.
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(true);
    expect(out.infectedHpReductionThisTurn).toEqual({ amount: 10, min: 5 });
  });

  it('Attic Landing bonuses the Infected revealed after it', () => {
    const base = clockGame(1, { turnAmmo: 50 });
    const s = hand(stackTop(base, ['loc-020', 'ma-001']), ['we-009']);
    const [w1] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!], exploreCount: 1 });
    // Majini 20 + 10 = 30 HP survives one Handgun and deals its 10 attack.
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(false);
    expect(out.seats[0]?.hp).toBe(70);
    expect(out.infectedHpBonusThisTurn).toBe(10);
  });

  it('On Reveal choices are offered (Large Gallery draws for the other player)', () => {
    const base = clockGame(1, { turnAmmo: 50 });
    const s = hand(stackTop(base, ['loc-006', 'ma-001']), ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    const p = out.prompts.find(x => x.payload?.kind === 'locDrawChoice');
    expect(p?.seat).toBe(1);
  });

  it('Bedroom blocks the NEXT Explore, not the one that revealed it', () => {
    const base = clockGame(1, { turnAmmo: 50 });
    const s = hand(stackTop(base, ['loc-023', 'ma-001']), ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    expect(out.mansionRevealBlockedSeat).toBe(0);
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(true);
    const again = validateAction({ ...out, seats: out.seats.map((p, i) => (i === 0 ? { ...p, exploresLeft: 1 } : p)) },
      { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toMatch(/Bedroom/);
  });

  it('a Mansion consisting only of Locations is consumed without a battle', () => {
    const base = clockGame(1, { turnAmmo: 50 });
    const s = hand({ ...base, mansionDeck: [] }, ['we-009']);
    const top = stackTop(s, ['loc-001']);
    const [w1] = top.seats[0]!.hand;
    const out = applyAction(top, { type: 'explore', seat: 0, weapons: [w1!], exploreCount: 1 });
    expect(out.mansionDeck.length).toBe(0);
    expect((out.locations ?? []).some(l => out.cards[l.instanceId]?.cardId === 'loc-001')).toBe(true);
    expect(out.seats[0]?.exploresLeft).toBe(top.seats[0]!.exploresLeft - 1);
  });

  it('Sherry\'s forced explore also replaces Locations (revealed by the target)', () => {
    const base = hpDown(clockGame(1), 20);
    const s = stackTop(base, ['loc-001', 'ma-001']);
    const out = resolveAllyExplore(s, 0, 1);
    const loc = (out.locations ?? []).find(l => out.cards[l.instanceId]?.cardId === 'loc-001');
    expect(loc?.revealedBy).toBe(1);
    // Unarmed target: Majini deals 10, split 5/5; Library heals both +10.
    expect(out.seats[0]?.hp).toBe(65); // 80 - 20 - 5 + 10
    expect(out.seats[1]?.hp).toBe(55); // 70 - 20 - 5 + 10
    expect(out.mansionDeck.length).toBe(s.mansionDeck.length - 1);
  });
});
