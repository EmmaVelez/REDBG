import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { cardsForScenario, ALLIANCE_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * CH-015 Hunk L1 (Alliance): "When Hunk would take any damage, you can give
 * that damage to your Partner instead."
 *
 * Printed "you can", so it is a CHOICE: the damage lands first and the offer is
 * raised from the post-action damage-diff hook (`applyDamageTakenHooks`), which
 * covers every damage source with one code path. Accepting restores Hunk's
 * Health and takes it from the Partner instead; a hit that empties the Partner
 * kills it (permanent removal, like a leading Partner).
 */

let counter = 0;

function game(
  over: Partial<PlayerState> = {},
  mainId = 'ch-015',
  partnerId: string | undefined = 'ch-001',
): GameState {
  const s = setup(
    {
      seed: 11,
      partnerMode: true,
      players: [
        {
          name: 'A',
          controller: 'human' as const,
          characterCardId: mainId,
          ...(partnerId !== undefined ? { partnerCharacterId: partnerId } : {}),
        },
        { name: 'B', controller: 'human' as const, characterCardId: 'ch-002' },
      ],
    },
    cardsForScenario('alliance'),
    ALLIANCE_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#hr${++counter}`;
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat } } },
      seats: s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
    },
    id,
  };
}

/** AC-040 deals a deterministic 10 damage to the playing character. */
function hurtWithVengeful(s: GameState, hp: number): GameState {
  let t: GameState = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp } : p)) };
  const ac = place(t, 0, 'ac-040');
  t = ac.state;
  return applyAction(t, { type: 'playActionCard', seat: 0, instanceId: ac.id });
}

const redirectPrompt = (s: GameState) => s.prompts.find(p => p.payload?.kind === 'hunkRedirect');

describe('CH-015 Hunk L1 — redirect offer', () => {
  it('offers the redirect when Hunk (Main) takes damage', () => {
    const s = hurtWithVengeful(game({ level: 1, hp: 60, actionsLeft: 3 }), 60);
    expect(s.seats[0]?.hp).toBe(50); // the damage lands first
    const pr = redirectPrompt(s);
    expect(pr).toBeDefined();
    expect(pr?.options).toEqual(['Give the damage to your Partner', 'Decline']);
  });

  it('accepting moves the lost Health off Hunk and onto the Partner', () => {
    const s = hurtWithVengeful(game({ level: 1, hp: 60, actionsLeft: 3 }), 60);
    const partnerBefore = s.seats[0]?.partnerHp;
    const pr = redirectPrompt(s)!;
    const out = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(60);
    expect(out.seats[0]?.partnerHp).toBe((partnerBefore ?? 0) - 10);
    expect(redirectPrompt(out)).toBeUndefined();
  });

  it('declining leaves the damage on Hunk', () => {
    const s = hurtWithVengeful(game({ level: 1, hp: 60, actionsLeft: 3 }), 60);
    const partnerBefore = s.seats[0]?.partnerHp;
    const pr = redirectPrompt(s)!;
    const out = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 1 });
    expect(out.seats[0]?.hp).toBe(50);
    expect(out.seats[0]?.partnerHp).toBe(partnerBefore);
  });

  it('is not offered without a Partner', () => {
    let s = game({ level: 1, hp: 60, actionsLeft: 3 }, 'ch-015', undefined);
    s = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0
        ? { ...p, partnerInstanceId: undefined, partnerAttached: undefined, partnerHp: undefined, partnerMaxHp: undefined }
        : p)),
    };
    const out = hurtWithVengeful(s, 60);
    expect(out.seats[0]?.hp).toBe(50);
    expect(redirectPrompt(out)).toBeUndefined();
  });

  it('does not fire for a Hunk who is the PARTNER (only the Main redirects)', () => {
    const s = hurtWithVengeful(game({ level: 1, hp: 60, actionsLeft: 3 }, 'ch-019', 'ch-015'), 60);
    expect(s.seats[0]?.hp).toBe(50);
    expect(redirectPrompt(s)).toBeUndefined();
  });

  it('kills the Partner when the redirected damage empties it', () => {
    let s = game({ level: 1, hp: 60, actionsLeft: 3 });
    const skillId = s.seats[0]?.partnerSkillId;
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, partnerHp: 5 } : p)) };
    const hurt = hurtWithVengeful(s, 60);
    const pr = redirectPrompt(hurt)!;
    const out = applyAction(hurt, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(60);
    expect(out.seats[0]?.partnerInstanceId).toBeUndefined();
    expect(out.seats[0]?.partnerHp).toBeUndefined();
    if (skillId !== undefined) expect(out.removed).toContain(skillId);
  });
});
