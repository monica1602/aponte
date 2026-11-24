import { test } from "node:test";
import assert from "node:assert/strict";
import { eventStarted } from "../src/lib/event-time.ts";

const HOUR = 60 * 60 * 1000;
const brt = (ms) => new Date(ms - 3 * HOUR).toISOString().slice(0, 16);

test("cancelamento vale ate o inicio do evento (horario de Brasilia)", () => {
  const now = Date.now();
  assert.equal(eventStarted(brt(now + 2 * HOUR), now), false);
  assert.equal(eventStarted(brt(now - 60 * 1000), now), true);
  assert.equal(eventStarted(brt(now - 5 * HOUR), now), true);
});

test("check-out vale ate 2 horas depois do fim do evento", async () => {
  const { checkOutOpen } = await import("../src/lib/event-time.ts");
  const now = Date.now();
  assert.equal(checkOutOpen(brt(now + HOUR), now), true);
  assert.equal(checkOutOpen(brt(now - 90 * 60 * 1000), now), true);
  assert.equal(checkOutOpen(brt(now - 3 * HOUR), now), false);
});
