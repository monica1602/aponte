const OPEN_BEFORE_MS = 30 * 60 * 1000;

export function eventTimeMs(value: string): number {
  return Date.parse(`${String(value).slice(0, 16)}:00-03:00`);
}

export function checkInWindow(startsAt: string, endsAt: string, now = Date.now()) {
  const opens = eventTimeMs(startsAt) - OPEN_BEFORE_MS;
  const closes = eventTimeMs(endsAt);
  const state: "before" | "open" | "closed" = now < opens ? "before" : now > closes ? "closed" : "open";
  return { opens, closes, state };
}

export function spTime(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export function eventStarted(startsAt: string, now = Date.now()): boolean {
  return eventTimeMs(startsAt) <= now;
}

const CHECKOUT_AFTER_END_MS = 2 * 60 * 60 * 1000;

/** O check-out vale do check-in ate 2 horas depois do fim do evento. */
export function checkOutOpen(endsAt: string, now = Date.now()): boolean {
  return now <= eventTimeMs(endsAt) + CHECKOUT_AFTER_END_MS;
}
