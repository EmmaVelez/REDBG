import type { JSX } from 'react';
import type { RoomSnapshot, PlayerInfo } from '@re/server';

/**
 * M4-T08: Lobby — create/join a room, pick a seat, add/remove bots (host),
 * and start. Bare-bones forms driven by the store's dispatch.
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
}

export function Lobby({ room, clientId, status, onCreateRoom, onJoinRoom, onSelectSeat, onAddBot, onRemoveBot, onStart }: LobbyProps): JSX.Element {
  const me: PlayerInfo | undefined = room?.players.find(p => p.clientId === clientId);
  const isHost = me?.seat === 0;

  return (
    <div className="lobby">
      <h1 className="lobby-title">Resident Evil Deck Builder</h1>
      {status !== 'connected' && <p className="lobby-status">Connecting… ({status})</p>}

      {room === null ? (
        <RoomEntry onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />
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