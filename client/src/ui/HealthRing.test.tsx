import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthRing } from './HealthRing';

function countOf(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

describe('HealthRing', () => {
  it('90 max HP renders 9 segments, all filled at full health', () => {
    const html = renderToStaticMarkup(<HealthRing hp={90} maxHp={90} />);
    expect(html).toContain('data-segments="9"');
    expect(html).toContain('data-filled="9"');
    expect(html).toContain('data-hp="90"');
    expect(html).toContain('data-max-hp="90"');
    expect(countOf(html, 'health-filled')).toBe(9);
    expect(countOf(html, 'health-empty')).toBe(0);
    expect(html).toContain('aria-label="Health 90 of 90"');
  });

  it('the HP number carries the health-ring-label class the text-shadow hangs off', () => {
    // The 2px all-round shadow on the gauge number is pure CSS
    // (`.health-ring-label { text-shadow: ... }`), so the class is the contract:
    // if a refactor drops it, the number goes back to being unreadable over art.
    const html = renderToStaticMarkup(<HealthRing hp={40} maxHp={80} />);
    expect(html).toMatch(/<text[^>]*class="health-ring-label"[^>]*>40<\/text>/);
  });

  it('half health fills half the ring (50 of 90 -> 5 filled, 4 empty)', () => {
    const html = renderToStaticMarkup(<HealthRing hp={50} maxHp={90} />);
    expect(html).toContain('data-filled="5"');
    expect(countOf(html, 'health-filled')).toBe(5);
    expect(countOf(html, 'health-empty')).toBe(4);
  });

  it('zero health fills nothing but still renders all segments', () => {
    const html = renderToStaticMarkup(<HealthRing hp={0} maxHp={80} />);
    expect(html).toContain('data-segments="8"');
    expect(html).toContain('data-filled="0"');
    expect(countOf(html, 'health-filled')).toBe(0);
    expect(countOf(html, 'health-empty')).toBe(8);
    expect(html).toContain('>0</text>');
  });

  it('120 max HP renders 12 segments (Chris)', () => {
    const html = renderToStaticMarkup(<HealthRing hp={100} maxHp={120} />);
    expect(html).toContain('data-segments="12"');
    expect(html).toContain('data-filled="10"');
    expect(countOf(html, 'health-segment')).toBe(12);
  });

  it('fractional health rounds to nearest segment (75 of 80 -> 8 of 8)', () => {
    const html = renderToStaticMarkup(<HealthRing hp={75} maxHp={80} />);
    expect(html).toContain('data-filled="8"');
    expect(countOf(html, 'health-filled')).toBe(8);
  });

  it('respects size and strokeWidth props', () => {
    const html = renderToStaticMarkup(<HealthRing hp={40} maxHp={80} size={60} strokeWidth={8} />);
    expect(html).toContain('width="60"');
    expect(html).toContain('height="60"');
    expect(html).toContain('stroke-width="8"');
    const defaultHtml = renderToStaticMarkup(<HealthRing hp={40} maxHp={80} />);
    expect(defaultHtml).toContain('width="44"');
  });

  it('guards degenerate maxHp 0 with a single empty segment', () => {
    const html = renderToStaticMarkup(<HealthRing hp={0} maxHp={0} />);
    expect(html).toContain('data-segments="1"');
    expect(html).toContain('data-filled="0"');
    expect(countOf(html, 'health-empty')).toBe(1);
  });

  it('pure component: identical props render identical markup', () => {
    const html1 = renderToStaticMarkup(<HealthRing hp={55} maxHp={90} />);
    const html2 = renderToStaticMarkup(<HealthRing hp={55} maxHp={90} />);
    expect(html1).toBe(html2);
  });
});

describe('HealthRing tiers', () => {
  it('full health: green segments, tier ok', () => {
    const html = renderToStaticMarkup(<HealthRing hp={90} maxHp={90} />);
    expect(html).toContain('data-tier="ok"');
    expect(countOf(html, 'stroke="#4ade80"')).toBe(9);
  });

  it('exactly half health: orange, tier warn', () => {
    const html = renderToStaticMarkup(<HealthRing hp={45} maxHp={90} />);
    expect(html).toContain('data-tier="warn"');
    expect(html).toContain('stroke="#fb923c"');
    expect(html).not.toContain('stroke="#4ade80"');
    expect(countOf(html, 'stroke="#fb923c"')).toBe(5);
  });

  it('just above half: green, tier ok', () => {
    const html = renderToStaticMarkup(<HealthRing hp={46} maxHp={90} />);
    expect(html).toContain('data-tier="ok"');
    expect(html).toContain('stroke="#4ade80"');
  });

  it('exactly one third: red, tier critical', () => {
    const html = renderToStaticMarkup(<HealthRing hp={30} maxHp={90} />);
    expect(html).toContain('data-tier="critical"');
    expect(html).toContain('stroke="#ef4444"');
    expect(html).not.toContain('stroke="#fb923c"');
    expect(html).not.toContain('stroke="#4ade80"');
  });

  it('just above one third: orange, tier warn', () => {
    const html = renderToStaticMarkup(<HealthRing hp={31} maxHp={90} />);
    expect(html).toContain('data-tier="warn"');
  });

  it('zero health: red', () => {
    const html = renderToStaticMarkup(<HealthRing hp={0} maxHp={80} />);
    expect(html).toContain('data-tier="critical"');
    expect(html).not.toContain('stroke="#ef4444"');
  });

  it('empty segments stay grey at every tier', () => {
    const html = renderToStaticMarkup(<HealthRing hp={30} maxHp={90} />);
    expect(countOf(html, 'stroke="rgba(255,255,255,0.12)"')).toBe(6);
  });
});
