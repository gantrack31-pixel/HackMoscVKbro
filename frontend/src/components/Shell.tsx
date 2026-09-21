import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Avatar, Brand } from "./Brand";
import type { Health, Route, User } from "../types";
const nav: [Route, IconName, string][] = [
  ["home", "home", "Главная"],
  ["templates", "grid", "Шаблоны"],
  ["projects", "folder", "Мои презентации"],
  ["favorites", "star", "Избранное"],
  ["demo", "play", "Как это работает"],
];
const titles: Record<Route, string> = {
  home: "Главная",
  templates: "Шаблоны",
  projects: "Мои презентации",
  favorites: "Избранное",
  create: "Новая презентация",
  editor: "Редактор",
  audit: "Проверка",
  demo: "Как это работает",
  support: "Поддержка",
  profile: "Мой профиль",
  finish: "Сохранение",
};
export function Shell({
  route,
  user,
  children,
  onLogout,
  onSearch,
  favoriteCount,
}: {
  route: Route;
  health: Health | null;
  user: User;
  children: ReactNode;
  onLogout: () => void;
  onSearch: (s: string) => void;
  templateCount: number;
  favoriteCount: number;
}) {
  const [menu, setMenu] = useState(false),
    [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setMenu(false), [route]);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  function search(e: FormEvent) {
    e.preventDefault();
    onSearch(query.trim());
  }
  return (
    <div className={`shell shell-refined ${collapsed ? "sidebar-collapsed" : ""}`} id="design-root">
      <aside className="sidebar" id="workspace-sidebar" inert={collapsed} aria-hidden={collapsed}>
        <a
          className="sidebar-brand"
          href="#home"
          aria-label="Deckly.Ai — главная"
        >
          <Brand compact />
        </a>
        <a
          className="workspace workspace-link"
          href="#profile"
          aria-label="Личное пространство — мой профиль"
        >
          <Avatar user={user} />
          <span>
            <strong>{user.first_name}</strong>
            <small>Личное пространство</small>
          </span>
          <Icon name="down" />
        </a>
        <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav className="nav" aria-label="Основная навигация">
          {nav.map(([id, icon, name]) => (
            <a
              key={id}
              href={"#" + id}
              className={id === route ? "active" : ""}
              aria-current={id === route ? "page" : undefined}
              title={name}
            >
              <Icon name={icon} />
              <span>{name}</span>
              {id === "favorites" && favoriteCount > 0 && (
                <b className="nav-count">{favoriteCount}</b>
              )}
            </a>
          ))}
        </nav>
        <a href="#create" className="sidebar-create">
          <Icon name="plus" />
          <span>Новая презентация</span>
        </a>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Icon name="spark" />
            <strong>Начните с одной идеи</strong>
            <p>Шаблон поможет найти ей форму.</p>
            <a href="#templates">
              Выбрать оформление <Icon name="arrow" />
            </a>
          </div>
          <nav className="nav" aria-label="Аккаунт и помощь">
            <a
              href="#profile"
              className={route === "profile" ? "active" : ""}
              aria-current={route === "profile" ? "page" : undefined}
            >
              <Icon name="user" />
              <span>Мой профиль</span>
            </a>
            <a
              href="#support"
              className={route === "support" ? "active" : ""}
              aria-current={route === "support" ? "page" : undefined}
            >
              <Icon name="help" />
              <span>Поддержка</span>
            </a>
          </nav>
          <div className="local-note">Ваши идеи. Ваш стиль.</div>
        </div>
      </aside>
      <header className="topbar topbar-refined">
        <div className="masthead">
          <button className="theme-toggle sidebar-toggle" aria-expanded={!collapsed} aria-controls="workspace-sidebar"
            aria-label={collapsed ? "Показать боковую панель" : "Скрыть боковую панель"} onClick={() => setCollapsed(value => !value)}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <a className="masthead-brand" href="#home" aria-label="Deckly.Ai">
            <Brand />
            <span className="masthead-tagline">
              Цифровой дизайнер
              <br />
              презентаций
            </span>
          </a>
          <form className="global-search" onSubmit={search} role="search">
            <Icon name="search" />
            <input
              aria-label="Поиск по шаблонам"
              placeholder="Найдите свой следующий стиль"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" aria-label="Найти шаблоны">
              <Icon name="arrow" />
            </button>
          </form>
          <ThemeToggle />
          <div className="account-control" ref={profileRef}>
            <button
              className={"account-trigger " + (menu ? "open" : "")}
              ref={trigger}
              aria-expanded={menu}
              aria-controls="account-popover"
              aria-label="Открыть меню профиля"
              onClick={() => setMenu(!menu)}
            >
              <Avatar user={user} />
              <span>
                <strong>{user.first_name}</strong>
                <small>Мой аккаунт</small>
              </span>
              <Icon name="down" />
            </button>
            {menu && (
              <div className="account-popover" id="account-popover">
                <div className="popover-identity">
                  <Avatar user={user} />
                  <span>
                    <strong>
                      {user.first_name} {user.last_name}
                    </strong>
                    <small>{user.email}</small>
                  </span>
                </div>
                <a href="#profile">
                  <Icon name="user" />
                  Профиль и настройки
                  <Icon name="arrow" />
                </a>
                <a href="#projects">
                  <Icon name="folder" />
                  Мои презентации
                </a>
                <a href="#support">
                  <Icon name="help" />
                  Связаться с поддержкой
                </a>
                <button
                  onClick={() => {
                    setMenu(false);
                    onLogout();
                  }}
                >
                  <Icon name="logout" />
                  Выйти из аккаунта
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main aria-label={titles[route]} className="page" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
