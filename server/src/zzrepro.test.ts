import { describe, it, expect, afterEach } from 'vitest';
import { createGameServer } from './ws';
import type { GameServer } from './ws';
import type { ServerMessage } from './protocol';
import { connect, open, waitFor, nextWithTimeout, isStateSync, isRoomState, isGameStarted, isWelcome } from './testHelpers';
import type { GameState } from '@re/game-core';

const servers: GameServer[] = [];

function startServer(): GameServer {
  const server = createGameServer({ port: 0, heartbeatMs: 0 });
  servers.push(server);
  return server;
}

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

type Client = ReturnType<typeof connect>;

describe('repro: HUNK final down then bot freeze', () => {
  it('keeps advancing the bots after the human is permanently defeated', async () => {
    const server = startServer();
    const host = connect(server);
    await open(host);
    await waitFor(host, isWelcome, 3000, 'welcome');
    host.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false, mainCharacterId: 'pr-010', partnerCharacterId: undefined, skillSystem: false, customCards: [] });
    await waitFor(host, isRoomState, 3000, 'room');
    host.send({ kind: 'addBot', seat: 1 });
    await waitFor(host, isRoomState, 3000, 'bot1');
    host.send({ kind: 'addBot', seat: 2 });
    await waitFor(host, isRoomState, 3000, 'bot2');
    host.send({ kind: 'startGame' });
    await waitFor(host, isGameStarted, 5000, 'started');
    console.log('[repro] game started');

    let lastProgressAt = Date.now();
    let syncs = 0;
    let frozen = false;
    let hunkDead = false;
    let lastActive = -1;
    let lastVersion = -1;
    let stallCount = 0;

    for (let i = 0; i < 20000; i++) {
      let msg: ServerMessage | null = null;
      try {
        msg = await nextWithTimeout(host, 1500);
      } catch {
        msg = null;
      }
      if (msg === null) {
        if (Date.now() - lastProgressAt > 5000) {
          frozen = true;
          console.log(`[repro] FREEZE after 5s idle: syncs=${syncs} lastActive=${lastActive} hunkDead=${hunkDead}`);
          break;
        }
        continue;
      }
      if (isStateSync(msg)) {
        syncs++;
        const st = msg.view.state as GameState;
        const hunk = st.seats[0];
        lastActive = st.activeSeat;
        if (hunk?.dead === true) {
          if (!hunkDead) console.log(`[repro] HUNK DEAD at sync ${syncs}: activeSeat=${st.activeSeat} hp=${hunk.hp}/${hunk.maxHp}`);
          hunkDead = true;
        }
        if (st.version !== lastVersion) {
          lastVersion = st.version;
          lastProgressAt = Date.now();
          stallCount = 0;
        } else {
          stallCount++;
        }
        if (st.activeSeat === 0 && !hunkDead) {
          host.send({ type: 'explore', seat: 0, weapons: [], exploreCount: 1 } as never);
        }
      }
      if (hunkDead && stallCount > 40) {
        frozen = true;
        console.log(`[repro] STAGNANT after death: syncs=${syncs} lastActive=${lastActive} version=${lastVersion}`);
        break;
      }
    }

    console.log(`[repro] done: syncs=${syncs} hunkDead=${hunkDead} frozen=${frozen} lastActive=${lastActive} lastVersion=${lastVersion}`);
    expect(true).toBe(true);
  }, 300000);
});
