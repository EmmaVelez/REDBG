import type { JSX } from 'react';
import type { GameState, PlayerState } from '@re/game-core';
import { defForInstance } from './cards';

export interface CharacterSkillsProps {
  readonly state: GameState;
  readonly seat: number;
}

export function CharacterSkills({ state, seat }: CharacterSkillsProps): JSX.Element {
  const player: PlayerState | undefined = state.seats[seat];
  
  if (player === undefined) {
    return <div className="character-skills" data-seat={seat}>—</div>;
  }
  
  const charDef = defForInstance(state, player.characterInstanceId);
  
  if (charDef === null) {
    return <div className="character-skills" data-seat={seat}>—</div>;
  }
  
  const rows: JSX.Element[] = [];
  
  for (const entry of charDef.levels ?? []) {
    const unlocked = player.level >= entry.level;
    const gate = entry.level === 1 ? charDef.level1At : charDef.level2At;
    
    if (gate !== undefined) {
      rows.push(
        <div key={entry.level} className={`skill-row ${unlocked ? 'skill-unlocked' : 'skill-locked'}`} data-level={entry.level}>
          <span className="skill-gate">{'Lv' + entry.level + ' · ' + gate + '★'}</span>
          <span className="skill-text">{entry.text}</span>
        </div>
      );
    } else {
      rows.push(
        <div key={entry.level} className={`skill-row ${unlocked ? 'skill-unlocked' : 'skill-locked'}`} data-level={entry.level}>
          <span className="skill-gate">{'Lv' + entry.level}</span>
          <span className="skill-text">{entry.text}</span>
        </div>
      );
    }
  }
  
  const nextGate = player.level === 0 ? charDef.level1At : charDef.level2At;
  const footerText = player.level >= 2 || nextGate === undefined ? 'MAX LEVEL' : 'Next: ' + nextGate + '★';
  
  return (
    <div className="character-skills" data-seat={seat}>
      {rows}
      <div className="skill-footer">
        <span className="skill-decorations">★ {player.decorations}</span>
        <span className="skill-next">{footerText}</span>
      </div>
    </div>
  );
}
