/** Previa do Vercel: deploy de um branch que nao e a main. Na producao e no computador, falso. */
export function isPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}
