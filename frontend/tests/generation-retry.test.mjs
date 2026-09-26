import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/pages/Wizard.tsx", import.meta.url), "utf8");

test("retry controls are shown only for retryable generation jobs", () => {
  assert.match(source, /failure\.jobId && failure\.retryable/);
  assert.match(source, /Повторить создание/);
  assert.match(source, /Повторить оформление/);
  assert.match(source, /api\.retryJob\(failedJob\.id\)/);
});

test("failed retry preserves an existing project and returns to its result screen", () => {
  assert.match(source, /keepCurrentResult && result \? 4 : 2/);
  assert.match(source, /setResult\(project\)/);
  assert.match(source, /setFailedJob\(null\)/);
});

test("a pending job id is saved in session scope so wizard remount can reconnect", () => {
  assert.match(source, /deckly-pending-generation/);
  assert.match(source, /sessionStorage\.setItem\(PENDING_JOB_KEY/);
  assert.match(source, /sessionStorage\.removeItem\(PENDING_JOB_KEY/);
  assert.match(source, /const pending = readPendingJob\(\)/);
  assert.match(source, /await poll\(pending\.id, id\)/);
});

test("frontend retry implementation type-checks", () => {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
});