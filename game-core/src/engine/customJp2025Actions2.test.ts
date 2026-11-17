import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/** Fan JP-2025 actions: CAC-001, CAC-004, CAC-008, CAC-009. */

const IDS = ['cac-001', 'cac-004', 'cac-008', 'cac-009'] as const;

let counter = 0;

function game(over: Partial<PlayerState> = {}, seats = 2): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? 'ch-002' : 'ch-001',
  }));
  const s = setup({ seed: 11, players }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' | 'discard' | 'attached' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#c2${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    if (zone === 'hand') return { ...p, hand: [...p.hand, id] };
    if (zone === 'discard') return { ...p, discard: [...p.discard, id] };
    if (zone === 'attached') return { ...p, attached: [...p.attached, id] };
    return { ...p, playArea: [...p.playArea, id] };
  });
  return { state: { ...s, cards, seats }, id };
}

function defOf(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

describe('JP-2025 actions batch 2 — data', () => {
  it('defines all four with the printed cost and bonuses', () => {
    expect(defOf('cac-001')).toEqual(expect.objectContaining({ id: 'cac-001', name: "Can't Let Go", cost: 20, bonuses: { actions: 1 } }));
    expect(defOf('cac-004')).toEqual(expect.objectContaining({ id: 'cac-004', name: 'Resupply', cost: 50, bonuses: { gold: 20, cards: 2, buys: 1 } }));
    expect(defOf('cac-008')).toEqual(expect.objectContaining({ id: 'cac-008', name: 'Gather Intel', cost: 60, bonuses: { ammo: 20, actions: 1 } }));
    expect(defOf('cac-009')).toEqual(expect.objectContaining({ id: 'cac-009', name: 'Welcome to the Club', cost: 60, bonuses: { ammo: 20, actions: 1 } }));
  });

  it('ships art for all four', () => {
    for (const id of IDS) {
      expect(existsSync(`src/data/CARD-ART/${id.toUpperCase()}.png`), id).toBe(true);
    }
  });
});

describe("CAC-001 Can't Let Go", () => {
  it('trashes up to 2 from hand or discard, then pays the empty-discard rider', () => {
    let s = game({ level: 1, actionsLeft: 2, turnGold: 100 });
    const played = place(s, 0, 'cac-001');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const prompt = s.prompts.find(p => p.payload?.kind === 'cantLetGoChoice');
    expect(prompt).toBeDefined();
    // Trash one card, then DONE (only one card in the pool).
    const pick = prompt!.options[0]!;
    const afterPick = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(afterPick.removed).toContain(pick);
  });

  it('trashes itself and draws when the discard ends up empty', () => {
    let s = game({ level: 1, actionsLeft: 2, turnGold: 100 });
    // Empty discard, one card in hand to trash.
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, discard: [], hand: p.hand.slice(0, 1) } : p)) };
    const keep = (s.seats[0] as PlayerState).hand[0]!;
    const played = place(s, 0, 'cac-001');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const prompt = s.prompts.find(p => p.payload?.kind === 'cantLetGoChoice')!;
    const after = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(after.removed).toContain(keep);
    // Discard is still empty -> this card trashes itself and +1 card is drawn.
    const seat = after.seats[0] as PlayerState;
    expect(seat.playArea).not.toContain(played.id);
    expect(seat.hand.length).toBe(1);
  });
});

describe('CAC-004 Resupply', () => {
  it('routes the next gained Item to Hand', () => {
    let s = game({ level: 1, actionsLeft: 2, turnGold: 100, buysLeft: 2 });
    const played = place(s, 0, 'cac-004');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    expect((s.seats[0] as PlayerState).nextItemToHand).toBe(true);
    // Its own bonuses: +20 Gold, +2 Cards, +1 Buy.
    expect((s.seats[0] as PlayerState).turnGold).toBe(120);
    expect((s.seats[0] as PlayerState).buysLeft).toBe(3);

    // Gain an ITEM from the market.
    const itemPile = Object.entries(s.marketPiles).find(([, p]) => {
      const top = p.cards[0];
      const d = top === undefined ? undefined : s.cardDefs[s.cards[top]?.cardId ?? ''];
      return d?.type === 'item';
    });
    expect(itemPile).toBeDefined();
    const before = (s.seats[0] as PlayerState).discard.length;
    const after = applyAction(s, { type: 'buy', seat: 0, pileId: itemPile![0] });
    const seat = after.seats[0] as PlayerState;
    expect(seat.nextItemToHand).toBe(false);
    expect(seat.discard.length).toBe(before);
    expect(seat.hand.length).toBeGreaterThan((s.seats[0] as PlayerState).hand.length);
  });
});

describe('CAC-008 Gather Intel / CAC-009 Welcome to the Club', () => {
  it('CAC-008 adds +5 per 3 attached Infected', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const gun = place(s, 0, 'we-001');
    s = gun.state;
    const played = place(s, 0, 'cac-008');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const weapon = gun.id;
    expect(s.cards[weapon]?.cardId).toBe('we-001');
    const base = exploreDamage(s, 0, [weapon!]);
    // Attach 3 Infected -> +5.
    for (let i = 0; i < 3; i += 1) {
      const inf = place(s, 0, 'ma-010', 'attached');
      s = inf.state;
    }
    expect(exploreDamage(s, 0, [weapon])).toBe(base + 5);
    // ...and a 4th adds nothing (per 3).
    const fourth = place(s, 0, 'ma-010', 'attached');
    expect(exploreDamage(fourth.state, 0, [weapon])).toBe(base + 5);
  });

  it('CAC-009 is +5, or +10 against an 80+ Health Infected', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const gun = place(s, 0, 'we-001');
    s = gun.state;
    const played = place(s, 0, 'cac-009');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const weapon = gun.id;

    // Measure the card's OWN contribution: same state with the card in hand
    // (no bonus) vs in the Play Area (bonus).
    const inHand = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0
        ? { ...p, playArea: p.playArea.filter(id => id !== played.id), hand: [...p.hand, played.id] }
        : p)),
    } as GameState;
    const base = exploreDamage(inHand, 0, [weapon]);
    const withCard = exploreDamage(s, 0, [weapon]);

    const withTop = (cardId: string, n: number): GameState => {
      const id = `${cardId}#top${n}`;
      return {
        ...s,
        mansionDeck: [id],
        cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } } as GameState['cards'],
      };
    };

    // A low-HP Infected on the Mansion top -> +5.
    expect(withCard).toBe(base + 5);
    expect(exploreDamage(withTop('ma-001', ++counter), 0, [weapon])).toBe(base + 5);

    // An 80+ HP Infected -> +10 instead.
    const highHp = CUSTOM_CARDS.concat(PREMIER_CARDS).find(c => c.type === 'infected' && (c.hp ?? 0) >= 80);
    expect(highHp).toBeDefined();
    expect(exploreDamage(withTop(highHp!.id, ++counter), 0, [weapon])).toBe(base + 10);
  });
});
