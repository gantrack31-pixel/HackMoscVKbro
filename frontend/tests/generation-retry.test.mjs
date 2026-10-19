import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
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
const accountStorage = await readFile(new URL("../src/state/accountStorage.ts", import.meta.url), "utf8");

function recoveryRuntime(storage) {
  function load(source, require = () => { throw new Error("Unexpected import"); }) {
    const exports = {};
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(output, { exports, require, sessionStorage: storage, localStorage: storage });
    return exports;
  }
  const accounts = load(accountStorage);
  return { ...load(pendingJob, name => { assert.equal(name, "../../state/accountStorage"); return accounts; }), ...accounts };
}

test("retry controls are shown only for retryable generation jobs", () => {
  assert.match(source, /!failedJob \|\| !failedJob\.retryable/);
  assert.match(source, /Повторить создание/);
  assert.match(source, /Повторить оформление/);
  assert.match(source, /api\.retryJob\(failedJob\.id\)/);
});

test("failed retry preserves an existing project and returns to its result screen", () => {
  assert.match(source, /keepCurrentResult && result \? 4 : content \? 2 : 3/);
  assert.match(source, /setResult\(project\)/);
  assert.match(source, /setFailedJob\(null\)/);
});

test("pending generation survives remount and remains isolated between accounts", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const first = recoveryRuntime(storage);
  const job = { id: "job-a", kind: "generate", content: { title: "Approved outline", slides: [{ title: "Revenue", body: "100 → 123" }] }, sourceText: "Imported source + authored note", templateId: "tech" };
  first.writePendingJob("alice", job);
  first.writePendingJob("bob", { id: "job-b", kind: "regenerate", sourceProjectId: "project-b" });
  const remounted = recoveryRuntime(storage);
  assert.equal(JSON.stringify(remounted.readPendingJob("alice")), JSON.stringify(job));
  assert.equal(remounted.readPendingJob("bob").id, "job-b");
  assert.equal(remounted.readPendingJob("charlie"), null);
  remounted.clearPendingGenerationJob("alice");
  assert.equal(remounted.readPendingJob("alice"), null);
  assert.equal(remounted.readPendingJob("bob").id, "job-b");
});

test("corrupt or unavailable recovery storage does not restore an unrelated job", () => {
  const storage = { getItem: () => "broken json", setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("disabled"); } };
  const runtime = recoveryRuntime(storage);
  assert.equal(runtime.readPendingJob("alice"), null);
  assert.doesNotThrow(() => runtime.writePendingJob("alice", { id: "job", kind: "generate" }));
  assert.doesNotThrow(() => runtime.clearPendingGenerationJob("alice"));
  storage.getItem = () => '{"id":"job","kind":"unknown"}';
  assert.equal(runtime.readPendingJob("alice"), null);
});

test("only an explicit terminal job failure is eligible to discard recovery", () => {
  const runtime = recoveryRuntime({ getItem: () => null, setItem() {}, removeItem() {} });
  for (const failure of [new Error("Offline"), {status: 401}, {status: 503}, {code: "INVALID_RESPONSE"}, {status: 404}]) {
    assert.equal(runtime.isTerminalJobFailure(failure), false);
  }
  assert.equal(runtime.isTerminalJobFailure({terminal: true, retryable: true, jobId: "job-a"}), true);
  assert.equal(runtime.isTerminalJobFailure({terminal: true, retryable: false, status: 404}), true);
});

test("malformed and unrelated poll responses cannot publish or erase the saved job", () => {
  const runtime = recoveryRuntime({ getItem: () => null, setItem() {}, removeItem() {} });
  for (const response of [null, {}, {id: "other",state:"complete",stage:"ready",project_id:"p"},
    {id:"job-a",state:"complete",stage:"ready",project_id:null}, {id:"job-a",state:"unexpected",stage:"ready"}]) {
    assert.throws(() => runtime.checkedJob(response,"job-a"));
  }
  for (const state of ["queued","running","failed","cancelled"]) {
    assert.equal(runtime.checkedJob({id:"job-a",state,stage:"working"},"job-a").state,state);
  }
  assert.equal(runtime.checkedJob({id:"job-a",state:"complete",stage:"ready",project_id:"p"},"job-a").project_id,"p");
  assert.throws(() => runtime.checkedProject({id:"p"},"p"));
  assert.throws(() => runtime.checkedProject({id:"different",template:{},content:{slides:[]},variants:{a:[],b:[],c:[]}},"p"));
  assert.equal(runtime.checkedProject({id:"p",template:{},content:{slides:[]},variants:{a:[],b:[],c:[]}},"p").id,"p");
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
  assert.match(app, /clearPendingGenerationJob\(user\.id\)/);
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
