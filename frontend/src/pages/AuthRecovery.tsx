import { useState } from "react";
import type React from "react";
import { api } from "../api";

export function EmailVerification({
  token,
  onComplete,
}: {
  token: string;
  onComplete: () => void;
}) {
  const [message, setMessage] = useState(
    "Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты.",
  );
  const [status, setStatus] = useState<
    "pending" | "busy" | "verified" | "failed"
  >("pending");
  async function verify() {
    setStatus("busy");
    try {
      await api.verifyEmail(token);
      setStatus("verified");
      setMessage("Почта подтверждена. Теперь можно войти в аккаунт.");
    } catch (error) {
      setStatus("failed");
      setMessage((error as Error).message);
    } finally {
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#login",
      );
    }
  }
  return (
    <main className="email-verification-page" aria-live="polite">
      <section className="email-verification-card">
        <div
          className={`email-verification-mark ${status === "failed" ? "is-error" : ""}`}
          aria-hidden="true"
        >
          {status === "failed" ? "!" : status === "verified" ? "✓" : "✉"}
        </div>
        <h1>
          {status === "failed"
            ? "Не удалось подтвердить почту"
            : status === "verified"
              ? "Почта подтверждена"
              : "Подтверждение почты"}
        </h1>
        <p>{message}</p>
        {status === "pending" && (
          <button className="auth-submit" onClick={verify}>
            Подтвердить адрес
          </button>
        )}
        {status === "busy" && (
          <button className="auth-submit" disabled>
            Проверяем…
          </button>
        )}
        {status === "verified" && (
          <button className="auth-submit" onClick={onComplete}>
            Перейти ко входу
          </button>
        )}
        {status === "failed" && (
          <a className="auth-submit" href="/#login">
            Вернуться ко входу
          </a>
        )}
      </section>
    </main>
  );
}

export function PasswordReset({ token }: { token: string }) {
  const [status, setStatus] = useState<"pending" | "busy" | "done" | "failed">(
    "pending",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm_password") ?? "")) {
      setError("Пароли не совпадают.");
      return;
    }
    setStatus("busy");
    setError("");
    try {
      await api.confirmPasswordReset(token, password);
      setStatus("done");
      setMessage("Пароль изменён. Теперь войдите с новым паролем.");
    } catch (cause) {
      setStatus("failed");
      setMessage((cause as Error).message);
    }
  }

  return (
    <main className="email-verification-page" aria-live="polite">
      <section className="email-verification-card">
        <div
          className={`email-verification-mark ${status === "failed" ? "is-error" : ""}`}
          aria-hidden="true"
        >
          {status === "failed" ? "!" : status === "done" ? "✓" : "⌑"}
        </div>
        <h1>
          {status === "failed"
            ? "Не удалось сбросить пароль"
            : status === "done"
              ? "Пароль изменён"
              : "Задайте новый пароль"}
        </h1>
        {status === "done" || status === "failed" ? (
          <>
            <p role="status">{message}</p>
            <button
              className="auth-submit"
              onClick={() => {
                location.hash = "#login";
              }}
            >
              Перейти ко входу
            </button>
          </>
        ) : (
          <form className="password-reset-form" onSubmit={submit}>
            <label>
              Новый пароль
              <input
                aria-label="Новый пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            <label>
              Повторите новый пароль
              <input
                aria-label="Повторите новый пароль"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="auth-submit"
              disabled={status === "busy"}
              type="submit"
            >
              {status === "busy" ? "Сохраняем…" : "Сохранить пароль"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
