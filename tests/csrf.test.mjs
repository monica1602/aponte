import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest } from "../src/lib/csrf.ts";

const base = { method: "POST", origin: null, host: "aponte.app", forwardedHost: null, secFetchSite: null };

test("GET nunca e bloqueado", () => {
  assert.equal(isSameOriginRequest({ ...base, method: "GET", origin: "https://mal.com", secFetchSite: "cross-site" }), true);
});

test("POST do proprio site passa", () => {
  assert.equal(isSameOriginRequest({ ...base, origin: "https://aponte.app", secFetchSite: "same-origin" }), true);
  assert.equal(isSameOriginRequest({ ...base, origin: "https://aponte.app" }), true);
  assert.equal(isSameOriginRequest({ ...base, secFetchSite: "same-origin" }), true);
  assert.equal(isSameOriginRequest({ ...base, host: "localhost:3000", forwardedHost: "aponte.app", origin: "https://aponte.app" }), true);
});

test("POST de outro site e bloqueado", () => {
  assert.equal(isSameOriginRequest({ ...base, origin: "https://mal.com" }), false);
  assert.equal(isSameOriginRequest({ ...base, origin: "https://mal.com", secFetchSite: "same-origin" }), false);
  assert.equal(isSameOriginRequest({ ...base, origin: "https://aponte.app", secFetchSite: "cross-site" }), false);
  assert.equal(isSameOriginRequest({ ...base, origin: "https://sub.aponte.app", secFetchSite: "same-site" }), false);
  assert.equal(isSameOriginRequest({ ...base, origin: "null" }), false);
});

test("POST sem origem e sem Sec-Fetch-Site e bloqueado", () => {
  assert.equal(isSameOriginRequest(base), false);
});
