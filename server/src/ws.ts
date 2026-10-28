import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { encodeMessage, decodeMessage } from './protocol';
import type { ClientMessage, ServerMessage } from './protocol';
import { createHost } from './host';
import type { GameHost, HostResult } from './host';
import { createRoomStore } from './rooms';
import type { RoomStore } from './rooms';

/**
 * WebSocket game server (M3-T04). Wires the protocol to the room store and
 * the authoritative hosts:
 *
 * - every connection immediately gets a `welcome` (clientId + reconnectToken);
 * - createRoom/joinRoom/reconnect/spectate establish a session;
 * - selectSeat/addBot/removeBot/startGame/sendAction/sendChat mutate the room
 *   or game through the room store / host and broadcast the result;
 * - after every successful human action, bot seats advance automatically
 *   (stepBot in a loop) so the game is always at a human or game-over;
 * - heartbeat pings prune dead connections (heartbeatMs 0 disables);
 * - disconnect marks the player `connected: false` in the room.
 *
 * No game logic lives here — everything funnels into rooms.ts + host.ts.
 */

export interface GameServerOptions {
  readonly port?: number;
  /** Optional pre-existing HTTP server to attach the WebSocket endpoint to
   *  (Render single-service mode: one server serves both the client build and
   *  the game). When omitted, the WebSocketServer creates its own listener. */
  readonly httpServer?: HttpServer;
  readonly heartbeatMs?: number;
  readonly seedFn?: () => number;
  /** Injectable token factory for deterministic reconnect tests. */
  readonly tokenFn?: () => string;
  /** Injectable RNG for bot actions (deterministic tests). */
  readonly rand?: () => number;
}

export interface GameServer {
  readonly wss: WebSocketServer;
  /** Actual bound port (0 = ephemeral). */
  readonly port: () => number;
  readonly close: () => void;
}

interface Session {
  clientId: string | null;
  roomCode: string | null;
  isSpectator: boolean;
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const newToken = options.tokenFn ?? (() => Math.random().toString(36).slice(2, 10));
  const random = options.rand ?? Math.random;
  const wss =
    options.httpServer !== undefined
      ? new WebSocketServer({ server: options.httpServer })
      : new WebSocketServer({ port: options.port ?? 0 });
  const roomStore: RoomStore = createRoomStore();
  const hosts = new Map<string, GameHost>();
  const sessions = new Map<WebSocket, Session>();
  const byClient = new Map<string, WebSocket>();
  /** reconnectToken -> clientId */
  const tokens = new Map<string, string>();
  const roomWatchers = new Map<string, Set<WebSocket>>();
  let clientCounter = 0;

  const send = (ws: WebSocket, msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage(msg));
    }
  };

  const sendToClient = (clientId: string, msg: ServerMessage): void => {
    const ws = byClient.get(clientId);
    if (ws !== undefined) {
      send(ws, msg);
    }
  };

  const watchersOf = (roomCode: string): Set<WebSocket> => {
    let set = roomWatchers.get(roomCode);
    if (set === undefined) {
      set = new Set();
      roomWatchers.set(roomCode, set);
    }
    return set;
  };

  const broadcastToRoom = (roomCode: string, msg: ServerMessage): void => {
    const room = roomStore.getRoom(roomCode);
    if (room !== undefined) {
      for (const p of room.players) {
        if (!p.isBot) sendToClient(p.clientId, msg);
      }
    }
    for (const ws of watchersOf(roomCode)) {
      send(ws, msg);
    }
  };

  const broadcastRoomState = (roomCode: string): void => {
    const room = roomStore.getRoom(roomCode);
    if (room !== undefined) {
      broadcastToRoom(roomCode, { kind: 'roomState', room: roomStore.toSnapshot(room) });
    }
  };

  const broadcastGameViews = (roomCode: string): void => {
    const host = hosts.get(roomCode);
    if (host === undefined || host.state === undefined) return;
    const room = roomStore.getRoom(roomCode);
    if (room !== undefined) {
      for (const p of room.players) {
        if (!p.isBot) {
          const view = host.viewFor(p.clientId);
          if (view !== undefined) sendToClient(p.clientId, { kind: 'stateSync', view });
        }
      }
    }
    for (const ws of watchersOf(roomCode)) {
      send(ws, { kind: 'stateSync', view: { seat: -1, state: hideAll(host.state) } });
    }
  };

  /**
   * After a human move, keep advancing the active bot seats until a human is
   * active again (or the game is over). Bounded so a bug can't spin forever.
   */
  const advanceBots = (roomCode: string): HostResult | undefined => {
    const host = hosts.get(roomCode);
    if (host === undefined || host.state === undefined) return undefined;
    for (let guard = 0; guard < 2000; guard++) {
      const state = host.state;
      if (state === undefined) return undefined;
      const room = roomStore.getRoom(roomCode);
      if (room === undefined) return undefined;
      const activeSeat = state.seats[state.activeSeat]?.seat;
      if (activeSeat === undefined) return undefined;
      const sitter = room.players.find(p => p.seat === activeSeat);
      if (sitter === undefined || !sitter.isBot) return undefined; // human or no one: stop
      const result = host.stepBot(Math.floor(random() * 2 ** 31), 'hard');
      if (result === undefined || !result.ok) return undefined;
      if (result.gameOver) return result; // ok + over: the caller must broadcast gameOver
    }
    return undefined;
  };

  const disconnectPlayer = (clientId: string, roomCode: string): void => {
    const room = roomStore.getRoom(roomCode);
    if (room === undefined) return;
    if (room.players.some(p => p.clientId === clientId && !p.isBot)) {
      roomStore.setConnected(roomCode, clientId, false);
      broadcastRoomState(roomCode);
    }
  };

  /** Assigns a fresh client identity + reconnect token for this session. */
  const issueIdentity = (session: Session, ws: WebSocket): string => {
    const clientId = `client-${++clientCounter}`;
    const token = newToken();
    session.clientId = clientId;
    byClient.set(clientId, ws);
    tokens.set(token, clientId);
    return token;
  };

  const handle = (ws: WebSocket, session: Session, raw: string): void => {
    const decoded = decodeMessage(raw);
    if (!decoded.ok) {
      send(ws, { kind: 'error', message: decoded.error });
      return;
    }
    const msg = decoded.msg as ClientMessage;

    switch (msg.kind) {
      case 'createRoom': {
        if (session.roomCode !== null) {
          send(ws, { kind: 'error', message: 'already in a room' });
          return;
        }
        if (session.clientId === null) return; // identity issued at connect
        const room = roomStore.createRoom(session.clientId, msg.playerName, msg.scenario, msg.partnerMode);
        session.roomCode = room.roomCode;
        broadcastRoomState(room.roomCode);
        return;
      }

      case 'joinRoom': {
        if (session.roomCode !== null) {
          send(ws, { kind: 'error', message: 'already in a room' });
          return;
        }
        if (session.clientId === null) return;
        try {
          const room = roomStore.joinRoom(msg.roomCode, session.clientId, msg.playerName);
          session.roomCode = room.roomCode;
          broadcastRoomState(room.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'reconnect': {
        const clientId = tokens.get(msg.token);
        if (clientId === undefined) {
          send(ws, { kind: 'error', message: 'invalid reconnect token' });
          return;
        }
        for (const room of roomStore.rooms.values()) {
          if (room.players.some(p => p.clientId === clientId && !p.isBot)) {
            session.clientId = clientId;
            session.roomCode = room.roomCode;
            byClient.set(clientId, ws);
            roomStore.setConnected(room.roomCode, clientId, true);
            broadcastRoomState(room.roomCode);
            broadcastGameViews(room.roomCode);
            return;
          }
        }
        send(ws, { kind: 'error', message: 'no room for token' });
        return;
      }

      case 'spectate': {
        const room = roomStore.getRoom(msg.roomCode);
        if (room === undefined) {
          send(ws, { kind: 'error', message: 'room not found' });
          return;
        }
        session.isSpectator = true;
        session.roomCode = room.roomCode;
        watchersOf(room.roomCode).add(ws);
        broadcastRoomState(room.roomCode);
        broadcastGameViews(room.roomCode);
        return;
      }

      case 'leaveRoom': {
        if (session.roomCode === null) return;
        const roomCode = session.roomCode;
        if (!session.isSpectator && session.clientId !== null) {
          const room = roomStore.getRoom(roomCode);
          if (room !== undefined) {
            roomStore.leaveRoom(roomCode, session.clientId);
            session.roomCode = null;
            broadcastRoomState(roomCode);
          }
        } else {
          watchersOf(roomCode).delete(ws);
          session.roomCode = null;
        }
        return;
      }

      case 'selectSeat': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.selectSeat(session.roomCode, session.clientId, msg.seat);
          broadcastRoomState(session.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'addBot': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.addBot(session.roomCode, session.clientId, msg.seat);
          broadcastRoomState(session.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'removeBot': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.removeBot(session.roomCode, session.clientId, msg.seat);
          broadcastRoomState(session.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'setScenario': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.setScenario(session.roomCode, session.clientId, msg.scenario);
          broadcastRoomState(session.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'setPartnerMode': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.setPartnerMode(session.roomCode, session.clientId, msg.partnerMode);
          broadcastRoomState(session.roomCode);
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'startGame': {
        if (session.roomCode === null || session.clientId === null) return;
        try {
          roomStore.startGame(session.roomCode, session.clientId);
          const room = roomStore.getRoom(session.roomCode);
          if (room === undefined) return;
          const host = createHost(room);
          host.start(Math.floor(random() * 2 ** 31));
          hosts.set(session.roomCode, host);
          broadcastToRoom(session.roomCode, { kind: 'gameStarted' });
          // If seat 0 is a bot, kick the bot loop immediately — otherwise the
          // game sits on 'Waiting for Bot 1…' before anyone can act.
          const botResult = advanceBots(session.roomCode);
          broadcastGameViews(session.roomCode);
          if (botResult !== undefined && botResult.ok && botResult.gameOver) {
            broadcastToRoom(session.roomCode, { kind: 'gameOver', winners: botResult.winners, endReason: botResult.endReason });
          }
        } catch (e) {
          send(ws, { kind: 'error', message: (e as Error).message });
        }
        return;
      }

      case 'sendAction': {
        if (session.roomCode === null || session.clientId === null) {
          send(ws, { kind: 'actionRejected', reason: 'not in a room' });
          return;
        }
        const roomCode = session.roomCode;
        const host = hosts.get(roomCode);
        if (host === undefined || host.state === undefined) {
          send(ws, { kind: 'actionRejected', reason: 'game not started' });
          return;
        }
        const result = host.apply(session.clientId, msg.action);
        if (!result.ok) {
          send(ws, { kind: 'actionRejected', reason: result.reason });
          return;
        }
        // A bot stepping after the human's action can ALSO end the game
        // (e.g. a bot defeats Uroboros) — that ending must be broadcast too,
        // or every client sits on 'Waiting for Bot N…' forever.
        const botResult = advanceBots(roomCode);
        broadcastGameViews(roomCode);
        const ended = result.gameOver ? result : botResult;
        if (ended !== undefined && ended.ok && ended.gameOver) {
          broadcastToRoom(roomCode, { kind: 'gameOver', winners: ended.winners, endReason: ended.endReason });
        }
        return;
      }

      case 'sendChat': {
        if (session.roomCode === null) return;
        const room = roomStore.getRoom(session.roomCode);
        const seat = room?.players.find(p => p.clientId === session.clientId)?.seat ?? -1;
        broadcastToRoom(session.roomCode, { kind: 'chat', seat, text: msg.text });
        return;
      }

      case 'ping': {
        send(ws, { kind: 'pong', ts: msg.ts });
        return;
      }
    }
  };

  wss.on('connection', ws => {
    const session: Session = { clientId: null, roomCode: null, isSpectator: false };
    // Every connection immediately gets a client identity + reconnect token.
    issueIdentity(session, ws);
    send(ws, { kind: 'welcome', clientId: session.clientId as string, reconnectToken: [...tokens.entries()].find(([, c]) => c === session.clientId)?.[0] ?? '' });
    sessions.set(ws, session);
    ws.on('message', data => {
      const text = (data as Buffer).toString();
      try {
        handle(ws, session, text);
      } catch (e) {
        send(ws, { kind: 'error', message: (e as Error).message ?? 'internal error' });
      }
    });
    ws.on('close', () => {
      sessions.delete(ws);
      if (session.clientId !== null) byClient.delete(session.clientId);
      if (session.roomCode !== null) {
        watchersOf(session.roomCode).delete(ws);
        if (session.clientId !== null && !session.isSpectator) {
          disconnectPlayer(session.clientId, session.roomCode);
        }
      }
    });
    ws.on('error', () => {
      /* surfaced via close */
    });
  });

  // Heartbeat: ping every interval; dead sockets error out and close.
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined;
  const heartbeatMs = options.heartbeatMs ?? 30000;
  if (heartbeatMs > 0) {
    heartbeatHandle = setInterval(() => {
      for (const ws of sessions.keys()) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch {
            /* socket already closed */
          }
        }
      }
    }, heartbeatMs);
  }

  return {
    wss,
    port: () => {
      const addr = wss.address();
      return typeof addr === 'object' && addr !== null ? addr.port : -1;
    },
    close: () => {
      if (heartbeatHandle !== undefined) clearInterval(heartbeatHandle);
      for (const ws of sessions.keys()) {
        try {
          ws.terminate();
        } catch {
          /* already closed */
        }
      }
      sessions.clear();
      wss.close();
    },
  };
}

/** All-hidden per-seat view for spectators (public board intact). */
function hideAll(state: import('@re/game-core').GameState): import('@re/game-core').GameState {
  return {
    ...state,
    seats: state.seats.map(s => ({
      ...s,
      hand: s.hand.map((_, i) => `hidden-${i}`),
      inventory: s.inventory.map((_, i) => `hidden-${i}`),
      discard: s.discard.map((_, i) => `hidden-${i}`),
      playArea: s.playArea.map((_, i) => `hidden-${i}`),
    })),
  };
}