import { describe, it, expect } from 'vitest';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { buyCostAfterReduction } from './abilities';
import type { CardDef, CardInstance, GameState, Prompt } from '../types';

type Seat = GameState['seats'][number];

let counter = 0;

function base(): GameState {
  counter += 1;
  return startTurn(
    setup({
      seed: 100 + counter,
      players: [
        { name: 'P0', controller: 'human', characterCardId: 'ch-001' },
        { name: 'P1', controller: 'human', characterCardId: 'ch-004' },
      ],
    }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK),
  );
}

/** Swap seat 0's Character for one of the fan cards. */
function withCharacter(state: GameState, charId: string): GameState {
  const def = CUSTOM_CARDS.find(c => c.id === charId);
  if (def === undefined) throw new Error('missing ' + charId);
  const instId = state.seats[0]!.characterInstanceId;
  const inst: CardInstance = { instanceId: instId, cardId: def.id, location: { zone: 'hand', index: 0, seat: 0 } };
  return {
    ...state,
    cardDefs: { ...state.cardDefs, [def.id]: def },
    cards: { ...state.cards, [instId]: inst },
    seats: state.seats.map((p, i) =>
      i === 0 ? { ...p, characterMaxHp: def.maxHp ?? 100, hp: def.maxHp ?? 100, level: 2 } : p),
  } as GameState;
}

/** Seat 0's main-phase turn with the given hand. */
function turn(hand: string[], opts: Partial<Seat> = {}, charId = 'b4mc-ch-016'): GameState {
  const s0 = withCharacter(base(), charId);
  const ids = hand.map(c => `${c}#h${counter}`);
  const extra: Record<string, CardInstance> = {};
  for (const id of ids) {
    const cardId = id.split('#')[0]!;
    if (s0.cards[id] === undefined) {
      extra[id] = { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat: 0 } };
    }
  }
  const started = startTurn({
    ...s0,
    phase: 'main',
    activeSeat: 0,
    cards: { ...s0.cards, ...extra },
    seats: s0.seats.map((p, i) => (i === 0
      ? { ...p, hand: ids, inventory: ['ma-001#inv'], discard: [], actionsLeft: 1, buysLeft: 1, turnGold: 100, turnAmmo: 0, ...opts }
      : p)),
  } as GameState);
  // Turn-start prompts (e.g. CH-018's low-Health draw) are real; clear the
  // incidental ones so each test starts from a quiet board.
  return drain(started, ['helenaLowHpDrawChoice']);
}

/** Put an Infected on the Mansion top. */
function withTop(s: GameState, cardId: string): GameState {
  const def = CUSTOM_CARDS.concat(PREMIER_CARDS).find(c => c.id === cardId);
  const id = `${cardId}#t${counter}`;
  const inst: CardInstance = { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } };
  return {
    ...s,
    cardDefs: { ...s.cardDefs, [cardId]: def as CardDef },
    cards: { ...s.cards, [id]: inst },
    mansionDeck: [id],
  } as GameState;
}

function kinds(s: GameState): string[] {
  return s.prompts.map(p => String(p.payload?.kind ?? ''));
}

function find(s: GameState, kind: string): Prompt {
  const p = s.prompts.find(x => x.payload?.kind === kind);
  if (p === undefined) throw new Error('no prompt ' + kind + ' in ' + kinds(s).join(','));
  return p;
}

/** Answer a SPECIFIC prompt by kind. */
function answer(s: GameState, kind: string, option: number | string): GameState {
  const p = find(s, kind);
  const idx = typeof option === 'string' ? p.options.indexOf(option) : option;
  return applyAction(s, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: idx });
}

/** Drain every prompt except the ones named in `keep`. */
function drain(s: GameState, keep: string[]): GameState {
  let out = s;
  let guard = 0;
  while (out.prompts.length > 0 && guard++ < 20) {
    const p = out.prompts[0];
    if (p === undefined) break;
    if (keep.includes(String(p.payload?.kind ?? ''))) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

describe('fan characters: Helena Harper x3', () => {
  describe('CH-016', () => {
    it('L1: attaches a hand card face down, returning the previous one to hand', () => {
      let s = turn(['ac-001', 'ac-002']);
      const first = s.seats[0]!.hand[0]!;
      const second = s.seats[0]!.hand[1]!;

      let after = applyAction(s, { type: 'attachCardFaceDown', seat: 0, instanceId: first });
      expect(after.seats[0]!.attached).toEqual([first]);
      expect(after.seats[0]!.hand).toEqual([second]);
      expect(after.cards[first]?.location.zone).toBe('attached');

      after = applyAction(after, { type: 'attachCardFaceDown', seat: 0, instanceId: second });
      expect(after.seats[0]!.attached).toEqual([second]);
      expect(after.seats[0]!.hand).toContain(first);
      expect(after.cards[first]?.location.zone).toBe('hand');
    });

    it('L1: the action validates only for a hand card on your own turn', () => {
      const s = turn(['ac-001']);
      const id = s.seats[0]!.hand[0]!;
      expect(validateAction(s, { type: 'attachCardFaceDown', seat: 0, instanceId: id }).ok).toBe(true);
      expect(validateAction(s, { type: 'attachCardFaceDown', seat: 1, instanceId: id }).ok).toBe(false);
    });

    it('L2: defeating an Infected offers a Player choice, and the chosen Player draws', () => {
      let s = turn(['we-008'], { turnGold: 100, turnAmmo: 100 });
      s = withTop(s, 'ma-010');
      const before = s.seats[1]!.hand.length;
      let after = drain(applyAction(s, { type: 'explore', seat: 0, weapons: [s.seats[0]!.hand[0]!], exploreCount: 1 }), ['helenaDefeatChoice']);
      expect(kinds(after)).toContain('helenaDefeatChoice');
      after = answer(after, 'helenaDefeatChoice', 0);
      expect(after.seats[1]!.hand.length).toBe(before + 1);
    });
  });

  describe('CH-017', () => {
    it('L1: Shotgun weapons cost 10 less to buy; other weapons do not', () => {
      const shotgun = PREMIER_CARDS.find(c => c.type === 'weapon' && (c.weaponTags ?? []).includes('shotgun'));
      const other = PREMIER_CARDS.find(c => c.type === 'weapon' && !(c.weaponTags ?? []).includes('shotgun'));
      expect(shotgun).toBeDefined();
      expect(other).toBeDefined();
      const abilities = [{ kind: 'weaponBuyCostReduction' as const, tag: 'shotgun' as const, amount: 10, level: 1 as const }];
      expect(buyCostAfterReduction(abilities, shotgun)).toBe((shotgun!.cost ?? 0) - 10);
      expect(buyCostAfterReduction(abilities, other)).toBe(other!.cost ?? 0);
    });

    it('L2: the reveal prompt offers the hand; discarding grants +10, declining does not', () => {
      let s = turn(['ac-001'], {}, 'b4mc-ch-017');
      s = withTop(s, 'ma-010');
      const offered = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
      expect(kinds(offered)).toContain('helenaRevealChoice');

      const declined = answer(offered, 'helenaRevealChoice', 'Decline');
      expect(declined.seats[0]!.helenaRevealBonus ?? 0).toBe(0);

      const cardId = s.seats[0]!.hand[0]!;
      const paid = answer(offered, 'helenaRevealChoice', cardId);
      expect(paid.seats[0]!.hand).not.toContain(cardId);
      expect(paid.seats[0]!.discard).toContain(cardId);
      expect(paid.seats[0]!.helenaRevealBonus).toBe(10);
    });

    it('L2: the offer appears only once per round', () => {
      let s = turn(['ac-001'], {}, 'b4mc-ch-017');
      s = withTop(s, 'ma-010');
      const offered = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
      const paid = answer(offered, 'helenaRevealChoice', s.seats[0]!.hand[0]!);
      const again = applyAction(paid, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
      expect(kinds(again)).not.toContain('helenaRevealChoice');
    });
  });

  describe('CH-018', () => {
    it('offers +1 card once per turn when Health is at most 40', () => {
      const s = turn([], { hp: 40 }, 'b4mc-ch-018');
      expect(kinds(s)).toContain('helenaLowHpDrawChoice');
      const before = s.seats[0]!.hand.length;
      const after = answer(s, 'helenaLowHpDrawChoice', 0);
      expect(after.seats[0]!.hand.length).toBe(before + 1);
    });

    it('does not offer above 40 Health, nor twice in one turn', () => {
      const high = turn([], { hp: 41 }, 'b4mc-ch-018');
      expect(kinds(high)).not.toContain('helenaLowHpDrawChoice');

      const low = turn([], { hp: 40 }, 'b4mc-ch-018');
      const after = answer(low, 'helenaLowHpDrawChoice', 0);
      expect(kinds(after)).not.toContain('helenaLowHpDrawChoice');
    });
  });

  it('all three Helena cards are in the card set exactly once', () => {
    for (const id of ['b4mc-ch-016', 'b4mc-ch-017', 'b4mc-ch-018']) {
      const matches = CUSTOM_CARDS.filter(c => c.id === id);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe('Helena Harper');
      expect(matches[0]!.type).toBe('character');
      expect(matches[0]!.maxHp).toBe(80);
    }
  });
});
