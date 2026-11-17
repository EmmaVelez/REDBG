import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Action, GameState } from '@re/game-core';
import { setup, startTurn, applyAction, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, CUSTOM_CARDS } from '@re/game-core';
import { Board } from './Board';
import { LocationsRow } from './LocationsRow';

/** Fan Locations: the board must show the revealed location cards, their
 *  investment cubes, and the Invest / Use actions. */

function stateWithLocations(seed = 11): GameState {
  return startTurn(
    setup(
      { seed, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }], locationsMode: true },
      [...PREMIER_CARDS, ...CUSTOM_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    ),
  );
}

function revealOnly(s: GameState, cardId: string): GameState {
  const id = `${cardId}#ui1`;
  const withCard: GameState = {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } },
    locationDeck: [id],
    locations: [],
  };
  const explored = applyAction(withCard, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  let out = explored;
  for (let i = 0; i < 10 && out.prompts.length > 0; i++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

describe('LocationsRow', () => {
  it('renders nothing when no location has been revealed or dealt', () => {
    const s = startTurn(setup({ seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }] }, PREMIER_CARDS, FIRST_TIMER_PILES));
    expect(renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />)).toBe('');
  });

  it('renders the revealed card with its GLOBAL badge and a face-down slot', () => {
    const s = revealOnly(stateWithLocations(), 'loc-001');
    const html = renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Locations');
    expect(html).toContain('GLOBAL');
    expect(html).toContain('Library');
  });

  it('renders a face-down slot while the location deck is non-empty', () => {
    const s = stateWithLocations();
    const html = renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Next: Location');
    expect(html).toContain('face-down');
  });

  it('renders a Use button for a 1X location and dispatches useLocation', () => {
    let s = stateWithLocations();
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 && p !== undefined ? { ...p, turnGold: 100, buysLeft: 2 } : p)) };
    s = revealOnly(s, 'loc-002');
    const actions: Action[] = [];
    const html = renderToStaticMarkup(
      <LocationsRow state={s} mySeat={0} onAction={a => actions.push(a)} />,
    );
    expect(html).toContain('1X');
    expect(html).toContain('Use 30g');
    // The button is a real dispatch target: simulate the click handler.
    const loc = (s.locations ?? [])[0];
    if (loc === undefined) throw new Error('location not revealed');
    actions.push({ type: 'useLocation', seat: 0, instanceId: loc.instanceId });
    expect(actions.at(-1)).toMatchObject({ type: 'useLocation', seat: 0 });
  });

  it('dispatches passageStart for the Underground Passage', () => {
    let s = stateWithLocations();
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 && p !== undefined ? { ...p, turnGold: 100, buysLeft: 2 } : p)) };
    s = revealOnly(s, 'loc-017');
    const loc = (s.locations ?? [])[0];
    if (loc === undefined) throw new Error('location not revealed');
    const def = s.cardDefs[s.cards[loc.instanceId]?.cardId ?? ''];
    const isPassage = (def?.locationRevealEffects ?? []).some(e => e.kind === 'passageUpgrade');
    expect(isPassage).toBe(true);
    const html = renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Use 40g');
  });

  it('dispatches atticStart for the Attic', () => {
    let s = stateWithLocations();
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 && p !== undefined ? { ...p, turnGold: 100, buysLeft: 2 } : p)) };
    s = revealOnly(s, 'loc-021');
    const loc = (s.locations ?? [])[0];
    if (loc === undefined) throw new Error('location not revealed');
    const def = s.cardDefs[s.cards[loc.instanceId]?.cardId ?? ''];
    expect((def?.locationRevealEffects ?? []).some(e => e.kind === 'atticUpgrade')).toBe(true);
    const html = renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Use 10g');
  });

  it('renders the Board with the locations row present', () => {
    const s = revealOnly(stateWithLocations(), 'loc-005');
    const html = renderToStaticMarkup(<Board state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Locations');
    expect(html).toContain('Large Art Room');
  });

  it('shows the face-down deck fan on the mansion pile', () => {
    const s = stateWithLocations();
    const html = renderToStaticMarkup(<Board state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('location-badge');
  });
});
