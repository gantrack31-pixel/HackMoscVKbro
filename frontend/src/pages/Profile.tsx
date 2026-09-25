import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { Avatar } from "../components/Brand";
import { Icon } from "../components/Icon";
import type { Health, User } from "../types";
import "../styles/profile-polish.css";
const profileTabs = ["Личные данные", "Вход и безопасность", "Моя библиотека"];
const colors = [
  ["#0077FF", "Синий"],
  ["#7851BA", "Фиолетовый"],
  ["#29745F", "Зелёный"],
  ["#C05640", "Коралловый"],
  ["#0F172A", "Тёмный"],
  ["#B05A8B", "Розовый"],
];
const oauthMessages: Record<string, string> = {
  state: "Сессия подключения истекла. Попробуйте ещё раз.",
  cancelled: "Подключение Яндекс ID отменено.",
  linked:
    "Этот Яндекс ID уже связан с аккаунтом. Используйте другой или войдите в связанный аккаунт.",
  profile: "Яндекс не передал необходимые данные профиля.",
  provider: "Яндекс не ответил. Повторите подключение.",
};
export function Profile({
  user,
  health,
  onUser,
  onDirty,
  onLogout,
}: {
  user: User;
  health: Health | null;
  onUser: (u: User) => void;
  onDirty: (d: boolean) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState(
    location.hash.includes("yandex") ? "Вход и безопасность" : "Личные данные",
  );
  const [shownTab, setShownTab] = useState(tab);
  useEffect(() => {
    if (tab === shownTab) return;
    const timer = window.setTimeout(
      () => setShownTab(tab),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140,
    );
    return () => window.clearTimeout(timer);
  }, [tab, shownTab]);
  const [first, setFirst] = useState(user.first_name),
    [last, setLast] = useState(user.last_name),
    [color, setColor] = useState(user.avatar_color);
  const [stats, setStats] = useState<{
    projects: number;
    favorites: number;
    templates: number;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      location.hash.includes("yandex=connected")
        ? "Яндекс ID подключён. Теперь с ним можно входить в этот аккаунт."
        : "",
    );
  const [error, setError] = useState(
    oauthMessages[
      new URLSearchParams(location.hash.split("?")[1]).get("yandex_error") || ""
    ] || "",
  );
  const dirty =
    first !== user.first_name ||
    last !== user.last_name ||
    color !== user.avatar_color;
  useEffect(() => {
    api
      .profileStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.updateProfile({
        first_name: first.trim(),
        last_name: last.trim(),
        avatar_color: color,
      });
      onUser(updated);
      setFirst(updated.first_name);
      setLast(updated.last_name);
      setMessage("Изменения сохранены");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    if (dirty) {
      setError("Сначала сохраните изменения профиля.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.linkYandex();
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="profile-page profile-refined">
      <div className="heading">
        <span className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h1>Мой профиль</h1>
        <p>Всё, что делает Deckly вашим.</p>
      </div>
      <section className="profile-hero">
        <div className="profile-hero-identity">
          <Avatar
            user={{
              ...user,
              first_name: first,
              last_name: last,
              avatar_color: color,
            }}
            large
          />
          <div>
            <span className="profile-hero-label">ВАШ АККАУНТ DECKLY</span>
            <h2>
              {user.first_name} {user.last_name}
            </h2>
            <p>{user.email}</p>
            <small>
              С нами с{" "}
              {new Date(user.created_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </small>
          </div>
        </div>
        <span className="profile-privacy">
          <Icon name="shield" />
          Личная библиотека
        </span>
      </section>
      <div className="profile-stats">
        {(
          [
            ["projects", "folder", "Презентации", "#projects"],
            ["favorites", "star", "В избранном", "#favorites"],
            ["templates", "grid", "Свои шаблоны", "#templates"],
          ] as const
        ).map(([key, icon, label, href]) => (
          <a href={href} key={key}>
            <span className="stat-icon">
              <Icon name={icon} />
            </span>
            <span>
              <strong>{stats ? stats[key] : "…"}</strong>
              <small>{label}</small>
            </span>
            <Icon name="arrow" />
          </a>
        ))}
      </div>
      <div className="tabs profile-tabs" role="tablist" aria-label="Настройки профиля">
        <span className="profile-tab-indicator" aria-hidden="true" style={{ transform: `translateX(${profileTabs.indexOf(tab) * 100}%)` }} />
        {profileTabs.map((t, index) => (
          <button
            key={t}
            id={`profile-tab-${index}`}
            role="tab"
            aria-selected={t === tab}
            aria-controls="profile-tab-panel"
            tabIndex={t === tab ? 0 : -1}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % profileTabs.length
                : event.key === "ArrowLeft" ? (index + profileTabs.length - 1) % profileTabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? profileTabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              setTab(profileTabs[next]);
              document.getElementById(`profile-tab-${next}`)?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <Icon name="alert" />
          {error}
        </div>
      )}
      {message && (
        <div className="profile-success" role="status">
          <Icon name="check" />
          {message}
        </div>
      )}
      <div key={shownTab} id="profile-tab-panel" role="tabpanel"
        aria-labelledby={`profile-tab-${profileTabs.indexOf(shownTab)}`}
        className={`profile-tab-content${tab !== shownTab ? " is-leaving" : ""}`}
        inert={tab !== shownTab}>
      {shownTab === "Личные данные" && (
        <div className="profile-columns">
          <form className="panel profile-form" onSubmit={save}>
            <h2>Личные данные</h2>
            <p className="muted small">
              Так вы будете отображаться в своём пространстве.
            </p>
            <fieldset disabled={busy}>
              <div className="profile-name-fields">
                <label>
                  Имя
                  <input
                    required
                    maxLength={60}
                    autoComplete="given-name"
                    value={first}
                    onChange={(e) => {
                      setFirst(e.target.value);
                      setMessage("");
                    }}
                  />
                </label>
                <label>
                  Фамилия
                  <input
                    maxLength={60}
                    autoComplete="family-name"
                    value={last}
                    onChange={(e) => {
                      setLast(e.target.value);
                      setMessage("");
                    }}
                  />
                </label>
              </div>
              <label>
                Электронная почта
                <input type="email" value={user.email} readOnly />
                <small>Почта, с которой создан аккаунт.</small>
              </label>
              <div className="avatar-editor">
                <span>Цвет аватара</span>
                <div>
                  {colors.map(([c, name]) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Цвет аватара: ${name}`}
                      aria-pressed={color === c}
                      className={color === c ? "selected" : ""}
                      style={{ background: c }}
                      onClick={() => {
                        setColor(c);
                        setMessage("");
                      }}
                    >
                      {color === c && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
            <div className="profile-save">
              <span className={dirty ? "has-changes" : ""}>
                <Icon name={dirty ? "edit" : "check"} />
                {dirty
                  ? "Есть несохранённые изменения"
                  : "Все изменения сохранены"}
              </span>
              <button
                className="btn primary"
                disabled={busy || !dirty || !first.trim()}
              >
                {busy ? <i className="spinner" /> : <Icon name="check" />}
                Сохранить изменения
              </button>
            </div>
          </form>
          <aside className="profile-side-card">
            <span className="profile-side-icon">
              <Icon name="spark" />
            </span>
            <h2>Ваша следующая история</h2>
            <p>
              Удачное оформление начинается с задачи. Выберите шаблон для своего
              проекта.
            </p>
            <a className="btn" href="#templates">
              К шаблонам
              <Icon name="arrow" />
            </a>
            <div className="profile-deck-preview" aria-hidden="true">
              <span className="profile-preview-back" />
              <div className="profile-preview-slide">
                <span className="profile-preview-label">ВАША ПРЕЗЕНТАЦИЯ</span>
                <strong>Идеям<br />нужна форма.</strong>
                <span className="profile-preview-rule" />
                <span className="profile-preview-bars"><i /><i /><i /></span>
                <span className="profile-preview-number">01</span>
              </div>
              <span className="profile-preview-caption">От первого слайда — к целой истории</span>
            </div>
          </aside>
        </div>
      )}
      {shownTab === "Вход и безопасность" && (
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
                    : "Ожидает настройки владельцем сайта"}
              </p>
            </div>
            {user.yandex_connected ? (
              <span className="badge green">
                <Icon name="check" />
                Подключён
              </span>
            ) : (
              <button
                className="btn"
                disabled={busy || !health?.yandex_enabled}
                onClick={connect}
              >
                Подключить Яндекс ID
                <Icon name="external" />
              </button>
            )}
          </div>
          <div className="login-method">
            <span className="login-method-icon">
              <Icon name="shield" />
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
            <p>
              <Icon name="shield" />
              Данные профиля и презентации доступны после входа.
            </p>
            <button className="btn ghost" onClick={onLogout}>
              <Icon name="logout" />
              Выйти из аккаунта
            </button>
          </div>
        </section>
      )}
      {shownTab === "Моя библиотека" && (
        <section className="panel profile-library">
          <h2>От идеи до готовой презентации</h2>
          <p className="muted">
            Проекты, любимые стили и ваши фирменные шаблоны — в одном месте.
          </p>
          <div>
            {(
              [
                [
                  "projects",
                  "folder",
                  "Продолжить работу",
                  "Ваши сохранённые презентации",
                ],
                [
                  "favorites",
                  "star",
                  "Любимые стили",
                  "Шаблоны, отмеченные звёздочкой",
                ],
                [
                  "templates",
                  "upload",
                  "Своя коллекция",
                  "Добавьте PPTX с фирменным стилем",
                ],
              ] as const
            ).map(([id, icon, title, desc]) => (
              <a href={`#${id}`} key={id}>
                <Icon name={icon} />
                <h3>{title}</h3>
                <p>{desc}</p>
                <span>
                  Открыть
                  <Icon name="arrow" />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
