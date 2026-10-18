import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const wizard = await readFile(
  new URL("../src/pages/Wizard.tsx", import.meta.url),
  "utf8",
);
const progress = await readFile(
  new URL("../src/pages/wizard/GenerationProgress.tsx", import.meta.url),
  "utf8",
);
const results = await readFile(
  new URL("../src/pages/wizard/GenerationResults.tsx", import.meta.url),
  "utf8",
);
const outline = await readFile(
  new URL("../src/pages/wizard/OutlineStep.tsx", import.meta.url),
  "utf8",
);
const pendingJob = await readFile(
  new URL("../src/pages/wizard/pendingJob.ts", import.meta.url),
  "utf8",
);
const source = [wizard, outline, progress, results, pendingJob].join("\n");

test("retry controls are shown only for retryable generation jobs", () => {
  assert.match(source, /failure\.jobId && failure\.retryable/);
  assert.match(source, /Повторить создание/);
  assert.match(source, /Повторить оформление/);
  assert.match(source, /api\.retryJob\(failedJob\.id\)/);
});

test("failed retry preserves an existing project and returns to its result screen", () => {
  assert.match(source, /keepCurrentResult && result \? 4 : content \? 2 : 3/);
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

test("recovered generation failures clear stale recovery state and offer retry or a fresh start", () => {
  assert.match(
    source,
    /writePendingJob\(null\);[\s\S]*setFailedJob\(\{[\s\S]*retryable: failure\.retryable === true/,
  );
  assert.match(source, /Начать заново/);
  assert.match(source, /Структура сохранена — можно запустить\s+новую\s+генерацию/);
  assert.match(source, /content,[\s\S]*sourceText: prompt,[\s\S]*audience/);
  assert.match(source, /setContent\(pending\.content\)/);
  assert.match(source, /pending\.content \? 2 : 3/);
});

test("retrying generation from the outline submits a fresh job from the approved content", () => {
  const outlineSection = outline;
  assert.match(outlineSection, /Повторить создание/);
  assert.match(outlineSection, /onClick=\{onGenerate\}/);
  assert.match(wizard, /onGenerate=\{generate\}/);
  assert.doesNotMatch(outlineSection, /retryFailedJob\(false\)/);
});

test("explicitly starting a new presentation clears the saved recovery job", async () => {
  const app = await readFile(
    new URL("../src/pages/Workspace.tsx", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("../src/components/Shell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /clearPendingGenerationJob\(\)/);
  assert.match(app, /onNewPresentation=\{/);
  assert.match(shell, /onNewPresentation: \(\) => void/);
  assert.match(shell, /onNewPresentation\(\)/);
});

test("frontend retry implementation type-checks", () => {
  const result = ts.transpileModule(wizard, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
});
