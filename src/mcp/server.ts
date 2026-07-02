import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MODELS,
  VIDEO_MODEL,
  VIDEO_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_EXT,
  productaiRequest,
  productaiUpload,
} from "../productai.js";

/** A result URL that points at a video file rather than a still image. */
function isVideoUrl(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  return /\.(mp4|webm|mov|m4v)$/.test(path);
}

const MAX_COUNT = 4;

export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "productai",
    version: "0.2.0",
    icons: [
      {
        src: "https://mcp.productai.photo/assets/logo-512.png",
        mimeType: "image/png",
        sizes: ["512x512"],
      },
      {
        src: "https://mcp.productai.photo/assets/logo.svg",
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
    ],
  });

  server.registerTool(
    "upload_asset",
    {
      title: "Upload a reference image",
      description:
        "Upload a reference image to ProductAI and get back a hosted URL you can pass as `image_url` to generate_image, generate_and_wait, or generate_video. Use this when the user attaches or provides an image that isn't already a public URL — pass its base64 bytes as `data`. Alternatively pass `source_url` to re-host an image from an existing URL. Max 10MB; PNG, JPG, or WebP only.",
      annotations: {
        title: "Upload a reference image",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        data: z
          .string()
          .optional()
          .describe("Base64-encoded image bytes (no data: prefix). Provide this OR source_url."),
        mime_type: z
          .enum(["image/png", "image/jpeg", "image/webp"])
          .optional()
          .describe("MIME type of the image in `data`. Required when using `data`."),
        source_url: z
          .string()
          .url()
          .optional()
          .describe("URL of an image to fetch and re-host. Provide this OR data."),
      },
    },
    async ({ data, mime_type, source_url }) => {
      try {
        let bytes: Uint8Array;
        let mimeType: string;
        if (data) {
          if (!mime_type) {
            return { isError: true, content: [{ type: "text", text: "mime_type is required when uploading base64 `data`." }] };
          }
          bytes = Buffer.from(data, "base64");
          mimeType = mime_type;
        } else if (source_url) {
          const res = await fetch(source_url);
          if (!res.ok) {
            return { isError: true, content: [{ type: "text", text: `Could not fetch source_url (${res.status}).` }] };
          }
          mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? mimeFromUrl(source_url);
          bytes = new Uint8Array(await res.arrayBuffer());
        } else {
          return { isError: true, content: [{ type: "text", text: "Provide either `data` (base64) + `mime_type`, or `source_url`." }] };
        }

        const ext = UPLOAD_MIME_EXT[mimeType.toLowerCase()];
        if (!ext) {
          return { isError: true, content: [{ type: "text", text: `Unsupported image type \`${mimeType}\`. Use PNG, JPG, or WebP.` }] };
        }
        if (bytes.byteLength > UPLOAD_MAX_BYTES) {
          return {
            isError: true,
            content: [{ type: "text", text: `Image is ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB — the limit is 10MB.` }],
          };
        }

        const result = (await productaiUpload(userId, bytes, mimeType, `upload.${ext}`)) as UploadResult;
        const url = result.data?.image_url;
        if (!url) {
          return { isError: true, content: [{ type: "text", text: "Upload succeeded but no URL was returned." }] };
        }
        return {
          content: [
            { type: "text", text: `**Uploaded** · \`${url}\`\n\nPass this as \`image_url\` to generate_image, generate_and_wait, or generate_video.` },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Upload failed: ${errMsg(err)}` }] };
      }
    }
  );

  server.registerTool(
    "generate_image",
    {
      title: "Generate product photo",
      description:
        "Start a product photo generation. Provide an image URL (or array of URLs for seedream/nanobanana) and a prompt. Use `count` to start multiple variants in parallel.",
      annotations: {
        title: "Generate product photo",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        image_url: z
          .union([z.string().url(), z.array(z.string().url())])
          .describe("URL of the product image, or an array of URLs (up to 14) for multi-image models (seedream, nanobananapro, nanobanana, nanobanana2)"),
        prompt: z.string().describe("Text prompt describing the desired product photo"),
        model: z.enum(MODELS).default("nanobananapro").describe(`Model. Default: nanobananapro. For video use the separate generate_video tool.`),
        count: z
          .number()
          .int()
          .min(1)
          .max(MAX_COUNT)
          .default(1)
          .describe(`Number of variants to generate in parallel (1-${MAX_COUNT}). Each consumes credits.`),
      },
    },
    async ({ image_url, prompt, model, count }) => {
      const results = await Promise.allSettled(
        Array.from({ length: count }, () =>
          productaiRequest(userId, "POST", "/api/generate", { model, image_url, prompt })
        )
      );
      const lines: string[] = [`**${count} generation job${count === 1 ? "" : "s"} started** · model: \`${model}\``, ""];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          const id = (r.value as GenStart).data?.id;
          lines.push(`- Job ${i + 1}: id \`${id ?? "?"}\` — running. Use \`wait_for_job\` with this id to see the result.`);
        } else {
          lines.push(`- Job ${i + 1}: failed to start — ${errMsg(r.reason)}`);
        }
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "get_job",
    {
      title: "Check generation job status",
      description: "Check the status of a generation job. Returns RUNNING/COMPLETED/FAILED and the result URL when ready.",
      annotations: {
        title: "Check generation job status",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        job_id: z.number().int().describe("Job ID returned from generate_image"),
        preview: z.boolean().default(true).describe("If true and the job is COMPLETED, also return the image inline."),
      },
    },
    async ({ job_id, preview }) => {
      try {
        const result = (await productaiRequest(userId, "GET", `/api/job/${job_id}`)) as JobResult;
        return { content: await renderJob(result, preview) };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Status check failed: ${errMsg(err)}` }] };
      }
    }
  );

  server.registerTool(
    "wait_for_job",
    {
      title: "Wait for generation job",
      description: "Poll a generation job until it completes (or times out). Returns the final result, with the image inline when preview is enabled.",
      annotations: {
        title: "Wait for generation job",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        job_id: z.number().int().describe("Job ID to wait for"),
        max_wait_seconds: z.number().int().min(5).max(300).default(120),
        poll_interval_seconds: z.number().int().min(2).max(30).default(5),
        preview: z.boolean().default(true),
      },
    },
    async ({ job_id, max_wait_seconds, poll_interval_seconds, preview }) => {
      const deadline = Date.now() + max_wait_seconds * 1000;
      try {
        while (Date.now() < deadline) {
          const r = (await productaiRequest(userId, "GET", `/api/job/${job_id}`)) as JobResult;
          if (isTerminal(r)) return { content: await renderJob(r, preview) };
          await sleep(poll_interval_seconds * 1000);
        }
        return {
          content: [
            { type: "text", text: `Job ${job_id} did not complete within ${max_wait_seconds}s. Use get_job to check later.` },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Polling failed: ${errMsg(err)}` }] };
      }
    }
  );

  server.registerTool(
    "generate_and_wait",
    {
      title: "Generate product photo (wait for result)",
      description:
        "Generate one or more product photos and wait for the completed images. Returns each result inline so the user sees the picture directly.",
      annotations: {
        title: "Generate product photo (wait for result)",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        image_url: z.union([z.string().url(), z.array(z.string().url())]),
        prompt: z.string(),
        model: z.enum(MODELS).default("nanobananapro"),
        count: z
          .number()
          .int()
          .min(1)
          .max(MAX_COUNT)
          .default(1)
          .describe(`Number of variants to generate in parallel (1-${MAX_COUNT}).`),
        max_wait_seconds: z.number().int().min(5).max(300).default(120),
        preview: z.boolean().default(true),
      },
    },
    async ({ image_url, prompt, model, count, max_wait_seconds, preview }) => {
      try {
        // Fan out N parallel /generate calls
        const started = await Promise.all(
          Array.from({ length: count }, () =>
            productaiRequest(userId, "POST", "/api/generate", { model, image_url, prompt })
              .then((g) => ({ ok: true as const, data: g as GenStart }))
              .catch((e) => ({ ok: false as const, error: errMsg(e) }))
          )
        );
        const jobIds: { idx: number; jobId: number | null; error?: string }[] = started.map((s, i) =>
          s.ok
            ? { idx: i, jobId: s.data.data?.id ?? null }
            : { idx: i, jobId: null, error: s.error }
        );

        const deadline = Date.now() + max_wait_seconds * 1000;
        const finals = await Promise.all(
          jobIds.map(async (j) => {
            if (j.jobId == null) {
              return { index: j.idx, status: "FAILED", error: j.error ?? "no job id returned" };
            }
            while (Date.now() < deadline) {
              await sleep(5000);
              const r = (await productaiRequest(userId, "GET", `/api/job/${j.jobId}`)) as JobResult;
              if (isTerminal(r)) return { index: j.idx, ...flatten(r) };
            }
            return { index: j.idx, status: "TIMEOUT", job_id: j.jobId };
          })
        );

        const content: ToolContent[] = [
          { type: "text", text: renderBatchMarkdown(finals, model) },
        ];
        if (preview) {
          for (const f of finals) {
            const url = "image_url" in f ? f.image_url : undefined;
            if (typeof url === "string" && !isVideoUrl(url)) {
              const img = await tryFetchImage(url);
              if (img) content.push(img);
            }
          }
        }
        return { content };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Generation failed: ${errMsg(err)}` }] };
      }
    }
  );

  server.registerTool(
    "generate_video",
    {
      title: "Generate product video (Seedance 2.0)",
      description:
        "Start a Seedance 2.0 video generation. Give a prompt (required) and, optionally, one or more reference images (up to 9) to animate a product — omit the image for text-to-video. Video jobs run for a few minutes and are billed per second of output scaled by resolution (e.g. a 5s 720p clip ≈ 35 credits; 1080p and 4k cost much more). Returns a job id — use `wait_for_job` (raise max_wait_seconds) or `get_job` to fetch the finished video URL.",
      annotations: {
        title: "Generate product video (Seedance 2.0)",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        prompt: z.string().describe("Text prompt describing the video to generate"),
        image_url: z
          .union([z.string().url(), z.array(z.string().url())])
          .optional()
          .describe("Optional reference image(s). Omit for text-to-video; pass one URL or an array (up to 9) for reference-to-video."),
        resolution: z
          .enum(VIDEO_RESOLUTIONS)
          .default("720p")
          .describe("Output resolution. Higher resolution costs more credits per second."),
        aspect_ratio: z.enum(VIDEO_ASPECT_RATIOS).default("auto"),
        duration: z
          .union([z.number().int().min(4).max(15), z.literal("auto")])
          .default("auto")
          .describe('Clip length in seconds (4-15) or "auto".'),
        generate_audio: z.boolean().default(true).describe("Whether to generate an audio track."),
      },
    },
    async ({ prompt, image_url, resolution, aspect_ratio, duration, generate_audio }) => {
      try {
        const body: Record<string, unknown> = {
          model: VIDEO_MODEL,
          prompt,
          resolution,
          aspect_ratio,
          duration,
          generate_audio,
        };
        if (image_url !== undefined) body.image_url = image_url;
        const res = (await productaiRequest(userId, "POST", "/api/generate-video", body)) as GenStart;
        const id = res.data?.id;
        const durLabel = typeof duration === "number" ? ` · ${duration}s` : "";
        const lines = [
          `**Video generation started** · model: \`${VIDEO_MODEL}\` · ${resolution}${durLabel}`,
          "",
          `- Job id \`${id ?? "?"}\` — running. Video takes a few minutes; use \`wait_for_job\` (raise max_wait_seconds) or \`get_job\` with this id to fetch the finished video.`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Video generation failed: ${errMsg(err)}` }] };
      }
    }
  );

  return server;
}

// ── helpers ────────────────────────────────────────────────────────────

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

interface GenStart {
  data?: { id?: number };
}
interface UploadResult {
  data?: { id?: number; image_url?: string; mimetype?: string };
}
interface JobResult {
  status?: string;
  data?: { status?: string; image_url?: string; output_url?: string; result_url?: string; url?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function isTerminal(r: JobResult): boolean {
  const s = r.data?.status ?? r.status;
  return s === "COMPLETED" || s === "FAILED" || s === "ERROR" || s === "TIMEOUT";
}

function flatten(r: JobResult): Record<string, unknown> {
  const d = r.data ?? {};
  const status = d.status ?? r.status ?? "UNKNOWN";
  const url = d.image_url ?? d.output_url ?? d.result_url ?? d.url;
  return { status, ...(url ? { image_url: url } : {}), raw: r };
}

async function renderJob(r: JobResult, preview: boolean): Promise<ToolContent[]> {
  const flat = flatten(r);
  const content: ToolContent[] = [{ type: "text", text: renderSingleMarkdown(flat) }];
  if (preview && typeof flat.image_url === "string" && !isVideoUrl(flat.image_url)) {
    const img = await tryFetchImage(flat.image_url);
    if (img) content.push(img);
  }
  return content;
}

/**
 * Build a markdown-formatted tool-result body that renders inline in
 * Claude's chat. Embedding ![](url) in the *text* content (rather than
 * relying on `image` content blocks, which the UI collapses to "Show
 * Image" cards) is what gets the picture to appear directly.
 */
function renderSingleMarkdown(flat: Record<string, unknown>): string {
  const status = String(flat.status ?? "UNKNOWN");
  const url = typeof flat.image_url === "string" ? flat.image_url : null;
  const lines: string[] = [];
  if (status === "COMPLETED" && url && isVideoUrl(url)) {
    lines.push(`**Status:** ${status}`);
    lines.push("");
    lines.push(`🎬 [Watch / download video](${url})`);
  } else if (status === "COMPLETED" && url) {
    lines.push(`**Status:** ${status}`);
    lines.push("");
    lines.push(`![Generated product photo](${url})`);
    lines.push("");
    lines.push(`[Open full size](${url})`);
  } else if (url) {
    lines.push(`**Status:** ${status}`);
    lines.push(`**Image:** ${url}`);
  } else {
    lines.push(`**Status:** ${status}`);
  }
  return lines.join("\n");
}

function renderBatchMarkdown(
  finals: Array<{ index: number; status?: string; image_url?: string; error?: string; [k: string]: unknown }>,
  model: string
): string {
  const lines: string[] = [];
  const ok = finals.filter((f) => f.status === "COMPLETED" && typeof f.image_url === "string");
  const fail = finals.filter((f) => f.status !== "COMPLETED");
  lines.push(`**${ok.length} of ${finals.length} variants ready** · model: \`${model}\``);
  lines.push("");
  for (const f of finals) {
    const idx = f.index + 1;
    if (f.status === "COMPLETED" && typeof f.image_url === "string" && isVideoUrl(f.image_url)) {
      lines.push(`### Variant ${idx}`);
      lines.push(`🎬 [Watch / download video](${f.image_url})`);
      lines.push("");
    } else if (f.status === "COMPLETED" && typeof f.image_url === "string") {
      lines.push(`### Variant ${idx}`);
      lines.push(`![Variant ${idx}](${f.image_url})`);
      lines.push(`[Open full size](${f.image_url})`);
      lines.push("");
    } else {
      const reason = f.error ?? f.status ?? "unknown error";
      lines.push(`### Variant ${idx} — ${f.status ?? "failed"}`);
      lines.push(`_${reason}_`);
      lines.push("");
    }
  }
  if (fail.length > 0) {
    lines.push(`_${fail.length} variant${fail.length === 1 ? "" : "s"} did not complete. Use \`get_job\` if you want to retry._`);
  }
  return lines.join("\n");
}

async function tryFetchImage(url: string): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? mimeFromUrl(url);
    const buf = Buffer.from(await res.arrayBuffer());
    // ~8MB raw cap to keep MCP messages reasonable (base64 ~10.7MB)
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    return { type: "image", data: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
