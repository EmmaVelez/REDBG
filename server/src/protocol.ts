import type { Action, PlayerView, ScenarioId } from '@re/game-core';

/**
 * WebSocket wire protocol — the contract shared between the server and the
 * client. Every message is a discriminated union with a `kind` discriminant,
 * encoded as a single JSON string over the WebSocket.
 *
 * Two top-level families:
 * - ClientMessage — sent by a client to the server (rooms, seats, actions...)
 * - ServerMessage — sent by the server to a client (state, events, errors...)
 *
 * No shared state lives here: the server is authoritative and the protocol
 * only carries it. Room/host mechanics and per-player view sanitization are
 * implemented by later M3 tasks (rooms.ts, host.ts) against this contract.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** A player seated in a room (or waiting to be seated). */
export interface PlayerInfo {
  readonly clientId: string;
  readonly name: string;
  /** -1 while unseated. */
  readonly seat: number;
  readonly isBot: boolean;
  readonly connected: boolean;
  readonly mainCharacterId?: string;
  readonly partnerCharacterId?: string;
}

export type RoomPhase = 'lobby' | 'playing';

/** Snapshot of a room sent whenever the room's visible state changes. */
export interface RoomSnapshot {
  readonly roomCode: string;
  readonly phase: RoomPhase;
  readonly maxSeats: number;
  readonly scenario: ScenarioId;
  readonly players: readonly PlayerInfo[];
  /** Enable Partner Modification rules (Alliance expansion feature). */
  readonly partnerMode: boolean;
  /** Enable the Mercenaries Skill System (Skill cards, XP, draft). */
  readonly skillSystem: boolean;
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { readonly kind: 'createRoom'; readonly playerName: string; readonly scenario: ScenarioId; readonly partnerMode: boolean; readonly mainCharacterId?: string; readonly partnerCharacterId?: string; readonly skillSystem?: boolean }
  | { readonly kind: 'joinRoom'; readonly roomCode: string; readonly playerName: string }
  | { readonly kind: 'reconnect'; readonly token: string }
  | { readonly kind: 'leaveRoom' }
  /** Watch a room without playing: receive roomState + all-hidden stateSync. */
  | { readonly kind: 'spectate'; readonly roomCode: string }
  | { readonly kind: 'selectSeat'; readonly seat: number }
  /** Host control: fill an empty seat (or a specific seat) with a bot. */
  | { readonly kind: 'addBot'; readonly seat?: number }
  /** Host control: remove the bot sitting on `seat`. */
  | { readonly kind: 'removeBot'; readonly seat: number }
  /** Host control: change the scenario while still in the lobby. */
  | { readonly kind: 'setScenario'; readonly scenario: ScenarioId }
  /** Host control: enable/disable partner mode (Alliance expansion). */
  | { readonly kind: 'setPartnerMode'; readonly partnerMode: boolean }
  /** Host control: enable/disable the Mercenaries Skill System. */
  | { readonly kind: 'setSkillSystem'; readonly skillSystem: boolean }
  | { readonly kind: 'setCharacterSelection'; readonly mainCharacterId?: string; readonly partnerCharacterId?: string }
  /** Host control: start the game from the lobby. */
  | { readonly kind: 'startGame' }
  /** Send a game action to the authoritative server engine. */
  | { readonly kind: 'sendAction'; readonly action: Action }
  | { readonly kind: 'sendChat'; readonly text: string }
  | { readonly kind: 'ping'; readonly ts: number };

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  /** Sent once, immediately after the socket connects. */
  | { readonly kind: 'welcome'; readonly clientId: string; readonly reconnectToken: string }
  /** Room snapshot change (lobby updates, seat changes, bot adds/removes). */
  | { readonly kind: 'roomState'; readonly room: RoomSnapshot }
  /** The host started the game; stateSync messages follow. */
  | { readonly kind: 'gameStarted' }
  /** Per-player sanitized game view for THIS client's seat. */
  | { readonly kind: 'stateSync'; readonly view: PlayerView }
  /** A client-sent action was rejected (invalid for the current state). */
  | { readonly kind: 'actionRejected'; readonly reason: string }
  | { readonly kind: 'playerJoined'; readonly player: PlayerInfo }
  | { readonly kind: 'playerLeft'; readonly seat: number }
  | { readonly kind: 'seatChanged'; readonly clientId: string; readonly seat: number }
  | { readonly kind: 'hostChanged'; readonly seat: number }
  | { readonly kind: 'chat'; readonly seat: number; readonly text: string }
  | { readonly kind: 'gameOver'; readonly winners: readonly number[]; readonly endReason?: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'pong'; readonly ts: number };

export type WireMessage = ClientMessage | ServerMessage;

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

export interface DecodeSuccess {
  readonly ok: true;
  readonly msg: WireMessage;
}

export interface DecodeFailure {
  readonly ok: false;
  readonly error: string;
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

/** Serializes a wire message to a single JSON string (safe to send over WS). */
export function encodeMessage(msg: WireMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parses a raw WS payload back into a typed message. Unknown kinds, malformed
 * JSON, and structurally invalid messages are rejected.
 */
export function decodeMessage(raw: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  return validateMessage(parsed);
}

/** Structural validation of an unknown value into a WireMessage. */
export function validateMessage(value: unknown): DecodeResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'message must be an object' };
  }
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== 'string') {
    return { ok: false, error: 'message is missing a string kind' };
  }

  const k = kind as string;

  // Client kinds
  if (k === 'createRoom') {
    const m = value as { kind: string; playerName?: unknown; scenario?: unknown; partnerMode?: unknown; skillSystem?: unknown };
    if (typeof m.playerName !== 'string') {
      return { ok: false, error: 'createRoom requires a playerName string' };
    }
    if (m.scenario !== 'firstTimer' && m.scenario !== 'classicHorror' && m.scenario !== 'spyGames' && m.scenario !== 'whaddyaBuyin' && m.scenario !== 'battleHardenedVeteran' && m.scenario !== 'alliance' && m.scenario !== 'partnersInEscape' && m.scenario !== 'outbreak') {
      return { ok: false, error: 'createRoom requires a valid scenario' };
    }
    if (typeof m.partnerMode !== 'boolean') {
      return { ok: false, error: 'createRoom requires a partnerMode boolean' };
    }
    if (m.skillSystem !== undefined && typeof m.skillSystem !== 'boolean') {
      return { ok: false, error: 'createRoom requires a skillSystem boolean when present' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'setScenario') {
    const m = value as { kind: string; scenario?: unknown };
    if (m.scenario !== 'firstTimer' && m.scenario !== 'classicHorror' && m.scenario !== 'spyGames' && m.scenario !== 'whaddyaBuyin' && m.scenario !== 'battleHardenedVeteran' && m.scenario !== 'alliance' && m.scenario !== 'partnersInEscape' && m.scenario !== 'outbreak') {
      return { ok: false, error: 'setScenario requires a valid scenario' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'setPartnerMode') {
    const m = value as { kind: string; partnerMode?: unknown };
    if (typeof m.partnerMode !== 'boolean') {
      return { ok: false, error: 'setPartnerMode requires a partnerMode boolean' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'setSkillSystem') {
    const m = value as { kind: string; skillSystem?: unknown };
    if (typeof m.skillSystem !== 'boolean') {
      return { ok: false, error: 'setSkillSystem requires a skillSystem boolean' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'setCharacterSelection') {
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'leaveRoom' || k === 'startGame') {
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'joinRoom') {
    const m = value as { kind: string; roomCode?: unknown; playerName?: unknown };
    if (typeof m.roomCode !== 'string' || typeof m.playerName !== 'string') {
      return { ok: false, error: 'joinRoom requires roomCode and playerName strings' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'reconnect') {
    const m = value as { kind: string; token?: unknown };
    if (typeof m.token !== 'string') return { ok: false, error: 'reconnect requires a token string' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'spectate') {
    const m = value as { kind: string; roomCode?: unknown };
    if (typeof m.roomCode !== 'string') return { ok: false, error: 'spectate requires a roomCode string' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'selectSeat' || k === 'removeBot') {
    const m = value as { kind: string; seat?: unknown };
    if (typeof m.seat !== 'number' || !Number.isInteger(m.seat) || m.seat < 0) {
      return { ok: false, error: `${k} requires a non-negative integer seat` };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'addBot') {
    const m = value as { kind: string; seat?: unknown };
    if (m.seat !== undefined && (typeof m.seat !== 'number' || !Number.isInteger(m.seat) || m.seat < 0)) {
      return { ok: false, error: 'addBot seat must be a non-negative integer when present' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'sendAction') {
    const m = value as { kind: string; action?: unknown };
    if (typeof m.action !== 'object' || m.action === null) {
      return { ok: false, error: 'sendAction requires an action object' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'sendChat') {
    const m = value as { kind: string; text?: unknown };
    if (typeof m.text !== 'string') return { ok: false, error: 'sendChat requires a text string' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'ping') {
    const m = value as { kind: string; ts?: unknown };
    if (typeof m.ts !== 'number') return { ok: false, error: 'ping requires a numeric ts' };
    return { ok: true, msg: value as WireMessage };
  }

  // Server kinds
  if (k === 'welcome') {
    const m = value as { kind: string; clientId?: unknown; reconnectToken?: unknown };
    if (typeof m.clientId !== 'string' || typeof m.reconnectToken !== 'string') {
      return { ok: false, error: 'welcome requires clientId and reconnectToken strings' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'roomState') {
    const m = value as { kind: string; room?: unknown };
    if (typeof m.room !== 'object' || m.room === null) return { ok: false, error: 'roomState requires a room object' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'stateSync') {
    const m = value as { kind: string; view?: unknown };
    if (typeof m.view !== 'object' || m.view === null) return { ok: false, error: 'stateSync requires a view object' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'gameStarted' || k === 'playerLeft') {
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'actionRejected' || k === 'error') {
    const m = value as { kind: string; reason?: unknown; message?: unknown };
    const field: unknown = k === 'actionRejected' ? m.reason : m.message;
    if (typeof field !== 'string') return { ok: false, error: `${k} requires a string payload` };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'playerJoined') {
    const m = value as { kind: string; player?: unknown };
    if (typeof m.player !== 'object' || m.player === null) return { ok: false, error: 'playerJoined requires a player object' };
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'seatChanged' || k === 'hostChanged') {
    const m = value as { kind: string; seat?: unknown };
    if (typeof m.seat !== 'number' || !Number.isInteger(m.seat) || m.seat < 0) {
      return { ok: false, error: `${k} requires a non-negative integer seat` };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'chat') {
    const m = value as { kind: string; seat?: unknown; text?: unknown };
    if (typeof m.seat !== 'number' || typeof m.text !== 'string') {
      return { ok: false, error: 'chat requires a numeric seat and string text' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'gameOver') {
    const m = value as { kind: string; winners?: unknown };
    if (!Array.isArray(m.winners) || m.winners.some(w => typeof w !== 'number')) {
      return { ok: false, error: 'gameOver requires a numeric winners array' };
    }
    return { ok: true, msg: value as WireMessage };
  }
  if (k === 'pong') {
    const m = value as { kind: string; ts?: unknown };
    if (typeof m.ts !== 'number') return { ok: false, error: 'pong requires a numeric ts' };
    return { ok: true, msg: value as WireMessage };
  }

  return { ok: false, error: `unknown message kind: ${k}` };
}