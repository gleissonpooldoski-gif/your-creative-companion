/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const updateSchema = z
  .object({ update_id: z.number().int() })
  .passthrough();

export const Route = createFileRoute("/api/public/telegram/webhook/$accountId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const accountId = params.accountId;
        if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as unknown as { from: (t: string) => any };

        const { data: account } = await admin
          .from("telegram_accounts")
          .select("id, workspace_id, webhook_secret")
          .eq("id", accountId)
          .maybeSingle();
        if (!account) return new Response("Not found", { status: 404 });

        const secret = request.headers.get("x-telegram-bot-api-secret-token");
        if (!account.webhook_secret || secret !== account.webhook_secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: z.infer<typeof updateSchema>;
        try {
          parsed = updateSchema.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        // Idempotency key: workspace + account + telegram update id.
        const { data: inserted, error } = await admin
          .from("telegram_updates")
          .upsert(
            {
              workspace_id: account.workspace_id,
              account_id: account.id,
              telegram_update_id: parsed.update_id,
              payload: parsed,
            },
            { onConflict: "workspace_id,account_id,telegram_update_id", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();

        if (error) {
          await admin.from("integration_logs").insert({
            workspace_id: account.workspace_id,
            provider: "telegram",
            action: "webhook",
            success: false,
            message: error.message,
          });
          return new Response("Storage error", { status: 500 });
        }

        if (!inserted) {
          // Duplicate delivery — already stored, do not process twice.
          return Response.json({ ok: true, duplicate: true });
        }

        await admin.from("queue_jobs").upsert(
          {
            workspace_id: account.workspace_id,
            kind: "process_telegram_update",
            payload: { update_row_id: inserted.id },
            priority: 20,
            idempotency_key: `tg_update:${account.id}:${parsed.update_id}`,
          },
          { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true },
        );

        return Response.json({ ok: true });
      },
    },
  },
});
