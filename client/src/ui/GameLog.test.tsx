import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { GameLog } from './GameLog';

describe('GameLog collapse', () => {
  it('renders the collapse toggle button', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} />);
    expect(html).toContain('data-log-toggle');
    expect(html).toContain('Game Log');
  });

  it('is expanded by default (body visible, toggle says Hide)', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} />);
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('Hide');
    expect(html).toContain('data-kind="history"');
  });

  it('starts collapsed when defaultCollapsed is set (body hidden, toggle says Show)', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} defaultCollapsed />);
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('Show');
    expect(html).not.toContain('data-kind="history"');
    expect(html).not.toContain('No actions yet');
  });

  it('still renders turn indicator and chat when expanded', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} />);
    expect(html).toContain('Turn 0');
    expect(html).toContain('No messages yet');
  });
});
