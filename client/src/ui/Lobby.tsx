import type { JSX } from 'react';
import { useState } from 'react';
import type { RoomSnapshot, PlayerInfo } from '@re/server';

/**
 * M4-T08: Lobby — create/join a room, pick a seat, add/remove bots (host),
 * and start. Bare-bones forms driven by the store's dispatch.
 * M4-T10: a Pass & Play section starts an in-browser hot-seat game with
 * 2-4 named players on this device (no server).
 */

export interface LobbyProps {
  readonly room: RoomSnapshot | null;
  readonly clientId: string | null;
  readonly status: string;
  readonly onCreateRoom: (name: string) => void;
  readonly onJoinRoom: (roomCode: string, name: string) => void;
  readonly onSelectSeat: (seat: number) => void;
  readonly onAddBot: (seat: number | undefined) => void;
  readonly onRemoveBot: (seat: number) => void;
  readonly onStart: () => void;
  readonly onStartHotseat: (names: readonly string[]) => void;
}

const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

function PassAndPlay(props: { readonly onStart: (names: readonly string[]) => void }): JSX.Element {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<readonly string[]>([...DEFAULT_NAMES]);
  const setNameAt = (index: number, value: string): void => {
    setNames(prev => prev.map((n, i) => (i === index ? value : n)));
  };
  const effective = names.slice(0, count).map((n, i) => (n.trim() === '' ? (DEFAULT_NAMES[i] ?? `Player ${i + 1}`) : n.trim()));
  const ready = effective.length >= 2 && effective.every(n => n !== '');

  return (
    <div className="passandplay" data-testid="pass-and-play">
      <h2 className="lobby-section">Pass &amp; Play (this device)</h2>
      <p className="lobby-hint">No room or server needed — everyone shares this screen.</p>
      <div className="passandplay-count">
        {[2, 3, 4].map(n => (
          <button
            key={n}
            type="button"
            className={count === n ? 'count-btn count-btn-on' : 'count-btn'}
            onClick={() => setCount(n)}
          >
            {n} players
          </button>
        ))}
      </div>
      <div className="passandplay-names">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            className="passandplay-name"
            placeholder={DEFAULT_NAMES[i] ?? `Player ${i + 1}`}
            value={names[i] ?? ''}
            onChange={e => setNameAt(i, e.target.value)}
            aria-label={`Player ${i + 1} name`}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={!ready}
        onClick={() => props.onStart(effective)}
      >
        Start pass &amp; play
      </button>
    </div>
  );
}

export function Lobby({ room, clientId, status, onCreateRoom, onJoinRoom, onSelectSeat, onAddBot, onRemoveBot, onStart, onStartHotseat }: LobbyProps): JSX.Element {
  const me: PlayerInfo | undefined = room?.players.find(p => p.clientId === clientId);
  const isHost = me?.seat === 0;

  return (
    <div className="lobby">
      <h1 className="lobby-title">Resident Evil Deck Builder</h1>
      {status !== 'connected' && <p className="lobby-status">Connecting… ({status})</p>}

      {room === null ? (
        <div className="lobby-modes">
          <PassAndPlay onStart={onStartHotseat} />
          <div className="lobby-divider">— or play online —</div>
          <RoomEntry onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />
        </div>
      ) : (
        <div className="lobby-room">
          <p className="lobby-code">
            Room code: <strong>{room.roomCode}</strong>
          </p>
          <p className="lobby-phase">Phase: {room.phase}</p>

          <div className="lobby-seats">
            {Array.from({ length: room.maxSeats }, (_, seat) => {
              const sitter: PlayerInfo | undefined = room.players.find(p => p.seat === seat);
              return (
                <div key={seat} className={`seat ${seat === me?.seat ? 'seat-me' : ''}`} data-seat={seat}>
                  <span className="seat-number">Seat {seat}</span>
                  {sitter === undefined ? (
                    <>
                      <span className="seat-empty">Empty</span>
                      <button type="button" onClick={() => onSelectSeat(seat)}>
                        Take seat
                      </button>
                      {isHost && (
                        <button type="button" onClick={() => onAddBot(seat)}>
                          Add bot
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="seat-name">{[sitter.name, sitter.isBot ? '(bot)' : '', sitter.connected ? '' : '(disconnected)'].filter(Boolean).join(' ')}</span>
                      {sitter.isBot && isHost && (
                        <button type="button" onClick={() => onRemoveBot(seat)}>
                          Remove bot
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="lobby-actions">
            <button type="button" onClick={() => onAddBot(undefined)} disabled={!isHost}>
              Fill empty seats with bots
            </button>
            <button type="button" onClick={() => onStart()} disabled={!isHost || room.players.filter(p => p.seat >= 0).length < 2}>
              Start game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomEntry(props: { readonly onCreateRoom: (name: string) => void; readonly onJoinRoom: (code: string, name: string) => void }): JSX.Element {
  function handleCreate(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    if (typeof name === 'string' && name.trim() !== '') {
      props.onCreateRoom(name.trim());
    }
  }
  function handleJoin(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = fd.get('code');
    const name = fd.get('joinName');
    if (typeof code === 'string' && typeof name === 'string' && code.trim() !== '' && name.trim() !== '') {
      props.onJoinRoom(code.trim().toUpperCase(), name.trim());
    }
  }
  return (
    <div className="lobby-entry">
      <form className="lobby-form" onSubmit={handleCreate}>
        <input name="name" placeholder="Your name" required />
        <button type="submit">Create room</button>
      </form>
      <form className="lobby-form" onSubmit={handleJoin}>
        <input name="code" placeholder="Room code" required />
        <input name="joinName" placeholder="Your name" required />
        <button type="submit">Join room</button>
      </form>
    </div>
  );
}