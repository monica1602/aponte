import { test } from "node:test";
import assert from "node:assert/strict";
const { CONTACT, CONTACT_TYPES, contactMail, contactProblem } = await import("../src/lib/contact.ts");

const ok = { name: "Maria Souza", email: "maria@email.com", type: "Dúvida", message: "Como viro mentora?" };

test("formulario de contato: campos validos passam", () => {
  assert.equal(contactProblem(ok), null);
  for (const type of CONTACT_TYPES) assert.equal(contactProblem({ ...ok, type }), null);
});

test("formulario de contato: recusa vazio, e-mail invalido, tipo inventado e texto longo", () => {
  assert.equal(contactProblem({ ...ok, name: "" }), "Informe seu nome.");
  assert.equal(contactProblem({ ...ok, email: "maria" }), "Informe um e-mail válido.");
  assert.equal(contactProblem({ ...ok, type: "Spam" }), "Escolha o tipo da mensagem.");
  assert.equal(contactProblem({ ...ok, message: "" }), "Escreva a descrição.");
  assert.match(contactProblem({ ...ok, name: "a".repeat(101) }), /100 caracteres/);
  assert.equal(contactProblem({ ...ok, message: "a".repeat(2000) }), null);
  assert.match(contactProblem({ ...ok, message: "a".repeat(2001) }), /2000 caracteres/);
});

test("e-mail de contato: vai para a Ponte, responde para a pessoa e escapa o HTML", () => {
  const m = contactMail({ ...ok, name: "Maria\r\nBcc: x@y.com", message: "<script>x</script>\nlinha 2" });
  assert.equal(m.to, CONTACT.email);
  assert.equal(m.replyTo, "maria@email.com");
  assert.equal(m.subject, "[Contato] Dúvida — Maria Bcc: x@y.com");
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
  assert.match(m.text, /linha 2/);
});
