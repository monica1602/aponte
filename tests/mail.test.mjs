import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const got = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    got.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    res.writeHead(req.url.includes("recusa") ? 400 : 201, { "Content-Type": "application/json" }).end('{"messageId":"x"}');
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const { sendMail, mailProvider, mailConfigured, BREVO_SENDER } = await import("../src/lib/mail.ts");

function setEnv(env) {
  for (const k of ["BREVO_API_KEY", "BREVO_API_URL", "RESEND_API_KEY", "RESEND_API_URL"]) delete process.env[k];
  Object.assign(process.env, env);
}

test("sem chaves, nao ha servico de e-mail", () => {
  setEnv({});
  assert.equal(mailProvider(), null);
  assert.equal(mailConfigured(), false);
});

test("com BREVO_API_KEY, envia pelo Brevo com o remetente da Ponte", async () => {
  setEnv({ BREVO_API_KEY: "kb", BREVO_API_URL: `${base}/brevo`, RESEND_API_KEY: "kr", RESEND_API_URL: `${base}/resend` });
  got.length = 0;
  const r = await sendMail({ to: "a@b.com", subject: "Oi", html: "<p>Oi</p>", text: "Oi" });
  assert.equal(r.ok, true);
  assert.equal(r.provider, "Brevo");
  assert.equal(got[0].url, "/brevo");
  assert.equal(got[0].headers["api-key"], "kb");
  assert.deepEqual(got[0].body, { sender: BREVO_SENDER, to: [{ email: "a@b.com" }], subject: "Oi", htmlContent: "<p>Oi</p>", textContent: "Oi" });
});

test("sem BREVO_API_KEY, continua pelo Resend", async () => {
  setEnv({ RESEND_API_KEY: "kr", RESEND_API_URL: `${base}/resend` });
  got.length = 0;
  const r = await sendMail({ to: "a@b.com", subject: "Oi", html: "<p>Oi</p>" });
  assert.equal(r.provider, "Resend");
  assert.equal(got[0].headers.authorization, "Bearer kr");
  assert.deepEqual(got[0].body.to, ["a@b.com"]);
});

test("resposta recusada volta com ok = false e o detalhe", async () => {
  setEnv({ BREVO_API_KEY: "kb", BREVO_API_URL: `${base}/recusa` });
  const r = await sendMail({ to: "a@b.com", subject: "Oi", html: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(await r.detail(), /messageId/);
  server.close();
});
