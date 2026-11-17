import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/** Fan character b4mc-ch-015 Leon Kennedy (JP print). */

let counter = 0;

function game(leonSeat = 1): GameState {
  const s = setup(
    { seed: 11, locationsMode: true, players: [
      { name: 'P0', controller: 'human', characterCardId: 'ch-002' },
      { name: 'Leon', controller: 'human', characterCardId: 'b4mc-ch-015' },
    ] },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return {
    ...started,
    seats: started.seats.map((p, i) => (i === leonSeat
      ? { ...p, level: 1, decorations: 3 }
      : { ...p, hand: [...p.hand, `ac-001#leon${++counter}`] })),
    cards: (() => {
      const c = { ...started.cards };
      c[`ac-001#leon${counter}`] = {
        instanceId: `ac-001#leon${counter}`,
        cardId: 'ac-001',
        location: { zone: 'hand', index: 0, seat: 0 },
      };
      return c;
    })(),
  } as GameState;
}

/** A pending `trashHandCard` prompt over `victim`, exactly as AC-019 raises it. */
function seedTrashPrompt(state: GameState, victim: string): GameState {
  return {
    ...state,
    prompts: [...state.prompts, {
      id: 'trashprobe',
      seat: 0,
      text: 'Trash a card from your hand?',
      options: [victim],
      payload: { kind: 'trashHandCard' },
    }],
  };
}

function leon(state: GameState, seat = 1): PlayerState {
  const p = state.seats[seat] as PlayerState;
  if (p === undefined) throw new Error('no leon seat');
  return p;
}

describe('b4mc-ch-015 Leon Kennedy — data', () => {
  it('is defined with the printed stats and resolves its art', () => {
    const def = CUSTOM_CARDS.find(c => c.id === 'b4mc-ch-015');
    expect(def).toEqual(expect.objectContaining({
      id: 'b4mc-ch-015', name: 'Leon Kennedy', type: 'character', maxHp: 90,
      level1At: 1, level2At: 5,
    }));
    expect(existsSync('src/data/CARD-ART/B4MC-CH-015.png')).toBe(true);
  });
});

describe('Leon — take a card another player trashed', () => {
  it('offers the trashed card and puts it in his Hand', () => {
    let s = game();
    const victim = (s.seats[0] as PlayerState).hand[0]!;
    // Seat 0 answers a trash prompt (the same path AC-019 raises).
    let out = applyAction(seedTrashPrompt(s, victim), {
      type: 'chooseOption', seat: 0, promptId: 'trashprobe', option: 0,
    });
    const prompt = out.prompts.find(p => p.payload?.kind === 'leonTrashClaim');
    expect(prompt).toBeDefined();
    expect(prompt!.seat).toBe(1);
    const claimed = applyAction(out, { type: 'chooseOption', seat: 1, promptId: prompt!.id, option: 0 });
    expect(leon(claimed).hand).toContain(victim);
    expect(claimed.removed).not.toContain(victim);
    expect(leon(claimed).leonTrashClaimUsedThisRound).toBe(true);
  });

  it('only fires once per round', () => {
    let s = game();
    const p0 = s.seats[0] as PlayerState;
    const first = p0.hand[0]!;
    const second = p0.hand[1]!;
    s = applyAction(seedTrashPrompt(s, first), {
      type: 'chooseOption', seat: 0, promptId: 'trashprobe', option: 0,
    });
    const prompt = s.prompts.find(p => p.payload?.kind === 'leonTrashClaim')!;
    s = applyAction(s, { type: 'chooseOption', seat: 1, promptId: prompt.id, option: 0 });
    expect(leon(s).leonTrashClaimUsedThisRound).toBe(true);
    // A second trash this round raises nothing.
    const after = applyAction(seedTrashPrompt(s, second), {
      type: 'chooseOption', seat: 0, promptId: 'trashprobe', option: 0,
    });
    expect(after.prompts.some(p => p.payload?.kind === 'leonTrashClaim')).toBe(false);
    void first;
  });

  it('declining still consumes the offer, and it refreshes next round', () => {
    let s = game();
    s = applyAction(seedTrashPrompt(s, (s.seats[0] as PlayerState).hand[0]!), {
      type: 'chooseOption', seat: 0, promptId: 'trashprobe', option: 0,
    });
    const prompt = s.prompts.find(p => p.payload?.kind === 'leonTrashClaim')!;
    s = applyAction(s, { type: 'chooseOption', seat: 1, promptId: prompt.id, option: prompt.options.length - 1 });
    expect(leon(s).leonTrashClaimUsedThisRound).toBe(true);
    // Next round: the flag clears at the turn boundary.
    const next = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));
    expect((next.seats[1] as PlayerState).leonTrashClaimUsedThisRound).toBeUndefined();
  });
});
