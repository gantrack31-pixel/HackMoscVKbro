import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const client = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
globalThis.window = new EventTarget();
let expired = 0;
window.addEventListener("session-expired", () => expired++);
const respond = (body, status = 200, headers = {"Content-Type": "application/json"}) => {
  globalThis.fetch = async () => new Response(body, {status, headers});
};

test("structured API errors produce useful strings, status and safe codes", async () => {
  respond(JSON.stringify({detail: [{msg: "First input"}, null, {msg: {unexpected: true}}, {msg: "Second input"}]}), 422);
  await assert.rejects(client.request("/projects"), error => error.status === 422 && error.message === "First input; Second input");
  respond(JSON.stringify({detail: {message: {unexpected: true}, code: {bad: true}}}), 500);
  await assert.rejects(client.request("/projects"), error => error.status === 500 && typeof error.code === "undefined" && !error.message.includes("[object Object]"));
  respond(JSON.stringify({detail: {message: {detail: "Nested explanation"}, code: "VERSION_CONFLICT"}}), 409);
  await assert.rejects(client.request("/projects"), error => error.status === 409 && error.code === "VERSION_CONFLICT" && error.message === "Nested explanation");
  respond("<html>upstream error</html>", 429, {"Content-Type": "text/html"});
  await assert.rejects(client.request("/projects"), error => error.status === 429 && error.message.includes("Подождите"));
});

test("session expiration is signalled for protected APIs and downloads, not login errors", async () => {
  expired = 0;
  respond("Unauthorized", 401, {"Content-Type": "text/plain"});
  await assert.rejects(client.request("/projects"));
  assert.equal(expired, 1);
  await assert.rejects(client.request("/auth/login"));
  assert.equal(expired, 1);
  await assert.rejects(client.downloadBlob("/api/projects/p/export/pdf", "pdf"), error => error.status === 401);
  assert.equal(expired, 2);
});

test("cancellation remains identifiable and offline errors remain readable", async () => {
  respond(JSON.stringify({detail: {code: "AI_CANCELLED"}}), 409);
  await assert.rejects(client.request("/projects"), error => error.code === "AI_CANCELLED" && error.message === "Остановлено");
  globalThis.fetch = async () => { throw new TypeError("Network failed"); };
  await assert.rejects(client.request("/projects"), error => error.message.includes("Проверьте соединение"));
  const controller = new AbortController();
  controller.abort();
  const abort = new DOMException("Aborted", "AbortError");
  globalThis.fetch = async () => { throw abort; };
  await assert.rejects(client.request("/projects", {signal: controller.signal}), error => error === abort);
});

test("malformed success JSON reports a recoverable product error and 204 stays empty", async () => {
  respond("<html>unexpected login page</html>", 200, {"Content-Type": "text/html"});
  await assert.rejects(client.request("/projects"), error => error.code === "INVALID_RESPONSE" && error.message.includes("черновике"));
  respond(null, 204);
  assert.equal(await client.request("/projects"), undefined);
});

test("downloads reject successful HTTP error pages and mismatched binary payloads", async () => {
  respond("<html>upstream error</html>", 200, {"Content-Type": "text/html"});
  await assert.rejects(client.downloadBlob("/api/projects/p/export/pptx", "pptx"), error => error.code === "INVALID_DOWNLOAD");
  await assert.rejects(client.downloadBlob("/api/projects/p/export/html", "html"), error => error.code === "INVALID_DOWNLOAD");
  respond("not a PDF", 200, {"Content-Type": "application/pdf"});
  await assert.rejects(client.downloadBlob("/api/projects/p/export/pdf", "pdf"), error => error.code === "INVALID_DOWNLOAD");
});

test("matching PDF, PPTX and standalone slide HTML remain downloadable", async () => {
  respond("%PDF-1.7\nexample", 200, {"Content-Type": "application/pdf"});
  assert.equal((await client.downloadBlob("/api/projects/p/export/pdf", "pdf")).type, "application/pdf");
  respond(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 200, {"Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation"});
  assert.equal((await client.downloadBlob("/api/projects/p/export/pptx", "pptx")).size, 6);
  respond('<!doctype html><html><section><svg xmlns="http://www.w3.org/2000/svg"></svg></section></html>', 200, {"Content-Type": "text/html; charset=utf-8"});
  assert.ok((await client.downloadBlob("/api/projects/p/export/html", "html")).size > 0);
});
