import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ActionBarStats } from './ActionBarStats';

describe('ActionBarStats', () => {
  it('renders all five stat chips', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={40} ammo={30} actions={1} buys={2} />);
    expect(html).toContain('data-action-stats');
    expect(html).toContain('data-stat="hp"');
    expect(html).toContain('data-stat="gold"');
    expect(html).toContain('data-stat="ammo"');
    expect(html).toContain('data-stat="actions"');
    expect(html).toContain('data-stat="buys"');
  });

  it('shows hp as current/max', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={40} ammo={30} actions={1} buys={2} />);
    expect(html).toContain('90');
    expect(html).toContain('/');
    expect(html).toContain('120');
  });

  it('shows the gold, ammo, actions and buys values', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={50} maxHp={80} gold={77} ammo={88} actions={3} buys={4} />);
    expect(html).toContain('77');
    expect(html).toContain('88');
    expect(html).toContain('50');
    expect(html).toContain('80');
    expect(html).toContain('Actions');
    expect(html).toContain('Buys');
  });

  it('renders zeros without crashing', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={0} maxHp={80} gold={0} ammo={0} actions={0} buys={0} />);
    expect(html).toContain('0');
    expect(html).toContain('/');
    expect(html).toContain('80');
    expect(html).toContain('data-stat="gold"');
  });
});
