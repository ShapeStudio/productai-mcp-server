import { Router } from "express";
import { config } from "../config.js";

export const metadataRouter = Router();

// RFC 8414 — OAuth 2.0 Authorization Server Metadata
metadataRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: config.publicUrl,
    authorization_endpoint: `${config.publicUrl}/oauth/authorize`,
    token_endpoint: `${config.publicUrl}/oauth/token`,
    registration_endpoint: `${config.publicUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
    service_documentation: `${config.publicUrl}/docs`,
  });
});

// RFC 9728 — OAuth 2.0 Protected Resource Metadata (for MCP discovery)
metadataRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: config.publicUrl,
    authorization_servers: [config.publicUrl],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
});
