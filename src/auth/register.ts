import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { query } from "../db.js";

export const registerRouter = Router();

const RegisterSchema = z.object({
  client_name: z.string().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post"]).optional(),
  scope: z.string().optional(),
});

// RFC 7591 — Dynamic Client Registration
registerRouter.post("/oauth/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_client_metadata", error_description: parsed.error.message });
    return;
  }
  const meta = parsed.data;
  const isPublic = (meta.token_endpoint_auth_method ?? "none") === "none";

  const clientId = `mcp_${randomBytes(16).toString("hex")}`;
  const clientSecret = isPublic ? null : randomBytes(32).toString("base64url");
  const clientSecretHash = clientSecret ? createHash("sha256").update(clientSecret).digest("hex") : null;

  await query(
    `insert into mcp_oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, scope)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      clientId,
      clientSecretHash,
      meta.client_name ?? "MCP Client",
      meta.redirect_uris,
      isPublic ? "none" : "client_secret_post",
      meta.scope ?? "mcp",
    ]
  );

  res.status(201).json({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: meta.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: isPublic ? "none" : "client_secret_post",
    scope: meta.scope ?? "mcp",
  });
});
