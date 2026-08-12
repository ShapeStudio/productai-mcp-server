import { createHash } from "node:crypto";

/**
 * Client-side integrity checks for upload_asset payloads.
 *
 * Context: during the 2026-08-12 Pixelcut benchmark, two images passed as
 * base64 `data` arrived byte-mangled (an LLM client emitting a multi-KB
 * base64 string dropped/fabricated spans of it) and were re-hosted as
 * broken files. The relum API now runs a full image decode server-side;
 * this module adds the cheap checks we can do here — magic-byte sniffing
 * and an optional caller-supplied SHA-256 that proves the bytes survived
 * transit — so bad payloads fail fast with an actionable message.
 */

export type SniffedMime = "image/png" | "image/jpeg" | "image/webp";

export interface PreparedUpload {
  ok: true;
  mimeType: SniffedMime;
  ext: string;
  sha256: string;
  byteLength: number;
}

export interface RejectedUpload {
  ok: false;
  error: string;
}

const MIME_EXT: Record<SniffedMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Identify the actual image container from its magic bytes. */
export function sniffImageFormat(bytes: Uint8Array): SniffedMime | null {
  if (bytes.byteLength >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((b, i) => bytes[i] === b)) return "image/png";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validate upload bytes before they leave for the API.
 *
 * - Sniffs the real container format; the sniffed type wins over a wrong
 *   `declaredMime` (a PNG sent as image/jpeg uploads as a PNG).
 * - When `expectedSha256` is provided, refuses bytes whose digest differs —
 *   the only check that catches mid-payload mangling at this layer. (The
 *   server's full decode is the backstop for callers that skip it.)
 */
export function prepareUpload(
  bytes: Uint8Array,
  declaredMime: string | null,
  expectedSha256?: string
): PreparedUpload | RejectedUpload {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "Decoded payload is empty — check the base64 `data` you passed." };
  }

  const sniffed = sniffImageFormat(bytes);
  if (!sniffed) {
    const claimed = declaredMime ? ` (declared \`${declaredMime}\`)` : "";
    return {
      ok: false,
      error:
        `The bytes are not a PNG, JPEG, or WebP image${claimed} — the file signature doesn't match any supported format. ` +
        "If you passed base64 `data`, it was likely corrupted in transit: re-read the source file, or use `source_url` instead.",
    };
  }

  const actualSha = sha256Hex(bytes);
  if (expectedSha256 && actualSha !== expectedSha256.trim().toLowerCase()) {
    return {
      ok: false,
      error:
        "Integrity check failed: the decoded payload does not match the sha256 you supplied, so the bytes were corrupted in transit and were NOT uploaded.\n" +
        `- expected: \`${expectedSha256.trim().toLowerCase()}\`\n` +
        `- received: \`${actualSha}\` (${bytes.byteLength} bytes)\n` +
        "Re-read the source file and try again, or upload via `source_url`.",
    };
  }

  return {
    ok: true,
    mimeType: sniffed,
    ext: MIME_EXT[sniffed],
    sha256: actualSha,
    byteLength: bytes.byteLength,
  };
}
