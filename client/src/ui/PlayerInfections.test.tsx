import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState } from '@re/game-core';
import {
  ALL_CARDS,
  MAX_INFECTION_LEVEL,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  SCENARIOS,
  pilesForScenario,
  setup,
  startTurn,
} from '@re/game-core';
import { ActionBar } from './ActionBar';
import { PlayerInfections } from './PlayerInfections';
import { PlayerPanel } from './PlayerPanel';

/**
 * Outbreak's infection track. A seat's `infectionCards` are the face-up IN-00x
 * cards and their COUNT is the Infection Level; every client already receives
 * them (`viewForSeat` hides only hand/inventory), but nothing rendered them.
 */

const INFECTED = ['in-001#p', 'in-003#p'];

function outbreakMansion(): ReadonlyArray<{ cardId: string; count: number }> | undefined {
  const found = SCENARIOS.find(s => s.id === 'outbreak') as
    | { mansionCards?: ReadonlyArray<{ cardId: string; count: number }> }
    | undefined;
  return found?.mansionCards;
}

function outbreakState(seat0Infections: readonly string[] = INFECTED): GameState {
  const base = startTurn(
    setup(
      {
        seed: 11,
        players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }],
        scenario: 'outbreak',
      },
      ALL_CARDS,
      pilesForScenario('outbreak'),
      outbreakMansion(),
    ),
  );
  const cards = { ...base.cards };
  seat0Infections.forEach((id, i) => {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand', index: i } };
  });
  return {
    ...base,
    cards,
    seats: base.seats.map((p, i) => (i === 0 ? { ...p, infectionCards: [...seat0Infections] } : p)),
  };
}

function firstTimerState(): GameState {
  return startTurn(setup(
    { seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }] },
    PREMIER_CARDS,
    FIRST_TIMER_PILES,
  ));
}

describe('PlayerPanel — infection level', () => {
  it('shows the count for every seat in Outbreak mode', () => {
    const s = outbreakState();
    const html = renderToStaticMarkup(<PlayerPanel state={s} seat={0} isMe />);
    expect(html).toContain('data-player-infection="true"');
    expect(html).toContain(`Infection ${INFECTED.length}`);
    // The opponent's panel shows their own level too.
    const theirs = renderToStaticMarkup(<PlayerPanel state={s} seat={1} />);
    expect(theirs).toContain('data-player-infection="true"');
    expect(theirs).toContain('Infection 0');
  });

  it('omits the readout outside Outbreak mode', () => {
    const s = firstTimerState();
    expect(renderToStaticMarkup(<PlayerPanel state={s} seat={0} isMe />)).not.toContain('data-player-infection');
  });

  it('flags a seat sitting on the reanimation threshold', () => {
    const atMax = Array.from({ length: MAX_INFECTION_LEVEL }, (_, i) => `in-00${(i % 7) + 1}#max${i}`);
    const s = outbreakState(atMax);
    const html = renderToStaticMarkup(<PlayerPanel state={s} seat={0} isMe />);
    expect(html).toContain('player-infection player-infection-max');
    expect(html).toContain(`Infection ${MAX_INFECTION_LEVEL}`);
  });
});

describe('PlayerInfections — your own infection cards', () => {
  it('renders one art chip per accumulated infection, each hoverable', () => {
    const s = outbreakState();
    const html = renderToStaticMarkup(<PlayerInfections state={s} seat={0} />);
    expect(html).toContain('data-player-infections="true"');
    expect(html).toContain(`Infections ${INFECTED.length}/${MAX_INFECTION_LEVEL}`);
    expect((html.match(/class="hover-card"/g) ?? []).length).toBe(INFECTED.length);
    expect(html).toContain('data-art-only="true"');
  });

  it('renders nothing when the seat has no infections', () => {
    expect(renderToStaticMarkup(<PlayerInfections state={outbreakState([])} seat={0} />)).toBe('');
  });

  it('renders nothing outside Outbreak mode', () => {
    expect(renderToStaticMarkup(<PlayerInfections state={firstTimerState()} seat={0} />)).toBe('');
  });

  it('an unknown seat renders nothing rather than a placeholder', () => {
    expect(renderToStaticMarkup(<PlayerInfections state={outbreakState()} seat={9} />)).toBe('');
  });

  it('the action dock places it between the character cards and the skills', () => {
    const html = renderToStaticMarkup(<ActionBar state={outbreakState()} seat={0} onAction={() => {}} />);
    const charIdx = html.indexOf('data-character-row');
    const infIdx = html.indexOf('data-player-infections');
    const skillIdx = html.indexOf('data-skill-column');
    expect(charIdx).toBeGreaterThan(-1);
    expect(infIdx).toBeGreaterThan(charIdx);
    expect(skillIdx).toBeGreaterThan(infIdx);
  });
});
