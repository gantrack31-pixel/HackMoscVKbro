import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/slideLayout.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  changeBox,
  editableObjects,
  layoutStyle,
  updateSlideLayout,
  transformLayoutScene,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const bounds = { width: 1280, height: 720 };
const box = { x: 100, y: 80, w: 400, h: 200 };

test("movement remains inside both widescreen and 4:3 slides", () => {
  for (const height of [720, 960]) {
    assert.deepEqual(
      changeBox(box, "move", -900, -500, { ...bounds, height }),
      { ...box, x: 0, y: 0 },
    );
    assert.deepEqual(
      changeBox(box, "move", 2000, 2000, { ...bounds, height }),
      { ...box, x: 880, y: height - 200 },
    );
  }
});

test("all eight resize handles anchor the opposite edges and prevent inversion", () => {
  for (const handle of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    for (const delta of [-2000, -10, 10, 2000]) {
      const next = changeBox(box, handle, delta, delta, bounds);
      assert.ok(next.x >= 0 && next.y >= 0 && next.w >= 16 && next.h >= 16);
      assert.ok(
        next.x + next.w <= bounds.width && next.y + next.h <= bounds.height,
      );
      if (handle.includes("w")) assert.equal(next.x + next.w, box.x + box.w);
      else assert.equal(next.x, box.x);
      if (handle.includes("n")) assert.equal(next.y + next.h, box.y + box.h);
      else assert.equal(next.y, box.y);
    }
  }
});

test("moving text preserves font size; resizing scales it within the API limits", () => {
  const object = { ...box, type: "text", font_size: 40 };
  assert.equal(layoutStyle(object, { ...box, x: 300 }).font_size, undefined);
  assert.equal(layoutStyle(object, { ...box, w: 800, h: 400 }).font_size, 80);
  assert.equal(layoutStyle(object, { ...box, w: 10, h: 10 }).font_size, 8);
  assert.equal(
    layoutStyle(object, { ...box, w: 8000, h: 4000 }).font_size,
    160,
  );
});

test("layout changes preserve other variants, typography, colors and fixed slide layout", () => {
  const a = {
    composition: "split",
    objects: { title: { color: "#FF0000", x: 40 }, body: { hidden: true } },
  };
  const b = { composition: "grid", objects: { title: { x: 99 } } };
  const slide = { layout: "b", designs: { a, b }, design: a };
  const patch = updateSlideLayout(slide, "a", "title", { x: 200, w: 600 });
  assert.equal(patch.designs.a, a);
  assert.deepEqual(patch.designs.b.objects.title, { x: 200, w: 600 });
  assert.equal(patch.designs.b.composition, "grid");
  assert.equal(slide.designs.b.objects.title.x, 99);
  const withColor = updateSlideLayout(
    { ...slide, layout: null },
    "a",
    "title",
    { x: 200 },
  );
  assert.equal(withColor.designs.a.objects.title.color, "#FF0000");
  assert.equal(withColor.designs.a.objects.body.hidden, true);
});

test("legacy designs retain layout_shift behavior and new designs use the template composition", () => {
  const slide = {
    design: { composition: "split", layout_shift: 2, density: "airy" },
    designs: {},
  };
  const patch = updateSlideLayout(slide, "c", "body", box);
  assert.equal(patch.designs, undefined);
  assert.equal(patch.design.layout_shift, 2);
  assert.equal(patch.design.density, "airy");
  assert.equal(
    updateSlideLayout({}, "a", "title", box, "grid").design.composition,
    "grid",
  );
});

test("charts move as a whole, including labels, without moving unrelated objects", () => {
  const chart = { ...box, id: "custom-chart", type: "chart" };
  const label = {
    ...box,
    x: 120,
    y: 100,
    id: "custom-chart-0",
    type: "text",
    font_size: 20,
  };
  const other = { ...box, id: "title", type: "text" };
  const scene = {
    ...bounds,
    objects: [chart, other],
    render_objects: [label, other],
  };
  const next = transformLayoutScene(scene, chart, {
    ...box,
    x: 200,
    y: 160,
    w: 800,
    h: 400,
  });
  assert.equal(next.render_objects[0].x, 240);
  assert.equal(next.render_objects[0].y, 200);
  assert.equal(next.render_objects[0].font_size, 40);
  assert.equal(next.render_objects[1], other);
  assert.equal(scene.objects[0].x, 100);
});

test("backgrounds cannot be selected; horizontal lines remain valid API overrides", () => {
  const line = { ...box, id: "connector", type: "line", h: 0 };
  const scene = {
    ...bounds,
    objects: [
      { ...box, id: "background" },
      { ...box, id: "canvas-background" },
      line,
    ],
  };
  assert.deepEqual(editableObjects(scene), [line]);
  assert.deepEqual(layoutStyle(line, { ...line, x: 150 }), {
    x: 150,
    y: 80,
    w: 400,
  });
});

test("zero-height lines can be resized into diagonal lines with correct endpoints", () => {
  const line = {
    ...box,
    id: "line",
    type: "line",
    h: 0,
    x1: 100,
    x2: 500,
    y1: 80,
    y2: 80,
  };
  const scene = { ...bounds, objects: [line] };
  const resized = transformLayoutScene(scene, line, {
    ...box,
    x: 200,
    y: 100,
    w: 600,
    h: 100,
  }).objects[0];
  assert.equal(resized.w, 600);
  assert.equal(resized.h, 100);
  assert.deepEqual(
    [resized.x1, resized.x2, resized.y1, resized.y2],
    [200, 800, 100, 200],
  );
});
