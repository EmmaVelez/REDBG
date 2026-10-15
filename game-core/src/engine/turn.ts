export interface TurnContext {
  readonly seatCount: number;
  readonly activeSeat: number;
  readonly turnNumber: number;
  readonly aliveSeats: readonly number[];
}

export function nextAliveSeat(ctx: TurnContext, fromSeat: number): number {
  if (ctx.seatCount < 1) {
    throw new Error('nextAliveSeat: seatCount must be positive');
  }
  if (ctx.aliveSeats.length === 0) {
    throw new Error('nextAliveSeat: no alive seats');
  }
  if (fromSeat < 0 || fromSeat >= ctx.seatCount) {
    throw new Error('nextAliveSeat: seat out of range: ' + fromSeat);
  }

  const alive = new Set(ctx.aliveSeats);
  for (let step = 1; step <= ctx.seatCount; step++) {
    const candidate = (fromSeat + step) % ctx.seatCount;
    if (alive.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('nextAliveSeat: no alive seats');
}

export function advanceTurn(ctx: TurnContext): TurnContext {
  return {
    seatCount: ctx.seatCount,
    activeSeat: nextAliveSeat(ctx, ctx.activeSeat),
    turnNumber: ctx.turnNumber + 1,
    aliveSeats: [...ctx.aliveSeats],
  };
}

export function makeInitialContext(seatCount: number, aliveSeats: readonly number[]): TurnContext {
  if (seatCount < 1) {
    throw new Error('makeInitialContext: seatCount must be positive');
  }
  if (aliveSeats.length === 0) {
    throw new Error('makeInitialContext: no alive seats');
  }
  const seen = new Set<number>();
  for (const seat of aliveSeats) {
    if (seat < 0 || seat >= seatCount) {
      throw new Error('makeInitialContext: seat out of range: ' + seat);
    }
    if (seen.has(seat)) {
      throw new Error('makeInitialContext: duplicate seat: ' + seat);
    }
    seen.add(seat);
  }

  const sortedAliveSeats = [...aliveSeats].sort((a, b) => a - b);
  const firstSeat = sortedAliveSeats[0];
  if (firstSeat === undefined) {
    throw new Error('makeInitialContext: no alive seats');
  }
  return {
    seatCount,
    activeSeat: firstSeat,
    turnNumber: 1,
    aliveSeats: sortedAliveSeats,
  };
}

export function withDeath(ctx: TurnContext, deadSeat: number): TurnContext {
  const index = ctx.aliveSeats.indexOf(deadSeat);
  if (index === -1) {
    throw new Error('withDeath: seat not alive: ' + deadSeat);
  }

  const newAliveSeats = ctx.aliveSeats.filter(seat => seat !== deadSeat);
  let newActiveSeat = ctx.activeSeat;
  if (ctx.activeSeat === deadSeat) {
    if (newAliveSeats.length > 0) {
      newActiveSeat = nextAliveSeat({ ...ctx, aliveSeats: newAliveSeats }, ctx.activeSeat);
    } else {
      newActiveSeat = -1;
    }
  }

  return {
    seatCount: ctx.seatCount,
    activeSeat: newActiveSeat,
    turnNumber: ctx.turnNumber,
    aliveSeats: newAliveSeats,
  };
}
