export type WhatsAppConfig = { phone: string; apiKey: string; apiUrl: string };

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const phone = (env.ADMIN_WHATSAPP ?? "").replace(/\D/g, "");
  const apiKey = (env.CALLMEBOT_API_KEY ?? "").trim();
  if (!phone || !apiKey) return null;
  return { phone, apiKey, apiUrl: env.CALLMEBOT_API_URL || "https://api.callmebot.com/whatsapp.php" };
}

export function whatsappRequestUrl(cfg: WhatsAppConfig, text: string): string {
  const url = new URL(cfg.apiUrl);
  url.searchParams.set("phone", `+${cfg.phone}`);
  url.searchParams.set("text", text.slice(0, 1000));
  url.searchParams.set("apikey", cfg.apiKey);
  return url.toString();
}

export async function sendWhatsApp(cfg: WhatsAppConfig, text: string): Promise<boolean> {
  const res = await fetch(whatsappRequestUrl(cfg, text), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) console.warn(`[whatsapp] CallMeBot respondeu ${res.status}`);
  return res.ok;
}
