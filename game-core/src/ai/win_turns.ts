/** Quick comparison: outbreak vs firstTimer */
import { playBotGame } from './sim';
import type { GameState } from '../types';
import { checkWin } from '../engine/game';

for (const scenario of ['outbreak' as const, 'firstTimer' as const]) {
  const NUM = 30;
  const MAX_ACTIONS = 1000;
  let normalCount = 0;
  let capCount = 0;
  const allEndTurns: number[] = [];
  
  for (let g = 0; g < NUM; g++) {
    const result = playBotGame({
      seed: g + 1,
      scenario,
      difficulties: ['hard','hard','hard','hard'],
      maxActions: MAX_ACTIONS,
    });

    if (result.ended === 'gameOver') normalCount++;
    else capCount++;

    const winInfo = checkWin(result.state as unknown as GameState);
    
    const eTcounts = [0,0,0,0];
    for (const entry of result.state.log) {
      if (entry.action.type === 'endTurn' && 'seat' in entry.action) {
        const s = (entry.action as any).seat as number;
        if (s >= 0 && s < 4) eTcounts[s] += 1;
      }
    }
    
    const totalET = eTcounts.reduce((a:number,b:number) => a+b, 0);
    allEndTurns.push(totalET);
  }

  console.log(`\n${scenario}: ${NUM} games | Normal: ${normalCount} | Cap: ${capCount}`);
  if (allEndTurns.length > 0) {
    const avg = allEndTurns.reduce((a:number,b:number) => a+b, 0) / allEndTurns.length;
    // Split at 200 eT threshold (short = normal death ending, long = infinite survival)
    const normalGames = allEndTurns.filter(e => e <= 200);
    const cappedGames = allEndTurns.filter(e => e > 200);
    if (normalGames.length > 0) {
      const nAvg = normalGames.reduce((a,b:number)=>a+b,0)/normalGames.length;
      console.log(`  Death-endings (eT<=200): ${normalGames.length}, avg eT=${nAvg.toFixed(0)}, est rounds=${(nAvg/4).toFixed(1)}`);
    }
    if (cappedGames.length > 0) {
      const cAvg = cappedGames.reduce((a,b:number)=>a+b,0)/cappedGames.length;
      console.log(`  Survival/cap (eT>200): ${cappedGames.length}, avg eT=${cAvg.toFixed(0)}, est rounds=${(cAvg/4).toFixed(1)} (infinite)`);
    }
    console.log(`  Overall avg eT: ${avg.toFixed(0)}, est rounds: ${(avg/4).toFixed(1)}, range: ${Math.min(...allEndTurns)}-${Math.max(...allEndTurns)}`);
  }
}
