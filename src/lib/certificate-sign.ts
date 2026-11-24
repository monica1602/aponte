import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";

/** Chave do certificado da Ponte: arquivo .p12 em base64 e a senha, nas variaveis do servidor. */
export function signingKey() {
  const p12 = process.env.CERTIFICATE_SIGNING_P12?.trim();
  if (!p12) return null;
  return { p12: Buffer.from(p12, "base64"), passphrase: process.env.CERTIFICATE_SIGNING_PASSWORD ?? "" };
}

/** Assina o PDF com o certificado da Ponte. Sem chave configurada, devolve o PDF sem assinatura. */
export async function signCertificatePdf(pdf: Uint8Array, contactInfo: string): Promise<Uint8Array> {
  const key = signingKey();
  if (!key) return pdf;
  try {
    const doc = await PDFDocument.load(pdf);
    pdflibAddPlaceholder({
      pdfDoc: doc,
      name: "Ponte",
      reason: "Certificado emitido pela plataforma Ponte",
      contactInfo,
      location: "Brasil",
      appName: "Ponte",
    });
    const unsigned = Buffer.from(await doc.save({ useObjectStreams: false }));
    return await new SignPdf().sign(unsigned, new P12Signer(key.p12, { passphrase: key.passphrase }));
  } catch (error) {
    console.error("Falha ao assinar o certificado; o PDF segue sem assinatura.", error);
    return pdf;
  }
}
