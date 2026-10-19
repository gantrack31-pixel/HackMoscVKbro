import { useSurfaceMotion } from "../motion/animation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { ThemeToggle } from "../components/ThemeToggle";
import { api } from "../api";
import { WordmarkTitle } from "../components/Brand";

import { AuthOrbit } from "../components/auth/AuthOrbit";
import type { Template, User } from "../types";
import {
  AuthFlowContent,
  type AuthScreenMode as Screen,
} from "../components/auth/AuthFlowContent";
function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
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
  const [screen, setScreen] = useState<Screen>(
      location.hash === "#login" || location.pathname === "/login"
        ? "login"
        : location.hash === "#register" || location.pathname === "/register"
          ? "register"
          : location.hash.startsWith("#auth-error=")
            ? "choice"
            : "welcome",
    ),
    [templates, setTemplates] = useState<Template[]>([]),
    [error, setError] = useState(
      initialError ||
        oauthErrors[location.hash.replace("#auth-error=", "")] ||
        "",
    ),
    [busy, setBusy] = useState(false),
    [verificationEmail, setVerificationEmail] = useState(""),
    [resendBusy, setResendBusy] = useState(false),
    [resendMessage, setResendMessage] = useState(""),
    [resetEmail, setResetEmail] = useState(""),
    [resetBusy, setResetBusy] = useState(false),
    [resetMessage, setResetMessage] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api
      .publicTemplates(controller.signal)
      .then((templates) => {
        if (!controller.signal.aborted) setTemplates(templates);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const formMotion = useSurfaceMotion(
    [screen],
    ".auth-panel-content > .auth-welcome, .auth-panel-content > .auth-choice, .auth-panel-content > .auth-divider, .auth-panel-content > .yandex-button, .auth-form > h1, .auth-form > .auth-form-hint, .auth-form > label, .auth-form > .auth-submit",
    true,
  );
  const startRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [],
  );
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
      360,
    );
    return () => clearTimeout(timer);
  }, [screen]);
  function go(next: Screen) {
    if (busy || transitionTimer.current || next === screen) return;
    const commit = () => {
      setScreen(next);
      setError("");
      setShowPassword(false);
      setLeaving(false);
      transitionTimer.current = null;
      if (next === "welcome")
        requestAnimationFrame(() =>
          startRef.current?.focus({ preventScroll: true }),
        );
    };
    if (opened) {
      setLeaving(true);
      transitionTimer.current = setTimeout(
        commit,
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
      );
    } else commit();
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
      if (screen === "register") {
        const result = await api.register({
          ...credentials,
          first_name: String(data.get("first_name")),
          last_name: String(data.get("last_name")),
        });
        if ("verification_required" in result) {
          setVerificationEmail(result.email);
          setResendMessage(
            result.delivery_pending
              ? "Не удалось отправить письмо. Проверьте SMTP-настройки или попробуйте отправить письмо ещё раз."
              : result.delivery_mode === "unavailable"
                ? "Почта не настроена на сервере. Обратитесь в поддержку, чтобы завершить подтверждение."
                : "",
          );
          setScreen("check-email");
        } else if (result.user) onUser(result.user);
      } else {
        const result = await api.login(credentials.email, credentials.password);
        if (result.user) onUser(result.user);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    if (!isValidEmail(verificationEmail)) {
      setError("Укажите корректную электронную почту, чтобы запросить письмо.");
      return;
    }
    setResendBusy(true);
    setError("");
    setResendMessage("");
    try {
      const result = await api.resendVerification(verificationEmail);
      setResendMessage(
        result.delivery_mode === "unavailable"
          ? "Почта не настроена на сервере. Обратитесь в поддержку, чтобы завершить подтверждение."
          : result.delivery_mode === "cooldown"
            ? "Подождите минуту перед повторной отправкой письма."
            : "Если адрес ожидает подтверждения, письмо скоро придёт.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResendBusy(false);
    }
  }
  function openResendVerification() {
    const email =
      contentRef.current
        ?.querySelector<HTMLInputElement>('input[name="email"]')
        ?.value.trim() ?? "";
    if (!isValidEmail(email)) {
      setError("Укажите корректную электронную почту, чтобы запросить письмо.");
      contentRef.current
        ?.querySelector<HTMLInputElement>('input[name="email"]')
        ?.focus();
      return;
    }
    setVerificationEmail(email);
    setScreen("check-email");
    setResendMessage("");
    setError("");
  }
  function openPasswordReset() {
    const email =
      contentRef.current
        ?.querySelector<HTMLInputElement>('input[name="email"]')
        ?.value.trim() ?? "";
    setResetEmail(email);
    setResetMessage("");
    setError("");
    setScreen("request-reset");
  }
  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    if (!isValidEmail(email)) {
      setError("Укажите корректную электронную почту.");
      return;
    }
    setResetBusy(true);
    setError("");
    try {
      await api.requestPasswordReset(email);
      setResetEmail(email);
      setResetMessage(
        "Если аккаунт с таким адресом существует, письмо со ссылкой скоро придёт.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <div
      ref={formMotion}
      className={`auth-shell ${screen === "welcome" ? "welcome" : "auth-dark"}`}
      id="design-root"
    >
      <section className="auth-left">
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
            <Icon name={opened ? "auth-return" : "auth-enter"} size={20} />
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
            <WordmarkTitle entry />
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

            </button>
          </div>
          <div
            ref={contentRef}
            id="auth-panel"
            className={`auth-panel-content ${leaving ? "is-leaving" : ""}`}
            inert={!opened}
            aria-hidden={!opened}
          >
            <AuthFlowContent
              screen={screen}
              verificationEmail={verificationEmail}
              resendBusy={resendBusy}
              resendMessage={resendMessage}
              resetEmail={resetEmail}
              resetBusy={resetBusy}
              resetMessage={resetMessage}
              showPassword={showPassword}
              busy={busy}
              onGo={go}
              onResendVerification={resendVerification}
              onRequestPasswordReset={requestPasswordReset}
              onSubmit={submit}
              onOpenResendVerification={openResendVerification}
              onOpenPasswordReset={openPasswordReset}
              onShowPassword={setShowPassword}
            />
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
        <footer className="auth-footer">
          <span>© 2026 Deckly</span>
        </footer>
      </section>
      <section
        className="auth-right auth-orbit-panel"
        aria-label="Создание презентации Deckly.Ai"
      >
        <AuthOrbit templates={templates} />
      </section>
    </div>
  );
}
