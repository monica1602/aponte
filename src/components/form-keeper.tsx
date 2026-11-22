"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const KEY = "ponte:formulario";
const MAX_AGE_MS = 5 * 60 * 1000;
const SKIP = new Set(["password", "hidden", "file", "submit", "button", "reset"]);

type Field = { name: string; type: string; value: string; checked: boolean };
type Saved = { sig: string; fields: Field[]; at: number };

function fieldsOf(form: HTMLFormElement): (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] {
  return Array.from(form.elements).filter(
    (el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
      !!el.name && !SKIP.has(el.type)
  );
}

const signature = (form: HTMLFormElement) => [...new Set(fieldsOf(form).map((el) => el.name))].sort().join("|");

function restore(saved: Saved) {
  const form = Array.from(document.forms).find((f) => signature(f) === saved.sig);
  if (!form) return;
  for (const el of fieldsOf(form)) {
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      const f = saved.fields.find((x) => x.name === el.name && x.value === el.value);
      if (f) el.checked = f.checked;
    } else {
      const f = saved.fields.find((x) => x.name === el.name);
      if (f) el.value = f.value;
    }
  }
}

function load(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
    if (saved && Date.now() - saved.at <= MAX_AGE_MS) return saved;
    sessionStorage.removeItem(KEY);
  } catch { /* storage indisponivel */ }
  return null;
}

// Se o servidor devolve o mesmo endereco com erro, a URL nao muda e o formulario e recriado vazio: preenche o novo.
function watch(form: HTMLFormElement) {
  const started = Date.now();
  let fills = 0;
  const timer = setInterval(() => {
    if (Date.now() - started > 20_000) return clearInterval(timer);
    if (form.isConnected && fills === 0) return;
    const saved = load();
    if (!saved || !new URLSearchParams(location.search).get("error")) return clearInterval(timer);
    restore(saved);
    if (++fills >= 3) clearInterval(timer);
  }, 150);
}

/** Guarda o que foi digitado num formulario e preenche de novo se o servidor voltar com erro (?error=). Senhas nunca sao guardadas. */
export function FormKeeper() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.noKeep !== undefined) return;
      const fields = fieldsOf(form).map((el) => ({
        name: el.name,
        type: el.type,
        value: el.value,
        checked: el instanceof HTMLInputElement ? el.checked : false,
      }));
      if (!fields.length) return;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ sig: signature(form), fields, at: Date.now() } satisfies Saved));
      } catch { /* storage indisponivel */ }
      watch(form);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  useEffect(() => {
    const saved = load();
    if (!saved) return;
    if (!search.get("error")) {
      sessionStorage.removeItem(KEY);
      return;
    }
    const s = saved;
    // React limpa formularios depois da action; preenche de novo logo em seguida.
    const timers = [0, 60, 250, 600].map((ms) => setTimeout(() => restore(s), ms));
    return () => timers.forEach(clearTimeout);
  }, [pathname, search]);

  return null;
}
