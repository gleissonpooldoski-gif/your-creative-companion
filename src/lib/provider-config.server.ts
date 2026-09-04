import { supabaseAdmin } from "@/integrations/supabase/client.server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = process.env["GROUP_PROVIDER_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Chave interna de proteção do provider não configurada.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptProviderKey(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptProviderKey(value: string): Promise<string> {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Credencial do provider está em formato inválido.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    await encryptionKey(),
    base64ToBytes(dataPart),
  );
  return decoder.decode(decrypted);
}

export type StoredProviderConfig = {
  apiUrl: string;
  apiKey: string;
  source: "workspace" | "environment";
};

export async function loadProviderConfig(workspaceId: string): Promise<StoredProviderConfig | null> {
  const { data } = await supabaseAdmin
    .from("group_discovery_provider_configs")
    .select("api_url, api_key_ciphertext")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (data?.api_url && data.api_key_ciphertext) {
    return {
      apiUrl: data.api_url,
      apiKey: await decryptProviderKey(data.api_key_ciphertext),
      source: "workspace",
    };
  }

  const apiUrl = process.env["GROUP_DIRECTORY_API_URL"];
  const apiKey = process.env["GROUP_DIRECTORY_API_KEY"];
  return apiUrl && apiKey ? { apiUrl, apiKey, source: "environment" } : null;
}