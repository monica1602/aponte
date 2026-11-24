import { test } from "node:test";
import assert from "node:assert/strict";

const { meetingState, canConfirmMeeting, meetingStarted } = await import("../src/lib/meetings.ts");

test("situacao do encontro", () => {
  assert.equal(meetingState({ status: "scheduled", confirmed_at: null }), "pending");
  assert.equal(meetingState({ status: "scheduled", confirmed_at: "2026-11-23 10:00:00" }), "confirmed");
  assert.equal(meetingState({ status: "completed", confirmed_at: null }), "completed");
  assert.equal(meetingState({ status: "cancelled", confirmed_at: "2026-11-23 10:00:00" }), "cancelled");
});

test("so a outra pessoa confirma; encontro antigo pode ser confirmado por qualquer uma", () => {
  const m = { status: "scheduled", confirmed_at: null, proposed_by: 1 };
  assert.equal(canConfirmMeeting(m, 1), false);
  assert.equal(canConfirmMeeting(m, 2), true);
  assert.equal(canConfirmMeeting({ ...m, proposed_by: null }, 1), true);
  assert.equal(canConfirmMeeting({ ...m, confirmed_at: "2026-11-23 10:00:00" }, 2), false);
  assert.equal(canConfirmMeeting({ ...m, status: "cancelled" }, 2), false);
});

test("concluir so depois do horario de inicio", () => {
  const now = Date.parse("2026-11-23T15:00:00-03:00");
  assert.equal(meetingStarted("2026-11-23T14:59", now), true);
  assert.equal(meetingStarted("2026-11-23T15:30", now), false);
});
