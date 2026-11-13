import type { JSX } from 'react';
import { useState } from 'react';
import type { RoomSnapshot, PlayerInfo } from '@re/server';
import type { ScenarioId } from '@re/game-core';
import { SCENARIOS, PREMIER_CARDS, ALLIANCE_CARDS, NIGHTMARE_CARDS, CUSTOM_CARDS, POISON_OPTION_ID, POISON_BUNDLE, canBePartner } from '@re/game-core';

/** Custom characters are only selectable when the room enabled them. */
function selectableCharacters(room: RoomSnapshot): ReadonlyArray<typeof PREMIER_CARDS[number]> {
  return [...PREMIER_CARDS, ...ALLIANCE_CARDS, ...NIGHTMARE_CARDS, ...CUSTOM_CARDS].filter(c => {
    if (c.type !== 'character') return false;
    return c.set !== 'custom' || room.customCards.includes(c.id);
  });
}

/**
 * M4-T08: Lobby — create/join a room, pick a seat, add/remove bots (host),
 * and start. Bare-bones forms driven by the store's dispatch.
 * M4-T10: a Pass & Play section starts an in-browser hot-seat game with
 * 2-4 named players on this device (no server).
 * Scenarios: a <select> dropdown picks First Timer, Classic Horror, Spy
 * Games, Whaddya Buyin?, Battle Hardened Veteran, or Alliance for Pass & Play,
 * create-room, and host pre-start.
 */

export interface LobbyProps {
  readonly room: RoomSnapshot | null;
  readonly clientId: string | null;
  readonly status: string;
  readonly onCreateRoom: (name: string, scenario: ScenarioId, partnerMode: boolean, mainCharacterId: string | undefined, partnerCharacterId: string | undefined, skillSystem: boolean, customCards: readonly string[], mansionAttachmentMode: 1 | 2) => void;
  readonly onJoinRoom: (roomCode: string, name: string) => void;
  readonly onSelectSeat: (seat: number) => void;
  readonly onAddBot: (seat: number | undefined) => void;
  readonly onRemoveBot: (seat: number) => void;
  readonly onSetScenario: (scenario: ScenarioId) => void;
  readonly onSetPartnerMode: (partnerMode: boolean) => void;
  readonly onSetSkillSystem: (skillSystem: boolean) => void;
  readonly onSetCustomCards: (customCards: readonly string[]) => void;
  readonly onSetMansionAttachmentMode: (mansionAttachmentMode: 1 | 2) => void;
  readonly onSetCharacterSelection: (mainCharacterId?: string, partnerCharacterId?: string) => void;
  readonly onStart: () => void;
  readonly onStartHotseat: (names: readonly string[], scenario: ScenarioId, skillSystem: boolean, customCards: readonly string[], mansionAttachmentMode: 1 | 2) => void;
}

const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

function ScenarioDropdown(props: {
  readonly value: ScenarioId;
  readonly disabled?: boolean;
  readonly onChange: (scenario: ScenarioId) => void;
}): JSX.Element {
  return (
    <div className="scenario-picker">
      <label className="lobby-hint" htmlFor={`scenario-${props.value}`}>
        Scenario
      </label>
      <select
        id={`scenario-${props.value}`}
        className="scenario-select"
        value={props.value}
        disabled={props.disabled === true}
        onChange={e => props.onChange(e.target.value as ScenarioId)}
        data-testid="scenario-select"
      >
        {SCENARIOS.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <p className="scenario-desc">
        {SCENARIOS.find(s => s.id === props.value)?.description ?? ''}
      </p>
    </div>
  );
}

/**
 * Expandable Custom Cards picker — the fan-made card line (MX-001.., EX-001..).
 * Organized into grouped submenus for easier selection.
 * Selected cards join the game: Infected, Tokens → Mansion deck; Characters → Deal pool; 
 * Weapons/Ammo/Items → Resource Area piles. Poison bundles Web Spinner + Yawn + Blue Herb stack.
 */
function CustomCardsPicker(props: {
  readonly selected: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  readonly disabled?: boolean;
}): JSX.Element {
  const bundled = new Set(POISON_BUNDLE);
  const toggle = (id: string, checked: boolean): void => {
    props.onChange(checked ? [...props.selected, id] : props.selected.filter(x => x !== id));
  };

  // Group cards by type. Cards inside the POISON_BUNDLE are represented by
  // the single bundle check below, so they are left out of the groups.
  const characters = CUSTOM_CARDS.filter(c => c.type === 'character' && !bundled.has(c.id));
  const infectionTokens = CUSTOM_CARDS.filter(c =>
    (c.type === 'infected' || c.type === 'token' || c.mansion === true) && !bundled.has(c.id)
  );
  const resourceAreaCards = CUSTOM_CARDS.filter(c =>
    (c.type === 'weapon' || c.type === 'ammunition' || c.type === 'item') &&
    c.mansion !== true &&
    !bundled.has(c.id)
  );
  const otherCards = CUSTOM_CARDS.filter(c =>
    (c.type === 'event' || c.type === 'action' || c.type === 'counter') && !bundled.has(c.id)
  );
  // Mercenaries Skill cards join the Skill deck when the Skill System is on.
  const skills = CUSTOM_CARDS.filter(c => c.type === 'skill' && !bundled.has(c.id));
  const allCustomCardIds = CUSTOM_CARDS.filter(c => !bundled.has(c.id)).map(c => c.id);

  const allSelected = allCustomCardIds.every(id => props.selected.includes(id));
  const toggleAll = (checked: boolean): void => {
    if (checked) {
      // Add all custom cards
      const toAdd = allCustomCardIds.filter(id => !props.selected.includes(id));
      props.onChange([...props.selected, ...toAdd]);
    } else {
      // Remove all custom cards
      props.onChange(props.selected.filter(id => !allCustomCardIds.includes(id)));
    }
  };

  const allCharactersSelected = characters.every(c => props.selected.includes(c.id));
  const toggleAllCharacters = (checked: boolean): void => {
    const charIds = characters.map(c => c.id);
    if (checked) {
      const toAdd = charIds.filter(id => !props.selected.includes(id));
      props.onChange([...props.selected, ...toAdd]);
    } else {
      props.onChange(props.selected.filter(id => !charIds.includes(id)));
    }
  };

  return (
    <details className="custom-cards" data-testid="custom-cards">
      <summary className="custom-cards-summary">Custom Cards ({props.selected.length} selected)</summary>
      <p className="lobby-hint">Fan-made cards. Selected cards join the game — Infected/Tokens and other Mansion cards go to the Mansion deck, Characters enter the deal pool, Weapons/Ammo/Items get Resource Area piles.</p>

      {/* Add All Custom Cards */}
      <label className="custom-card-row custom-card-row-all">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={props.disabled === true}
          onChange={e => toggleAll(e.target.checked)}
          data-testid="custom-card-all"
        />
        <span><strong>Add All Custom Cards</strong></span>
      </label>

      {/* Character Cards Section */}
      <details className="custom-card-section">
        <summary className="custom-card-section-title"> Characters</summary>
        <label className="custom-card-row custom-card-row-sub">
          <input
            type="checkbox"
            checked={allCharactersSelected}
            disabled={props.disabled === true}
            onChange={e => toggleAllCharacters(e.target.checked)}
            data-testid="custom-card-all-characters"
          />
          <span><em>Add All Characters</em></span>
        </label>
        {characters.map(c => (
          <label key={c.id} className="custom-card-row">
            <input
              type="checkbox"
              checked={props.selected.includes(c.id)}
              disabled={props.disabled === true}
              onChange={e => toggle(c.id, e.target.checked)}
              data-testid={`custom-card-${c.id}`}
            />
            <span>{c.id.toUpperCase()} {c.name}</span>
          </label>
        ))}
      </details>

      {/* Mansion Deck Cards Section */}
      <details className="custom-card-section">
        <summary className="custom-card-section-title">🏠 Mansion Deck Cards</summary>
        <p className="lobby-hint-small">Infected, tokens, and other Mansion-flagged cards are shuffled into the Mansion deck.</p>
        {infectionTokens.map(c => (
          <label key={c.id} className="custom-card-row">
            <input
              type="checkbox"
              checked={props.selected.includes(c.id)}
              disabled={props.disabled === true}
              onChange={e => toggle(c.id, e.target.checked)}
              data-testid={`custom-card-${c.id}`}
            />
            <span>{c.id.toUpperCase()} {c.name} ({c.type})</span>
          </label>
        ))}
      </details>

      {/* Resource Area Cards Section */}
      <details className="custom-card-section">
        <summary className="custom-card-section-title">⚔️ Resource Area Cards</summary>
        <p className="lobby-hint-small">Weapons, Ammo, and Items get their own Resource Area pile.</p>
        {resourceAreaCards.map(c => (
          <label key={c.id} className="custom-card-row">
            <input
              type="checkbox"
              checked={props.selected.includes(c.id)}
              disabled={props.disabled === true}
              onChange={e => toggle(c.id, e.target.checked)}
              data-testid={`custom-card-${c.id}`}
            />
            <span>{c.id.toUpperCase()} {c.name} ({c.type})</span>
          </label>
        ))}
      </details>

      {/* Mercenaries Skill Cards Section */}
      {skills.length > 0 && (
        <details className="custom-card-section">
          <summary className="custom-card-section-title">🎖️ Mercenaries Skills</summary>
          <p className="lobby-hint-small">Join the Mercenaries Skill deck when the Skill System modification is on.</p>
          {skills.map(c => (
            <label key={c.id} className="custom-card-row">
              <input
                type="checkbox"
                checked={props.selected.includes(c.id)}
                disabled={props.disabled === true}
                onChange={e => toggle(c.id, e.target.checked)}
                data-testid={`custom-card-${c.id}`}
              />
              <span>{c.id.toUpperCase()} {c.name} ({c.type})</span>
            </label>
          ))}
        </details>
      )}

      {/* Other Cards Section */}
      <details className="custom-card-section">
        <summary className="custom-card-section-title">✨ Other Cards</summary>
        {otherCards.map(c => (
          <label key={c.id} className="custom-card-row">
            <input
              type="checkbox"
              checked={props.selected.includes(c.id)}
              disabled={props.disabled === true}
              onChange={e => toggle(c.id, e.target.checked)}
              data-testid={`custom-card-${c.id}`}
            />
            <span>{c.id.toUpperCase()} {c.name} ({c.type})</span>
          </label>
        ))}
      </details>

      {/* Poison Bundle */}
      <label className="custom-card-row custom-card-row-bundle">
        <input
          type="checkbox"
          checked={props.selected.includes(POISON_OPTION_ID)}
          disabled={props.disabled === true}
          onChange={e => toggle(POISON_OPTION_ID, e.target.checked)}
          data-testid={`custom-card-${POISON_OPTION_ID}`}
        />
        <span>🧪 POISON BUNDLE — Enables: 2×Web Spinner + 2×Yawn in Mansion, 5×Blue Herbs (stack), poison counters</span>
      </label>
    </details>
  );
}

function PassAndPlay(props: {
  readonly onStart: (names: readonly string[], scenario: ScenarioId, skillSystem: boolean, customCards: readonly string[], mansionAttachmentMode: 1 | 2) => void;
}): JSX.Element {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<readonly string[]>([...DEFAULT_NAMES]);
  const [scenario, setScenario] = useState<ScenarioId>('firstTimer');
  const [skillSystem, setSkillSystem] = useState(false);
  const [customCards, setCustomCards] = useState<readonly string[]>([]);
  const [mansionAttachmentMode, setMansionAttachmentMode] = useState<1 | 2>(1);
  const setNameAt = (index: number, value: string): void => {
    setNames(prev => prev.map((n, i) => (i === index ? value : n)));
  };
  const effective = names.slice(0, count).map((n, i) => (n.trim() === '' ? (DEFAULT_NAMES[i] ?? `Player ${i + 1}`) : n.trim()));
  const ready = effective.length >= 2 && effective.every(n => n !== '');

  // Check if any selected custom cards are attachment events
  const hasAttachmentCards = customCards.some(id => {
    const card = CUSTOM_CARDS.find(c => c.id === id);
    return card?.type === 'event' && card?.attachmentMode !== undefined;
  });

  return (
    <div className="passandplay" data-testid="pass-and-play">
      <h2 className="lobby-section">Pass &amp; Play (this device)</h2>
      <p className="lobby-hint">No room or server needed — everyone shares this screen.</p>
      <ScenarioDropdown value={scenario} onChange={setScenario} />
      <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
        <input
          type="checkbox"
          checked={skillSystem}
          onChange={e => setSkillSystem(e.target.checked)}
          data-testid="hotseat-skill-system-toggle"
        />
        <span style={{ marginLeft: '6px', fontSize: '0.9em' }}>Skill System (Mercenaries)</span>
      </label>
      <CustomCardsPicker selected={customCards} onChange={setCustomCards} />
      {hasAttachmentCards && (
        <div className="mansion-attachment-mode" style={{ marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Mansion Attachment Mode:</span>
            <select
              value={mansionAttachmentMode}
              onChange={e => setMansionAttachmentMode(Number(e.target.value) as 1 | 2)}
              data-testid="hotseat-mansion-attachment-mode"
            >
              <option value={1}>Single (new replaces old)</option>
              <option value={2}>Multiple (all stack)</option>
            </select>
          </label>
        </div>
      )}
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
        onClick={() => props.onStart(effective, scenario, skillSystem, customCards, mansionAttachmentMode)}
      >
        Start pass &amp; play
      </button>
    </div>
  );
}

export function Lobby({
  room,
  clientId,
  status,
  onCreateRoom,
  onJoinRoom,
  onSelectSeat,
  onAddBot,
  onRemoveBot,
  onSetScenario,
  onSetPartnerMode,
  onSetSkillSystem,
  onSetCustomCards,
  onSetMansionAttachmentMode,
  onSetCharacterSelection,
  onStart,
  onStartHotseat,
}: LobbyProps): JSX.Element {
  const me: PlayerInfo | undefined = room?.players.find(p => p.clientId === clientId);
  const isHost = me?.seat === 0;
  const scenarioName = room ? (SCENARIOS.find(s => s.id === room.scenario)?.name ?? room.scenario) : '';

  return (
    <div className="lobby">
      <h1 className="lobby-title">Resident Evil Deck Builder</h1>
      {status !== 'connected' && <p className="lobby-status">Connecting… ({status})</p>}

      {room === null ? (
        <div className="lobby-modes">
          <RoomEntry onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />
          <div className="lobby-divider">— or pass &amp; play —</div>
          <PassAndPlay onStart={onStartHotseat} />
        </div>
      ) : (
        <div className="lobby-room">
          <p className="lobby-code">
            Room code: <strong>{room.roomCode}</strong>
          </p>
          <p className="lobby-phase">
            Phase: {room.phase} · Scenario: <strong>{scenarioName}</strong>
          </p>

          {isHost && room.phase === 'lobby' && (
            <>
              <div className="lobby-scenario-edit">
                <ScenarioDropdown value={room.scenario} onChange={onSetScenario} />
              </div>
              <div className="lobby-partner-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={room.partnerMode}
                    onChange={e => onSetPartnerMode(e.target.checked)}
                  />
                  {' '}Partner Mode (Alliance expansion rules)
                </label>
              </div>
              <div className="lobby-partner-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={room.skillSystem}
                    onChange={e => onSetSkillSystem(e.target.checked)}
                    data-testid="skill-system-toggle"
                  />
                  {' '}Skill System (Mercenaries expansion)
                </label>
              </div>
              <CustomCardsPicker selected={room.customCards} onChange={onSetCustomCards} />
              {room.customCards.some(id => {
                const card = CUSTOM_CARDS.find(c => c.id === id);
                return card?.type === 'event' && card?.attachmentMode !== undefined;
              }) && (
                <div className="mansion-attachment-mode" style={{ marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Mansion Attachment Mode:</span>
                    <select
                      value={room.mansionAttachmentMode ?? 1}
                      onChange={e => onSetMansionAttachmentMode(Number(e.target.value) as 1 | 2)}
                      data-testid="mansion-attachment-mode"
                    >
                      <option value={1}>Single (new replaces old)</option>
                      <option value={2}>Multiple (all stack)</option>
                    </select>
                  </label>
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>
                  Main character:
                  <select value={me?.mainCharacterId ?? ''} onChange={e => onSetCharacterSelection(e.target.value || undefined, me?.partnerCharacterId)}>
                    <option value="">Random</option>
                    {selectableCharacters(room).filter(c => {
                      const taken = new Set(room.players.flatMap(p => [p.mainCharacterId, p.partnerCharacterId]).filter(Boolean) as string[]);
                      return !taken.has(c.id) || c.id === me?.mainCharacterId;
                    }).map(c => <option key={c.id} value={c.id}>{c.id.toUpperCase()} {c.name}</option>)}
                  </select>
                </label>
                {room.partnerMode && (
                  <label style={{ display: 'block', fontSize: '0.9em', marginTop: '4px' }}>
                    Partner character:
                    <select value={me?.partnerCharacterId ?? ''} onChange={e => onSetCharacterSelection(me?.mainCharacterId, e.target.value || undefined)}>
                      <option value="">Random</option>
                      {/* Chris (ch-008) cannot receive attachments and
                          Sherry (fch-008) is a support character, so both
                          can only ever be Main characters — never Partners. */}
                      {selectableCharacters(room).filter(c => canBePartner(c)).filter(c => {
                        const taken = new Set(room.players.flatMap(p => [p.mainCharacterId, p.partnerCharacterId]).filter(Boolean) as string[]);
                        return !taken.has(c.id) || c.id === me?.partnerCharacterId;
                      }).map(c => <option key={c.id} value={c.id}>{c.id.toUpperCase()} {c.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}

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

function RoomEntry(props: {
  readonly onCreateRoom: (name: string, scenario: ScenarioId, partnerMode: boolean, mainCharacterId: string | undefined, partnerCharacterId: string | undefined, skillSystem: boolean, customCards: readonly string[], mansionAttachmentMode: 1 | 2) => void;
  readonly onJoinRoom: (code: string, name: string) => void;
}): JSX.Element {
  const [scenario, setScenario] = useState<ScenarioId>('firstTimer');
  const [partnerMode, setPartnerMode] = useState(false);
  const [skillSystem, setSkillSystem] = useState(false);
  const [customCards, setCustomCards] = useState<readonly string[]>([]);
  const [mansionAttachmentMode, setMansionAttachmentMode] = useState<1 | 2>(1);
  const [mainChar, setMainChar] = useState<string>('');
  const [partnerChar, setPartnerChar] = useState<string>('');
  const allianceChars = [...PREMIER_CARDS, ...ALLIANCE_CARDS, ...NIGHTMARE_CARDS].filter(c => c.type === 'character');
  function handleCreate(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    if (typeof name === 'string' && name.trim() !== '') {
      props.onCreateRoom(name.trim(), scenario, partnerMode, undefined, undefined, skillSystem, customCards, mansionAttachmentMode);
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
      <div className="lobby-entry-scenario">
        <ScenarioDropdown value={scenario} onChange={setScenario} />
        <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
          <input
            type="checkbox"
            checked={partnerMode}
            onChange={e => setPartnerMode(e.target.checked)}
          />
          <span style={{ marginLeft: '6px', fontSize: '0.9em' }}>Partner Mode</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
          <input
            type="checkbox"
            checked={skillSystem}
            onChange={e => setSkillSystem(e.target.checked)}
            data-testid="skill-system-toggle"
          />
          <span style={{ marginLeft: '6px', fontSize: '0.9em' }}>Skill System (Mercenaries)</span>
        </label>
        <CustomCardsPicker selected={customCards} onChange={setCustomCards} />
        {customCards.some(id => {
          const card = CUSTOM_CARDS.find(c => c.id === id);
          return card?.type === 'event' && card?.attachmentMode !== undefined;
        }) && (
          <div className="mansion-attachment-mode" style={{ marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Mansion Attachment Mode:</span>
              <select
                value={mansionAttachmentMode}
                onChange={e => setMansionAttachmentMode(Number(e.target.value) as 1 | 2)}
                data-testid="create-mansion-attachment-mode"
              >
                <option value={1}>Single (new replaces old)</option>
                <option value={2}>Multiple (all stack)</option>
              </select>
            </label>
          </div>
        )}
      </div>
      <form className="lobby-form" onSubmit={handleJoin}>
        <input name="code" placeholder="Room code" required />
        <input name="joinName" placeholder="Your name" required />
        <button type="submit">Join room</button>
      </form>
    </div>
  );
}