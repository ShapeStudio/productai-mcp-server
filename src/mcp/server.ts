import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MODELS, productaiRequest } from "../productai.js";

export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "productai",
    version: "0.1.0",
    icons: [
      {
        src: "https://create.productai.photo/icon-512.png",
        mimeType: "image/png",
        sizes: ["512x512"],
      },
    ],
  });

  server.registerTool(
    "generate_image",
    {
      title: "Generate product photo",
      description:
        "Generate an AI-powered product photo. Provide a product image URL and a prompt describing the desired edit or scene. Supports single image (all models) or multiple images (seedream, nanobanana only).",
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
          .describe("URL of the product image, or an array of URLs for multi-image models (seedream, nanobanana)"),
        prompt: z.string().describe("Text prompt describing the desired product photo"),
        model: z
          .enum(MODELS)
          .default("nanobananapro")
          .describe(`Model to use. One of: ${MODELS.join(", ")}. Default: nanobananapro`),
      },
    },
    async ({ image_url, prompt, model }) => {
      try {
        const result = await productaiRequest(userId, "POST", "/api/generate", {
          model,
          image_url,
          prompt,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Generation failed: ${errMsg(err)}` }],
        };
      }
    }
  );

  server.registerTool(
    "get_job",
    {
      title: "Check generation job status",
      description: "Check the status of a product photo generation job. Returns RUNNING/COMPLETED/FAILED and the result URL when ready.",
      annotations: {
        title: "Check generation job status",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        job_id: z.number().int().describe("Job ID returned from generate_image"),
      },
    },
    async ({ job_id }) => {
      try {
        const result = await productaiRequest(userId, "GET", `/api/job/${job_id}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Status check failed: ${errMsg(err)}` }] };
      }
    }
  );

  server.registerTool(
    "wait_for_job",
    {
      title: "Wait for generation job",
      description: "Poll a generation job until it completes (or times out). Returns the final result.",
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
      },
    },
    async ({ job_id, max_wait_seconds, poll_interval_seconds }) => {
      const deadline = Date.now() + max_wait_seconds * 1000;
      try {
        while (Date.now() < deadline) {
          const r = (await productaiRequest(userId, "GET", `/api/job/${job_id}`)) as {
            status?: string;
            data?: { status?: string };
          };
          const status = r.data?.status ?? r.status;
          if (status === "COMPLETED" || status === "FAILED") {
            return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
          }
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
      description: "Generate a product photo and wait for the completed image URL in a single call.",
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
        max_wait_seconds: z.number().int().min(5).max(300).default(120),
      },
    },
    async ({ image_url, prompt, model, max_wait_seconds }) => {
      try {
        const gen = (await productaiRequest(userId, "POST", "/api/generate", {
          model,
          image_url,
          prompt,
        })) as { data?: { id?: number } };
        const jobId = gen.data?.id;
        if (!jobId) {
          return { content: [{ type: "text", text: `Generation started but no job ID returned: ${JSON.stringify(gen)}` }] };
        }
        const deadline = Date.now() + max_wait_seconds * 1000;
        while (Date.now() < deadline) {
          await sleep(5000);
          const r = (await productaiRequest(userId, "GET", `/api/job/${jobId}`)) as {
            data?: { status?: string };
          };
          const status = r.data?.status;
          if (status === "COMPLETED" || status === "FAILED") {
            return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
          }
        }
        return {
          content: [
            { type: "text", text: `Job did not complete within ${max_wait_seconds}s. Use get_job to check later.` },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `Generation failed: ${errMsg(err)}` }] };
      }
    }
  );

  return server;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
