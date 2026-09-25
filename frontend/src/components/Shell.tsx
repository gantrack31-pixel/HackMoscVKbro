import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { Brand } from "./Brand";
import { SelectionIndicator } from "./SelectionIndicator";
import type { Health, Route, User } from "../types";

const nav: [Route, IconName, string][] = [
  ["home", "home", "Главная"], ["templates", "grid", "Шаблоны"],
  ["projects", "folder", "Мои презентации"], ["favorites", "star", "Избранное"],
  ["demo", "play", "Как это работает"],
];
export function Shell({ route, children, favoriteCount, onLogout }: {
  route: Route; health: Health | null; user: User; children: ReactNode;
  onLogout: () => void; onSearch: (s: string) => void;
  templateCount: number; favoriteCount: number;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarTrigger = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const accountNavigationRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    const timer = setTimeout(() => setCollapsed(true), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 580);
    return () => clearTimeout(timer);
  }, [route]);
  useEffect(() => {
    if (collapsed) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarTrigger.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollapsed(true);
      if (event.key !== "Tab") return;
      const items = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      sidebarTrigger.current?.focus({ preventScroll: true });
    };
  }, [collapsed]);
  return <div className={`shell shell-refined ${collapsed ? "sidebar-collapsed" : ""}`} id="design-root">
    <aside ref={sidebarRef} className="sidebar" id="workspace-sidebar" aria-label="Навигация">
      <button ref={sidebarTrigger} className="sidebar-brand" onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed} aria-controls="workspace-sidebar"
        aria-label={collapsed ? "Раскрыть навигацию Deckly.Ai" : "Свернуть навигацию Deckly.Ai"}>
        <Brand compact />
      </button>
      <div className="sidebar-nav-group">
        <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav ref={navigationRef} className="nav sliding-nav" aria-label="Основная навигация">
          <SelectionIndicator container={navigationRef} activeKey={route} />
          {nav.map(([id, icon, name]) => <a key={id} href={"#" + id}
            className={id === route ? "active" : ""} aria-current={id === route ? "page" : undefined}
            title={name} aria-label={name}>
            <Icon name={icon} /><span>{name}</span>
            {id === "favorites" && favoriteCount > 0 && <b className="nav-count">{favoriteCount}</b>}
          </a>)}
        </nav>
        <a href="#create" className="sidebar-create" aria-label="Новая презентация" title="Новая презентация">
          <Icon name="plus" /><span>Новая презентация</span>
        </a>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-theme"><ThemeToggle /><span>Оформление</span></div>
        <nav ref={accountNavigationRef} className="nav sliding-nav" aria-label="Аккаунт и помощь">
          <SelectionIndicator container={accountNavigationRef} activeKey={route} />
          {([["support", "help", "Поддержка"], ["profile", "user", "Мой профиль"]] as [Route, IconName, string][]).map(([id, icon, name]) =>
            <a key={id} href={"#" + id} title={name} aria-label={name}
              className={route === id ? "active" : ""} aria-current={route === id ? "page" : undefined}>
              <Icon name={icon} /><span>{name}</span>
            </a>)}
          <button type="button" className="sidebar-logout" onClick={() => {
            setCollapsed(true);
            onLogout();
          }} title="Выйти из аккаунта" aria-label="Выйти из аккаунта">
            <Icon name="logout" /><span>Выйти из аккаунта</span>
          </button>
        </nav>
      </div>
    </aside>
    <button className={`sidebar-scrim ${collapsed ? "is-hidden" : ""}`} aria-hidden={collapsed}
      aria-label="Закрыть навигацию" onClick={() => setCollapsed(true)} tabIndex={-1} />
    <div className="workspace-layer" inert={!collapsed}>
      <main className="page" id="main" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
