import type { ImpactItem } from "@/lib/impact";

export function ImpactGrid({ items }: { items: ImpactItem[] }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <li key={i.key} className="rounded-lg bg-raised px-3 py-2">
          <p className="text-2xl font-bold">{i.value}</p>
          <p className="text-xs text-muted">{i.label}</p>
          {i.note && <p className="mt-0.5 text-[11px] text-muted/80">{i.note}</p>}
        </li>
      ))}
    </ul>
  );
}
