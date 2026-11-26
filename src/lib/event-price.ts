export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 500_000;
export const PAYMENT_INFO_MAX = 1000;

/** "50", "50,00", "1.234,56" or "R$ 50" in cents; null when it is not a value in reais. */
export function parsePrice(text: string): number | null {
  let t = text.replace(/R\$/i, "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function formatPrice(cents: number): string {
  return (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

/** Value typed in the form when editing: 5000 -> "50,00". */
export function priceInput(cents: number): string {
  return Number(cents) > 0 ? (Number(cents) / 100).toFixed(2).replace(".", ",") : "";
}
