import "express-async-errors";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { metadataRouter } from "./auth/metadata.js";
import { registerRouter } from "./auth/register.js";
import { authorizeRouter } from "./auth/authorize.js";
import { callbackRouter } from "./auth/callback.js";
import { tokenRouter } from "./auth/token.js";
import { requireBearer } from "./auth/middleware.js";
import { buildMcpServer } from "./mcp/server.js";
import { docsRouter } from "./docs.js";
import { installRouter } from "./install.js";

// Never crash the container on a stray rejection — log and keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, name: "productai-mcp-server" });
});

// OAuth 2.1 surface
app.use(metadataRouter);
app.use(registerRouter);
app.use(authorizeRouter);
app.use(callbackRouter);
app.use(tokenRouter);

// Public docs + one-page install landing
app.use(docsRouter);
app.use(installRouter);
// Static brand assets (logo PNGs/SVG, favicon)
const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets");
app.use("/assets", express.static(assetsDir, { maxAge: "7d", immutable: false }));
// Root → docs (so people hitting https://mcp.productai.photo/ in a browser land somewhere useful)
app.get("/", (_req, res) => res.redirect(302, "/docs"));

// Active MCP sessions, keyed by Mcp-Session-Id
const sessions = new Map<string, StreamableHTTPServerTransport>();

app.all("/mcp", requireBearer, async (req, res) => {
  const userId = req.mcpAuth!.sub;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let transport: StreamableHTTPServerTransport | undefined = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "No active session. Send an initialize request first." },
        id: null,
      });
      return;
    }
    const newTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, newTransport);
      },
    });
    newTransport.onclose = () => {
      if (newTransport.sessionId) sessions.delete(newTransport.sessionId);
    };
    const server = buildMcpServer(userId);
    await server.connect(newTransport);
    transport = newTransport;
  }

  // Cast away the SDK's stricter IncomingMessage.auth typing — our middleware
  // already verified the bearer and we pass userId via the MCP server closure.
  await transport.handleRequest(req as never, res, req.body);
});

// Top-level error handler — surfaces the error message instead of crashing.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[error] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "server_error", error_description: msg });
});

app.listen(config.port, () => {
  console.log(`[productai-mcp] listening on :${config.port} (public: ${config.publicUrl})`);
});
