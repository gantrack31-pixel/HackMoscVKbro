import { usePageMotion } from "../motion/animation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { Brand } from "./Brand";
import { SelectionIndicator } from "./SelectionIndicator";
import type { Route } from "../types";
import { prefetchPage } from "../navigation/pageLoaders";

const nav: [Route, IconName, string][] = [
  ["home", "nav-home", "Главная"],
  ["templates", "nav-templates", "Шаблоны"],
  ["projects", "nav-projects", "Мои презентации"],
  ["favorites", "nav-favorites", "Избранное"],
  ["demo", "nav-demo", "Как это работает"],
];
export function Shell({
  route,
  children,
  favoriteCount,
  onLogout,
  onNewPresentation,
}: {
  route: Route;
  children: ReactNode;
  onLogout: () => void;
  onNewPresentation: () => void;
  favoriteCount: number;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [iconMotion, setIconMotion] = useState<
    Partial<Record<Route | "logout", number>>
  >({});
  function animateIcon(id: Route | "logout") {
    setIconMotion((previous) => ({
      ...previous,
      [id]: (previous[id] || 0) + 1,
    }));
  }
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarTrigger = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const accountNavigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (collapsed) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarTrigger.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollapsed(true);
      if (event.key !== "Tab") return;
      const items = sidebarRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      sidebarTrigger.current?.focus({ preventScroll: true });
    };
  }, [collapsed]);
  return (
    <div
      className={`shell shell-refined ${collapsed ? "sidebar-collapsed" : ""}`}
      id="design-root"
    >
      <aside
        ref={sidebarRef}
        className="sidebar"
        id="workspace-sidebar"
        aria-label="Навигация"
      >
        <button
          ref={sidebarTrigger}
          className="sidebar-brand"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="workspace-sidebar"
          aria-label={
            collapsed
              ? "Раскрыть навигацию Deckly.Ai"
              : "Свернуть навигацию Deckly.Ai"
          }
        >
          <Brand compact />
        </button>
        <div className="sidebar-nav-group">
          <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <nav
            ref={navigationRef}
            className="nav sliding-nav"
            aria-label="Основная навигация"
          >
            <SelectionIndicator container={navigationRef} activeKey={route} />
            {nav.map(([id, icon, name]) => (
              <a
                key={id}
                href={"#" + id}
                data-nav={id}
                onPointerEnter={() => prefetchPage(id)}
                onFocus={() => prefetchPage(id)}
                onClick={() => animateIcon(id)}
                className={id === route ? "active" : ""}
                aria-current={id === route ? "page" : undefined}
                title={name}
                aria-label={name}
              >
                <Icon
                  name={icon}
                  key={iconMotion[id] || 0}
                  className={iconMotion[id] ? "nav-motion" : ""}
                />
                <span>{name}</span>
                {id === "favorites" && favoriteCount > 0 && (
                  <b className="nav-count">{favoriteCount}</b>
                )}
              </a>
            ))}
          </nav>
          <a
            href="#create"
            onPointerEnter={() => prefetchPage("create")}
            onFocus={() => prefetchPage("create")}
            className="sidebar-create"
            data-nav="create"
            aria-label="Новая презентация"
            title="Новая презентация"
            onClick={(event) => {
              event.preventDefault();
              animateIcon("create");
              onNewPresentation();
            }}
          >
            <Icon
              name="nav-create"
              key={iconMotion.create || 0}
              className={iconMotion.create ? "nav-motion" : ""}
            />
            <span>Новая презентация</span>
          </a>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-theme">
            <ThemeToggle />
            <span>Оформление</span>
          </div>
          <nav
            ref={accountNavigationRef}
            className="nav sliding-nav"
            aria-label="Аккаунт и помощь"
          >
            <SelectionIndicator
              container={accountNavigationRef}
              activeKey={route}
            />
            {(
              [
                ["support", "nav-support", "Поддержка"],
                ["profile", "nav-profile", "Мой профиль"],
              ] as [Route, IconName, string][]
            ).map(([id, icon, name]) => (
              <a
                key={id}
                href={"#" + id}
                title={name}
                aria-label={name}
                data-nav={id}
                onPointerEnter={() => prefetchPage(id)}
                onFocus={() => prefetchPage(id)}
                onClick={() => animateIcon(id)}
                className={route === id ? "active" : ""}
                aria-current={route === id ? "page" : undefined}
              >
                <Icon
                  name={icon}
                  key={iconMotion[id] || 0}
                  className={iconMotion[id] ? "nav-motion" : ""}
                />
                <span>{name}</span>
              </a>
            ))}
            <button
              type="button"
              className="sidebar-logout"
              data-nav="logout"
              onClick={() => {
                animateIcon("logout");
                setCollapsed(true);
                onLogout();
              }}
              title="Выйти из аккаунта"
              aria-label="Выйти из аккаунта"
            >
              <Icon
                name="nav-logout"
                key={iconMotion.logout || 0}
                className={iconMotion.logout ? "nav-motion" : ""}
              />
              <span>Выйти из аккаунта</span>
            </button>
          </nav>
        </div>
      </aside>
      <button
        className={`sidebar-scrim ${collapsed ? "is-hidden" : ""}`}
        aria-hidden={collapsed}
        aria-label="Закрыть навигацию"
        onClick={() => setCollapsed(true)}
        tabIndex={-1}
      />
      <div className="workspace-layer" inert={!collapsed}>
        {children}
      </div>
    </div>
  );
}

/** Mount the page motion after its lazy route has resolved. */
export function WorkspacePage({
  route,
  children,
}: {
  route: Route;
  children: ReactNode;
}) {
  const pageMotion = usePageMotion(route);
  return (
    <main ref={pageMotion} className="page motion-page" id="main" tabIndex={-1}>
      {children}
    </main>
  );
}
