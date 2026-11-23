"use client";

import { PROJECT_KINDS, PROJECT_VISIBILITY } from "@/lib/catalog";

const card = "cursor-pointer rounded-md border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent";

export function ProjectKindVisibility({ kinds, help }: { kinds: (keyof typeof PROJECT_KINDS)[]; help: Record<string, string> }) {
  const first = kinds[0];
  function onKind(e: React.ChangeEvent<HTMLInputElement>) {
    const target = e.currentTarget.form?.querySelector<HTMLInputElement>(
      `input[name="visibility"][value="${e.currentTarget.value === "open_source" ? "open" : "public"}"]`
    );
    if (target) target.checked = true;
  }
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tipo de projeto *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {kinds.map((k) => (
            <label key={k} className={card}>
              <input type="radio" name="kind" value={k} defaultChecked={k === first} onChange={onKind} className="mr-2 accent-[#9db4ff]" />
              <span className="font-medium">{PROJECT_KINDS[k]}</span>
              <span className="mt-1 block text-xs text-muted">{help[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Quem pode ver este projeto? *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(PROJECT_VISIBILITY).map(([v, o]) => (
            <label key={v} className={card}>
              <input type="radio" name="visibility" value={v} defaultChecked={v === (first === "open_source" ? "open" : "public")} className="mr-2 accent-[#9db4ff]" />
              <span className="font-medium">{o.label}</span>
              <span className="mt-1 block text-xs text-muted">{o.help}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
