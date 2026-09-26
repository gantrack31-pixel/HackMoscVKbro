import { expect, type Page } from "@playwright/test";

export class DecklyPage {
  constructor(readonly page: Page) {}

  async register() {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await this.page.getByRole("button", { name: "Начать работу" }).click();
    await this.page.getByRole("button", { name: "Регистрация" }).click();
    await expect(this.page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();
    await this.page.getByLabel("Электронная почта").fill(`e2e-${suffix}@example.test`);
    await this.page.getByLabel("Имя", { exact: true }).fill("E2E");
    await this.page.getByLabel("Фамилия", { exact: true }).fill("Test");
    await this.page.getByLabel("Пароль", { exact: true }).fill("E2e-Test-Password-1947");
    await this.page.getByRole("button", { name: "Зарегистрироваться", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: /Ваша следующая идея/ })).toBeVisible();
  }

  async createPresentation() {
    await this.page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: "О чём ваша презентация?" })).toBeVisible();

    const material = this.page.getByLabel("Опишите идею и добавьте материалы");
    await material.fill("Запуск нового продукта. Цель — рассказать команде о стратегии выхода на рынок и ключевых этапах запуска.");

    const templatePicker = this.page.locator("details.wizard-template-picker");
    await templatePicker.locator("summary").click();
    await templatePicker.getByText("VK Education", { exact: true }).click();
    await this.page.getByRole("radio", { name: "8" }).check();

    await this.page.getByRole("button", { name: "Создать структуру" }).click();
    await expect(this.page.getByRole("heading", { name: "Сначала — история" })).toBeVisible();
    await expect(this.page.getByText("8 слайдов", { exact: true })).toBeVisible();
    await this.page.getByLabel("Заголовок слайда 1").fill("Стратегия запуска продукта");
    await this.page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: "Одна история. Три способа рассказать." })).toBeVisible({ timeout: 30_000 });
    await expect(this.page.getByRole("button", { name: "Выбрать акцентный вариант" })).toBeVisible();
    await this.page.getByRole("button", { name: "Выбрать акцентный вариант" }).click();
    await expect(this.page.getByRole("button", { name: "Выбран" })).toBeVisible();
    await this.page.getByRole("button", { name: "Открыть презентацию" }).click();
    await expect(this.page.getByRole("region", { name: "Редактор презентации" })).toBeVisible();
  }

  async changeSlideTitle(value: string) {
    await this.page.getByLabel("Название презентации").fill("E2E стратегия запуска");
    const title = this.page.locator(".inspector").getByLabel("Заголовок", { exact: true });
    await title.fill(value);
  }

  async assertAccessibleMainLandmarks() {
    await expect(this.page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
    await expect(this.page.getByRole("main")).toBeVisible();
  }
}