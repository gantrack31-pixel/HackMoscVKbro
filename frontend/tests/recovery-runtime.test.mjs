import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function compiled(path) {
  const source = await readFile(path, "utf8");
  let output = ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  }}).outputText;
  const imports = [...output.matchAll(/from (["'])(\.[^"']+)\1/g)];
  for (const match of imports) {
    const dependency = new URL(`${match[2]}.ts`, path);
    output = output.replace(match[0], `from ${JSON.stringify(await compiled(dependency))}`);
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}
const storageModule = await compiled(new URL("../src/state/accountStorage.ts", import.meta.url));
const storage = await import(storageModule);
let documentNumber = 0;
const newDocument = () => import(`${storageModule}#document-${++documentNumber}`);
const drafts = await import(await compiled(new URL("../src/pages/wizard/draft.ts", import.meta.url)));
const pending = await import(await compiled(new URL("../src/pages/wizard/pendingJob.ts", import.meta.url)));

function memoryStorage() {
  const values = new Map();
  return {values, failWrites: false, maxBytes: Infinity,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      const next = new Map(values).set(key, String(value));
      const bytes = [...next].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
      if (this.failWrites || bytes > this.maxBytes) throw new DOMException("Quota", "QuotaExceededError");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
}
function install() {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
}
const example = () => ({version: 1, savedAt: "2026-10-19T00:00:00Z", step: 2, mode: "text",
  prompt: "My own introduction", count: 3, audience: "Team", purpose: "project",
  resources: [], sourceBlocks: [{id: "doc-a", name: "facts.txt", text: "Distinct fact: 37", characters: 17}],
  content: {title: "Draft", slides: [{title: "First", body: "Manual edit"}]},
  templateId: "tech", variant: "a", instruction: "Keep the facts"});

test("account-scoped draft and pending recovery never read another account or global legacy IDs", () => {
  install();
  storage.writeAccount("A:other", "wizard-draft", example());
  localStorage.setItem("deckly-active-project", "legacy-A-project");
  sessionStorage.setItem("deckly-pending-generation", JSON.stringify({id: "legacy-job", kind: "generate"}));
  pending.writePendingJob("A:other", {id: "job-A", kind: "generate", sourceText: "Private source"});
  assert.equal(drafts.readWizardDraft("B"), null);
  assert.equal(pending.readPendingJob("B"), null);
  assert.equal(pending.readPendingJob("A:other").id, "job-A");
  assert.notEqual(storage.accountKey("A:other", "wizard-draft"), storage.accountKey("A", "other:wizard-draft"));
  pending.clearPendingGenerationJob("B");
  assert.equal(pending.readPendingJob("A:other").id, "job-A");
});

test("ordinary new presentation archives complete source, outline and analytical choices", () => {
  install();
  const old = {...example(), analytics: [{profile: {id: "data-1", name: "facts.csv", tables: [], warnings: []}, selection: {table_id: "table-1", chart_type: "bar", measures: ["Revenue"]}}]};
  storage.writeAccount("A", "wizard-draft", old);
  drafts.archiveWizardDraft("A");
  assert.equal(drafts.readWizardDraft("A"), null);
  assert.deepEqual(storage.readAccount("A", "wizard-previous"), old);
  assert.equal(storage.readAccount("B", "wizard-previous"), null);
});

test("failed archive cannot erase the only recoverable draft", () => {
  install();
  const old = example();
  storage.writeAccount("A", "wizard-draft", old);
  localStorage.failWrites = true;
  assert.equal(drafts.archiveWizardDraft("A"), false);
  assert.deepEqual(drafts.readWizardDraft("A"), old);
});

test("autosave updates its recovery copy when quota allows one snapshot but not two", async () => {
  install();
  const tab = await newDocument();
  const original = {...example(), prompt: "Original " + "x".repeat(10_000)};
  const edited = {...original, prompt: "Modified " + "x".repeat(10_000)};
  assert.equal(tab.writeAccount("A", "wizard-draft", original), true);
  localStorage.maxBytes = 30_000;
  const results = [];

  tab.writeAccountDeferred("A", "wizard-draft", edited, saved => results.push(saved));
  tab.flushDeferredWrites();

  assert.deepEqual(results, [true]);
  globalThis.sessionStorage = memoryStorage();
  assert.deepEqual((await newDocument()).readAccount("A", "wizard-draft"), edited);
});

test("quota failure keeps the old recovery copy if even a replacement is too large", async () => {
  install();
  const tab = await newDocument();
  const original = example();
  assert.equal(tab.writeAccount("A", "wizard-draft", original), true);
  const before = new Map(localStorage.values);
  localStorage.maxBytes = 2_000;

  assert.equal(tab.writeAccount("A", "wizard-draft", {...original, prompt: "x".repeat(10_000)}), false);

  assert.deepEqual(localStorage.values, before);
  globalThis.sessionStorage = memoryStorage();
  assert.deepEqual((await newDocument()).readAccount("A", "wizard-draft"), original);
});

test("quota fallback keeps a shared snapshot available to the other tab", async () => {
  install();
  const tabA = await newDocument(), tabB = await newDocument();
  const original = {...example(), prompt: "x".repeat(10_000)};
  assert.equal(tabA.writeAccount("A", "wizard-draft", original), true);
  globalThis.sessionStorage = memoryStorage();
  assert.equal(tabB.writeAccount("A", "wizard-draft", original), true);
  const before = new Map(localStorage.values);
  localStorage.maxBytes = 30_000;

  assert.equal(tabB.writeAccount("A", "wizard-draft", {...original, prompt: "y".repeat(10_000)}), false);

  assert.deepEqual(localStorage.values, before);
  globalThis.sessionStorage = memoryStorage();
  assert.deepEqual((await newDocument()).readAccount("A", "wizard-draft"), original);
});

test("duplicated tabs keep separate working and durable drafts through independent edits and clears", async () => {
  install();
  const tabA = await newDocument(), tabB = await newDocument();
  const sessionA = sessionStorage, sessionB = memoryStorage();
  const a = example(), b = {...a, prompt: "Second tab's edits"};
  assert.equal(tabA.writeAccount("A", "wizard-draft", a), true);
  for (const [key, value] of sessionA.values) sessionB.setItem(key, value);
  globalThis.sessionStorage = sessionB;
  assert.deepEqual(tabB.readAccount("A", "wizard-draft"), a);
  // Mounting the duplicate may initially persist exactly the same snapshot.
  assert.equal(tabB.writeAccount("A", "wizard-draft", a), true);
  assert.equal(tabB.writeAccount("A", "wizard-draft", b), true);
  globalThis.sessionStorage = sessionA;
  assert.deepEqual(tabA.readAccount("A", "wizard-draft"), a);
  globalThis.sessionStorage = sessionB;
  assert.deepEqual(tabB.readAccount("A", "wizard-draft"), b);
  assert.equal(tabB.writeAccount("A", "wizard-draft", null), true);
  assert.equal(tabB.readAccount("A", "wizard-draft"), null);
  globalThis.sessionStorage = memoryStorage();
  assert.deepEqual((await newDocument()).readAccount("A", "wizard-draft"), a);
  assert.equal(tabA.readAccount("another-account", "wizard-draft"), null);
});

test("repeated reloads deduplicate unchanged content even when the wizard timestamp changes", async () => {
  install();
  for (let reload = 0; reload < 12; reload++) {
    const tab = await newDocument();
    const current = {...example(), savedAt: `2026-10-19T00:${String(reload).padStart(2, "0")}:00Z`};
    assert.equal(tab.writeAccount("A", "wizard-draft", current), true);
    assert.deepEqual(tab.readAccount("A", "wizard-draft"), current);
  }
  assert.equal([...localStorage.values.keys()].filter(key => key.includes(":recovery:")).length, 1);
});

test("recovery bound preserves other tabs and warns while retaining the newest working session", async () => {
  install();
  for (let index = 0; index < 8; index++) {
    globalThis.sessionStorage = memoryStorage();
    const tab = await newDocument();
    assert.equal(tab.writeAccount("A", "wizard-draft", {...example(), prompt: `Draft ${index}`}), true);
  }
  const before = new Map(localStorage.values);
  globalThis.sessionStorage = memoryStorage();
  const ninth = await newDocument(), newest = {...example(), prompt: "Ninth independent draft"};
  assert.equal(ninth.writeAccount("A", "wizard-draft", newest), false);
  assert.deepEqual(localStorage.values, before);
  assert.deepEqual(ninth.readAccount("A", "wizard-draft"), newest);
  globalThis.sessionStorage = memoryStorage();
  assert.equal(ninth.writeAccount("B", "wizard-draft", newest), true);
});

test("an empty wizard can start fresh without a false archive failure", () => {
  install();
  assert.equal(drafts.archiveWizardDraft("A"), true);
  assert.equal(drafts.readWizardDraft("A"), null);
});

test("removing a source drops its distinctive text and retains authored text plus other sources", () => {
  const blocks = [
    {id: "a", name: "removed.txt", text: "REMOVED-FACT-37", characters: 15},
    {id: "b", name: "kept.txt", text: "RETAINED-FACT-91", characters: 16},
  ];
  const authored = "My edited introduction retains an intentional mention: 37.";
  const combined = drafts.combinedMaterial(authored, blocks.filter(block => block.id !== "a"));
  assert.equal(combined.includes("REMOVED-FACT-37"), false);
  assert.equal(combined.includes("removed.txt"), false);
  assert.ok(combined.includes(authored) && combined.includes("RETAINED-FACT-91"));
});

test("large pasted material is rejected explicitly instead of silently truncated at the input limit", () => {
  const text = "слово ".repeat(17_000);
  const error = drafts.materialLengthError(text);
  assert.ok(error.includes("Материал содержит"));
  assert.ok(error.includes("при лимите"));
  assert.ok(error.includes("Текст не был обрезан и не отправлен"));
  assert.equal(drafts.materialLengthError("Короткий материал"), null);
});

test("corrupt JSON and unrecognized wizard records are recoverable instead of used as draft state", () => {
  install();
  localStorage.setItem(storage.accountKey("A", "wizard-draft"), "broken{");
  assert.equal(drafts.readWizardDraft("A"), null);
  storage.writeAccount("A", "wizard-draft", {version: 1, prompt: "Incomplete record"});
  assert.equal(drafts.readWizardDraft("A"), null);
  storage.writeAccount("A", "wizard-draft", {...example(), analytics: [{selection: {}}]});
  assert.equal(drafts.readWizardDraft("A"), null);
  storage.writeAccount("A", "wizard-draft", {...example(), resources: [{id: "source-without-name"}]});
  assert.equal(drafts.readWizardDraft("A"), null);
  sessionStorage.setItem(storage.accountKey("A", "pending-generation"), JSON.stringify({id: 7, kind: "generate"}));
  assert.equal(pending.readPendingJob("A"), null);
});

test("deferred draft writes coalesce typing and settle before reads and explicit writes", async () => {
  install();
  const results = [];
  for (const prompt of ["M", "My", "My draft"])
    storage.writeAccountDeferred("A", "wizard-draft", {...example(), prompt}, saved => results.push(saved));
  assert.equal(sessionStorage.getItem(storage.accountKey("A", "wizard-draft")), null);
  // A reader, such as archiving on New presentation, sees the latest edit, not a stale snapshot.
  assert.equal(drafts.readWizardDraft("A").prompt, "My draft");
  assert.deepEqual(results, [true]);

  storage.writeAccountDeferred("A", "wizard-draft", {...example(), prompt: "Unsaved edit"});
  drafts.archiveWizardDraft("A");
  await new Promise(resolve => setTimeout(resolve, 500));
  // The archive keeps the latest edit, and the pending write cannot resurrect the cleared draft.
  assert.equal(storage.readAccount("A", "wizard-previous").prompt, "Unsaved edit");
  assert.equal(drafts.readWizardDraft("A"), null);

  storage.writeAccountDeferred("A", "wizard-draft", {...example(), prompt: "Timed"}, saved => results.push(saved));
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.deepEqual(results, [true, true]);
  assert.equal(JSON.parse(sessionStorage.getItem(storage.accountKey("A", "wizard-draft"))).prompt, "Timed");
});
