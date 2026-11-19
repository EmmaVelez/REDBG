import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { resolveAllyExplore } from './allyExplore';
import { cardsForScenario, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * CE-009 Ecliptic Express (mansion attachment, mode 1):
 * "When a player defeats an infected, they can trash a card in their discard
 * pile." The optional trash window (eclipticTrash prompt, discard options +
 * Decline) must be offered on EVERY defeat path: single explore, multi
 * explore, and a deferred explore resolved through the reactive-window
 * handlers / the next-explore entry guard.
 *
 * Regression: the window used to exist ONLY in the multi-explore branch, so
 * the common single-explore defeat never prompted (Manny, 2026-11-19).
 *
 * Fixtures: ch-002 Leon (80 HP) / ch-003 Claire, ma-001 Majini 20 HP / 10
 * attack, we-009 Handgun 10 damage / 10 ammo.
 */

function game(): GameState {
  const s = setup(
    {
      seed: 1,
      players: [
        { name: 'A', controller: 'human', characterCardId: 'ch-002' },
        { name: 'B', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    cardsForScenario('firstTimer', { customCards: ['ce-009', 'ac-018'] }),
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  // Attach Ecliptic Express to the Mansion (its mode-1 "in play" state).
  return {
    ...s,
    cards: {
      ...s.cards,
      ['ce-009#e1']: { instanceId: 'ce-009#e1', cardId: 'ce-009', location: { zone: 'supply', index: 0 } },
    },
    mansionAttachments: ['ce-009#e1'],
  };
}

let counter = 0;
function stackTop(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cid => `${cid}#t${++counter}`);
  const cards = { ...s.cards };
  ids.forEach((id, i) => {
    cards[id] = { instanceId: id, cardId: cardIds[i]!, location: { zone: 'mansionDeck' as const, index: i } };
  });
  return { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] };
}

function hand(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cid => `${cid}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0, seat: 0 } };
  }
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) };
}

function withDiscard(s: GameState): GameState {
  const ids = ['am-001#d1', 'ac-001#d2'];
  const cards = { ...s.cards };
  ids.forEach((id, i) => {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'discard' as const, index: i, seat: 0 } };
  });
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, discard: ids } : p)) };
}

const ecliptic = (s: GameState) => s.prompts.filter(p => p.payload?.kind === 'eclipticTrash');

function armed(s: GameState, weapons: number, ammo = 100): GameState {
  const ids = Array.from({ length: weapons }, () => 'we-009');
  const h = hand(stackTop(s, ['ma-001']), ids);
  return { ...h, seats: h.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: ammo } : p)) };
}

describe('Ecliptic Express (ce-009) — single explore', () => {
  it('offers the optional discard-trash window when the explore defeats', () => {
    const s = withDiscard(armed(game(), 2));
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(true);
    const prompts = ecliptic(out);
    expect(prompts.length).toBe(1);
    expect(prompts[0]?.seat).toBe(0);
    expect(prompts[0]?.options).toEqual([...out.seats[0]!.discard, 'Decline']);
    expect(prompts[0]?.text).toMatch(/Ecliptic Express/);
  });

  it('choosing a card trashes it from the discard pile', () => {
    const s = withDiscard(armed(game(), 2));
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    const p = ecliptic(out)[0]!;
    const chosen = p.options[0]!;
    const after = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(after.seats[0]?.discard).not.toContain(chosen);
    expect(after.removed).toContain(chosen);
    expect(ecliptic(after)).toEqual([]);
  });

  it('Decline keeps the discard pile intact', () => {
    const s = withDiscard(armed(game(), 2));
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    const p = ecliptic(out)[0]!;
    const after = applyAction(out, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.length - 1 });
    expect(after.seats[0]?.discard).toEqual(out.seats[0]?.discard);
    expect(after.removed).toEqual(out.removed);
  });

  it('no prompt when the discard pile is empty', () => {
    const s = armed(game(), 2);
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    expect(ecliptic(out)).toEqual([]);
  });

  it('no prompt when Ecliptic Express is not attached', () => {
    const base = withDiscard(armed(game(), 2));
    const s = { ...base, mansionAttachments: [] };
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    expect(ecliptic(out)).toEqual([]);
  });

  it('no prompt when the explore does not defeat', () => {
    const s = withDiscard(hand(stackTop(game(), ['ma-001']), ['we-009']));
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(false);
    expect(ecliptic(out)).toEqual([]);
  });
});

describe('Ecliptic Express (ce-009) — multi explore', () => {
  it('offers the window when a multi-explore defeats', () => {
    const base = withDiscard(game());
    const h = hand(stackTop(base, ['ma-001', 'ma-001']), ['we-009', 'we-009', 'we-009', 'we-009']);
    const s = { ...h, seats: h.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 100, exploresLeft: 2 } : p)) };
    const ws = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [...ws], exploreCount: 2 });
    expect(out.seats[0]?.attached.filter(id => out.cards[id]?.cardId === 'ma-001').length).toBe(2);
    expect(ecliptic(out).length).toBe(1);
  });
});

describe('Ecliptic Express (ce-009) — deferred explores', () => {
  it('the next-explore entry guard offers the window for a resolved defeated pending', () => {
    const base = withDiscard(game());
    const pendingId = 'ma-001#p';
    const stacked = stackTop(base, ['ma-001']);
    const s: GameState = {
      ...stacked,
      cards: {
        ...stacked.cards,
        [pendingId]: { instanceId: pendingId, cardId: 'ma-001', location: { zone: 'supply', index: 0 } },
      },
      pendingExplore: {
        seat: 0,
        revealedInstanceId: pendingId,
        outcome: 'defeated',
        decorations: 1,
        decorationDelta: 1,
        damageTaken: 0,
        newPlayer: base.seats[0] as PlayerState,
        mansionDeck: base.mansionDeck,
        rngState: base.rngState,
      },
      prompts: [{ id: 'p1', seat: 1, text: 'Trash Uroboros Injection?', options: ['Decline'], payload: { kind: 'uroborosInjection' } }],
    };
    // New explore (unarmed, not defeated) must first resolve the pending one.
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(out.pendingExplore).toBeUndefined();
    expect(out.removed).toContain(pendingId);
    expect(ecliptic(out).length).toBe(1);
  });

  it('declining the AC-018 window still offers the trash window on a defeated explore', () => {
    const base = withDiscard(game());
    const h = hand(stackTop(base, ['ma-001']), ['we-009', 'we-009']);
    // AC-018 sits in the OTHER player's hand: the Uroboros window is offered
    // to non-exploring seats holding it, and the explore is deferred meanwhile.
    const s: GameState = {
      ...h,
      cards: { ...h.cards, ['ac-018#a1']: { instanceId: 'ac-018#a1', cardId: 'ac-018', location: { zone: 'hand', index: 0, seat: 1 } } },
      seats: h.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 50 } : { ...p, hand: ['ac-018#a1'] })),
    };
    const [w1, w2] = s.seats[0]!.hand;
    const out = applyAction(s, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    // The explore is deferred while the Uroboros window is open.
    expect(out.pendingExplore).toBeDefined();
    const uro = out.prompts.find(p => p.payload?.kind === 'uroborosInjection');
    expect(uro).toBeDefined();
    expect(uro?.seat).toBe(1);
    expect(ecliptic(out)).toEqual([]);
    // Decline: base outcome (defeated) stands -> the Ecliptic window opens.
    const after = applyAction(out, { type: 'chooseOption', seat: 1, promptId: uro!.id, option: uro!.options.length - 1 });
    expect(after.pendingExplore).toBeUndefined();
    expect(after.seats[0]?.attached.some(id => after.cards[id]?.cardId === 'ma-001')).toBe(true);
    expect(ecliptic(after).length).toBe(1);
    expect(ecliptic(after)[0]?.seat).toBe(0);
    expect(after.removed).not.toContain('ac-018#a1'); // declined, not trashed
  });
});

describe('Ecliptic Express (ce-009) — Sherry forced explore', () => {
  // RULING (Manny, 2026-11-19): the EXPLORING player gets the window, even
  // though the defeated Infected is awarded to Sherry.
  function forcedSetup(defeated: boolean): GameState {
    const base = game();
    const h = defeated ? hand(stackTop(base, ['ma-001']), ['we-009', 'we-009']) : hand(stackTop(base, ['ma-001']), []);
    const ids = ['am-001#d1', 'ac-001#d2'];
    const cards = { ...h.cards };
    ids.forEach((id, i) => {
      cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'discard' as const, index: i, seat: 1 } };
    });
    return {
      ...h,
      cards,
      seats: h.seats.map((p, i) => ({ ...p, turnAmmo: 50, ...(i === 1 ? { discard: ids } : {}) })),
    };
  }

  it('prompts the exploring player with their final discard when the forced explore defeats', () => {
    const out = resolveAllyExplore(forcedSetup(true), 0, 1);
    // The Infected is awarded to Sherry (seat 0)...
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(true);
    // ...but the trash window goes to the exploring player (seat 1).
    const prompts = ecliptic(out);
    expect(prompts.length).toBe(1);
    expect(prompts[0]?.seat).toBe(1);
    expect(prompts[0]?.options).toEqual([...out.seats[1]!.discard, 'Decline']);
    // Choosing trashes from the TARGET's discard.
    const p = prompts[0]!;
    const chosen = p.options[0]!;
    const after = applyAction(out, { type: 'chooseOption', seat: 1, promptId: p.id, option: 0 });
    expect(after.seats[1]?.discard).not.toContain(chosen);
    expect(after.removed).toContain(chosen);
  });

  it('no prompt when the forced explore does not defeat', () => {
    const out = resolveAllyExplore(forcedSetup(false), 0, 1);
    expect(out.seats[0]?.attached.some(id => out.cards[id]?.cardId === 'ma-001')).toBe(false);
    expect(ecliptic(out)).toEqual([]);
  });
});
