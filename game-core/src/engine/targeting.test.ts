import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction, recordTargeted } from './actions';
import { sanitize } from './view';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { MERCENARIES_PILES, MERCENARIES_MANSION } from '../data/cards';

/**
 * Off-turn targeting notices (`PlayerState.targetedBy`).
 *
 * The board needs a way for the viewing player to KNOW they were targeted by
 * a card or ability while it was NOT their turn (Manny, 2026-11-15 — the
 * driver was FCH-008 Sherry's forced explore). Every off-turn targeting site
 * records { seat, reason } on the TARGET's seat via `recordTargeted`; the
 * client floats a banner from that list, and `startTurn` clears it when the
 * seat's own turn begins. Covered sites: Sherry's forced explore
 * ('forcedExplore'), Wesker L2 / Cephalo ('mustExploreNextTurn'),
 * James Marcus ('mustUseAllExploresNextTurn'), Mercenaries Jill's ammo raise
 * ('ammoReqNextTurn'), Mind Control ('revealHand') and AC-048 Backstab
 * ('backstab' — only when the target has an XP'd Skill, so not covered here).
 */

const human = (name: string, characterCardId: string) => ({ name, controller: 'human' as const, characterCardId });

function game2(char0: string, over0: Partial<PlayerState> = {}, cards: readonly import('../types').CardDef[] = [...ALL_CARDS, ...CUSTOM_CARDS]): GameState {
  const s = setup(
    { seed: 11, players: [human('A', char0), human('B', 'ch-003')] },
    cards,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over0 } : p)) };
}

let counter = 0;

function addCards(s: GameState, seat: number, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  let next = s;
  const ids: string[] = [];
  for (const cardId of cardIds) {
    const id = `${cardId}#t${++counter}`;
    ids.push(id);
    next = {
      ...next,
      cards: { ...next.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } },
      seats: next.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
    };
  }
  return { state: next, ids };
}

function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck' as const, index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

// ---------------------------------------------------------------------------
// FCH-008 Sherry — the driver for this feature
// ---------------------------------------------------------------------------

describe('targetedBy — FCH-008 Sherry forced explore', () => {
  it('records a forcedExplore notice on the target, visible in their sanitized view', () => {
    let s = startTurn(game2('fch-008'));
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 0 } : p)) };
    const { state: s1 } = setMansionTop(s, ['ma-005']); // Bui Kichwa 10 HP / 10 attack — an unarmed explore fails
    const used = applyAction(s1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });

    expect(after.seats[1]?.targetedBy).toEqual([{ seat: 0, reason: 'forcedExplore' }]);
    // The notice travels through the per-seat view the client renders from.
    expect(sanitize(after, 1).seats[1]?.targetedBy?.[0]).toEqual({ seat: 0, reason: 'forcedExplore' });
    // Sherry (the one acting) does not clutter her own screen with the notice.
    expect(after.seats[0]?.targetedBy ?? []).toHaveLength(0);
  });

  it('keeps the notice through the target\'s turn start and clears it at the target\'s turn end', () => {
    let s = startTurn(game2('fch-008'));
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 0 } : p)) };
    const { state: s1 } = setMansionTop(s, ['ma-005']);
    const used = applyAction(s1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    if (prompt === undefined) throw new Error('no prompt');
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(after.seats[1]?.targetedBy).toHaveLength(1);

    // A bot-game client only receives a snapshot AFTER the bot stretch, which
    // always ends at the HUMAN's turn start — the notice MUST survive it.
    const foeTurn = startTurn(applyAction(after, { type: 'endTurn', seat: 0 }));
    expect(foeTurn.seats[1]?.targetedBy).toHaveLength(1);

    // The target's own turn END consumes the notice (banner stays up all turn).
    const foeEnded = applyAction(foeTurn, { type: 'endTurn', seat: 1 });
    expect(foeEnded.seats[1]?.targetedBy ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Wesker L2 / Cephalo — "must Explore on your next turn"
// ---------------------------------------------------------------------------

describe('targetedBy — must-Explore obligations', () => {
  it('Wesker L2: the chosen player gets a mustExploreNextTurn notice', () => {
    const s = startTurn(game2('ch-001', { level: 2, decorations: 9 }));
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'forceExploreOtherPlayer');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const resolved = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(resolved.seats[1]?.mustExplore).toBe(true);
    expect(resolved.seats[1]?.targetedBy).toEqual([{ seat: 0, reason: 'mustExploreNextTurn' }]);
  });

  it('Cephalo (defeated): the chosen player gets a mustExploreNextTurn notice', () => {
    const s = game2('ch-002', { turnAmmo: 90, exploresLeft: 1 });
    const { state: s1, ids: guns } = addCards(s, 0, ['we-009', 'we-009', 'we-009']); // 30 damage >= 25 HP
    const { state: s2 } = setMansionTop(s1, ['ma-030']);
    const after = applyAction(s2, { type: 'explore', seat: 0, weapons: guns, exploreCount: 1 });
    const prompt = findPrompt(after, 'cephaloChoosePlayer');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const resolved = applyAction(after, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(resolved.seats[1]?.mustExplore).toBe(true);
    expect(resolved.seats[1]?.targetedBy).toEqual([{ seat: 0, reason: 'mustExploreNextTurn' }]);
  });
});

// ---------------------------------------------------------------------------
// CH-048 Jill (Mercenaries) — +10 Ammo requirement next turn
// ---------------------------------------------------------------------------

describe('targetedBy — Mercenaries Jill ammo raise', () => {
  it('the chosen player gets an ammoReqNextTurn notice', () => {
    const s = setup(
      { seed: 5, players: [human('Hero', 'ch-048'), human('Foe', 'ch-044')] },
      MERCENARIES_CARDS,
      MERCENARIES_PILES,
      MERCENARIES_MANSION,
    );
    const tune = (st: GameState, over: Partial<PlayerState>): GameState =>
      ({ ...st, seats: st.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) });
    const tuned = tune(s, { level: 1, decorations: 10 });
    const next = applyAction(tuned, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const prompt = findPrompt(next, 'jillAmmoIncrease');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const chosen = applyAction(next, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(chosen.seats[1]?.ammoReqIncreaseNextTurn).toBe(10);
    expect(chosen.seats[1]?.targetedBy).toEqual([{ seat: 0, reason: 'ammoReqNextTurn' }]);
  });
});

// ---------------------------------------------------------------------------
// Records: dedupe + cap
// ---------------------------------------------------------------------------

describe('targetedBy — record shape', () => {
  it('dedupes the same (by, reason) pair and keeps the newest three', () => {
    // Drive the write through the exported helper directly: two identical
    // notices collapse, four distinct ones keep the last three.
    let s = game2('ch-002');
    s = recordTargeted(s, 1, 0, 'backstab');
    s = recordTargeted(s, 1, 0, 'backstab');
    expect(s.seats[1]?.targetedBy).toEqual([{ seat: 0, reason: 'backstab' }]);
    s = recordTargeted(s, 1, 0, 'revealHand');
    s = recordTargeted(s, 1, 0, 'ammoReqNextTurn');
    s = recordTargeted(s, 1, 2, 'mustExploreNextTurn');
    expect(s.seats[1]?.targetedBy ?? []).toHaveLength(3);
    expect(s.seats[1]?.targetedBy?.[0]).toEqual({ seat: 0, reason: 'revealHand' });
  });
});