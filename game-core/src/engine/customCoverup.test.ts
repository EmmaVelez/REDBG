import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario, pilesForScenario } from '../data/cards';

/**
 * CV-001 Cover-up — "+1 Action, +1 Card. You may Trash this card from your
 * hand at the beginning of any Player's turn. In that case, look at the top
 * Card of the Mansion. You may move it to the bottom of the Mansion."
 * Cost 60, 5 copies (own Resource Area pile).
 */

const COVER = CUSTOM_CARDS.find(c => c.id === 'cv-001');

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    pilesForScenario('firstTimer', { customCards: ['cv-001'] }),
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}
function findPromptForSeat(s: GameState, kind: string, seat: number) {
  return s.prompts.find(p => p.payload?.kind === kind && p.seat === seat);
}

describe('CV-001 Cover-up data', () => {
  it('matches the printed card (cost 60, +1 action +1 card, 5 copies)', () => {
    expect(COVER).toEqual(expect.objectContaining({
      id: 'cv-001', name: 'Cover-up', type: 'action', set: 'custom',
      copies: 5, cost: 60, bonuses: { actions: 1, cards: 1 },
    }));
    expect(COVER?.actionEffects).toEqual([{ kind: 'trashFromHandAtTurnStartPeekMansionTop' }]);
  });

  it('creates its own Resource Area pile of 5 when the room selects it', () => {
    const on = pilesForScenario('firstTimer', { customCards: ['cv-001'] });
    const pile = on.find(p => p.pileId === 'custom-cv-001');
    expect(pile).toBeDefined();
    expect(on.some(p => p.pileId === 'custom-cv-001' && p.cardIds.includes('cv-001'))).toBe(true);
    const s = setup(
      { seed: 11, players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'F', controller: 'human', characterCardId: 'ch-003' },
      ] },
      cardsForScenario('firstTimer', { customCards: ['cv-001'] }),
      on,
      STANDARD_MANSION_DECK,
    );
    expect(s.marketPiles['custom-cv-001']?.cards.length).toBe(5);
    // not present when the room did not tick it
    const off = pilesForScenario('firstTimer');
    expect(off.some(p => p.pileId === 'custom-cv-001')).toBe(false);
  });

  it('gives +1 action and +1 card when played as an action', () => {
    const { state, id } = addCard(game({ actionsLeft: 1 }), 0, 'cv-001');
    const handBefore = state.seats[0]?.hand.length ?? 0;
    const next = applyAction(state, { type: 'playActionCard', seat: 0, instanceId: id });
    // spent 1 action on the play, the card grants +1 -> net unchanged
    expect(next.seats[0]?.actionsLeft).toBe(1);
    // the played card leaves the hand, the +1 Card draw replaces it
    expect(next.seats[0]?.hand).not.toContain(id);
    expect(next.seats[0]?.hand.length).toBe(handBefore - 1 + 1);
    expect(next.seats[0]?.playArea).toContain(id);
  });
});

describe('CV-001 Cover-up turn-start trash', () => {
  it('offers the trash prompt at the start of the HOLDER\'s own turn', () => {
    const { state, id } = addCard(game(), 0, 'cv-001');
    const st = startTurn(state);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    expect(p).toBeDefined();
    expect(p?.options).toEqual(['Trash', 'Decline']);
  });

  it('offers the trash prompt at the start of ANOTHER player\'s turn (any player)', () => {
    const { state, id } = addCard(game(), 0, 'cv-001');
    // Foe's turn starts — seat 0 still holds Cover-up and may trash it then.
    const foeTurn = { ...state, activeSeat: 1, turnNumber: state.turnNumber + 1, log: [...state.log] };
    const st = startTurn(foeTurn);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    expect(p).toBeDefined();
    expect(p?.seat).toBe(0);
  });

  it('Decline keeps the card', () => {
    const { state, id } = addCard(game(), 0, 'cv-001');
    const st = startTurn(state);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    if (p === undefined) return;
    const next = applyAction(st, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('Decline') });
    expect(next.seats[0]?.hand).toContain(id);
    expect(next.removed).not.toContain(id);
  });

  it('Trash removes the card, then the peek prompt names the top Mansion card', () => {
    const base = game();
    const { state: s1, id } = addCard(base, 0, 'cv-001');
    const st = startTurn(s1);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    if (p === undefined) return;
    const afterTrash = applyAction(st, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('Trash') });
    expect(afterTrash.seats[0]?.hand).not.toContain(id);
    expect(afterTrash.removed).toContain(id);
    const peek = findPrompt(afterTrash, 'coverUpPeek');
    expect(peek).toBeDefined();
    expect(peek?.text).toContain('Move it to the bottom');
    expect(peek?.options).toEqual(['Move to bottom', 'Leave it']);
  });

  it('Move to bottom sends the peeked top card to the Mansion bottom', () => {
    const base = game();
    const { state: s1, id } = addCard(base, 0, 'cv-001');
    const topId = s1.mansionDeck[0] as string;
    const st = startTurn(s1);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    if (p === undefined) return;
    const afterTrash = applyAction(st, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('Trash') });
    const peek = findPrompt(afterTrash, 'coverUpPeek');
    if (peek === undefined) return;
    const next = applyAction(afterTrash, { type: 'chooseOption', seat: 0, promptId: peek.id, option: peek.options.indexOf('Move to bottom') });
    expect(next.mansionDeck[0]).toBe(s1.mansionDeck[1]);
    expect(next.mansionDeck[next.mansionDeck.length - 1]).toBe(topId);
  });

  it('Leave it keeps the peeked card on top', () => {
    const base = game();
    const { state: s1, id } = addCard(base, 0, 'cv-001');
    const topId = s1.mansionDeck[0] as string;
    const st = startTurn(s1);
    const p = findPromptForSeat(st, 'coverUpTrash', 0);
    if (p === undefined) return;
    const afterTrash = applyAction(st, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('Trash') });
    const peek = findPrompt(afterTrash, 'coverUpPeek');
    if (peek === undefined) return;
    const next = applyAction(afterTrash, { type: 'chooseOption', seat: 0, promptId: peek.id, option: peek.options.indexOf('Leave it') });
    expect(next.mansionDeck[0]).toBe(topId);
  });

  it('does not duplicate the prompt for the same copy on a second turn start', () => {
    const { state, id } = addCard(game(), 0, 'cv-001');
    const st = startTurn(state);
    const st2 = startTurn(st);
    const offers = st2.prompts.filter(p => p.payload?.kind === 'coverUpTrash' && p.payload?.instanceId === id);
    expect(offers.length).toBe(1);
  });
});