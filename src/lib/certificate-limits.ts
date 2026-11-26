import { blockedFor, recordAttempt, type Limit } from "./rate-limit";

export function certificatePdfLimits(ip: string): { downloads: Limit; misses: Limit } {
  return {
    downloads: { action: "certificate_pdf", subject: ip, max: 30, windowMin: 10 },
    misses: { action: "certificate_miss", subject: ip, max: 20, windowMin: 10 },
  };
}

/** Minutes this IP must wait before downloading another certificate PDF, or 0. */
export async function certificatePdfWait(ip: string): Promise<number> {
  const l = certificatePdfLimits(ip);
  return blockedFor([l.downloads, l.misses]);
}

export async function recordCertificatePdf(ip: string, found: boolean): Promise<void> {
  const l = certificatePdfLimits(ip);
  await recordAttempt(found ? l.downloads.action : l.misses.action, [ip]);
}

export function certificatePdfWaitMessage(minutes: number): string {
  return `Muitos downloads em pouco tempo. Aguarde ${minutes} minuto${minutes > 1 ? "s" : ""} e tente de novo.`;
}
