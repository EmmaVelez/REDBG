import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState, PlayerState } from '@re/game-core';
import { setup, startTurn, PREMIER_CARDS, FIRST_TIMER_PILES } from '@re/game-core';
import { CharacterSkills } from './CharacterSkills';

function stateFor(characterCardId: string, seat0: Partial<PlayerState> = {}, seed = 11): GameState {
  const s = startTurn(
    setup(
      { seed, players: [{ name: 'Me', controller: 'human', characterCardId }, { name: 'Bot', controller: 'human' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES
    )
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p)) };
}

describe('CharacterSkills', () => {
  it('Jill level 0: both rows locked with gates, footer next gate 5', () => {
    const state = stateFor('ch-009');
    const html = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    
    expect(html).toContain('<div class="character-skills" data-seat="0">');
    expect(html).toContain('<div class="skill-row skill-locked" data-level="1"><span class="skill-gate">Lv1 · 5★</span>');
    expect(html).toContain('<div class="skill-row skill-locked" data-level="2"><span class="skill-gate">Lv2 · 8★</span>');
    expect(html).toContain('<span class="skill-decorations">★ 0</span>');
    expect(html).toContain('<span class="skill-next">Next: 5★</span>');
    expect(html).not.toContain('skill-unlocked');
  });

  it('Jill level 1: row 1 unlocked, row 2 locked, footer next gate 8', () => {
    const state = stateFor('ch-009', { level: 1, decorations: 5 });
    const html = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    
    expect(html).toContain('<div class="skill-row skill-unlocked" data-level="1">');
    expect(html).toContain('<div class="skill-row skill-locked" data-level="2">');
    expect(html).toContain('<span class="skill-decorations">★ 5</span>');
    expect(html).toContain('<span class="skill-next">Next: 8★</span>');
  });

  it('Jill level 2: both unlocked, footer MAX LEVEL', () => {
    const state = stateFor('ch-009', { level: 2, decorations: 8 });
    const html = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    
    expect(html).toContain('skill-unlocked" data-level="1"');
    expect(html).toContain('skill-unlocked" data-level="2"');
    expect(html).not.toContain('skill-locked');
    expect(html).toContain('<span class="skill-next">MAX LEVEL</span>');
  });

  it('promo single-tier character renders one row; level 1 shows MAX LEVEL', () => {
    const state = stateFor('pr-002', { level: 1, decorations: 8 });
    const html = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    
    expect(html).toContain('<div class="skill-row skill-unlocked" data-level="1"><span class="skill-gate">Lv1 · 8★</span>');
    expect(html).not.toContain('data-level="2"');
    expect(html).toContain('<span class="skill-next">MAX LEVEL</span>');
    
    const locked = stateFor('pr-002');
    const htmlLocked = renderToStaticMarkup(<CharacterSkills state={locked} seat={0} />);
    expect(htmlLocked).toContain('skill-row skill-locked" data-level="1"');
    expect(htmlLocked).toContain('<span class="skill-next">Next: 8★</span>');
  });

  it('unknown seat renders the placeholder', () => {
    const state = stateFor('ch-009');
    const html = renderToStaticMarkup(<CharacterSkills state={state} seat={7} />);
    
    expect(html).toBe('<div class="character-skills" data-seat="7">—</div>');
  });

  it('pure component: identical state renders identical markup', () => {
    const state = stateFor('ch-009', { level: 1, decorations: 5 });
    const html1 = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    const html2 = renderToStaticMarkup(<CharacterSkills state={state} seat={0} />);
    
    expect(html1).toBe(html2);
  });
});
