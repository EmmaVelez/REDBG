import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { createGameServer } from './ws';

/**
 * Runnable server entry (npm run start --workspace server).
 *
 * Two paths:
 * - local dev (no STATIC_DIR / no built client): binds the game WebSocket on
 *   PORT (default 1724) exactly like before — the Vite dev server serves the
 *   client separately.
 * - Render single-service: one HTTP server serves the built client from
 *   STATIC_DIR (Vite build output, SPA fallback to index.html) AND hosts the
 *   game WebSocket on the same origin/port, so the browser's wss:// page-host
 *   default in the client works with no CORS and no second URL.
 */

const port = Number(process.env.PORT ?? "1724");

/** Static root candidates, first existing wins (Render sets STATIC_DIR). */
const staticCandidates = (): string[] => {
  const explicit = process.env.STATIC_DIR;
  const fromServerPkg = resolve(process.cwd(), "../client/dist");
  const fromRepoRoot = resolve(process.cwd(), "client/dist");
  const list = explicit !== undefined && explicit !== "" ? [explicit] : [];
  return [...list, fromServerPkg, fromRepoRoot];
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function serveStatic(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const root = staticCandidates().find((dir) => {
    try {
      return stat(dir).then((s) => s.isDirectory(), () => false);
    } catch {
      return false;
    }
  });
  if (root === undefined) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("client build not found (set STATIC_DIR or run the client build)");
    return;
  }

  const pathname = (req.url ?? "/").split("?")[0] ?? "/";
  // SPA fallback: paths that are not static assets get index.html (the app is
  // a single page; safe for the lobby/board views and any future deep links).
  const hasExt = extname(pathname) !== "";
  const file = hasExt
    ? join(root, pathname.replace(/^\/+/, ""))
    : join(root, "index.html");
  const mime = MIME[extname(file)] ?? "application/octet-stream";

  // Path traversal guard: resolved file must stay inside the static root.
  // Both sides are normalized through resolve() so this also works when the
  // configured root and the file path use different separators (env var vs
  // Windows-native paths).
  const resolved = resolve(file);
  const rootResolved = resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
    return;
  }

  try {
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(resolved);
    res.writeHead(200, { "content-type": mime, "content-length": body.length });
    res.end(body);
  } catch {
    if (!hasExt) {
      // Routable path always falls back to the SPA entry.
      try {
        const body = await readFile(join(root, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
        return;
      } catch {
        /* fallthrough to 404 */
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}

const httpServer = createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0] ?? "/";
  // Render health checks / uptime probe.
  if (pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  void serveStatic(req, res);
});

const server = createGameServer({ httpServer });

// ws with { server } does not listen on its own — the HTTP server is the
// single listener; WebSocket upgrades are handled by the attached wss.
httpServer.listen(port, () => {
  const addr = server.wss.address();
  const boundPort = typeof addr === "object" && addr !== null ? addr.port : port;
  console.log(`[re-deck-builder] server listening on :${boundPort} (ws + static)`);
});
