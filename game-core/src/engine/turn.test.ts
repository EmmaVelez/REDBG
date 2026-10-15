import { describe, it, expect } from 'vitest';
import { nextAliveSeat, advanceTurn, makeInitialContext, withDeath } from './turn';

describe('nextAliveSeat', () => {
  it('basic: 4 seats all alive, from 0 -> 1; from 3 -> 0 (wrap)', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] };
    expect(nextAliveSeat(ctx, 0)).toBe(1);
    expect(nextAliveSeat(ctx, 3)).toBe(0);
  });

  it('skips dead: seats [0,2,3] alive of 4, from 1 -> 2; from 2 -> 3; from 3 -> 0', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 2, 3] };
    expect(nextAliveSeat(ctx, 1)).toBe(2);
    expect(nextAliveSeat(ctx, 2)).toBe(3);
    expect(nextAliveSeat(ctx, 3)).toBe(0);
  });

  it('sole survivor: aliveSeats [2], from 0 -> 2; from 2 -> 2', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [2] };
    expect(nextAliveSeat(ctx, 0)).toBe(2);
    expect(nextAliveSeat(ctx, 2)).toBe(2);
  });

  it('throws: seatCount 0; empty aliveSeats; fromSeat -1; fromSeat 4 with seatCount 4', () => {
    expect(() => nextAliveSeat({ seatCount: 0, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] }, 0)).toThrow('seatCount must be positive');
    expect(() => nextAliveSeat({ seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [] }, 0)).toThrow('no alive seats');
    expect(() => nextAliveSeat({ seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] }, -1)).toThrow('seat out of range: -1');
    expect(() => nextAliveSeat({ seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] }, 4)).toThrow('seat out of range: 4');
  });
});

describe('advanceTurn', () => {
  it('activeSeat moves, turnNumber increments by 1, input object unchanged', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] };
    const newCtx = advanceTurn(ctx);
    expect(newCtx.activeSeat).toBe(1);
    expect(newCtx.turnNumber).toBe(2);
    expect(ctx).not.toBe(newCtx);
    expect(ctx.aliveSeats).not.toBe(newCtx.aliveSeats);
  });
});

describe('makeInitialContext', () => {
  it('activeSeat is the first alive seat even if aliveSeats given unsorted', () => {
    const ctx = makeInitialContext(4, [3, 1, 2]);
    expect(ctx.activeSeat).toBe(1);
    expect(ctx.aliveSeats).toEqual([1, 2, 3]);
  });

  it('all four validation errors thrown for their cases', () => {
    expect(() => makeInitialContext(0, [0, 1, 2])).toThrow('seatCount must be positive');
    expect(() => makeInitialContext(4, [])).toThrow('no alive seats');
    expect(() => makeInitialContext(4, [4])).toThrow('seat out of range: 4');
    expect(() => makeInitialContext(4, [0, 0])).toThrow('duplicate seat: 0');
  });
});

describe('withDeath', () => {
  it('removes seat, keeps activeSeat if it was someone else; when activeSeat dies, activeSeat becomes next alive seat after it', () => {
    const ctx = { seatCount: 4, activeSeat: 1, turnNumber: 1, aliveSeats: [0, 1, 2, 3] };
    const newCtx = withDeath(ctx, 1);
    expect(newCtx.activeSeat).toBe(2);
    expect(newCtx.aliveSeats).toEqual([0, 2, 3]);
  });

  it('when killing the last alive seat, aliveSeats empty and activeSeat -1', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0] };
    const newCtx = withDeath(ctx, 0);
    expect(newCtx.activeSeat).toBe(-1);
    expect(newCtx.aliveSeats).toEqual([]);
  });

  it('throws for a seat not in aliveSeats', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] };
    expect(() => withDeath(ctx, 4)).toThrow('seat not alive: 4');
  });
});

describe('All functions return new objects', () => {
  it('no shared references with inputs', () => {
    const ctx = { seatCount: 4, activeSeat: 0, turnNumber: 1, aliveSeats: [0, 1, 2, 3] };
    const newCtx = advanceTurn(ctx);
    expect(ctx).not.toBe(newCtx);
    expect(ctx.aliveSeats).not.toBe(newCtx.aliveSeats);

    const newCtx2 = makeInitialContext(4, [3, 1, 2]);
    expect(ctx).not.toBe(newCtx2);
    expect(ctx.aliveSeats).not.toBe(newCtx2.aliveSeats);

    const newCtx3 = withDeath(ctx, 1);
    expect(ctx).not.toBe(newCtx3);
    expect(ctx.aliveSeats).not.toBe(newCtx3.aliveSeats);
  });
});
