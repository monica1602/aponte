import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrice, formatPrice, priceInput } from "../src/lib/event-price.ts";

test("valor do evento: aceita formatos em reais e recusa texto", () => {
  assert.equal(parsePrice("50"), 5000);
  assert.equal(parsePrice("50,5"), 5050);
  assert.equal(parsePrice("R$ 1.234,56"), 123456);
  assert.equal(parsePrice("19.90"), 1990);
  for (const bad of ["", "abc", "-5", "1,234", "1.234", "javascript:1"]) assert.equal(parsePrice(bad), null, bad);
  assert.equal(formatPrice(5000), "R$ 50,00");
  assert.equal(priceInput(5050), "50,50");
  assert.equal(priceInput(0), "");
});

test("link da contribuicao: dominio so para enderecos de site validos", async () => {
  const { linkHost } = await import("../src/lib/url.ts");
  assert.equal(linkHost("https://www.GitHub.com/ana/x"), "github.com");
  assert.equal(linkHost("lu.ma/evento?x=1"), "lu.ma");
  for (const bad of ["", "//site-falso.com", "javascript:alert(1)", "data:text/html,oi", "/admin", "ftp://x.com", "texto solto"]) assert.equal(linkHost(bad), "", bad);
});
