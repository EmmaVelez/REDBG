import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Custom characters read from Manny's scans (printed codes not legible ->
 * provisional ids fr-001 / lo-001; rename when the codes are known).
 *
 *   FR-001 Francis 70 HP, gates 3 / 8
 *     L1: If you have no cards in your hand, one weapon Francis uses gets an
 *         additional +10 damage. (Implemented as a flat explore bonus.)
 *     L2: At the beginning of your turn, you can draw 2 cards and discard 2
 *         cards. (RULING: the scan's draw count read as both 2 and 3; 2 used.)
 *   LO-001 Louis 70 HP, gates 3 / 8
 *     L1: When Louis explores you can move the bottom card of the mansion to
 *         the top. (Manual button, once per turn.)
 *     L2: All of your Rifle and machine gun weapons get an additional +10
 *         damage.
 */

function game(charId: string, over: Partial<PlayerState> = {}, seatCount = 2): GameState {
  const players = Array.from({ length: seatCount }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? charId : 'ch-003',
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

function hand(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cardId => `${cardId}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0 } };
  }
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

describe('fr-001 Francis', () => {
  it('L1: an empty remaining hand adds +10 to the explore (only then)', () => {
    // Only the weapon in hand -> after playing it the hand is empty -> +10.
    const s = hand(game('fr-001', { level: 1, turnAmmo: 50 }), ['we-004']);
    const knife = s.seats[0]!.hand[0]!;
    expect(exploreDamage(s, 0, [knife])).toBe(5 + 10); // Combat Knife 5 + empty-hand 10
    // With more cards still in hand the bonus is off.
    const s2 = hand(game('fr-001', { level: 1, turnAmmo: 50 }), ['we-004', 'ac-001']);
    expect(exploreDamage(s2, 0, [s2.seats[0]!.hand[0]!])).toBe(5);
  });

  it('L2: turn-start can draw 2 then discard 2 (with the pick chain)', () => {
    const s = startTurn(game('fr-001', { level: 2, decorations: 10 }));
    const p = s.prompts.find(pr => pr.payload?.kind === 'rebeccaTurnStartDrawAndDiscard');
    expect(p).toBeDefined();
    expect(p?.text).toContain('+2 cards');
    const drawn = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: 0 });
    expect(drawn.seats[0]!.hand.length).toBe(s.seats[0]!.hand.length + 2);
    // Pick 1, then prompt again, pick 1 -> 2 discarded, hand back to 5.
    let cur = drawn;
    const discardedIds: string[] = [];
    for (let pick = 0; pick < 2; pick++) {
      const dp = findPrompt(cur, 'rebeccaDiscard');
      expect(dp).toBeDefined();
      const choose = dp?.options[0] ?? '';
      if (choose === 'No Discard' || choose === '') break;
      discardedIds.push(choose);
      cur = applyAction(cur, { type: 'chooseOption', seat: 0, promptId: dp?.id ?? '', option: 0 });
    }
    expect(discardedIds).toHaveLength(2);
    expect(cur.seats[0]!.hand).toHaveLength(5);
    for (const id of discardedIds) expect(cur.seats[0]!.discard).toContain(id);
  });
});

describe('lo-001 Louis', () => {
  it('L1: the manual ability moves the mansion bottom card to the top, once per turn', () => {
    const s = startTurn(game('lo-001', { level: 1, decorations: 3 }));
    const deck = s.mansionDeck;
    const bottom = deck[deck.length - 1]!;
    expect(deck[0]).not.toBe(bottom);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(used.mansionDeck[0]).toBe(bottom);
    expect(used.mansionDeck.length).toBe(deck.length);
    expect(used.mansionDeck[used.mansionDeck.length - 1]).toBe(deck[deck.length - 2]);
    // Once per turn: the second use is rejected.
    expect(() => applyAction(used, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 })).toThrow(
      'already used this turn',
    );
  });

  it('L2: Rifle and Machine Gun weapons get +10 (preview matches the engine rule)', () => {
    // we-015 Bolt-Action Rifle: 20 + 10 (rifle tag; no other bonuses active).
    const s = hand(game('lo-001', { level: 2, decorations: 10, turnAmmo: 50 }), ['we-015']);
    const rifle = s.seats[0]!.hand[0]!;
    expect(exploreDamage(s, 0, [rifle])).toBe(30);
  });
});

describe('rebeccaDiscard regression (RC-001 Rebecca L1)', () => {
  it('the discard choice actually removes the chosen card (raw ids, was broken)', () => {
    const s = startTurn(game('rc-001', { level: 1, decorations: 2 }));
    void s;
    const p = s.prompts.find(pr => pr.payload?.kind === 'rebeccaTurnStartDrawAndDiscard');
    expect(p).toBeDefined();
    const drawn = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: 0 });
    const dp = findPrompt(drawn, 'rebeccaDiscard');
    expect(dp).toBeDefined();
    const target = dp?.options[0] ?? '';
    expect(target).not.toBe('No Discard');
    const before = drawn.seats[0]!.hand.length;
    const resolved = applyAction(drawn, { type: 'chooseOption', seat: 0, promptId: dp?.id ?? '', option: 0 });
    expect(resolved.seats[0]!.hand.length).toBe(before - 1);
    expect(resolved.seats[0]!.discard).toContain(target);
  });
});