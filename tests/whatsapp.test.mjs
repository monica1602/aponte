import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappConfig, whatsappRequestUrl } from "../src/lib/whatsapp.ts";

test("aviso de WhatsApp fica desligado sem telefone ou chave", () => {
  assert.equal(whatsappConfig({}), null);
  assert.equal(whatsappConfig({ ADMIN_WHATSAPP: "5511999999999" }), null);
  assert.equal(whatsappConfig({ CALLMEBOT_API_KEY: "123" }), null);
});

test("monta a URL do CallMeBot com telefone normalizado e texto codificado", () => {
  const cfg = whatsappConfig({ ADMIN_WHATSAPP: "+55 (11) 99999-9999", CALLMEBOT_API_KEY: " 123456 " });
  const url = new URL(whatsappRequestUrl(cfg, "Novo cadastro: Maria & Jose\nVer: x"));
  assert.equal(url.origin + url.pathname, "https://api.callmebot.com/whatsapp.php");
  assert.equal(url.searchParams.get("phone"), "+5511999999999");
  assert.equal(url.searchParams.get("apikey"), "123456");
  assert.equal(url.searchParams.get("text"), "Novo cadastro: Maria & Jose\nVer: x");
});
