import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import test from "node:test";
import { precompress } from "../scripts/precompress.mjs";

test("prebuilt gzip and Brotli retain the original bytes and skip binary and small assets", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "deckly-compress-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, "assets"));
  const source = Buffer.from(
    'const message = "Презентация Deckly";\n'.repeat(200),
  );
  const script = join(folder, "assets", "app-12345678.js");
  await writeFile(script, source);
  await writeFile(join(folder, "index.html"), "<html></html>");
  await writeFile(join(folder, "assets", "font.woff2"), source);

  await precompress(folder);

  assert.deepEqual(await readFile(script), source);
  assert.deepEqual(gunzipSync(await readFile(script + ".gz")), source);
  assert.deepEqual(
    brotliDecompressSync(await readFile(script + ".br")),
    source,
  );
  await assert.rejects(access(join(folder, "index.html.br")));
  await assert.rejects(access(join(folder, "assets", "font.woff2.br")));
});

test("rebuilding a smaller file removes obsolete compressed representations", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "deckly-compress-rebuild-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const script = join(folder, "entry.js");
  await writeFile(script, 'const value = "Deckly";\n'.repeat(100));
  await precompress(folder);
  await access(script + ".br");

  await writeFile(script, "new content");
  await precompress(folder);

  await assert.rejects(access(script + ".br"));
  await assert.rejects(access(script + ".gz"));
});
