/**
 * M5-T02 deploy smoke test — single-port static + WebSocket server.
 *
 * Exercises the REAL server entry (server/src/main.ts) against the built
 * client, covering everything the Render blueprint depends on:
 *   - /healthz probe
 *   - built SPA served at /
 *   - hashed /assets/* with correct MIME types
 *   - SPA fallback for extensionless routes
 *   - 404 for missing assets
 *   - no file outside the static root is ever served
 *   - WebSocket upgrade + a real round trip (welcome -> createRoom -> roomState)
 *
 * Prerequisites:
 *   node ../node_modules/vite/bin/vite.js build   (from client/)
 *   PORT=18080 STATIC_DIR=<repo>/client/dist npx tsx src/main.ts   (from server/)
 *
 * Usage:  npm run smoke -- --port 18080
 */
import http from 'node:http';
import { readdirSync } from 'node:fs';
import { WebSocket } from 'ws';

const argPort = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : '18080';
})();
const PORT = process.env.SMOKE_PORT ?? argPort;
const base = `http://127.0.0.1:${PORT}`;
const wsUrl = `ws://127.0.0.1:${PORT}`;
const DIST = 'client/dist';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(base + path, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolve({ status: res.statusCode, type: res.headers['content-type'] ?? '', body }),
      );
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  });
}

// --- static / HTTP -----------------------------------------------------------
console.log(`HTTP (${base}):`);
const health = await get('/healthz');
check('GET /healthz -> 200 ok', health.status === 200 && health.body === 'ok', `${health.status} ${JSON.stringify(health.body)}`);

const index = await get('/');
check('GET / -> 200 text/html', index.status === 200 && /text\/html/.test(index.type), `${index.status} ${index.type}`);
check('GET / serves the built app', /<div id="root">|<script type="module"/.test(index.body));

const assets = readdirSync(DIST + '/assets');
const jsAsset = assets.find((f) => /^index-.*\.js$/.test(f));
const cssAsset = assets.find((f) => /^index-.*\.css$/.test(f));
const svgAsset = assets.find((f) => f.endsWith('.svg'));

if (jsAsset) {
  const js = await get(`/assets/${jsAsset}`);
  check(`GET /assets/${jsAsset} -> 200 js`, js.status === 200 && /javascript/.test(js.type), `${js.status} ${js.type} ${(js.body.length / 1024).toFixed(0)}KB`);
} else {
  check('built js asset present in dist', false, `no index-*.js under ${DIST}/assets`);
}

if (cssAsset) {
  const css = await get(`/assets/${cssAsset}`);
  check(`GET /assets/${cssAsset} -> 200 css`, css.status === 200 && /css/.test(css.type), `${css.status} ${css.type}`);
}

if (svgAsset) {
  const svg = await get(`/assets/${svgAsset}`);
  check(`GET /assets/${svgAsset} -> 200 svg`, svg.status === 200 && /svg/.test(svg.type), `${svg.status} ${svg.type}`);
}

const spa = await get('/room/ABCDEF');
check('extensionless route -> 200 SPA fallback', spa.status === 200 && /text\/html/.test(spa.type), `${spa.status} ${spa.type}`);

const missing = await get('/assets/does-not-exist.js');
check('missing asset -> 404', missing.status === 404, `${missing.status}`);

const trav = await get('/..%2f..%2fpackage.json');
// Node's HTTP layer normalizes `..` before the handler sees it, so the
// in-handler guard is defence-in-depth; the property that matters is that a
// file outside the static root is never served.
check(
  'path traversal does not leak a file outside the static root',
  trav.status !== 200 && !trav.body.includes('workspaces'),
  `${trav.status} ${JSON.stringify(trav.body.slice(0, 40))}`,
);

// --- WebSocket ---------------------------------------------------------------
console.log(`WebSocket (${wsUrl}):`);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('ws timeout')), 8000);
  const ws = new WebSocket(wsUrl);
  const steps = [];

  const finish = (err) => {
    clearTimeout(timer);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    if (err) {
      fail++;
      console.log(`  FAIL ws flow — ${err.message}`);
      reject(err);
    } else {
      resolve();
    }
  };

  ws.on('open', () => steps.push('open(101)'));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.kind === 'welcome') {
      check('welcome + reconnectToken', typeof msg.clientId === 'string' && typeof msg.reconnectToken === 'string' && msg.reconnectToken.length > 0);
      ws.send(JSON.stringify({ kind: 'createRoom', playerName: 'Smoke', scenario: 'classicHorror', partnerMode: false }));
      return;
    }
    if (msg.kind === 'roomState') {
      const roomCode = msg.room?.roomCode ?? null;
      check('createRoom -> roomState', /^[A-Z2-9]{6}$/.test(roomCode ?? ''), `roomCode=${roomCode} phase=${msg.room?.phase}`);
      check('roomState has a seated player', (msg.room?.players?.length ?? 0) >= 1, `players=${msg.room?.players?.length}`);
      steps.push('createRoom');
      finish();
    }
  });
  ws.on('error', (e) => finish(e));
  ws.on('close', (code) => {
    if (steps.length === 0) finish(new Error(`closed early (${code})`));
  });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
