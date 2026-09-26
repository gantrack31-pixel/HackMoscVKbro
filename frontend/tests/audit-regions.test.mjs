import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/auditRegions.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { issueRegion, auditMarkers } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const object = (id, patch = {}) => ({
  id,
  x: 120,
  y: 80,
  w: 600,
  h: 90,
  ...patch,
});
const scene = (objects) => ({ width: 1280, height: 720, objects });
const issue = (id, object_id) => ({ id, object_id });

test("marker regions follow the current object geometry and overflowing text", () => {
  const note = issue("overflow", "body");
  const first = scene([object("body")]);
  const changed = scene([object("body", { y: 250, used_height: 260 })]);
  assert.equal(issueRegion(note, changed).h, 260);
  assert.notEqual(
    auditMarkers([note], first, 800, 450)[0].y,
    auditMarkers([note], changed, 800, 450)[0].y,
  );
  assert.equal(
    issueRegion(note, scene([object("body", { y: 650, used_height: 200 })])).h,
    70,
  );
});

test("issues on the same object share a marker; unlocated issues remain list-only", () => {
  const notes = [
    issue("contrast", "body"),
    issue("overflow", "body"),
    issue("source", "missing"),
  ];
  const markers = auditMarkers(notes, scene([object("body")]), 800, 450);
  assert.equal(markers.length, 1);
  assert.deepEqual(
    markers[0].issues.map((entry) => entry.number),
    [1, 2],
  );
  assert.equal(issueRegion(notes[2], scene([object("body")])), null);
});

test("resizing keeps markers inside the slide and separated", () => {
  const objects = Array.from({ length: 6 }, (_, i) =>
    object(`text-${i}`, { y: 80 + i * 12, h: 40 }),
  );
  const notes = objects.map((item, i) => issue(`issue-${i}`, item.id));
  for (const width of [320, 760, 1280]) {
    const height = (width * 720) / 1280;
    const markers = auditMarkers(notes, scene(objects), width, height);
    assert.equal(markers.length, notes.length);
    markers.forEach((marker, index) => {
      assert.ok(marker.x >= 16 && marker.x <= width - 16);
      assert.ok(marker.y >= 16 && marker.y <= height - 16);
      markers
        .slice(index + 1)
        .forEach((other) =>
          assert.ok(Math.hypot(marker.x - other.x, marker.y - other.y) >= 36),
        );
    });
  }
});
