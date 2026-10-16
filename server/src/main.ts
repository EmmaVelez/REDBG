import { createGameServer } from "./ws";

/**
 * Runnable server entry (npm run start --workspace server, or `tsx server/src/main.ts`).
 * Binds on the configured port; defaults to 1724 (Raccoon City easter egg).
 */
const port = Number(process.env.PORT ?? "1724");
const server = createGameServer({ port });

const addr = server.wss.address();
const boundPort = typeof addr === "object" && addr !== null ? addr.port : port;
console.log(`[re-deck-builder] server listening on ws://localhost:${boundPort}`);