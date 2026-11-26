import { expect, test } from "@playwright/test";
import { MAIN, sql } from "./helpers";

test("PDF do certificado: o 31o download do mesmo IP em 10 minutos e recusado", async ({ request }) => {
  await request.get(`${MAIN}/api/saude`);
  const code = `LIMITE${Date.now()}`;
  const [maria] = await sql<{ id: number }>("main", "SELECT id FROM users WHERE email = ?", ["maria@email.com"]);
  await sql("main", "INSERT INTO certificates (user_id, title, verification_code) VALUES (?,?,?)", [maria.id, "Certificado do teste de limite", code]);
  const cert = { verification_code: code };
  const url = `${MAIN}/certificados/${cert.verification_code}/pdf`;
  const from = (ip: string) => ({ headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 30; i++) expect((await request.get(url, from("203.0.113.10"))).status()).toBe(200);
  const blocked = await request.get(url, from("203.0.113.10"));
  expect(blocked.status()).toBe(429);
  expect(await blocked.text()).toContain("Muitos downloads em pouco tempo. Aguarde 10 minutos");
  expect((await request.get(url, from("203.0.113.11"))).status()).toBe(200);

  for (let i = 0; i < 20; i++) expect((await request.get(`${MAIN}/certificados/NAOEXISTE${i}/pdf`, from("203.0.113.12"))).status()).toBe(404);
  expect((await request.get(url, from("203.0.113.12"))).status()).toBe(429);
  await expect.poll(async () => (await request.get(`${MAIN}/certificados/${cert.verification_code}`, from("203.0.113.12"))).status()).toBe(200);
});
