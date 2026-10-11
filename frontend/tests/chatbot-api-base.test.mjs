/**
 * Regression tests for the chatbot public API base URL.
 *
 * Bug fixed in Phase 10A: chatbotService.js resolved its public-chatbot base
 * URL as `import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"`,
 * silently targeting localhost whenever the build-time env was missing. It now
 * reuses the shared API_URL from src/api/client.js.
 *
 * These tests import the real modules in Node (getEnv falls through to
 * process.env, import.meta.env is simply undefined outside Vite) with a
 * stubbed fetch to capture the exact request URL for each env configuration.
 *
 * Run: node --test tests/chatbot-api-base.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toFileUrl = (p) => "file:///" + p.split(path.sep).join("/");
const SERVICE_URL = toFileUrl(path.join(FRONTEND_ROOT, "src", "services", "chatbotService.js"));
const HOOKS_URL = toFileUrl(path.join(FRONTEND_ROOT, "tests", "esm-specifier-hooks.mjs"));

// Probe: stub browser globals + fetch, import the real service, fire one
// request per public/authenticated entry point, print captured calls.
const PROBE = `
import { register } from "node:module";
register(${JSON.stringify(HOOKS_URL)});
const calls = [];
globalThis.localStorage = { getItem: () => "stub-token", setItem() {}, removeItem() {} };
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {} });
  return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
};
const svc = await import(${JSON.stringify(SERVICE_URL)});
await svc.fetchPublicChatbotWelcome();
await svc.sendPublicChatbotMessage("hello");
await svc.sendChatbotMessage("hi");
console.log("CAPTURED:" + JSON.stringify(calls));
`;

function probe(env = {}) {
  const childEnv = { ...process.env };
  for (const key of ["VITE_API_BASE_URL", "REACT_APP_API_URL"]) delete childEnv[key];
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", PROBE],
    { cwd: FRONTEND_ROOT, env: { ...childEnv, ...env }, encoding: "utf8" }
  );
  const line = out.trim().split("\n").find((l) => l.startsWith("CAPTURED:"));
  assert.ok(line, "probe emitted captured calls");
  return JSON.parse(line.slice("CAPTURED:".length));
}

function assertNoLocalhost(calls) {
  for (const c of calls) {
    assert.doesNotMatch(c.url, /127\.0\.0\.1|localhost/i, `url must not target localhost: ${c.url}`);
  }
}

test("configured VITE_API_BASE_URL is used as-is for public chatbot calls", () => {
  const calls = probe({ VITE_API_BASE_URL: "https://api.example.com/api" });
  assert.equal(calls[0].url, "https://api.example.com/api/chatbot/public/welcome");
  assert.equal(calls[1].url, "https://api.example.com/api/chatbot/public/message");
  assertNoLocalhost(calls);
});

test("trailing slash on VITE_API_BASE_URL does not produce double slashes", () => {
  const calls = probe({ VITE_API_BASE_URL: "https://api.example.com/api/" });
  for (const c of calls) assert.doesNotMatch(c.url, /([^:])\/\//, `double slash in ${c.url}`);
  assert.equal(calls[0].url, "https://api.example.com/api/chatbot/public/welcome");
});

test("no duplicated /api segment when base ends with /api", () => {
  const calls = probe({ VITE_API_BASE_URL: "https://railway.example.com/api" });
  assert.equal(calls[2].url, "https://railway.example.com/api/chatbot/message");
  for (const c of calls) assert.doesNotMatch(c.url, /\/api\/api\//);
});

test("missing API config falls back to same-origin /api, never localhost", () => {
  const calls = probe();
  assert.equal(calls[0].url, "/api/chatbot/public/welcome");
  assert.equal(calls[1].url, "/api/chatbot/public/message");
  assert.equal(calls[2].url, "/api/chatbot/message");
  assertNoLocalhost(calls);
});

test("legacy REACT_APP_API_URL is honored like the main client", () => {
  const calls = probe({ REACT_APP_API_URL: "https://legacy.example.com/api" });
  assert.equal(calls[0].url, "https://legacy.example.com/api/chatbot/public/welcome");
});

test("VITE_API_BASE_URL takes precedence over REACT_APP_API_URL", () => {
  const calls = probe({
    VITE_API_BASE_URL: "https://vite.example.com/api",
    REACT_APP_API_URL: "https://legacy.example.com/api",
  });
  assert.equal(calls[0].url, "https://vite.example.com/api/chatbot/public/welcome");
});

test("public message POST sends JSON headers and body", () => {
  const calls = probe({ VITE_API_BASE_URL: "https://api.example.com/api" });
  const post = calls[1];
  assert.equal(post.method, "POST");
  assert.equal(post.headers["Content-Type"], "application/json");
  assert.equal(post.headers.Accept, "application/json");
});

test("authenticated chatbot message uses the same base and bearer token", () => {
  const calls = probe({ VITE_API_BASE_URL: "https://api.example.com/api" });
  const authed = calls[2];
  assert.equal(authed.method, "POST");
  assert.equal(authed.headers.Authorization, "Bearer stub-token");
});

test("service source contains no hardcoded localhost fallback", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path.join(FRONTEND_ROOT, "src", "services", "chatbotService.js"), "utf8");
  assert.doesNotMatch(src, /127\.0\.0\.1|localhost/);
  assert.match(src, /API_URL/, "service must derive its base from the shared client");
});
