import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Shell } from "./components/Shell";
import { Modal } from "./components/Modal";
import { Finish } from "./pages/Finish";
import { Icon } from "./components/Icon";
import { TemplateCover } from "./components/TemplateCard";
import { Home, Catalog } from "./pages/Home";
import { Wizard } from "./pages/Wizard";
import { Editor } from "./pages/Editor";
import { Audit } from "./pages/Audit";
import { Projects, Demo, Support } from "./pages/InfoPages";
import { AuthScreen } from "./pages/AuthScreen";
import { Profile } from "./pages/Profile";
import { YandexAuth } from "./pages/YandexAuth";
import type { Health, Project, Route, Template, User } from "./types";

const routes: Route[] = [
  "home",
  "templates",
  "favorites",
  "projects",
  "create",
  "editor",
  "audit",
  "demo",
  "support",
  "profile",
  "finish",
];
function readRoute(): Route {
  const value = location.hash.slice(1).split("?")[0] as Route;
  return routes.includes(value) ? value : "home";
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (location.pathname.replace(/\/$/, "") === "/auth/yandex")
    return <YandexAuth />;
  if (!ready)
    return (
      <div className="boot-screen">
        Deckly<span>.Ai</span>
        <p>Готовим пространство для вашей истории…</p>
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        error={error}
        onUser={(u) => {
          setUser(u);
          location.hash = "home";
        }}
      />
    );
  return (
    <Workspace
      key={user.id}
      user={user}
      onUser={setUser}
      onLogout={async () => {
        await api.logout();
        localStorage.removeItem("deckly-active-project");
        setUser(null);
        location.hash = "home";
      }}
    />
  );
}
function Workspace({
  user,
  onLogout,
  onUser,
}: {
  user: User;
  onLogout: () => Promise<void>;
  onUser: (user: User) => void;
}) {
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<Route | "logout" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const [route, setRoute] = useState(readRoute),
    [templates, setTemplates] = useState<Template[]>([]),
    [health, setHealth] = useState<Health | null>(null),
    [selected, setSelected] = useState<Template | null>(null),
    [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState<Template | null>(null),
    [mode, setMode] = useState<"text" | "description">("description"),
    [wizardKey, setWizardKey] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const favoriteBusy = useRef(new Set<string>());
  const uploadInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const change = () => {
      const next = readRoute();
      if (dirty && next !== route) {
        history.replaceState(null, "", "#" + route);
        setPending(next);
        return;
      }
      setRoute(next);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [dirty, route]);
  useEffect(() => {
    const protect = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href^="#"]');
      if (!dirty || !anchor) return;
      const next = anchor.getAttribute("href")!.slice(1) as Route;
      if (routes.includes(next) && next !== route) {
        event.preventDefault();
        setPending(next);
      }
    };
    document.addEventListener("click", protect, true);
    return () => document.removeEventListener("click", protect, true);
  }, [dirty, route]);
  useEffect(() => {
    Promise.all([api.templates(), api.health(), api.favorites()])
      .then(([t, h, f]) => {
        setTemplates(t);
        setSelected(t[0]);
        setHealth(h);
        setFavorites(f);
      })
      .catch((e) => setError(e.message));
    const id = localStorage.getItem("deckly-active-project");
    if (id)
      api
        .project(id)
        .then(setProject)
        .catch(() => localStorage.removeItem("deckly-active-project"));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function update(p: Project) {
    setProject(p);
    localStorage.setItem("deckly-active-project", p.id);
  }
  function open(p: Project) {
    update(p);
    setTemplates((prev) =>
      prev.some((t) => t.id === p.template.id) ? prev : [...prev, p.template],
    );
    location.hash = "editor";
  }
  function start(m: "text" | "description", t?: Template) {
    setMode(m);
    if (t) setSelected(t);
    setWizardKey((k) => k + 1);
    location.hash = "create";
  }
  async function toggleFavorite(id: string) {
    if (favoriteBusy.current.has(id)) return;
    favoriteBusy.current.add(id);
    const save = !favorites.includes(id);
    setFavorites((prev) =>
      save ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
    try {
      await api.favorite(id, save);
    } catch (e) {
      setFavorites((prev) =>
        save ? prev.filter((x) => x !== id) : [...new Set([...prev, id])],
      );
      setError((e as Error).message);
    } finally {
      favoriteBusy.current.delete(id);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const t = await api.upload(file);
      setTemplates((prev) => [...prev, t]);
      setSelected(t);
      setPreview(t);
      setToast("Шаблон добавлен. Палитра и макеты прочитаны.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }
  const catalog = {
    templates,
    favorites,
    toggleFavorite,
    select: (t: Template) => start("description", t),
    preview: setPreview,
    upload: () => uploadInput.current?.click(),
  };
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        К содержанию
      </a>
      <Shell
        route={route}
        health={health}
        user={user}
        templateCount={templates.length}
        favoriteCount={favorites.length}
        onSearch={(query) => {
          setCatalogSearch(query);
          setSearchRevision((value) => value + 1);
          location.hash = "templates";
        }}
        onLogout={() => setPending("logout")}
      >
        {error && (
          <div className="error-banner" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
            <button
              className="btn ghost sm"
              onClick={() => setError("")}
              aria-label="Закрыть сообщение"
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {uploading && (
          <div className="demo-notice" role="status">
            <i className="spinner" />
            Читаем структуру PPTX…
          </div>
        )}
        {!templates.length && !error ? (
          <section className="empty">
            <i className="spinner" />
            <p>Готовим рабочее пространство…</p>
          </section>
        ) : (
          <>
            {route === "home" && (
              <Home {...catalog} start={start} open={open} onError={setError} />
            )}
            {(route === "templates" || route === "favorites") && (
              <Catalog
                key={`${route}-${searchRevision}`}
                {...catalog}
                onlyFavorites={route === "favorites"}
                initialSearch={route === "templates" ? catalogSearch : ""}
              />
            )}
            {route === "create" && selected && (
              <Wizard
                key={wizardKey}
                template={selected}
                templates={templates}
                initialMode={mode}
                health={health}
                onSelect={setSelected}
                onOpen={open}
                onError={setError}
              />
            )}
            {route === "projects" && (
              <Projects
                templates={templates}
                onOpen={open}
                onError={setError}
              />
            )}
            {route === "editor" && project && (
              <Editor
                key={project.id}
                project={project}
                onUpdate={update}
                onError={setError}
                onDirty={setDirty}
                onExport={() => {
                  location.hash = "finish";
                }}
              />
            )}
            {route === "audit" && project && (
              <Audit
                key={project.id}
                onDirty={setDirty}
                project={project}
                health={health}
                onUpdate={update}
                onError={setError}
              />
            )}
            {route === "finish" && project && (
              <Finish
                key={`${project.id}-${project.updated_at}`}
                project={project}
                onOpen={(p) => {
                  open(p);
                  api
                    .templates()
                    .then(setTemplates)
                    .catch((e) => setError(e.message));
                }}
              />
            )}
            {(route === "editor" || route === "audit" || route === "finish") &&
              !project && (
                <div className="empty panel">
                  <h2>Откройте презентацию</h2>
                  <p>Создайте новую или выберите сохранённую.</p>
                  <a className="btn primary" href="#projects">
                    Мои презентации
                  </a>
                </div>
              )}
            {route === "demo" && (
              <Demo templates={templates} start={() => start("text")} />
            )}
            {route === "support" && <Support />}
            {route === "profile" && (
              <Profile
                user={user}
                health={health}
                onUser={onUser}
                onDirty={setDirty}
                onLogout={() => setPending("logout")}
              />
            )}
          </>
        )}
        <input
          hidden
          ref={uploadInput}
          type="file"
          accept=".pptx"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </Shell>
      {preview && (
        <Modal
          title={preview.name}
          className="template-preview-dialog"
          onClose={() => setPreview(null)}
        >
          <TemplateCover template={preview} />
          <div className="template-details">
            <span className="badge blue">
              {preview.metadata.source === "pptx"
                ? "Исходный PPTX"
                : "Авторская тема"}
            </span>
            <p>
              {preview.metadata.source === "pptx"
                ? `${preview.metadata.count} исходных слайдов · ${preview.metadata.layouts.length} макетов`
                : "Авторская тема · 3 варианта композиции"}{" "}
              · {preview.metadata.font}
            </p>
            <div className="swatches">
              {Object.values(preview.metadata.colors)
                .slice(0, 6)
                .map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
            </div>
            <p className="small muted">
              Обложка — пример подачи. Предпросмотр схемы и PDF используют
              Manrope; исходные шрифты и ресурсы мастеров сохраняются в PPTX.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                start("description", preview);
                setPreview(null);
              }}
            >
              Выбрать вариант
              <Icon name="arrow" />
            </button>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal
          closeDisabled={loggingOut}
          title={
            pending === "logout"
              ? "Вы уверены, что хотите выйти?"
              : "Изменения ещё не сохранены"
          }
          onClose={() => {
            if (!logoutLock.current) setPending(null);
          }}
        >
          <p className="muted">
            {pending === "logout"
              ? dirty
                ? "На этой странице есть несохранённые изменения. При выходе они будут потеряны."
                : "Сохранённые презентации останутся в вашем аккаунте."
              : "Сохраните изменения на текущей странице, чтобы продолжить работу с ними."}
          </p>
          <div className="form-footer">
            <button
              className="btn"
              disabled={loggingOut}
              onClick={async () => {
                if (logoutLock.current) return;
                const next = pending;
                if (next === "logout") {
                  logoutLock.current = true;
                  setLoggingOut(true);
                  try {
                    await onLogout();
                  } catch (e) {
                    setError((e as Error).message);
                    setPending(null);
                  } finally {
                    logoutLock.current = false;
                    setLoggingOut(false);
                  }
                } else {
                  setPending(null);
                  setDirty(false);
                  history.replaceState(null, "", `#${next}`);
                  setRoute(next);
                  window.scrollTo(0, 0);
                }
              }}
            >
              {loggingOut
                ? "Выходим…"
                : pending === "logout"
                  ? "Выйти из аккаунта"
                  : "Уйти без сохранения"}
            </button>
            <button
              className="btn primary"
              disabled={loggingOut}
              autoFocus
              onClick={() => setPending(null)}
            >
              {pending === "logout" ? "Остаться" : "Остаться на странице"}
            </button>
          </div>
        </Modal>
      )}
      <div id="toast" className={toast ? "show" : ""} role="status">
        {toast}
      </div>
    </>
  );
}
