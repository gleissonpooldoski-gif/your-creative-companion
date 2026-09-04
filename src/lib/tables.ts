// Allowlist of tenant tables the generic resource API may touch.
export const RESOURCE_TABLES = [
  "telegram_accounts",
  "telegram_updates",
  "contacts",
  "tags",
  "leads",
  "activities",
  "campaigns",
  "campaign_variations",
  "campaign_accounts",
  "campaign_destinations",
  "prospecting_campaigns",
  "prospecting_queue",
  "group_keywords",
  "group_sources",
  "group_memberships",
  "group_mirrors",
  "bots",
  "bot_flows",
  "ai_agents",
  "ai_knowledge",
  "ai_jobs",
  "personas",
  "mini_apps",
  "mini_app_submissions",
  "remarketing_calls",
  "instagram_accounts",
  "instagram_posts",
  "smm_services",
  "smm_orders",
  "transactions",
  "wallet_ledger",
  "pix_payments",
  "queue_jobs",
  "notifications",
  "system_logs",
  "integration_logs",
  "audit_logs",
] as const;

export type ResourceTable = (typeof RESOURCE_TABLES)[number];

export function isResourceTable(value: string): value is ResourceTable {
  return (RESOURCE_TABLES as readonly string[]).includes(value);
}
