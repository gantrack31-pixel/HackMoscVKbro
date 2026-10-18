import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { Avatar } from "../components/Brand";
import { Icon } from "../components/Icon";
import type { Health, User } from "../types";
import { PersonalDetails } from "./profile/PersonalDetails";
import { SecuritySettings } from "./profile/SecuritySettings";
import { ProfileLibrary } from "./profile/ProfileLibrary";
const profileTabs = ["Личные данные", "Вход и безопасность", "Моя библиотека"];
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
  const avatarInput = useRef<HTMLInputElement>(null);
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
  async function changeAvatar(file?: File) {
    if (busy) return;
    if (file && file.size > 5 * 1024 * 1024) {
      setError("Выберите фото до 5 МБ.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      onUser(file ? await api.uploadAvatar(file) : await api.removeAvatar());
      setMessage(
        file
          ? "Фото профиля обновлено"
          : "Фото удалено. Теперь отображаются инициалы.",
      );
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
          <div className="profile-avatar-control">
            <button
              type="button"
              className="profile-avatar-button"
              disabled={busy}
              onClick={() => avatarInput.current?.click()}
              aria-label="Изменить фото профиля"
            >
              <Avatar
                user={{
                  ...user,
                  first_name: first,
                  last_name: last,
                  avatar_color: color,
                }}
                large
              />
              <span className="profile-avatar-badge">
                <Icon name="edit" />
              </span>
            </button>
            <button
              type="button"
              className="profile-avatar-caption"
              disabled={busy}
              onClick={() => avatarInput.current?.click()}
            >
              Изменить фото
            </button>
            {user.avatar_url && (
              <button
                type="button"
                className="profile-avatar-caption"
                disabled={busy}
                onClick={() => void changeAvatar()}
              >
                Убрать фото
              </button>
            )}
            <input
              ref={avatarInput}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void changeAvatar(file);
              }}
            />
          </div>
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
      <div
        className="tabs profile-tabs"
        role="tablist"
        aria-label="Настройки профиля"
      >
        <span
          className="profile-tab-indicator"
          aria-hidden="true"
          style={{
            transform: `translateX(${profileTabs.indexOf(tab) * 100}%)`,
          }}
        />
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
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % profileTabs.length
                  : event.key === "ArrowLeft"
                    ? (index + profileTabs.length - 1) % profileTabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? profileTabs.length - 1
                        : null;
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
      <div
        key={shownTab}
        id="profile-tab-panel"
        role="tabpanel"
        aria-labelledby={`profile-tab-${profileTabs.indexOf(shownTab)}`}
        className={`profile-tab-content${tab !== shownTab ? " is-leaving" : ""}`}
        inert={tab !== shownTab}
      >
        {shownTab === "Личные данные" && (
          <PersonalDetails
            user={user}
            first={first}
            last={last}
            color={color}
            busy={busy}
            dirty={dirty}
            onFirstChange={(value) => {
              setFirst(value);
              setMessage("");
            }}
            onLastChange={(value) => {
              setLast(value);
              setMessage("");
            }}
            onColorChange={(value) => {
              setColor(value);
              setMessage("");
            }}
            onSave={save}
          />
        )}
        {shownTab === "Вход и безопасность" && (
          <SecuritySettings
            user={user}
            health={health}
            busy={busy}
            onConnect={connect}
            onLogout={onLogout}
          />
        )}
        {shownTab === "Моя библиотека" && <ProfileLibrary />}
      </div>
    </div>
  );
}
