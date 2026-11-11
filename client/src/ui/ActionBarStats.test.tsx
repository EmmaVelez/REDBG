import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ActionBarStats } from './ActionBarStats';

describe('ActionBarStats', () => {
  it('renders the five per-turn stat chips', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={40} ammo={30} actions={1} buys={2} />);
    expect(html).toContain('data-action-stats');
    expect(html).toContain('data-stat="hp"');
    expect(html).toContain('data-stat="gold"');
    expect(html).toContain('data-stat="ammo"');
    expect(html).toContain('data-stat="actions"');
    expect(html).toContain('data-stat="buys"');
  });

  it('renders the turn and total-decoration chips when given', () => {
    const html = renderToStaticMarkup(
      <ActionBarStats hp={90} maxHp={120} gold={40} ammo={30} actions={1} buys={2} turn={7} decorations={13} />,
    );
    expect(html).toContain('data-stat="turn"');
    expect(html).toMatch(/data-stat="turn"[^>]*>.*?<strong>7<\/strong>/);
    expect(html).toContain('data-stat="decorations"');
    expect(html).toMatch(/data-stat="decorations"[^>]*>.*?<strong>13<\/strong>/);
  });

  it('renders the room code and connection status as chips when given', () => {
    const html = renderToStaticMarkup(
      <ActionBarStats hp={90} maxHp={120} gold={0} ammo={0} actions={1} buys={1} roomCode="ABC123" status="connected" />,
    );
    expect(html).toContain('data-stat="room"');
    expect(html).toContain('data-stat="status"');
    expect(html).toContain('data-app-status="connected"');
    expect(html).toContain('app-status-connected');
    expect(html).toContain('app-room');
    expect(html).toContain('ABC123');
  });

  it('omits the turn, decoration, room and status chips when not given', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={0} ammo={0} actions={1} buys={1} />);
    expect(html).not.toContain('data-stat="turn"');
    expect(html).not.toContain('data-stat="decorations"');
    expect(html).not.toContain('data-stat="room"');
    expect(html).not.toContain('data-stat="status"');
    expect(html).not.toContain('app-status-');
    expect(html).not.toContain('app-room');
    // XP chip omitted when skillSystem is off
    expect(html).not.toContain('data-stat="xp"');
  });

  it('shows XP when skillSystem is enabled', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={0} ammo={0} actions={1} buys={1} skillSystem xp={7} />);
    expect(html).toContain('data-stat="xp"');
    expect(html).toMatch(/XP <strong>7<\/strong>/);
  });

  it('renders XP as zero when skillSystem on but no xp prop', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={0} ammo={0} actions={1} buys={1} skillSystem />);
    expect(html).toContain('data-stat="xp"');
    expect(html).toMatch(/XP <strong>0<\/strong>/);
  });

  it('omits XP when skillSystem is false', () => {
    const html = renderToStaticMarkup(<ActionBarStats hp={90} maxHp={120} gold={0} ammo={0} actions={1} buys={1} skillSystem={false} xp={5} />);
    expect(html).not.toContain('data-stat="xp"');
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
