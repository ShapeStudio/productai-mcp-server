import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareUpload, sniffImageFormat, sha256Hex } from "../src/upload-validation.js";

// Fixtures from the 2026-08-12 Pixelcut benchmark incident. The "orig"
// files are the images as they existed at the source; the "corrupt" files
// are what our pipeline hosted after the base64 `data` argument was
// mangled in transit (PNG: broken IDAT stream + fabricated tail; JPEG:
// 2751 bytes of scan data deleted between two intact halves).
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => new Uint8Array(readFileSync(join(fixturesDir, name)));

test("sniffs the container format from magic bytes", () => {
  assert.equal(sniffImageFormat(fixture("orig-T1.png")), "image/png");
  assert.equal(sniffImageFormat(fixture("orig-G1.jpg")), "image/jpeg");
  assert.equal(sniffImageFormat(new TextEncoder().encode("not an image")), null);
});

test("accepts intact bytes and reports their identity", () => {
  const bytes = fixture("orig-T1.png");
  const prepared = prepareUpload(bytes, "image/png");
  assert.ok(prepared.ok);
  assert.equal(prepared.mimeType, "image/png");
  assert.equal(prepared.ext, "png");
  assert.equal(prepared.byteLength, 12895);
  assert.equal(prepared.sha256, sha256Hex(bytes));
});

test("sniffed format wins over a wrong declared mime type", () => {
  const prepared = prepareUpload(fixture("orig-T1.png"), "image/jpeg");
  assert.ok(prepared.ok);
  assert.equal(prepared.mimeType, "image/png");
  assert.equal(prepared.ext, "png");
});

test("rejects bytes that are not any supported image", () => {
  const prepared = prepareUpload(new TextEncoder().encode("<html>error page</html>"), "image/png");
  assert.equal(prepared.ok, false);
  assert.match((prepared as { error: string }).error, /not a PNG, JPEG, or WebP/);
});

test("incident case 1: mangled PNG passes the sniff but fails the source digest", () => {
  // Magic bytes and header survive this kind of corruption, so sniffing
  // alone cannot catch it — the caller-supplied digest is what does.
  const corrupt = fixture("corrupt-T1.png");
  assert.equal(sniffImageFormat(corrupt), "image/png");

  const sourceDigest = sha256Hex(fixture("orig-T1.png"));
  const prepared = prepareUpload(corrupt, "image/png", sourceDigest);
  assert.equal(prepared.ok, false);
  assert.match((prepared as { error: string }).error, /corrupted in transit/);
  assert.match((prepared as { error: string }).error, /NOT uploaded/);
});

test("incident case 2: spliced JPEG passes the sniff but fails the source digest", () => {
  const corrupt = fixture("corrupt-G1.jpg");
  assert.equal(sniffImageFormat(corrupt), "image/jpeg");

  const sourceDigest = sha256Hex(fixture("orig-G1.jpg"));
  const prepared = prepareUpload(corrupt, "image/jpeg", sourceDigest);
  assert.equal(prepared.ok, false);
});

test("matching digest is accepted, case-insensitively", () => {
  const bytes = fixture("orig-G1.jpg");
  const prepared = prepareUpload(bytes, "image/jpeg", sha256Hex(bytes).toUpperCase());
  assert.ok(prepared.ok);
});

test("rejects an empty payload", () => {
  const prepared = prepareUpload(new Uint8Array(0), "image/png");
  assert.equal(prepared.ok, false);
  assert.match((prepared as { error: string }).error, /empty/);
});
