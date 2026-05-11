import type { Request, Response, NextFunction } from "express";
import { verifyMcpToken, type McpClaims } from "./tokens.js";
import { config } from "../config.js";

declare module "express-serve-static-core" {
  interface Request {
    mcpAuth?: McpClaims;
  }
}

export async function requireBearer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res
      .status(401)
      .header(
        "WWW-Authenticate",
        `Bearer realm="${config.publicUrl}", resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource"`
      )
      .json({ error: "unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    req.mcpAuth = await verifyMcpToken(token, "access");
    next();
  } catch {
    res
      .status(401)
      .header(
        "WWW-Authenticate",
        `Bearer error="invalid_token", resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource"`
      )
      .json({ error: "invalid_token" });
  }
}
