import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState } from '@re/game-core';
import {
  MERCENARIES_CARDS,
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  setup,
  startTurn,
} from '@re/game-core';
import { Board } from './Board';
import { PlayerPanel } from './PlayerPanel';
import { PlayerSkills } from './PlayerSkills';

/**
 * An opponent's Skill Area: the Mercenaries Skill cards as small faces in that
 * seat's player panel, each wrapped in a HoverCard so hovering pops the
 * full-size card up. The viewer's own skills live in the ActionBar instead.
 */

const SKILL_ID = 'sk-001';
const skillDef = MERCENARIES_CARDS.find(c => c.id === SKILL_ID);
if (skillDef === undefined) throw new Error('missing sk-001');

/** Two seats, Skill System on, no draft — seat 1 holds one Skill card. */
function stateWithSkill(skillsOnSeat1: readonly string[] = [`${SKILL_ID}#probe`]): GameState {
  const base = startTurn(setup(
    { seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'human' }], skillSystem: true },
    [...PREMIER_CARDS, ...MERCENARIES_CARDS],
    FIRST_TIMER_PILES,
  ));
  return {
    ...base,
    cardDefs: { ...base.cardDefs, [SKILL_ID]: skillDef! },
    cards: {
      ...base.cards,
      ...Object.fromEntries(skillsOnSeat1.map(id => [
        id,
        { instanceId: id, cardId: SKILL_ID, location: { zone: 'playArea' as const, index: 0 } },
      ])),
    },
    seats: base.seats.map((p, i) => (i === 1 ? { ...p, skills: skillsOnSeat1 } : p)),
  };
}

describe('PlayerSkills', () => {
  it('renders nothing when the Skill System is off', () => {
    const s = stateWithSkill();
    const off = { ...s, skillSystem: false };
    expect(renderToStaticMarkup(<PlayerSkills state={off} seat={1} />)).toBe('');
  });

  it('renders nothing when the seat holds no Skills', () => {
    const s = stateWithSkill([]);
    expect(renderToStaticMarkup(<PlayerSkills state={s} seat={1} />)).toBe('');
  });

  it('renders one compact card per Skill, each inside a HoverCard trigger', () => {
    const s = stateWithSkill([`${SKILL_ID}#probe`, `${SKILL_ID}#probe2`]);
    const html = renderToStaticMarkup(<PlayerSkills state={s} seat={1} />);
    expect(html).toContain('<div class="player-skills" data-player-skills="true">');
    // The trigger wrapper is the hover host; the popup itself is a portal and
    // therefore absent from server-rendered markup.
    expect((html.match(/class="hover-card"/g) ?? []).length).toBe(2);
    expect((html.match(new RegExp(`data-card-id="${SKILL_ID}"`, 'g')) ?? []).length).toBe(2);
    expect(html).toContain('data-art-only="true"');
  });

  it('unknown seat renders nothing rather than a placeholder', () => {
    const s = stateWithSkill();
    expect(renderToStaticMarkup(<PlayerSkills state={s} seat={7} />)).toBe('');
  });
});

describe('PlayerPanel — opponent identity row', () => {
  it('puts the Skill Area immediately right of the character cards', () => {
    const s = stateWithSkill();
    const html = renderToStaticMarkup(<PlayerPanel state={s} seat={1} isMe={false} showCharacterCards />);
    expect(html).toContain('data-identity-row');
    expect(html.indexOf('data-character-row')).toBeLessThan(html.indexOf('data-player-skills'));
  });

  it('omits the Skill Area when the opponent has no Skills', () => {
    const s = stateWithSkill([]);
    const html = renderToStaticMarkup(<PlayerPanel state={s} seat={1} isMe={false} showCharacterCards />);
    expect(html).not.toContain('data-player-skills');
  });

  it('Board still renders the opponent panel with its Skill Area', () => {
    const s = stateWithSkill();
    const html = renderToStaticMarkup(<Board state={s} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('data-seat="1"');
    expect(html).toContain('data-player-skills');
  });
});
