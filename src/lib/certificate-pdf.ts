import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { certificateTheme, formatWorkload } from "./certificate-themes";

export type CertificateData = {
  title: string;
  verification_code: string;
  issued_at: string;
  recipient_name: string;
  starts_at: string | null;
  modality?: string | null;
  city?: string | null;
  state?: string | null;
  workload_minutes?: number | null;
  organizer_name?: string | null;
  responsible_name?: string | null;
  responsible_signature?: string | null;
  theme?: string | null;
};

let signatureFont: Promise<Buffer> | undefined;
/** Great Vibes (SIL Open Font License), a letra cursiva da assinatura. */
const signatureFontBytes = () =>
  (signatureFont ??= readFile(path.join(process.cwd(), "src/fonts/GreatVibes-Regular.ttf")));

const MODALITY: Record<string, string> = { online: "Online", in_person: "Presencial", hybrid: "Hibrido" };

// As fontes padrao do PDF so cobrem o Latin-1; outros caracteres sao removidos.
const latin1 = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "").trim();

/** "AAAA-MM-DD..." -> "DD/MM/AAAA", sem depender do fuso do servidor. */
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Linha "em DD/MM/AAAA · Presencial · Cidade/UF". */
export function certificateDetails(c: CertificateData): string {
  const place = [c.city, c.state].filter(Boolean).join("/");
  return [c.starts_at ? `em ${brDate(c.starts_at)}` : "", c.modality ? MODALITY[c.modality] ?? "" : "", place].filter(Boolean).join(" · ");
}

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

function decorate(page: PDFPage, decor: string, accent: ReturnType<typeof rgb>) {
  const { width, height } = page.getSize();
  if (decor === "double") {
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: accent, borderWidth: 2 });
    page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: accent, borderWidth: 0.5 });
  } else if (decor === "band-left") {
    page.drawRectangle({ x: 0, y: 0, width: 36, height, color: accent });
    page.drawRectangle({ x: 48, y: 24, width: width - 72, height: height - 48, borderColor: accent, borderWidth: 0.75 });
  } else if (decor === "single") {
    page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: accent, borderWidth: 1 });
  } else if (decor === "corners") {
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: accent, borderWidth: 1.5 });
    page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: accent, borderWidth: 0.5 });
    for (const [x, y] of [[18, 18], [width - 34, 18], [18, height - 34], [width - 34, height - 34]]) {
      page.drawRectangle({ x, y, width: 16, height: 16, color: accent });
    }
  } else {
    page.drawRectangle({ x: 0, y: height - 30, width, height: 30, color: accent });
    page.drawRectangle({ x: 0, y: 0, width, height: 20, color: accent });
  }
}

export async function certificatePdf(c: CertificateData, validationUrl: string): Promise<Uint8Array> {
  const theme = certificateTheme(c.theme);
  const doc = await PDFDocument.create();
  doc.setTitle(latin1(`Certificado - ${c.title}`));
  doc.setAuthor("Ponte");
  const page = doc.addPage([842, 595]);
  const regular = await doc.embedFont(theme.serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const bold = await doc.embedFont(theme.serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const accent = rgb(...theme.accent);
  const muted = rgb(...theme.muted);
  const ink = rgb(...theme.text);
  const { width, height } = page.getSize();

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(...theme.background) });
  decorate(page, theme.decor, accent);

  let y = 515;
  const center = (text: string, font: PDFFont, size: number, color = ink) => {
    const t = latin1(text);
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  center("PONTE", bold, 13, accent); y -= 40;
  center("CERTIFICADO", bold, 32); y -= 40;
  center("A Ponte certifica que", regular, 13, muted); y -= 38;
  center(c.recipient_name, bold, 26); y -= 32;
  center("participou de", regular, 13, muted); y -= 26;
  for (const line of wrap(latin1(c.title), bold, 18, width - 180).slice(0, 3)) {
    center(line, bold, 18); y -= 22;
  }
  y += 2;
  const details = certificateDetails(c);
  if (details) { center(details, regular, 13, muted); y -= 20; }
  const workload = formatWorkload(c.workload_minutes);
  if (workload) { center(`com carga horaria de ${workload}`, regular, 13, muted); y -= 20; }
  if (c.organizer_name) center(`Organizado por ${c.organizer_name}`, regular, 13, muted);

  if (c.responsible_name) {
    y = 200;
    const signature = c.responsible_signature?.normalize("NFC").trim();
    if (signature) {
      try {
        doc.registerFontkit(fontkit);
        const cursive = await doc.embedFont(await signatureFontBytes(), { subset: true });
        const size = Math.min(30, (30 * 240) / cursive.widthOfTextAtSize(signature, 30));
        page.drawText(signature, { x: (width - cursive.widthOfTextAtSize(signature, size)) / 2, y: y + 7, size, font: cursive, color: ink });
      } catch (error) {
        signatureFont = undefined;
        console.error("Falha ao desenhar a assinatura do certificado.", error);
      }
    }
    page.drawLine({ start: { x: width / 2 - 120, y }, end: { x: width / 2 + 120, y }, thickness: 0.75, color: muted });
    y -= 15; center(c.responsible_name, bold, 12);
    y -= 13; center("Responsavel pelo evento", regular, 9, muted);
    y -= 12; center("Assinatura eletronica: este certificado pode ser validado pelo codigo e pelo QR code", regular, 8, muted);
  }

  y = 128;
  center(`Emitido pela plataforma Ponte em ${brDate(c.issued_at)}`, regular, 11, muted); y -= 16;
  center(`Codigo de validacao: ${c.verification_code}`, bold, 11); y -= 16;
  center(`Valide em: ${validationUrl}`, regular, 10, muted);

  const qr = await doc.embedPng(await QRCode.toBuffer(validationUrl, { margin: 1, width: 240 }));
  const qrSize = 80;
  const qrX = width - 40 - 8 - qrSize;
  page.drawImage(qr, { x: qrX, y: 56, width: qrSize, height: qrSize });
  const legend = "Escaneie para validar";
  page.drawText(legend, { x: qrX + (qrSize - regular.widthOfTextAtSize(legend, 8)) / 2, y: 44, size: 8, font: regular, color: muted });

  return doc.save();
}
