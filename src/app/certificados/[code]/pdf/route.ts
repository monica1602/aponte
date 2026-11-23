import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/session";
import { certificatePdf, type CertificateData } from "@/lib/certificate-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const certificate = (await getDb().prepare(
    `SELECT c.title, c.verification_code, c.issued_at, u.name AS recipient_name, issuer.name AS issuer_name, e.starts_at
     FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN users issuer ON issuer.id = c.issued_by
     LEFT JOIN events e ON e.id = c.event_id WHERE c.verification_code = ?`
  ).get(code)) as CertificateData | undefined;
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
