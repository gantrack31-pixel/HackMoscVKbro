import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [baseURL, destination] = process.argv.slice(2);
if (!baseURL || !destination)
  throw new Error(
    "Usage: node scripts/profile-browser.mjs URL OUTPUT_DIRECTORY",
  );
const output = resolve(destination);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const samples = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const pending = new Set();
    const errors = [];
    page.on("request", (request) => pending.add(request));
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 80,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
    });
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Performance.enable");
    await page.addInitScript(() => {
      window.loadMetrics = { lcp: 0, cls: 0, longTaskOver50: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.loadMetrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.loadMetrics.cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.loadMetrics.longTaskOver50 += Math.max(0, entry.duration - 50);
      }).observe({ type: "longtask", buffered: true });
    });
    for (const cache of ["cold", "warm"]) {
      pending.clear();
      errors.length = 0;
      if (cache === "cold") await page.goto(baseURL);
      else await page.reload();
      await page
        .getByRole("button", { name: "Начать работу", exact: true })
        .waitFor();
      await page.locator(".auth-orbit.is-ready").waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame);
      });
      const metrics = await page.evaluate(() => ({
        ...window.loadMetrics,
        fcp: performance.getEntriesByName("first-contentful-paint")[0]
          ?.startTime,
        resources: performance.getEntriesByType("resource").map((entry) => ({
          path: new URL(entry.name).pathname,
          transferBytes: entry.transferSize,
          decodedBytes: entry.decodedBodySize,
        })),
      }));
      const performanceMetrics = (await session.send("Performance.getMetrics"))
        .metrics;
      samples.push({
        run,
        cache,
        ...metrics,
        pendingRequests: [...pending].map(
          (request) => new URL(request.url()).pathname,
        ),
        errors: [...errors],
        browserMetrics: Object.fromEntries(
          performanceMetrics
            .filter((entry) =>
              [
                "TaskDuration",
                "ScriptDuration",
                "LayoutDuration",
                "RecalcStyleDuration",
                "JSHeapUsedSize",
              ].includes(entry.name),
            )
            .map((entry) => [entry.name, entry.value]),
        ),
      });
    }
    await context.close();
  }
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page
      .getByRole("button", { name: "Начать работу", exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${output}/auth-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }
  await writeFile(
    `${output}/load.json`,
    JSON.stringify(
      {
        conditions: {
          baseURL,
          viewport: "1440x900",
          cpuSlowdown: 4,
          latencyMs: 80,
          downloadBytesPerSecond: 200000,
          runs: 3,
          animations: "enabled",
          note: "LCP/FCP/CLS use browser entries. longTaskOver50 is an observation-window diagnostic, not Lighthouse TBT. No field INP collected. Capture ends 30 frames after the WebGL scene and fonts are ready, not after all network requests finish; resources list completed requests only.",
        },
        samples,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Saved six load samples and two screenshots to ${output}`);
} finally {
  await browser.close();
}
