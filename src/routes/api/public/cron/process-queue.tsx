import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { processQueue } from "@/lib/queue.server";

async function run(request: Request) {
  const unauthorized = await authenticateCronRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await processQueue();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error("cron process-queue failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/process-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
