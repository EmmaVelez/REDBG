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

  const index = ctx.aliveSeats.indexOf(fromSeat);
  if (index !== -1) {
    return ctx.aliveSeats[(index + 1) % ctx.aliveSeats.length];
  }

  let nextSeat = (fromSeat + 1) % ctx.seatCount;
  while (ctx.aliveSeats.indexOf(nextSeat) === -1) {
    nextSeat = (nextSeat + 1) % ctx.seatCount;
  }
  return nextSeat;
}

export function advanceTurn(ctx: TurnContext): TurnContext {
  return {
    ...ctx,
    activeSeat: nextAliveSeat(ctx, ctx.activeSeat),
    turnNumber: ctx.turnNumber + 1,
  };
}

export function makeInitialContext(seatCount: number, aliveSeats: readonly number[]): TurnContext {
  if (seatCount < 1) {
    throw new Error('makeInitialContext: seatCount must be positive');
  }
  if (aliveSeats.length === 0) {
    throw new Error('makeInitialContext: no alive seats');
  }
  const sortedAliveSeats = [...aliveSeats].sort((a, b) => a - b);
  for (const seat of sortedAliveSeats) {
    if (seat < 0 || seat >= seatCount) {
      throw new Error('makeInitialContext: seat out of range: ' + seat);
    }
  }
  const seatSet = new Set(sortedAliveSeats);
  if (seatSet.size !== sortedAliveSeats.length) {
    throw new Error('makeInitialContext: duplicate seat');
  }

  return {
    seatCount,
    activeSeat: sortedAliveSeats[0],
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
  const newActiveSeat = ctx.activeSeat === deadSeat
    ? newAliveSeats.length > 0 ? nextAliveSeat({ ...ctx, aliveSeats: newAliveSeats }, ctx.activeSeat) : -1
    : ctx.activeSeat;

  return {
    ...ctx,
    activeSeat: newActiveSeat,
    aliveSeats: newAliveSeats,
  };
}
