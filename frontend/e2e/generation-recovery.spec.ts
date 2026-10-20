import { expect, test } from "@playwright/test";

test("poll interruption survives reload and resumes the same job without duplicate generation", async ({ page }) => {
  await page.goto("/");
  const registration = await page.request.post("/api/auth/register", { data: {
    email: `recovery-${Date.now()}@example.test`, password: "Recovery-Password-1947", first_name: "Recovery", last_name: "Test",
  } });
  expect(registration.status()).toBe(201);
  const auth = await registration.json();
  const content = { title: "Сохранённый план", slides: [{ title: "Проверка восстановления", body: "Выручка 123 рубля.", kind: "text", source_quote: "Выручка 123 рубля." }] };
  await page.evaluate(({ account, content }) => sessionStorage.setItem(`deckly:${encodeURIComponent(account)}:wizard-draft`, JSON.stringify({
    version: 1, savedAt: new Date().toISOString(), step: 2, mode: "text", prompt: "Выручка 123 рубля.", count: 3,
    audience: "Команда", purpose: "project", resources: [], sourceBlocks: [], analytics: [], content, templateId: "tech", variant: "a", instruction: "",
  })), { account: auth.user.id, content });
  let fault: "unavailable" | "unauthorized" | "malformed" | null = "unavailable";
  let generations = 0, retries = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/generate") generations++;
    if (request.method() === "POST" && /\/api\/jobs\/[^/]+\/retry$/.test(path)) retries++;
  });
  await page.route("**/api/jobs/*", async route => {
    if (route.request().method() !== "GET" || !fault) return route.fallback();
    await route.fulfill({ status: fault === "unavailable" ? 503 : fault === "unauthorized" ? 401 : 200,
      json: fault === "malformed" ? {} : { detail: "Временная ошибка проверки" } });
  });
  const pending = () => page.evaluate(account => JSON.parse(sessionStorage.getItem(`deckly:${encodeURIComponent(account)}:pending-generation`) || "null"), auth.user.id);
  await page.goto("/#create");
  // API registration sets cookies; reload so App reads the new session.
  await page.reload();
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
  await expect(page.getByRole("button", { name: "Проверить состояние", exact: true })).toBeVisible();
  const snapshot = await pending();
  expect(snapshot.id).toBeTruthy(); expect(snapshot.content).toEqual(content);
  expect(generations).toBe(1);
  await expect(page.getByRole("button", { name: "Создать презентацию", exact: true })).toHaveCount(0);
  fault = "unauthorized";
  await page.getByRole("button", { name: "Проверить состояние", exact: true }).click();
  await expect(page.locator(".auth-shell")).toBeVisible();
  expect(await pending()).toEqual(snapshot);
  // The injected 401 never destroyed the real test session. A reload models
  // returning after authentication, retaining the same tab/account snapshot.
  fault = "malformed";
  await page.reload();
  await expect(page.getByRole("button", { name: "Проверить состояние", exact: true })).toBeVisible();
  expect(await pending()).toEqual(snapshot);
  fault = null;
  await page.getByRole("button", { name: "Проверить состояние", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Одна история. Три способа рассказать." })).toBeVisible({ timeout: 30_000 });
  expect(await pending()).toBeNull();
  expect(generations).toBe(1); expect(retries).toBe(0);
  const projects = await (await page.request.get("/api/projects")).json();
  expect(projects).toHaveLength(1);
});
