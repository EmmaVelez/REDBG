# Resident Evil Deck Builder (REDBG)

A browser-based, online multiplayer implementation of the **Resident Evil Deck Building Game**
(Bandai, 2010) — Premier Edition base set plus the **Nightmare**, **Alliance** and **Outbreak**
expansions, with AI-controlled players, invite-code rooms, and local pass-and-play.

> Personal/fan project. Game mechanics and card stats are implemented as data; card faces use
> placeholder rendering (and a set of art-only scans, see *Card art* below). No Bandai artwork
> is distributed.

---

## Requirements

- **Node.js 20+** (the Render blueprint pins `22.10.0`)
- **npm 9+** (workspaces)

## Quick start (development)

```bash
npm install
```

Then run the two processes in separate terminals:

```bash
# terminal 1 — game WebSocket server on :1724
npm run dev:server

# terminal 2 — Vite dev server on :5173
npm run dev:client
```

Open **http://localhost:5173**.

The client talks to `ws://localhost:1724` in dev. To point it at another server, use the
`?server=ws://host:1724` query parameter or set `VITE_WS_URL`.

## Production (single service)

The server serves the built client as static files **and** hosts the WebSocket on the same
port, so no second URL or CORS setup is needed.

```bash
npm run build            # typechecks + vite build into client/dist
npm start                # node/tsx server on $PORT (default 1724)
```

Open **http://localhost:1724**.

## Modes

| Mode | Where | Notes |
| --- | --- | --- |
| **Online room** | Lobby → Create/Join | 6-character invite code, up to 4 seats, bot slots, host controls start |
| **Pass-and-play** | Lobby → Hot-seat | 2–4 players on one device; the engine runs in the browser, hands are hidden between turns |
| **Bots** | Add from the lobby | Greedy 1-ply policy over the same legal-action list the UI uses |

## Scenarios

| id | Name |
| --- | --- |
| `firstTimer` | First Timer — guided intro |
| `classicHorror` | Classic Horror — the base-game scenario |
| `spyGames` | Spy Games — Master of Unlocking |
| `whaddyaBuyin` | Whaddya Buyin? — Merchant economy |
| `battleHardenedVeteran` | Battle Hardened Veteran |
| `partnersInEscape` | Partners in Escape *(Alliance)* |
| `alliance` | Alliance — stand-alone expansion |
| `outbreak` | Outbreak — infection levels + Infection Deck |

## Card sets

| File | Contents |
| --- | --- |
| `game-core/src/data/cards.ts` | Premier Edition base + promos (65 defs, 14 characters) |
| `game-core/src/data/nightmare.ts` | Nightmare expansion (50 defs, 10 characters) |
| `game-core/src/data/alliance.ts` | Alliance expansion (96 defs, 10 characters) |
| `game-core/src/data/outbreak.ts` | Outbreak expansion (52 defs, 13 characters) |

**47 characters** across the four sets have engine behaviour (the three Zombies have none by
design). `ALL_CARDS` = Premier + Alliance + Outbreak; the Nightmare set is **not** in it — a
Nightmare card id referenced by a scenario resolves to no definition and contributes nothing.

## Architecture

```
re-deck-builder/
├─ game-core/     pure TypeScript engine — no DOM, no I/O
│  ├─ src/types.ts        contract: CardDef, PlayerState, GameState, Action unions
│  ├─ src/engine/         reducer (GameState × Action → GameState), validate, explore, gainCard
│  ├─ src/ai/             enumerateLegalActions + heuristic bot policy
│  └─ src/data/           card database + scenario registry + CARD-ART/*.svg
├─ server/        Node + ws authoritative host: rooms, seats, per-seat sanitized views
└─ client/        Vite + React + zustand: lobby, board, hand, hot-seat
```

The engine is a **pure functional reducer** with a seeded RNG and a full action log, so the
server is authoritative, the bot is just another action source, and pass-and-play reuses the
exact same engine — all from one code path.

### Card art

`game-core/src/data/CARD-ART/<UPPERCASE-ID>.svg` holds art-only scans (decorative border, no
printed text). The client resolves them with an eager `import.meta.glob` — **dropping a new SVG
in that directory is all it takes**, no manifest and no copy step. Cards without art keep the
placeholder frame. The scans are 2–6 MB each (~68 MB dist); if rendering gets janky, the fix is
to pre-rasterize to PNG/WebP at ~3× card size, not to drop the art.

## Testing

```bash
npm run typecheck   # tsc --noEmit in all three workspaces
npm test            # vitest in all three workspaces
```

743 tests green at the M4 close: game-core 526, server 89, client 128.

The server suite drives real WebSocket connections (ephemeral ports) through a scripted
2-client game: lobby → seats → bot → start → multi-turn sanitized views → out-of-turn
rejection → reconnect → spectator.

### Deploy smoke test

`tools/smoke.mjs` checks the single-port production path end to end against the real
server entry: `/healthz`, the built SPA at `/`, hashed `/assets/*` MIME types, SPA
fallback, 404 for missing assets, no static-root escape, and a live WebSocket round
trip (welcome → createRoom → roomState).

```bash
npm run build
PORT=18080 STATIC_DIR=$(pwd)/client/dist npm run dev:server   # terminal 1
npm run smoke -- --port 18080                                # terminal 2
```

## Deployment

`render.yaml` at the repo root defines one free web service: the server serves `client/dist`
(SPA fallback, MIME map) **and** the WebSocket on the same port.

- build: `npm ci && npm rebuild esbuild && npm run build --workspace client`
- start: `npm run start --workspace server`
- health check: `/healthz`

Render's production install omits devDependencies, so anything the start command needs at
runtime (`tsx`, `ws`) lives in `dependencies`, not `devDependencies`.

Game state is in-memory only — every restart, redeploy or free-tier idle spin-down (~15 min)
loses all rooms and reconnect tokens.

## Known limitations

- Some card effect kinds are declared in `types.ts` but not yet consumed by the engine; a card
  carrying one plays as a silent no-op. `ABILITY_AUDIT.md` tracks the audit.
- Data transcribed from OCR'd rulebooks can be wrong; unverified values are marked in-repo.
- Rules questions are settled by the project owner and recorded as contract changes — see
  `docs/rules/RULES-DIGEST.md` and `HANDOFF.md`.

## Docs

| File | What |
| --- | --- |
| `PLAN.md` | Milestones M0–M5 |
| `HANDOFF.md` | Resume state + checklist |
| `LEDGER.jsonl` | Per-task outcome log |
| `ABILITY_AUDIT.md` | Card/ability implementation audit |
| `docs/rules/` | Rulebooks, scenario booklet, rules digest |
