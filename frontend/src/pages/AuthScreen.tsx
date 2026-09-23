import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Mail,
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { api } from "../api";
import { SystemActivity } from "../components/SystemActivity";

import { TemplateCover } from "../components/TemplateCard";
import type { Template, User } from "../types";
type Screen = "welcome" | "choice" | "login" | "register";
const oauthErrors: Record<string, string> = {
  state: "Сессия входа истекла. Повторите вход через Яндекс.",
  cancelled: "Вход через Яндекс отменён.",
  profile: "Яндекс не передал почту. Проверьте права приложения.",
  exists: "С этой почтой уже есть аккаунт. Войдите в него с паролем.",
  provider: "Не удалось завершить вход через Яндекс. Попробуйте снова.",
};
export function AuthScreen({
  onUser,
  error: initialError,
}: {
  onUser: (u: User) => void;
  error: string;
}) {
  const [screen, setScreen] = useState<Screen>(location.hash === "#login" ? "login" : location.hash.startsWith("#auth-error=") ? "choice" : "welcome"),
    [templates, setTemplates] = useState<Template[]>([]),
    [error, setError] = useState(
      initialError ||
        oauthErrors[location.hash.replace("#auth-error=", "")] ||
        "",
    ),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    api
      .publicTemplates()
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);
  const startRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const opened = screen !== "welcome";
  useEffect(() => {
    if (!opened) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) go("welcome");
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [opened, busy]);
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(
      () =>
        contentRef.current
          ?.querySelector<HTMLElement>("input, button")
          ?.focus({ preventScroll: true }),
      520,
    );
    return () => clearTimeout(timer);
  }, [screen]);
  function go(next: Screen) {
    if (busy) return;
    if (next === "welcome")
      requestAnimationFrame(() =>
        startRef.current?.focus({ preventScroll: true }),
      );
    setScreen(next);
    setError("");
    setShowPassword(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const credentials = {
        email: String(data.get("email")),
        password: String(data.get("password")),
      };
      const result =
        screen === "register"
          ? await api.register({
              ...credentials,
              first_name: String(data.get("first_name")),
              last_name: String(data.get("last_name")),
            })
          : await api.login(credentials.email, credentials.password);
      if (result.user) onUser(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`auth-shell ${screen === "welcome" ? "welcome" : "auth-dark"}`}
      id="design-root"
    >
      <section className="auth-left">
        <div className="auth-sliding-surface" aria-hidden="true" />
        <SystemActivity />
        <div className="auth-controls">
          <ThemeToggle />
          <button
            className="auth-panel-toggle"
            disabled={busy}
            onClick={() => go(opened ? "welcome" : "choice")}
            aria-expanded={opened}
            aria-controls="auth-panel"
            aria-label={opened ? "Скрыть панель входа" : "Открыть панель входа"}
          >
            {opened ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
          </button>
        </div>
        <div className="auth-brand-block">
          <a
            className="auth-logo"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go("welcome");
            }}
            aria-label="Deckly.Ai — главная"
          >
            <span>Deckly</span>
            <i>.</i>
            <small>Ai</small>
          </a>
          <p className="auth-tagline">
            Цифровой дизайнер
            <br />
            презентаций
          </p>
        </div>
        <div className="auth-content">
          <div
            className="auth-welcome-layer"
            inert={opened}
            aria-hidden={opened}
          >
            <div className="auth-intro">
              <span className="auth-eyebrow">ВАША ИДЕЯ. ВАШ СТИЛЬ.</span>
              <h1>
                От первой мысли
                <br />
                до яркой истории.
              </h1>
              <p>
                Презентации в фирменном стиле —<br />с вниманием к каждой
                детали.
              </p>
            </div>
            <button
              ref={startRef}
              className="auth-primary"
              onClick={() => go("choice")}
            >
              Начать работу
              <ArrowRight size={20} />
            </button>
          </div>
          <div
            ref={contentRef}
            id="auth-panel"
            className="auth-panel-content"
            inert={!opened}
            aria-hidden={!opened}
          >
            {screen === "choice" || screen === "welcome" ? (
              <>
                <p className="auth-welcome">
                  Хорошая история
                  <br />
                  начинается здесь.
                </p>
                <div className="auth-choice">
                  <button onClick={() => go("login")}>Вход</button>
                  <button onClick={() => go("register")}>Регистрация</button>
                </div>
                <div className="auth-divider">
                  <span>или</span>
                </div>
                <button
                  className="yandex-button"
                  onClick={() => location.assign("/auth/yandex")}
                >
                  <b>Я</b>Войти с Яндекс ID
                </button>
              </>
            ) : (
              <form key={screen} onSubmit={submit} className="auth-form">
                <button
                  className="auth-back"
                  type="button"
                  onClick={() => go("choice")}
                >
                  <ArrowLeft size={16} />
                  Назад
                </button>
                <h1>
                  {screen === "register" ? "Создать аккаунт" : "С возвращением"}
                </h1>
                <p className="auth-form-hint">
                  {screen === "register"
                    ? "Сохраните пространство для своих идей."
                    : "Ваши презентации уже ждут вас."}
                </p>
                <label>
                  Электронная почта
                  <div className="auth-input">
                    <Mail size={17} />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      placeholder="name@example.ru"
                    />
                  </div>
                </label>
                {screen === "register" && (
                  <div className="auth-name-row">
                    <label>
                      Имя
                      <div className="auth-input">
                        <UserRound size={17} />
                        <input
                          name="first_name"
                          autoComplete="given-name"
                          required
                          maxLength={60}
                          placeholder="Имя"
                        />
                      </div>
                    </label>
                    <label>
                      Фамилия
                      <div className="auth-input">
                        <UserRound size={17} />
                        <input
                          name="last_name"
                          autoComplete="family-name"
                          required
                          maxLength={60}
                          placeholder="Фамилия"
                        />
                      </div>
                    </label>
                  </div>
                )}
                <label>
                  Пароль
                  <div className="auth-input">
                    <LockKeyhole size={17} />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        screen === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      minLength={screen === "register" ? 10 : 1}
                      maxLength={128}
                      required
                      placeholder={
                        screen === "register"
                          ? "Не менее 10 символов"
                          : "Введите пароль"
                      }
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Скрыть пароль" : "Показать пароль"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                {screen === "login" && (
                  <a
                    className="auth-help"
                    href="https://t.me/flixyyy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Не получается войти? Написать в поддержку
                  </a>
                )}
                {screen === "register" && (
                  <p className="password-hint">
                    Используйте уникальный пароль длиной от 10 символов.
                  </p>
                )}
                <button className="auth-submit" disabled={busy}>
                  {busy
                    ? "Подождите…"
                    : screen === "register"
                      ? "Зарегистрироваться"
                      : "Войти"}
                  <ArrowRight size={18} />
                </button>
                <p className="auth-switch">
                  {screen === "register"
                    ? "Уже есть аккаунт?"
                    : "Ещё нет аккаунта?"}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      go(screen === "register" ? "login" : "register")
                    }
                  >
                    {screen === "register" ? "Войти" : "Зарегистрироваться"}
                  </button>
                </p>
              </form>
            )}
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
        <footer className="auth-footer">
          <span>Ваши идеи. Ваш стиль. © 2026</span>
          <a href="https://t.me/flixyyy" target="_blank" rel="noreferrer">
            Поддержка ↗
          </a>
        </footer>
      </section>
      <section className="auth-right" aria-label="Примеры шаблонов">
        <SystemActivity />
        <div className="auth-preview-note" aria-hidden={opened}>
          <span className="auth-note-dot" />
          Один шаблон — бесконечно много идей
        </div>
        <div className="auth-template-stack">
          {templates.slice(0, 3).map((t, i) => (
            <article className={`auth-template auth-template-${i}`} key={t.id}>
              <TemplateCover
                template={t}
                title={
                  [
                    "Технологии на новом уровне.",
                    "Пространство для вашей команды",
                    "Знания, которые меняют будущее",
                  ][i]
                }
              />
              <div className="auth-template-info">
                <div>
                  <h2>{t.name}</h2>
                  <p>
                    {t.metadata.category} · {t.metadata.count} слайдов · 16:9
                  </p>
                </div>
                <button
                  onClick={() => go("choice")}
                  tabIndex={screen === "welcome" ? 0 : -1}
                >
                  Выбрать этот шаблон
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="auth-preview-caption">
          Ваша история выглядит лучше
          <br />
          <strong>в правильном оформлении.</strong>
        </div>
      </section>
    </div>
  );
}
