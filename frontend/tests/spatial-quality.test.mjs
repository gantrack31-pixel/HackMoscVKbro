import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/spatial/quality.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const quality = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

const device = (overrides = {}) => ({
  deviceMemory: 16,
  hardwareConcurrency: 12,
  maxTextureSize: 8192,
  saveData: false,
  mobile: false,
  reducedMotion: false,
  ...overrides,
});

test("spatial quality selects hardware-aware high, medium and low budgets", () => {
  assert.equal(quality.initialSpatialQuality(device()), "high");
  assert.equal(
    quality.initialSpatialQuality(device({ deviceMemory: 6 })),
    "medium",
  );
  assert.equal(
    quality.initialSpatialQuality(device({ mobile: true })),
    "medium",
  );
  assert.equal(
    quality.initialSpatialQuality(device({ hardwareConcurrency: 4 })),
    "low",
  );
  assert.equal(
    quality.initialSpatialQuality(device({ reducedMotion: true })),
    "low",
  );
  assert.equal(
    quality.initialSpatialQuality(device({ saveData: true })),
    "low",
  );
  assert.equal(
    quality.initialSpatialQuality(device({ maxTextureSize: 2048 })),
    "low",
  );
});

test("performance fallback only moves downward while keeping essential orbit details", () => {
  assert.equal(quality.lowerSpatialQuality("high"), "medium");
  assert.equal(quality.lowerSpatialQuality("medium"), "low");
  assert.equal(quality.lowerSpatialQuality("low"), "low");
  assert.ok(quality.spatialQualitySettings.high.desktopDpr <= 1.5);
  assert.ok(quality.spatialQualitySettings.medium.desktopDpr < quality.spatialQualitySettings.high.desktopDpr);
  assert.ok(quality.spatialQualitySettings.low.mobileDpr < quality.spatialQualitySettings.medium.mobileDpr);
  assert.equal(quality.spatialQualitySettings.low.ornaments, true);
  assert.ok(quality.spatialQualitySettings.high.textureSize > 1024);
  assert.ok(quality.spatialQualitySettings.medium.textureSize < quality.spatialQualitySettings.high.textureSize);
  assert.ok(quality.spatialQualitySettings.low.textureSize < quality.spatialQualitySettings.medium.textureSize);
});