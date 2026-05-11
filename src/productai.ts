import { config } from "./config.js";
import { query } from "./db.js";

export const MODELS = [
  "gpt-low",
  "gpt-medium",
  "gpt-high",
  "kontext-pro",
  "kontext-max",
  "nanobananapro",
  "nanobanana",
  "seedream",
] as const;

export type Model = (typeof MODELS)[number];

const apiKeyCache = new Map<string, { key: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function fetchUserApiKey(userId: string): Promise<string> {
  const cached = apiKeyCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const r = await query<{ key: string }>(
    `select "key" from "ApiKeys"
     where "userId" = $1 and status = 'active'
     order by "createdAt" desc nulls last, "id" desc
     limit 1`,
    [Number(userId)]
  );
  const key = r.rows[0]?.key;
  if (!key) {
    throw new Error(
      "No active ProductAI API key found for this account. Create one at https://create.productai.photo/dashboard/api-access then try again."
    );
  }
  apiKeyCache.set(userId, { key, expiresAt: Date.now() + CACHE_TTL_MS });
  return key;
}

export async function productaiRequest(
  userId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const apiKey = await fetchUserApiKey(userId);
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
