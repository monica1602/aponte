type Rgb = [number, number, number];

export type CertificateTheme = {
  id: string;
  label: string;
  background: Rgb;
  accent: Rgb;
  text: Rgb;
  muted: Rgb;
  serif: boolean;
  decor: "double" | "band-left" | "single" | "corners" | "bands";
};

export const CERTIFICATE_THEMES: CertificateTheme[] = [
  { id: "classico", label: "Classico (azul, moldura dupla)", background: [1, 1, 1], accent: [0.36, 0.42, 0.95], text: [0.1, 0.1, 0.12], muted: [0.35, 0.37, 0.42], serif: false, decor: "double" },
  { id: "esmeralda", label: "Esmeralda (verde, faixa lateral)", background: [1, 1, 1], accent: [0.05, 0.55, 0.4], text: [0.08, 0.14, 0.12], muted: [0.33, 0.4, 0.38], serif: false, decor: "band-left" },
  { id: "grafite", label: "Grafite (fundo escuro)", background: [0.11, 0.12, 0.15], accent: [0.98, 0.75, 0.2], text: [0.96, 0.96, 0.97], muted: [0.7, 0.72, 0.76], serif: false, decor: "single" },
  { id: "dourado", label: "Dourado (fundo creme, letras serifadas)", background: [0.99, 0.97, 0.92], accent: [0.72, 0.55, 0.2], text: [0.2, 0.15, 0.08], muted: [0.45, 0.38, 0.28], serif: true, decor: "corners" },
  { id: "coral", label: "Coral (faixas no topo e na base)", background: [1, 1, 1], accent: [0.93, 0.38, 0.33], text: [0.15, 0.1, 0.1], muted: [0.42, 0.36, 0.36], serif: false, decor: "bands" },
];

export const DEFAULT_CERTIFICATE_THEME = "classico";

export function certificateTheme(id: string | null | undefined): CertificateTheme {
  return CERTIFICATE_THEMES.find((t) => t.id === id) ?? CERTIFICATE_THEMES[0];
}

export function validCertificateTheme(id: string): string {
  return CERTIFICATE_THEMES.some((t) => t.id === id) ? id : DEFAULT_CERTIFICATE_THEME;
}

/** 150 -> "2h30", 120 -> "2h", 45 -> "45min". */
export function formatWorkload(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
