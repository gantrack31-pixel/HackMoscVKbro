import type { FormEvent } from "react";
import { Icon } from "../Icon";

export type AuthScreenMode =
  | "welcome"
  | "choice"
  | "login"
  | "register"
  | "check-email"
  | "request-reset";

export function AuthFlowContent({
  screen,
  verificationEmail,
  resendBusy,
  resendMessage,
  resetEmail,
  resetBusy,
  resetMessage,
  showPassword,
  busy,
  onGo,
  onResendVerification,
  onRequestPasswordReset,
  onSubmit,
  onOpenResendVerification,
  onOpenPasswordReset,
  onShowPassword,
}: {
  screen: AuthScreenMode;
  verificationEmail: string;
  resendBusy: boolean;
  resendMessage: string;
  resetEmail: string;
  resetBusy: boolean;
  resetMessage: string;
  showPassword: boolean;
  busy: boolean;
  onGo: (mode: AuthScreenMode) => void;
  onResendVerification: () => void | Promise<void>;
  onRequestPasswordReset: (
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onOpenResendVerification: () => void;
  onOpenPasswordReset: () => void;
  onShowPassword: (show: boolean) => void;
}) {
  return (
    <>
      {screen === "check-email" ? (
        <section className="auth-form email-pending" aria-live="polite">
          <button
            className="auth-back"
            type="button"
            onClick={() => onGo("login")}
          >
            <Icon name="auth-return" /><span>Ко входу</span>
          </button>
          <div className="email-pending-icon" aria-hidden="true">
            <Icon name="auth-email-confirmation" size={24} />
          </div>
          <h1>Проверьте почту</h1>
          <p className="auth-form-hint">
            Мы отправили ссылку для подтверждения на
          </p>
          <strong className="email-pending-address">{verificationEmail}</strong>
          <p className="password-hint">
            Перейдите по ссылке в письме, чтобы подтвердить адрес и войти в
            аккаунт.
          </p>
          <button
            className="auth-submit"
            type="button"
            disabled={resendBusy}
            onClick={onResendVerification}
          >
            {resendBusy ? "Отправляем…" : "Отправить письмо ещё раз"}

          </button>
          {resendMessage && (
            <p className="email-resend-message" role="status">
              {resendMessage}
            </p>
          )}
        </section>
      ) : screen === "request-reset" ? (
        <section className="auth-form email-pending" aria-live="polite">
          <button
            className="auth-back"
            type="button"
            onClick={() => onGo("login")}
          >
            <Icon name="auth-return" /><span>Ко входу</span>
          </button>
          <h1>Восстановление пароля</h1>
          <p className="auth-form-hint">
            Укажите почту аккаунта. Если он существует, мы отправим ссылку для
            сброса.
          </p>
          <form onSubmit={onRequestPasswordReset}>
            <label>
              Электронная почта
              <div className="auth-input">
                <Icon name="auth-reset-email" size={17} />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  defaultValue={resetEmail}
                  placeholder="name@example.ru"
                />
              </div>
            </label>
            <button className="auth-submit" type="submit" disabled={resetBusy}>
              {resetBusy ? "Отправляем…" : "Отправить ссылку"}
            </button>
          </form>
          {resetMessage && (
            <p className="email-resend-message" role="status">
              {resetMessage}
            </p>
          )}
        </section>
      ) : screen === "choice" || screen === "welcome" ? (
        <>
          <p className="auth-welcome">
            Хорошая история
            <br />
            начинается здесь.
          </p>
          <div className="auth-choice">
            <button onClick={() => onGo("login")}>Вход</button>
            <button onClick={() => onGo("register")}>Регистрация</button>
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
        <form key={screen} onSubmit={onSubmit} className="auth-form">
          <button
            className="auth-back"
            type="button"
            onClick={() => onGo("choice")}
          >
            <Icon name="auth-return" /><span>Назад</span>
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
              <Icon name="auth-email" size={17} />
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
                  <Icon name="auth-first-name" size={17} />
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
                  <Icon name="auth-last-name" size={17} />
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
              <Icon name="auth-password" size={17} />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  screen === "register" ? "new-password" : "current-password"
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
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => onShowPassword(!showPassword)}
              >
                <Icon name={showPassword ? "auth-hide-password" : "auth-show-password"} size={17} />
              </button>
            </div>
          </label>
          {screen === "login" && (
            <>
              <button
                className="auth-help auth-resend-trigger"
                type="button"
                onClick={onOpenResendVerification}
              >
                Не получили письмо подтверждения? Запросить повторно
              </button>
              <button
                className="auth-help"
                type="button"
                onClick={onOpenPasswordReset}
              >
                Забыли пароль?
              </button>
            </>
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

          </button>
          <p className="auth-switch">
            {screen === "register" ? "Уже есть аккаунт?" : "Ещё нет аккаунта?"}{" "}
            <button
              type="button"
              onClick={() => onGo(screen === "register" ? "login" : "register")}
            >
              {screen === "register" ? "Войти" : "Зарегистрироваться"}
            </button>
          </p>
        </form>
      )}
    </>
  );
}
