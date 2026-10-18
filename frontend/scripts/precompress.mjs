import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip, brotliCompress, constants } from "node:zlib";
import { pathToFileURL } from "node:url";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const extensions = new Set([".js", ".css", ".html", ".svg", ".json"]);

export async function precompress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await precompress(file);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      const source = await readFile(file);
      if (source.length < 1024) {
        await Promise.all([
          rm(file + ".gz", { force: true }),
          rm(file + ".br", { force: true }),
        ]);
        continue;
      }
      const [gz, br] = await Promise.all([
        gzipAsync(source, { level: 9 }),
        brotliAsync(source, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }),
      ]);
      if (gz.length < source.length) await writeFile(file + ".gz", gz);
      else await rm(file + ".gz", { force: true });
      if (br.length < source.length) await writeFile(file + ".br", br);
      else await rm(file + ".br", { force: true });
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await precompress(resolve(process.argv[2] || "dist"));
}
