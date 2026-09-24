import { useEffect, useState } from "react";
import { api } from "../api";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";

export function YandexAuth() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.health().then(result => setEnabled(result.yandex_enabled))
      .catch(() => setError("Не удалось связаться с сервером. Обновите страницу и попробуйте снова."));
    const restore = () => setBusy(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return <main className="yandex-host">
    <div className="yandex-theme"><ThemeToggle /></div>
    <section className="panel yandex-auth-card" aria-labelledby="yandex-heading">
      <Brand />
      <h1 id="yandex-heading">Вход через Яндекс ID</h1>
      <p>Продолжите со своим аккаунтом Яндекса, чтобы создавать и сохранять презентации.</p>
      <button className="yandex-button" disabled={!enabled || busy} onClick={() => {
        setBusy(true);
        location.assign("/api/auth/yandex/start");
      }}><b>Я</b>{busy ? "Переходим в Яндекс…" : "Войти с Яндекс ID"}</button>
      <div role="status" className="yandex-auth-status">
        {error || (enabled === false ? "Вход через Яндекс пока не подключён. Вы можете войти по почте." : enabled === null ? "Проверяем доступность входа…" : "Пароль от Яндекса вводится только на странице Яндекса.")}
      </div>
      <a className="btn" href="/#login">Войти по почте</a>
      <a className="small muted" href="/">Вернуться на главную</a>
    </section>
  </main>;
}
