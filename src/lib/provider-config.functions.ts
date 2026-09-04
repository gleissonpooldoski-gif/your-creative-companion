import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (table: string) => any };

async function requireAdmin(supabase: LooseClient, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(String(data.role))) {
    throw new Error("Somente proprietários e administradores podem configurar o provider.");
  }
  return data.workspace_id as string;
}

function validateProviderUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL do provider inválida.");
  }
  if (url.protocol !== "https:" && !(url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    throw new Error("A URL do provider precisa usar HTTPS.");
  }
  return url.toString();
}

export const getDirectoryProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("group_discovery_provider_configs")
      .select("api_url, status, last_tested_at, last_test_message, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (data) return { configured: true, source: "workspace" as const, ...data };
    const configured = Boolean(process.env["GROUP_DIRECTORY_API_URL"] && process.env["GROUP_DIRECTORY_API_KEY"]);
    return {
      configured,
      source: configured ? ("environment" as const) : ("none" as const),
      api_url: process.env["GROUP_DIRECTORY_API_URL"] ?? null,
      status: configured ? "not_tested" : "not_configured",
      last_tested_at: null,
      last_test_message: null,
      updated_at: null,
    };
  });

const configInput = z.object({ apiUrl: z.string().min(8).max(500), apiKey: z.string().min(1).max(2000) });

export const saveDirectoryProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => configInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const apiUrl = validateProviderUrl(data.apiUrl);
    const [{ supabaseAdmin }, { encryptProviderKey }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/provider-config.server"),
    ]);
    const apiKeyCiphertext = await encryptProviderKey(data.apiKey);
    const { error } = await supabaseAdmin.from("group_discovery_provider_configs").upsert({
      workspace_id: workspaceId,
      provider_type: "directory_api",
      api_url: apiUrl,
      api_key_ciphertext: apiKeyCiphertext,
      status: "not_tested",
      last_tested_at: null,
      last_test_message: null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const testDirectoryProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const [{ supabaseAdmin }, providerModule] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/providers/group-discovery.server"),
    ]);
    const result = await providerModule.testConfiguredDiscoveryProvider(workspaceId);
    await supabaseAdmin
      .from("group_discovery_provider_configs")
      .update({
        status: result.ok ? "connected" : "error",
        last_tested_at: new Date().toISOString(),
        last_test_message: result.message.slice(0, 500),
      })
      .eq("workspace_id", workspaceId);
    return result;
  });