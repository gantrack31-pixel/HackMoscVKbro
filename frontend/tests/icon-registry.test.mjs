import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const lucide = require("lucide-react");
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/components/iconRegistry.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const registryModule = { exports: {} };
runInNewContext(compiled, {
  require,
  module: registryModule,
  exports: registryModule.exports,
});
const { icons } = registryModule.exports;

test("every interface role resolves to a Lucide drawing", () => {
  const drawings = new Set(Object.values(lucide));
  assert.ok(Object.keys(icons).length > 0);
  for (const [role, drawing] of Object.entries(icons)) {
    assert.ok(drawing && drawings.has(drawing), `Unknown drawing for ${role}`);
  }
});

// The same meaning must stay recognizable wherever it appears in the app.
const sharedMeanings = {
  favorites: [
    "Heart",
    "nav-favorites",
    "library-favorite",
    "library-empty-favorites",
    "account-favorite-count",
    "account-library-favorites",
  ],
  projects: [
    "FolderClosed",
    "nav-projects",
    "library-empty-projects",
    "account-project-count",
    "account-library-projects",
  ],
  templates: [
    "PanelsTopLeft",
    "nav-templates",
    "account-template-count",
    "account-library-templates",
    "account-next-project",
  ],
  create: ["SquarePlus", "nav-create", "home-create", "library-new-project"],
  upload: [
    "Upload",
    "home-upload",
    "library-upload",
    "info-help-template",
    "flow-import",
  ],
  search: ["Search", "library-search", "library-empty-search"],
  demo: [
    "Clapperboard",
    "nav-demo",
    "home-how-it-works",
    "info-demo",
    "info-support-guide",
  ],
  profile: ["ContactRound", "nav-profile", "account-personal-tab"],
  person: ["UserRound", "auth-first-name", "auth-last-name"],
  support: ["LifeBuoy", "nav-support", "info-support"],
  logout: ["LogOut", "nav-logout", "account-signout"],
  email: ["Mail", "auth-email", "info-support-email", "account-auth-email"],
  password: ["LockKeyhole", "auth-password", "account-password"],
  save: ["Save", "account-save", "editor-save"],
  close: ["X", "ui-modal-close", "viewer-close"],
  previous: ["ChevronLeft", "viewer-previous", "library-previous-template"],
  next: ["ChevronRight", "viewer-next", "library-next-template"],
  preview: ["Play", "export-preview", "editor-preview"],
  powerpoint: ["FileSliders", "export-powerpoint", "demo-format-pptx"],
  pdf: ["FileType", "export-pdf", "demo-format-pdf"],
  html: ["FileCode2", "export-html", "demo-format-html"],
  addSlide: ["CopyPlus", "flow-add-slide", "editor-add-slide"],
  idea: ["Lightbulb", "home-idea", "flow-idea"],
  example: [
    "FlaskConical",
    "home-open-example",
    "flow-example",
    "demo-try-example",
  ],
  materials: [
    "FolderInput",
    "flow-material-step",
    "info-stage-materials",
    "info-feature-materials",
  ],
  outline: [
    "ListOrdered",
    "flow-outline-step",
    "info-stage-outline",
    "info-feature-outline",
    "flow-build-outline",
  ],
  variants: [
    "Layers3",
    "flow-style-step",
    "library-choose-variant",
    "info-stage-compositions",
    "info-feature-variants",
    "info-metric-variants",
  ],
  designAudit: [
    "ShieldCheck",
    "editor-audit",
    "info-stage-audit",
    "info-feature-audit",
    "info-audit-design",
  ],
  success: [
    "CircleCheckBig",
    "flow-ready",
    "editor-saved",
    "export-complete",
    "export-cloud-receipt",
    "info-support-sent",
  ],
  cloud: ["Cloud", "export-cloud-library", "export-cloud-method"],
  export: ["FileOutput", "info-stage-export", "info-feature-export"],
};

for (const [meaning, [glyph, ...roles]] of Object.entries(sharedMeanings)) {
  test(`${meaning} uses the same recognizable drawing across the app`, () => {
    for (const role of roles) {
      assert.equal(icons[role], lucide[glyph], `${role} must use ${glyph}`);
    }
  });
}

test("actions remain distinct from their completion and opposite states", () => {
  assert.equal(icons["info-support-send"], lucide.Send);
  for (const [action, other] of [
    ["info-support-send", "info-support-sent"],
    ["editor-save", "editor-saved"],
    ["auth-show-password", "auth-hide-password"],
    ["viewer-previous", "viewer-next"],
    ["flow-generate", "flow-regenerate"],
  ]) {
    assert.notEqual(
      icons[action],
      icons[other],
      `${action} must differ from ${other}`,
    );
  }
});
