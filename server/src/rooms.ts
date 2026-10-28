import type { PlayerInfo, RoomPhase, RoomSnapshot } from './protocol';
import type { ScenarioId } from '@re/game-core';

/**
 * In-memory room store (M3-T02). Rooms hold players (humans + bots) in seats,
 * with a 6-char invite code and a host (the creator) who controls bots and
 * game start. Pure factory: createRoomStore() returns a fresh store whose
 * internal Map/bot-counter are closed over — two stores never share state.
 */

export interface Room {
  readonly roomCode: string;
  /** 'lobby' until the host starts the game, then 'playing'. */
  readonly phase: RoomPhase;
  readonly maxSeats: number;
  /** Which scenario's resource piles the game will use (host-set, lobby only). */
  readonly scenario: ScenarioId;
  /** All players, in join order (bots are players with isBot: true). */
  readonly players: readonly PlayerInfo[];
  /** Enable Partner Modification rules (Alliance expansion feature). */
  readonly partnerMode: boolean;
}

export interface RoomStore {
  readonly rooms: ReadonlyMap<string, Room>;
  /** Create a room; the creator becomes host seated at 0. Returns the new room. */
  createRoom(clientId: string, name: string, scenario?: ScenarioId, partnerMode?: boolean): Room;
  /** Add an unseated player (seat -1) to a lobby room. */
  joinRoom(roomCode: string, clientId: string, name: string): Room;
  /** Remove a player; host leaves -> lowest-seat remaining becomes host;
   *  room empty -> deleted. Returns undefined when the room was removed. */
  leaveRoom(roomCode: string, clientId: string): Room | undefined;
  /** Assign the player to a free seat. */
  selectSeat(roomCode: string, clientId: string, seat: number): Room;
  /** Host only, lobby only: add a bot to a seat (default: first free). */
  addBot(roomCode: string, hostClientId: string, seat?: number): Room;
  /** Host only, lobby only: remove the bot at a seat (only actual bots). */
  removeBot(roomCode: string, hostClientId: string, seat: number): Room;
  /** Host only, lobby only: change the scenario. */
  setScenario(roomCode: string, hostClientId: string, scenario: ScenarioId): Room;
  /** Host only, lobby only: set partner mode. */
  setPartnerMode(roomCode: string, hostClientId: string, partnerMode: boolean): Room;
  /** Host only, lobby only: flip phase to 'playing'. */
  startGame(roomCode: string, hostClientId: string): Room;
  /** Mark a player's connection state (used on ws open/close + reconnect). */
  setConnected(roomCode: string, clientId: string, connected: boolean): Room;
  getRoom(roomCode: string): Room | undefined;
  /** Converts a Room into the protocol snapshot shape. */
  toSnapshot(room: Room): RoomSnapshot;
}

/** 32-char confusion-free alphabet: no I, O, 0, 1. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_SEATS = 4;
const MAX_CODE_TRIES = 10;

export function createRoomStore(rand: () => number = Math.random): RoomStore {
  const rooms = new Map<string, Room>();
  /** roomCode -> clientId of the current host (default = creator). */
  const hosts = new Map<string, string>();
  let botCounter = 0;

  const generateCode = (): string => {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const index = Math.floor(rand() * ALPHABET.length);
      code += ALPHABET[index] ?? 'A';
    }
    return code;
  };

  const allocateCode = (): string => {
    for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
      const code = generateCode();
      if (!rooms.has(code)) {
        return code;
      }
    }
    throw new Error('could not allocate room code');
  };

  const requireRoom = (roomCode: string): Room => {
    const room = rooms.get(roomCode);
    if (room === undefined) {
      throw new Error('not found');
    }
    return room;
  };

  const requireLobby = (room: Room): void => {
    if (room.phase !== 'lobby') {
      throw new Error('game already started');
    }
  };

  const requireHost = (roomCode: string, hostClientId: string): void => {
    if (hosts.get(roomCode) !== hostClientId) {
      throw new Error('not the host');
    }
  };

  const findPlayer = (room: Room, clientId: string): PlayerInfo | undefined =>
    room.players.find(p => p.clientId === clientId);

  const seatOccupied = (room: Room, seat: number): boolean =>
    room.players.some(p => p.seat === seat);

  const save = (roomCode: string, room: Room): Room => {
    rooms.set(roomCode, room);
    return room;
  };

  return {
    rooms,

    createRoom(clientId: string, name: string, scenario: ScenarioId = 'firstTimer', partnerMode: boolean = false): Room {
      const roomCode = allocateCode();
      const room: Room = {
        roomCode,
        phase: 'lobby',
        maxSeats: MAX_SEATS,
        scenario,
        players: [{ clientId, name, seat: 0, isBot: false, connected: true }],
        partnerMode,
      };
      save(roomCode, room);
      hosts.set(roomCode, clientId);
      return room;
    },

    joinRoom(roomCode: string, clientId: string, name: string): Room {
      const room = requireRoom(roomCode);
      if (findPlayer(room, clientId) !== undefined) {
        throw new Error('already in room');
      }
      if (room.players.length >= room.maxSeats) {
        throw new Error('room is full');
      }
      const next: Room = {
        ...room,
        players: [
          ...room.players,
          { clientId, name, seat: -1, isBot: false, connected: true },
        ],
      };
      return save(roomCode, next);
    },

    leaveRoom(roomCode: string, clientId: string): Room | undefined {
      const room = rooms.get(roomCode);
      if (room === undefined) {
        return undefined;
      }
      const players = room.players.filter(p => p.clientId !== clientId);
      if (players.length === 0) {
        rooms.delete(roomCode);
        hosts.delete(roomCode);
        return undefined;
      }
      if (hosts.get(roomCode) === clientId) {
        // Host left: promote the remaining player with the lowest seat
        // value (including -1 for unseated players).
        let newHost: PlayerInfo | undefined;
        for (const p of players) {
          if (newHost === undefined || p.seat < newHost.seat) {
            newHost = p;
          }
        }
        if (newHost !== undefined) {
          hosts.set(roomCode, newHost.clientId);
        }
      }
      return save(roomCode, { ...room, players });
    },

    selectSeat(roomCode: string, clientId: string, seat: number): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      const player = findPlayer(room, clientId);
      if (player === undefined) {
        throw new Error('not in room');
      }
      if (seat < 0 || seat >= room.maxSeats) {
        throw new Error('invalid seat');
      }
      if (seatOccupied(room, seat)) {
        throw new Error('seat taken');
      }
      const next: Room = {
        ...room,
        players: room.players.map(p => (p.clientId === clientId ? { ...p, seat } : p)),
      };
      return save(roomCode, next);
    },

    addBot(roomCode: string, hostClientId: string, seat?: number): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      requireHost(roomCode, hostClientId);
      let targetSeat = seat;
      if (targetSeat === undefined) {
        targetSeat = -1;
        for (let s = 0; s < room.maxSeats; s++) {
          if (!seatOccupied(room, s)) {
            targetSeat = s;
            break;
          }
        }
        if (targetSeat === -1) {
          throw new Error('no free seats');
        }
      } else {
        if (targetSeat < 0 || targetSeat >= room.maxSeats) {
          throw new Error('invalid seat');
        }
        if (seatOccupied(room, targetSeat)) {
          throw new Error('seat taken');
        }
      }
      botCounter += 1;
      const bot: PlayerInfo = {
        clientId: `bot-${botCounter}`,
        name: `Bot ${botCounter}`,
        seat: targetSeat,
        isBot: true,
        connected: true,
      };
      const next: Room = { ...room, players: [...room.players, bot] };
      return save(roomCode, next);
    },

    removeBot(roomCode: string, hostClientId: string, seat: number): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      requireHost(roomCode, hostClientId);
      if (seat < 0 || seat >= room.maxSeats) {
        throw new Error('invalid seat');
      }
      const bot = room.players.find(p => p.seat === seat);
      if (bot === undefined || !bot.isBot) {
        throw new Error('not a bot');
      }
      const next: Room = {
        ...room,
        players: room.players.filter(p => p.clientId !== bot.clientId),
      };
      return save(roomCode, next);
    },

    setScenario(roomCode: string, hostClientId: string, scenario: ScenarioId): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      requireHost(roomCode, hostClientId);
      return save(roomCode, { ...room, scenario });
    },

    setPartnerMode(roomCode: string, hostClientId: string, partnerMode: boolean): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      requireHost(roomCode, hostClientId);
      return save(roomCode, { ...room, partnerMode });
    },

    startGame(roomCode: string, hostClientId: string): Room {
      const room = requireRoom(roomCode);
      requireLobby(room);
      requireHost(roomCode, hostClientId);
      return save(roomCode, { ...room, phase: 'playing' });
    },

    setConnected(roomCode: string, clientId: string, connected: boolean): Room {
      const room = requireRoom(roomCode);
      const player = findPlayer(room, clientId);
      if (player === undefined) {
        throw new Error('not in room');
      }
      const next: Room = {
        ...room,
        players: room.players.map(p => (p.clientId === clientId ? { ...p, connected } : p)),
      };
      return save(roomCode, next);
    },

    getRoom(roomCode: string): Room | undefined {
      return rooms.get(roomCode);
    },

    toSnapshot(room: Room): RoomSnapshot {
      return {
        roomCode: room.roomCode,
        phase: room.phase,
        maxSeats: room.maxSeats,
        scenario: room.scenario,
        players: room.players,
        partnerMode: room.partnerMode,
      };
    },
  };
}