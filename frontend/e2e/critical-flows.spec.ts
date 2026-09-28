import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("register, create, edit, save, audit and export a presentation", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  await app.assertAccessibleMainLandmarks();
  await app.createPresentation();

  await app.changeSlideTitle("E2E — материал сохранён");
  await expect(page.getByRole("status").filter({ hasText: "Есть изменения" })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Сохранено" })).toBeVisible();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.getByRole("region", { name: "Проверка презентации" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Замечаний:/ })).toBeVisible();

  await page.getByRole("link", { name: "Завершить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваша история готова к выходу" })).toBeVisible();
  await page.getByRole("button", { name: /На устройство/ }).click();

  const downloadResponse = page.waitForResponse((response) =>
    response.url().includes("/export/pptx") && response.status() === 200,
  );
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  await downloadResponse;
  await expect(page.getByText("Файл передан браузеру для скачивания")).toBeVisible();
});

test("warn before discarding unsaved editor changes and allow staying", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  await app.createPresentation();
  await app.changeSlideTitle("Несохранённый вариант");

  await page.getByRole("link", { name: "Мои презентации" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменения ещё не сохранены" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Сохраните изменения на текущей странице", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Остаться на странице" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Редактор презентации", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Есть изменения" })).toBeVisible();
});

test("keyboard navigation, visible focus, theme persistence and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toHaveCount(1);
  await expect(page.locator(":focus-visible")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Регистрация" }).click();
  await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();

  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("authentication logo stays legible on the dark panel in light theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("deckly-theme", "light"));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("region", { name: "Примеры шаблонов" }).locator(".auth-feed-group").first().locator(".auth-template")).toHaveCount(3);
  await page.getByRole("button", { name: "Открыть панель входа" }).click();
  await expect(page.locator(".auth-shell")).toHaveClass(/auth-dark/);
  await expect(page.getByRole("button", { name: "Регистрация" })).toBeVisible();

  const logoContrast = () => page.locator(".auth-logo").evaluate((element) => {
    const luminance = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.slice(0, 3).map((channel) => {
        const normalized = Number(channel) / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = getComputedStyle(element).color;
    const background = getComputedStyle(element.closest(".auth-left")!).backgroundColor;
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });

  await expect.poll(logoContrast).toBeGreaterThanOrEqual(4.5);
});

test("workspace navigation opens and closes with keyboard and traps focus", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  const trigger = page.getByRole("button", { name: "Раскрыть навигацию Deckly.Ai" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Свернуть навигацию Deckly.Ai" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Раскрыть навигацию Deckly.Ai" })).toBeFocused();
});

test("authentication errors are announced accessibly", async ({ page }) => {
  await page.goto("/#login");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await page.getByLabel("Электронная почта").fill("missing@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("no-such-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Неверная почта или пароль");
});

test("registration shows the email confirmation screen and allows resending", async ({ page }) => {
  await page.route("**/api/auth/register", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ verification_required: true, email: "confirm@example.test", delivery_mode: "unavailable" }),
  }));
  await page.route("**/api/auth/verification/resend", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Начать работу" }).click();
  await page.getByRole("button", { name: "Регистрация" }).click();
  await page.getByLabel("Электронная почта").fill("confirm@example.test");
  await page.getByLabel("Имя", { exact: true }).fill("Тест");
  await page.getByLabel("Фамилия", { exact: true }).fill("Подтверждения");
  await page.getByLabel("Пароль", { exact: true }).fill("Example-Password-1947");
  await page.getByRole("button", { name: "Зарегистрироваться", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();
  const emailContrast = await page.locator(".email-pending-address").evaluate((element) => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = getComputedStyle(element).color;
    const background = getComputedStyle(element.closest(".auth-left")!).backgroundColor;
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
  expect(emailContrast).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByText(/Почта не настроена на сервере/)).toBeVisible();
  await page.getByRole("button", { name: "Отправить письмо ещё раз" }).click();
  await expect(page.getByRole("status")).toContainText("письмо скоро придёт");
});

test("resending confirmation requires a valid email and does not call the API otherwise", async ({ page }) => {
  let resendRequests = 0;
  await page.route("**/api/auth/verification/resend", async (route) => {
    resendRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/#login");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await page.getByRole("button", { name: /Не получили письмо подтверждения/ }).click();

  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("корректную электронную почту");
  await expect.poll(() => resendRequests).toBe(0);

  await page.getByLabel("Электронная почта").fill("not-an-email");
  await page.getByRole("button", { name: /Не получили письмо подтверждения/ }).click();
  await expect(page.getByRole("alert")).toContainText("корректную электронную почту");
  await expect.poll(() => resendRequests).toBe(0);

  await page.getByLabel("Электронная почта").fill("valid@example.test");
  await page.getByRole("button", { name: /Не получили письмо подтверждения/ }).click();
  await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();
  await page.getByRole("button", { name: "Отправить письмо ещё раз" }).click();
  await expect.poll(() => resendRequests).toBe(1);
});

test("email verification needs an explicit button click", async ({ page }) => {
  let verificationRequests = 0;
  await page.route("**/api/auth/verify-email", async (route) => {
    verificationRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true }),
    });
  });
  await page.goto("/#verify-email=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
  await expect(page.getByRole("heading", { name: "Подтверждение почты" })).toBeVisible();
  await expect.poll(() => verificationRequests).toBe(0);

  await page.getByRole("button", { name: "Подтвердить адрес" }).click();
  await expect(page.getByRole("heading", { name: "Почта подтверждена" })).toBeVisible();
  await expect.poll(() => verificationRequests).toBe(1);

  await page.getByRole("button", { name: "Перейти ко входу" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await expect(page).toHaveURL(/#login$/);
});

test("password reset request gives a generic confirmation and submits the email", async ({ page }) => {
  let requestBody: { email?: string } | undefined;
  await page.route("**/api/auth/password-reset/request", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/#login");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await page.getByRole("button", { name: "Забыли пароль?" }).click();
  await expect(page.getByRole("heading", { name: "Восстановление пароля" })).toBeVisible();
  await page.getByLabel("Электронная почта").fill("person@example.test");
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText("Если аккаунт с таким адресом существует");
  expect(requestBody).toEqual({ email: "person@example.test" });
});

test("password reset link is not consumed until the new-password form is submitted", async ({ page }) => {
  let confirmations = 0;
  await page.route("**/api/auth/password-reset/confirm", async (route) => {
    confirmations += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reset: true }) });
  });
  await page.goto("/#reset-password=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
  await expect(page.getByRole("heading", { name: "Задайте новый пароль" })).toBeVisible();
  await expect.poll(() => confirmations).toBe(0);
  // Current baseline keeps the reset form mounted until the user follows the login link.
  await expect(page).toHaveURL(/#reset-password=/);

  await page.getByLabel("Новый пароль", { exact: true }).fill("Replacement-password-531");
  await page.getByLabel("Повторите новый пароль").fill("Does-not-match-531");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByRole("alert")).toContainText("Пароли не совпадают");
  await expect.poll(() => confirmations).toBe(0);

  await page.getByLabel("Повторите новый пароль").fill("Replacement-password-531");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();

  await expect(page.getByRole("status")).toContainText("Пароль изменён");
  await expect.poll(() => confirmations).toBe(1);
  await page.getByRole("button", { name: "Перейти ко входу", exact: true }).click();
  await expect(page).toHaveURL(/#login$/);
  await expect(page.getByRole("heading", {name:"С возвращением"})).toBeVisible();
});
