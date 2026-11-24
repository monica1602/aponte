import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateData = {
  title: string;
  verification_code: string;
  issued_at: string;
  recipient_name: string;
  issuer_name: string | null;
  starts_at: string | null;
};

// As fontes padrao do PDF so cobrem o Latin-1; outros caracteres sao removidos.
const latin1 = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "").trim();

/** "AAAA-MM-DD..." -> "DD/MM/AAAA", sem depender do fuso do servidor. */
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function certificatePdf(c: CertificateData, validationUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(latin1(`Certificado - ${c.title}`));
  doc.setAuthor("Ponte");
  const page = doc.addPage([842, 595]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.36, 0.42, 0.95);
  const muted = rgb(0.35, 0.37, 0.42);
  const { width } = page.getSize();

  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: 595 - 48, borderColor: accent, borderWidth: 2 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: 595 - 64, borderColor: accent, borderWidth: 0.5 });

  let y = 500;
  const center = (text: string, font: PDFFont, size: number, color = rgb(0.1, 0.1, 0.12)) => {
    const t = latin1(text);
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  center("PONTE", bold, 14, accent); y -= 48;
  center("CERTIFICADO", bold, 34); y -= 50;
  center("A Ponte certifica que", regular, 14, muted); y -= 46;
  center(c.recipient_name, bold, 28); y -= 40;
  center("participou de", regular, 14, muted); y -= 30;
  for (const line of wrap(latin1(c.title), bold, 18, width - 160).slice(0, 3)) {
    center(line, bold, 18); y -= 24;
  }
  if (c.starts_at) { y -= 4; center(`em ${brDate(c.starts_at)}`, regular, 14, muted); }

  y = 120;
  center(`Emitido por ${c.issuer_name ?? "conta excluida"} em ${brDate(c.issued_at)}`, regular, 11, muted); y -= 18;
  center(`Codigo de validacao: ${c.verification_code}`, bold, 11); y -= 18;
  center(`Valide em: ${validationUrl}`, regular, 10, muted);

  const qr = await doc.embedPng(await QRCode.toBuffer(validationUrl, { margin: 1, width: 240 }));
  const qrSize = 80;
  const qrX = width - 40 - 8 - qrSize;
  page.drawImage(qr, { x: qrX, y: 56, width: qrSize, height: qrSize });
  const legend = "Escaneie para validar";
  page.drawText(legend, { x: qrX + (qrSize - regular.widthOfTextAtSize(legend, 8)) / 2, y: 44, size: 8, font: regular, color: muted });

  return doc.save();
}
