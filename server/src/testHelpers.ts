import WebSocket from 'ws';
import type { GameServer } from './ws';
import { encodeMessage, decodeMessage } from './protocol';
import type { ServerMessage } from './protocol';

/**
 * Shared WebSocket client helpers for the server integration suites.
 *
 * Extracted from integration.test.ts so the reconnect torture suite drives
 * real sockets without duplicating the waiter machinery. The cancellable
 * `nextCancel` matters: a plain `next()` raced by a timeout leaves a stale
 * waiter that eats the NEXT real message.
 */

export type Client = {
  ws: WebSocket;
  /** Resolves with the next decoded server message (FIFO). */
  next: () => Promise<ServerMessage>;
  /** Cancellable variant: call the returned function to unregister the wait. */
  nextCancel: () => { promise: Promise<ServerMessage>; cancel: () => void };
  send: (m: unknown) => void;
};

export function connect(server: GameServer): Client {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port()}`);
  const queue: ServerMessage[] = [];
  type Waiter = (m: ServerMessage) => void;
  const waiters: Waiter[] = [];
  ws.on('message', (data) => {
    const d = decodeMessage((data as Buffer).toString());
    if (d.ok) {
      const m = d.msg as ServerMessage;
      const w = waiters.shift();
      if (w !== undefined) w(m);
      else queue.push(m);
    }
  });
  const next = (): Promise<ServerMessage> =>
    new Promise((resolve) => {
      const q = queue.shift();
      if (q !== undefined) resolve(q);
      else waiters.push(resolve);
    });
  const nextCancel = () => {
    let cancelled = false;
    let resolveMsg: (m: ServerMessage) => void = () => {};
    let rejectMsg: (e: Error) => void = () => {};
    const promise = new Promise<ServerMessage>((res, rej) => {
      resolveMsg = res;
      rejectMsg = rej;
    });
    const waiter = (m: ServerMessage): void => {
      if (!cancelled) {
        cancelled = true;
        resolveMsg(m);
      }
    };
    const q = queue.shift();
    if (q !== undefined) {
      cancelled = true;
      resolveMsg(q);
    } else {
      waiters.push(waiter);
    }
    return {
      promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        const i = waiters.indexOf(waiter);
        if (i !== -1) waiters.splice(i, 1);
        rejectMsg(new Error('waiter cancelled'));
      },
    };
  };
  return {
    ws,
    next,
    nextCancel,
    send: (m) => ws.send(encodeMessage(m as never)),
  };
}

export const open = (c: Client): Promise<void> => new Promise((resolve) => c.ws.on('open', resolve));

/** First message satisfying the predicate (buffers the ones before it). */
export async function waitFor<T extends ServerMessage>(
  c: Client,
  pred: (m: ServerMessage) => m is T,
  timeoutMs = 10000,
  label = 'waitFor',
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`waitFor timed out after ${timeoutMs}ms: ${label}`);
    let msg: ServerMessage;
    try {
      msg = await nextWithTimeout(c, remaining);
    } catch {
      continue; // single-message wait expired; loop re-checks the deadline
    }
    if (pred(msg)) return msg;
  }
}

export async function nextWithTimeout(c: Client, ms: number): Promise<ServerMessage> {
  const { promise, cancel } = c.nextCancel();
  const timer = setTimeout(() => {
    cancel();
  }, ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

/** Collects every message that arrives until nothing has for `quietMs`. */
export async function drain(c: Client, quietMs = 60): Promise<ServerMessage[]> {
  const out: ServerMessage[] = [];
  for (;;) {
    try {
      out.push(await nextWithTimeout(c, quietMs));
    } catch {
      return out; // quiet window reached
    }
  }
}

export const isStateSync = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'stateSync' }> => m.kind === 'stateSync';
export const isRoomState = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'roomState' }> => m.kind === 'roomState';
export const isGameStarted = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'gameStarted' }> => m.kind === 'gameStarted';
export const isActionRejected = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'actionRejected' }> => m.kind === 'actionRejected';
export const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'welcome' }> => m.kind === 'welcome';
export const isError = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'error' }> => m.kind === 'error';
export const isGameOver = (m: ServerMessage): m is Extract<ServerMessage, { kind: 'gameOver' }> => m.kind === 'gameOver';

/** True when every card zone of `seat` is hidden (another seat's view / spectator). */
export function seatHidden(state: {
  seats: readonly { hand: readonly string[]; inventory: readonly string[]; discard: readonly string[]; playArea: readonly string[] }[];
}, seat: number): boolean {
  const s = state.seats[seat];
  if (s === undefined) return false;
  return (
    s.hand.every((id) => id.startsWith('hidden-')) &&
    s.inventory.every((id) => id.startsWith('hidden-')) &&
    s.discard.every((id) => id.startsWith('hidden-')) &&
    s.playArea.every((id) => id.startsWith('hidden-'))
  );
}

export function handVisible(state: { seats: readonly { hand: readonly string[] }[] }, seat: number): boolean {
  const s = state.seats[seat];
  return s !== undefined && s.hand.length > 0 && s.hand.some((id) => !id.startsWith('hidden-'));
}
