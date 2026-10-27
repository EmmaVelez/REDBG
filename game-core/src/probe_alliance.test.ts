import { it } from 'vitest';
import { pilesForScenario, SCENARIOS, PREMIER_CARDS } from './data/cards';
import { ALLIANCE_CARDS } from './data/alliance';
import { setup, startTurn } from './engine/game';

it('probe alliance set', () => {
  console.log('SCENARIOS ids:', JSON.stringify(SCENARIOS.map(s => s.id)));
  try {
    const p = pilesForScenario('alliance');
    console.log('alliance piles OK:', p.length);
  } catch (e) {
    console.log('pilesForScenario(alliance) THREW:', (e as Error).message);
  }
  console.log('PREMIER_CARDS count:', PREMIER_CARDS.length);
  console.log('ALLIANCE_CARDS count:', ALLIANCE_CARDS.length);
  console.log('ch-015 in PREMIER_CARDS?', PREMIER_CARDS.some(c => c.id === 'ch-015'));
  console.log('ch-015 in ALLIANCE_CARDS?', ALLIANCE_CARDS.some(c => c.id === 'ch-015'));
  // Can we even build the alliance scenario?
  try {
    const s = setup({ seed: 11, players: [{ name: 'A', controller: 'human' }, { name: 'B', controller: 'bot' }] }, PREMIER_CARDS, pilesForScenario('alliance'));
    console.log('setup with alliance piles OK, pile count:', Object.keys(s.marketPiles).length);
  } catch (e) {
    console.log('setup with alliance piles THREW:', (e as Error).message);
  }
});
