import { config } from "./config.js";
import { query } from "./db.js";

// Image models — POST /api/generate
export const MODELS = [
  "gpt-2",
  "gpt-1.5",
  "gpt-low",
  "gpt-medium",
  "gpt-high",
  "kontext-pro",
  "kontext-max",
  "nanobananapro",
  "nanobanana",
  "nanobanana2",
  "seedream",
] as const;

export type Model = (typeof MODELS)[number];

// Video generation — POST /api/generate-video (Seedance 2.0)
export const VIDEO_MODEL = "seedance" as const;
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p", "4k"] as const;
export const VIDEO_ASPECT_RATIOS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

const API_KEY_NAME = (userId: string) => `Claude MCP (#${userId})`;
const API_KEY_LEN = 32;
const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const apiKeyCache = new Map<string, { key: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function randomKey(): string {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(API_KEY_LEN));
  for (let i = 0; i < API_KEY_LEN; i++) {
    s += KEY_ALPHABET[bytes[i]! % KEY_ALPHABET.length];
  }
  return s;
}

/**
 * Return an active relum API key for the given relum users.id, minting one
 * automatically if the user doesn't have one yet. This is what lets users
 * "just connect" from Claude without ever opening the ProductAI dashboard.
 */
export async function ensureApiKey(userId: string): Promise<string> {
  const cached = apiKeyCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const existing = await query<{ key: string }>(
    `select "key" from "ApiKeys"
     where "userId" = $1 and status = 'ACTIVE'
     order by "createdAt" desc nulls last, "id" desc
     limit 1`,
    [Number(userId)]
  );
  if (existing.rows[0]?.key) {
    apiKeyCache.set(userId, { key: existing.rows[0].key, expiresAt: Date.now() + CACHE_TTL_MS });
    return existing.rows[0].key;
  }

  // Mint a new key matching the relum-api format. Retry on the rare
  // collision against the global UNIQUE constraint.
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = randomKey();
    const last4 = key.slice(-4);
    const name = API_KEY_NAME(userId);
    try {
      await query(
        `insert into "ApiKeys" ("userId", name, "key", last4, status, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'ACTIVE', now(), now())
         on conflict ("name") do nothing`,
        [Number(userId), name, key, last4]
      );
      const verify = await query<{ key: string }>(
        `select "key" from "ApiKeys"
         where "userId" = $1 and status = 'ACTIVE'
         order by "createdAt" desc nulls last, "id" desc
         limit 1`,
        [Number(userId)]
      );
      if (verify.rows[0]?.key) {
        apiKeyCache.set(userId, { key: verify.rows[0].key, expiresAt: Date.now() + CACHE_TTL_MS });
        return verify.rows[0].key;
      }
    } catch (err) {
      // most likely a unique-key collision; try again
      continue;
    }
  }
  throw new Error("Could not provision a ProductAI API key for this account. Please try again or contact support.");
}

export async function productaiRequest(
  userId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const apiKey = await ensureApiKey(userId);
  const url = `${config.productaiApiBase}${path}`;
  const headers: Record<string, string> = { "x-api-key": apiKey };
  let payload: string | undefined;
  if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(url, { method, headers, body: payload });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ProductAI API error (${response.status}): ${text}`);
  }
  return response.json();
}

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/**
 * Upload raw image bytes to /api/upload-asset (multipart/form-data) and return
 * the hosted-URL response. Content-Type is intentionally left unset so fetch
 * adds the multipart boundary itself.
 */
export async function productaiUpload(
  userId: string,
  bytes: Uint8Array,
  mimeType: string,
  filename: string
): Promise<unknown> {
  const apiKey = await ensureApiKey(userId);
  const url = `${config.productaiApiBase}/api/upload-asset`;
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }), filename);
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ProductAI API error (${response.status}): ${text}`);
  }
  return response.json();
}
