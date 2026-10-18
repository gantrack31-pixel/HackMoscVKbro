import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("workspace navigation does not refetch the current session", async ({
  page,
}) => {
  const app = new DecklyPage(page);
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/me") sessionRequests++;
  });
  await page.goto("/");
  await app.register();
  await page.goto("/#templates");
  await expect(page.getByLabel("Поиск шаблонов")).toBeVisible();
  await page.goto("/#projects");
  await expect(
    page.getByRole("heading", { name: "Мои презентации", exact: true }),
  ).toBeVisible();
  expect(sessionRequests).toBe(1);
});

test("an expired session still returns the user to authentication", async ({
  page,
}) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      status: 401,
      json: { detail: "Сессия истекла" },
    }),
  );

  await page.goto("/#projects");

  await expect(
    page.getByRole("button", { name: "Начать работу", exact: true }),
  ).toBeVisible();
});
