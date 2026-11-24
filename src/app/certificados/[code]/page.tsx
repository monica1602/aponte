import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { siteUrl } from "@/lib/session";
import { loadCertificate } from "@/lib/certificates";
import { certificateDetails } from "@/lib/certificate-pdf";
import { formatWorkload } from "@/lib/certificate-themes";
import { Badge, Card, btnCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const certificate = await loadCertificate((await params).code);
  if (!certificate) notFound();
  const qr = await QRCode.toDataURL(`${await siteUrl()}/certificados/${certificate.verification_code}`, { margin: 1, width: 160 });
  const details = certificateDetails(certificate);
  const workload = formatWorkload(certificate.workload_minutes);
  return <div className="mx-auto max-w-2xl py-12"><Card className="border-accent/40 text-center"><Badge kind="active" label="Certificado verificado" /><p className="mt-7 font-mono text-xs uppercase tracking-[0.18em] text-muted">Ponte certifica que</p><h1 className="mt-3 text-3xl font-bold">{certificate.recipient_name}</h1><p className="mx-auto mt-5 max-w-lg text-muted">participou de <strong className="text-fg">{certificate.title}</strong>{details ? ` ${details}` : ""}.</p>{workload && <p className="mt-2 text-muted">Carga horaria: {workload}</p>}{certificate.organizer_name && <p className="mt-2 text-muted">Organizado por {certificate.organizer_name}</p>}{certificate.responsible_name && <div className="mx-auto mt-6 max-w-xs border-t border-line pt-2"><p className="font-semibold">{certificate.responsible_name}</p><p className="text-xs text-muted">Responsavel pelo evento</p><p className="mt-1 text-[11px] text-muted">Assinatura eletronica: este certificado pode ser validado pelo codigo e pelo QR code</p></div>}<div className="mt-8 border-t border-line pt-5 text-xs text-muted"><p>Emitido pela plataforma Ponte em {new Date(certificate.issued_at + "Z").toLocaleDateString("pt-BR")}</p><p className="mt-2 font-mono">Codigo: {certificate.verification_code}</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={qr} alt="QR code de validacao deste certificado" width={120} height={120} className="mx-auto mt-4 rounded-md bg-white" /><p className="mt-2">Escaneie para validar</p></div><a href={`/certificados/${certificate.verification_code}/pdf`} download className={`${btnCls} mt-6 inline-block`}>Baixar PDF</a></Card></div>;
}
