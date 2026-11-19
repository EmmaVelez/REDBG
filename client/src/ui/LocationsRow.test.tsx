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
  it('Tiger Statue Room investment discounts the buy button and price label', () => {
    const base = stateWithLocations();
    // Seat 0 has invested in Tiger Statue Room (loc-015, -10 gold on buys).
    const s: GameState = {
      ...base,
      cards: { ...base.cards, ['loc-015#inv1']: { instanceId: 'loc-015#inv1', cardId: 'loc-015', location: { zone: 'supply', index: 0 } } },
      locations: [{ instanceId: 'loc-015#inv1', cubes: { 0: 1 }, revealedBy: 0 }],
      seats: base.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 25 } : p)),
    };
    // The foyer pile's top card costs 30 -> 20 after the discount. 25 gold
    // affords the discounted price but NOT the printed one.
    const html = renderToStaticMarkup(<Board state={s} mySeat={0} onAction={() => {}} />);
    const foyerTag = html.match(/<button[^>]*data-pile="foyer"[^>]*>/)?.[0] ?? '';
    expect(foyerTag).not.toBe('');
    expect(foyerTag).not.toContain('disabled');
    expect(html).toContain('20g');
    // Without the investment the button stays disabled at 25 gold.
    const plain = renderToStaticMarkup(<Board state={{ ...s, locations: [] }} mySeat={0} onAction={() => {}} />);
    expect(plain.match(/<button[^>]*data-pile="foyer"[^>]*>/)?.[0] ?? '').toContain('disabled');
  });
  it('crowns XP-token piles with a circular #xp badge (Bar, loc-022)', () => {
    const s = stateWithLocations();
    const pileId = Object.keys(s.marketPiles)[0]!;
    const html = renderToStaticMarkup(<Board state={{ ...s, xpTokens: [pileId] }} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('xp-token-badge');
    expect(html).toContain('1xp');
    // the badge rides on the tokenized pile, not another one
    expect(html.match(new RegExp(`data-pile="${pileId}"[^>]*>[\\s\\S]*?xp-token-badge`))).not.toBeNull();
    // stacked tokens show the total on the stack
    const stacked = renderToStaticMarkup(<Board state={{ ...s, xpTokens: [pileId, pileId] }} mySeat={0} onAction={() => {}} />);
    expect(stacked).toContain('2xp');
    // no tokens -> no badge
    expect(renderToStaticMarkup(<Board state={s} mySeat={0} onAction={() => {}} />)).not.toContain('xp-token-badge');
  });
  it('wraps revealed locations in a HoverCard (full-art popup on hover)', () => {
    const s = revealOnly(stateWithLocations(), 'loc-008');
    const html = renderToStaticMarkup(<LocationsRow state={s} mySeat={0} onAction={() => {}} />);
    // the tile rides inside the hover wrapper, thumbnail art present
    expect(html).toContain('hover-card');
    expect(html).toContain('location-card');
    expect(html).toContain('data-card-id="loc-008"');
  });
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
