import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/state/draftRecovery.ts", import.meta.url), "utf8");
function runtime(readLatest) {
  const events = [], blobs = [], exports = {};
  const anchor = { click() { events.push("download"); }, remove() { events.push("remove"); } };
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    exports, Blob, Date,
    require(name) { assert.equal(name, "../api"); return { api: { async project(id) { events.push("read:" + id); return readLatest(id); } } }; },
    URL: { createObjectURL(blob) { blobs.push(blob); return "blob:test"; }, revokeObjectURL() {} },
    document: { createElement(name) { assert.equal(name, "a"); return anchor; }, body: { append() { events.push("append"); } } },
    setTimeout() {},
  });
  return { ...exports, events, blobs, anchor };
}
const project = { id: "p1", updated_at: "v1", template_id: "tech", variant: "b", source_text: "Original source", provenance: { effective_style: { metadata: { accent: "#008877" } } } };
const content = { title: "Unsaved draft", slides: [{ title: "One" }, { title: "Two", analytics: { source: "Evidence" } }] };

test("failed latest-version read leaves the only working copy untouched and creates no download", async () => {
  const recovery = runtime(() => { throw new Error("Offline"); });
  await assert.rejects(recovery.backupDraftAndReadLatest(project, content, "v1", "editor", 0), /Offline/);
  assert.deepEqual(recovery.events, ["read:p1"]);
  assert.equal(recovery.blobs.length, 0);
});

test("successful recovery downloads the entire old draft before handing the fresh version to the editor", async () => {
  const latest = { ...project, updated_at: "v2", content: { title: "Newer server data" } };
  const recovery = runtime(() => latest);
  const returned = await recovery.backupDraftAndReadLatest(project, content, "v1", "audit", 1);
  assert.equal(returned, latest);
  assert.deepEqual(recovery.events, ["read:p1", "append", "download", "remove"]);
  const backup = JSON.parse(await recovery.blobs[0].text());
  assert.deepEqual(backup.content, content);
  assert.deepEqual(backup.provenance, project.provenance);
  assert.equal(backup.source_text, project.source_text);
  assert.equal(backup.base_updated_at, "v1");
  assert.equal(backup.slide_index, 1);
  assert.match(recovery.anchor.download, /\.json$/);
  assert.equal(recovery.isVersionConflict({ status: 409 }), true);
  assert.equal(recovery.isVersionConflict({ status: 503 }), false);
});
