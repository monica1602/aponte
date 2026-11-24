import { siteUrl } from "@/lib/session";
import { certificatePdf } from "@/lib/certificate-pdf";
import { loadCertificate } from "@/lib/certificates";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const certificate = await loadCertificate((await params).code);
  if (!certificate) return new Response("Certificado nao encontrado.", { status: 404 });
  const url = `${await siteUrl()}/certificados/${certificate.verification_code}`;
  const pdf = await certificatePdf(certificate, url);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${certificate.verification_code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
