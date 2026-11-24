import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_MAX, messageProblem, messageTime, otherOf, pair } from "../src/lib/messages.ts";

test("mensagens: par ordenado, outra pessoa, tamanho e horario", () => {
  assert.deepEqual(pair(9, 3), [3, 9]);
  assert.deepEqual(pair(3, 9), [3, 9]);
  assert.equal(otherOf({ user_a: 3, user_b: 9 }, 3), 9);
  assert.equal(otherOf({ user_a: 3, user_b: null }, 3), null);
  assert.equal(messageProblem(""), "Escreva a mensagem.");
  assert.equal(messageProblem("x".repeat(MESSAGE_MAX)), null);
  assert.match(messageProblem("x".repeat(MESSAGE_MAX + 1)), /ate 2000 caracteres/);
  assert.equal(messageTime("2026-11-24 13:05:00"), "24/11/2026, 10:05");
});

test("denuncias: motivo, tamanho e Outro com texto", async () => {
  const { reportProblem, REPORT_DETAILS_MAX } = await import("../src/lib/moderation.ts");
  assert.equal(reportProblem("xyz", ""), "Escolha o motivo da denuncia.");
  assert.equal(reportProblem("assedio", ""), null);
  assert.match(reportProblem("outro", ""), /descreva/);
  assert.equal(reportProblem("outro", "texto"), null);
  assert.match(reportProblem("spam", "x".repeat(REPORT_DETAILS_MAX + 1)), /ate 1000/);
});

test("avaliacoes: nota, comentario, relato sensivel e janela de 30 dias", async () => {
  const { reviewProblem, eventReviewOpen } = await import("../src/lib/reviews.ts");
  assert.match(reviewProblem(0, "", false, ""), /nota/);
  assert.equal(reviewProblem(5, "", false, ""), null);
  assert.match(reviewProblem(4, "", true, ""), /relato/);
  assert.match(reviewProblem(4, "x".repeat(1001), false, ""), /ate 1000/);
  const end = Date.parse("2026-01-10T12:00:00-03:00");
  assert.equal(eventReviewOpen("2026-01-10T12:00", end - 1), false);
  assert.equal(eventReviewOpen("2026-01-10T12:00", end + 29 * 86400000), true);
  assert.equal(eventReviewOpen("2026-01-10T12:00", end + 31 * 86400000), false);
});

test("anexos: tipo pelo conteudo, tamanho e nome seguro", async () => {
  const { sniffType, fileProblem, safeFilename, ATTACH_MAX_BYTES } = await import("../src/lib/attachments.ts");
  const b = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  assert.equal(sniffType(b("%PDF-1.4 x")), "application/pdf");
  assert.equal(sniffType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(sniffType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffType(b("RIFF....WEBPVP8 ")), "image/webp");
  assert.equal(sniffType(b("<svg onload=alert(1)>")), null);
  assert.equal(sniffType(b("PK\x03\x04")), null);
  assert.match(fileProblem(ATTACH_MAX_BYTES + 1, "application/pdf", "profile"), /2 MB/);
  assert.match(fileProblem(10, null, "profile"), /Formato/);
  assert.match(fileProblem(10, "image/png", "resume"), /PDF/);
  assert.equal(fileProblem(10, "image/png", "profile"), null);
  assert.equal(safeFilename('Currículo "final".exe.pdf', "application/pdf"), "Curriculo-final-.exe.pdf");
});

test("tarefas: papeis, distribuicao, situacao, entrega e revisao", async () => {
  const t = await import("../src/lib/project-tasks.ts");
  const team = [
    { id: 1, name: "Dona", role: "coordinator", fn: "", owner: true },
    { id: 2, name: "Coord", role: "coordinator", fn: "", owner: false },
    { id: 3, name: "Part", role: "participant", fn: "", owner: false },
    { id: 4, name: "Mentor", role: "mentor", fn: "", owner: false },
  ];
  const [dona, coord, part, mentor] = team;
  assert.ok(t.canCreateFor(dona, team, 3) && t.canCreateFor(coord, team, null));
  assert.ok(!t.canCreateFor(dona, team, 4) && !t.canCreateFor(dona, team, 99));
  assert.ok(t.canCreateFor(part, team, 3) && !t.canCreateFor(part, team, 2) && !t.canCreateFor(mentor, team, 4));
  assert.deepEqual(t.statusesFor(part, { assignee_id: 3 }), ["todo", "doing"]);
  assert.deepEqual(t.statusesFor(part, { assignee_id: 2 }), []);
  assert.deepEqual(t.statusesFor(coord, { assignee_id: 3 }), ["todo", "doing", "done"]);
  assert.ok(t.canDeleteTask(part, { created_by: 3 }) && !t.canDeleteTask(part, { created_by: 1 }) && !t.canDeleteTask(mentor, { created_by: 4 }));
  assert.ok(t.canDeliver(part, { assignee_id: 3, status: "doing" }, false));
  assert.ok(!t.canDeliver(part, { assignee_id: 3, status: "doing" }, true) && !t.canDeliver(part, { assignee_id: 3, status: "done" }, false));
  assert.ok(t.canReview(mentor, { author_id: 3, status: "pending" }) && t.canReview(coord, { author_id: 3, status: "pending" }));
  assert.ok(!t.canReview(part, { author_id: 2, status: "pending" }) && !t.canReview(coord, { author_id: 2, status: "pending" }));
  assert.ok(!t.canReview(mentor, { author_id: 3, status: "approved" }));
  assert.equal(t.taskProblem("ok", "", "2026-12-01"), null);
  assert.match(t.taskProblem("x", "", ""), /titulo/);
  assert.match(t.taskProblem("ok", "", "01/12/2026"), /Prazo/);
  assert.match(t.taskProblem("ok", "a".repeat(1001), ""), /1000/);
});
