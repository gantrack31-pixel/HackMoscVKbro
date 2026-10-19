import { Icon } from "../../components/Icon";
import type { Health, User } from "../../types";

export function SecuritySettings({
  user,
  health,
  busy,
  onConnect,
  onLogout,
}: {
  user: User;
  health: Health | null;
  busy: boolean;
  onConnect: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="panel profile-security">
      <h2>Способы входа</h2>
      <p className="muted small">
        Удобный доступ к одному аккаунту и всем вашим презентациям.
      </p>
      <div className="login-method">
        <span className="yandex-symbol">Я</span>
        <div>
          <h3>Яндекс ID</h3>
          <p>
            {user.yandex_connected
              ? "Подключён к вашему аккаунту"
              : health?.yandex_enabled
                ? "Входите без ввода пароля Deckly"
                : "Вход через Яндекс пока недоступен"}
          </p>
        </div>
        {user.yandex_connected ? (
          <span className="badge green">Подключён</span>
        ) : (
          <button
            className="btn"
            disabled={busy || !health?.yandex_enabled}
            onClick={onConnect}
          >
            Подключить Яндекс ID
            <Icon name="account-connect" />
          </button>
        )}
      </div>
      <div className="login-method">
        <span className="login-method-icon">
          <Icon name="account-password" />
        </span>
        <div>
          <h3>Электронная почта и пароль</h3>
          <p>
            {user.password_enabled
              ? "Вход по почте доступен"
              : "Этот аккаунт использует вход через Яндекс ID"}
          </p>
        </div>
        <span className="badge">
          {user.password_enabled ? "Подключён" : "Яндекс ID"}
        </span>
      </div>
      <div className="security-footer">
        <button className="btn ghost" onClick={onLogout}>
          <Icon name="account-signout" />
          Выйти из аккаунта
        </button>
      </div>
    </section>
  );
}
