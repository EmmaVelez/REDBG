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
