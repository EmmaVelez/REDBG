import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState, Prompt } from '@re/game-core';
import {
  setup,
  startTurn,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  SCENARIOS,
  cardsForScenario,
  pilesForScenario,
} from '@re/game-core';
import { ActionBar } from './ActionBar';

/**
 * ActionBar prompt panel + the generic "other actions" fallback.
 *
 * The engine raises a Prompt for every card effect that needs a decision; the
 * ActionBar is the single place that renders them. These tests pin the two
 * contracts that were missing: EVERY queued prompt is shown (chained prompts
 * included) and option labels are readable (XP amounts are amounts, not seat
 * numbers).
 */

function twoPlayerState(seed = 11): GameState {
  return startTurn(
    setup(
      { seed, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'human' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ),
  );
}

function withPrompts(state: GameState, prompts: readonly Prompt[]): GameState {
  return { ...state, prompts };
}

describe('ActionBar prompt panel', () => {
  it('renders every queued prompt for the seat, not just the first', () => {
    const s = withPrompts(twoPlayerState(), [
      { id: 'p1', seat: 0, text: 'First choice', options: ['Decline'], payload: { kind: 'x' } },
      { id: 'p2', seat: 0, text: 'Second choice', options: ['Decline'], payload: { kind: 'y' } },
    ]);
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('First choice');
    expect(html).toContain('Second choice');
  });

  it('labels XP-amount options as amounts, never as player names', () => {
    const s = withPrompts(twoPlayerState(), [
      { id: 'p1', seat: 0, text: 'Remove how many XP?', options: ['1', '2', '3'], payload: { kind: 'skillRemoveXpAmount' } },
    ]);
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('1 XP');
    expect(html).toContain('3 XP');
    expect(html).not.toContain('Bot (seat 1)');
  });

  it('labels seat-choice options as player names', () => {
    const s = withPrompts(twoPlayerState(), [
      { id: 'p1', seat: 0, text: 'Choose a player', options: ['1'], payload: { kind: 'giveOneCardToPlayer' } },
    ]);
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('Bot (seat 1)');
  });

  it('labels card options as card names, not raw instance ids', () => {
    const s = withPrompts(twoPlayerState(), [
      { id: 'p1', seat: 0, text: 'Trash a card', options: ['am-001#s1_1'], payload: { kind: 'trashHandCard' } },
    ]);
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('Ammo x10');
    expect(html).not.toContain('am-001#s1_1');
  });
});

describe('ActionBar unhandled actions fallback', () => {
  it('renders Outbreak attack actions as buttons', () => {
    const scenarioDef = SCENARIOS.find(s => s.id === 'outbreak');
    const base = startTurn(setup(
      { seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'human' }], scenario: 'outbreak' },
      cardsForScenario('outbreak'),
      pilesForScenario('outbreak'),
      (scenarioDef as { mansionCards?: readonly { cardId: string; count: number }[] } | undefined)?.mansionCards,
    ));
    // Guarantee a 0-ammo weapon in hand so an attack is legal on turn 1.
    const knifeId = 'we-004#probe';
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [knifeId]: { instanceId: knifeId, cardId: 'we-004', location: { zone: 'hand', index: 0 } } },
      seats: base.seats.map((p, i) => (i === 0 ? { ...p, hand: [knifeId, ...p.hand] } : p)),
    };
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('Other actions');
    expect(html).toContain('Attack Bot with Combat Knife');
  });

  it('renders Alliance attachToPartner actions as buttons', () => {
    // Wesker (ch-001) has no "cannot attach non-Infected cards" restriction.
    const base = startTurn(setup(
      { seed: 11, players: [
        { name: 'Me', controller: 'human', characterCardId: 'ch-001' },
        { name: 'Bot', controller: 'human', characterCardId: 'ch-002' },
      ], partnerMode: true },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ));
    // Guarantee a weapon in hand so attachToPartner is legal.
    const handgunId = 'we-009#probe';
    const s: GameState = {
      ...base,
      cards: { ...base.cards, [handgunId]: { instanceId: handgunId, cardId: 'we-009', location: { zone: 'hand', index: 0 } } },
      seats: base.seats.map((p, i) => (i === 0 ? { ...p, hand: [handgunId, ...p.hand] } : p)),
    };
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('Attach Handgun to Partner');
  });
});
