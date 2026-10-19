import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { GameLog } from './GameLog';

describe('GameLog close button', () => {
  it('renders the close button when onClose is provided', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} onClose={() => {}} />);
    expect(html).toContain('data-log-close');
    expect(html).toContain('Game Log');
    expect(html).toContain('Close log');
  });

  it('omits the close button when onClose is absent', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} />);
    expect(html).not.toContain('data-log-close');
    expect(html).toContain('Game Log');
  });

  it('always renders the body (turn indicator, history, chat)', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} onClose={() => {}} />);
    expect(html).toContain('Turn 0');
    expect(html).toContain('data-kind="history"');
    expect(html).toContain('No actions yet');
    expect(html).toContain('No messages yet');
  });
});
