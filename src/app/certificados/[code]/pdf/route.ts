import { clientIp, siteUrl } from "@/lib/session";
import { certificatePdfWait, certificatePdfWaitMessage, recordCertificatePdf } from "@/lib/certificate-limits";
import { certificatePdf } from "@/lib/certificate-pdf";
import { loadCertificate } from "@/lib/certificates";
import { signCertificatePdf } from "@/lib/certificate-sign";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const ip = await clientIp();
  const wait = await certificatePdfWait(ip);
  if (wait) {
    return new Response(certificatePdfWaitMessage(wait), {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(wait * 60) },
    });
  }
  const certificate = await loadCertificate((await params).code);
  await recordCertificatePdf(ip, !!certificate);
  if (!certificate) return new Response("Certificado nao encontrado.", { status: 404 });
  if (certificate.revoked_at) return new Response("Certificado revogado: este certificado nao e valido.", { status: 410 });
  const site = await siteUrl();
  const url = `${site}/certificados/${certificate.verification_code}`;
  const pdf = await signCertificatePdf(await certificatePdf(certificate, url), site);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${certificate.verification_code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
