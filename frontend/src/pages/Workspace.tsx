import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Shell, WorkspacePage } from "../components/Shell";
import { LeaveWorkspaceDialog } from "../components/LeaveWorkspaceDialog";
import { Icon } from "../components/Icon";
import { TemplatePreviewDialog } from "../components/TemplatePreviewDialog";
import { readRoute, routes } from "../navigation/routes";
import type { Health, Project, Route, Template, User } from "../types";

import { clearPendingGenerationJob } from "./wizard/pendingJob";

const Finish = lazy(() =>
  import("./Finish").then((module) => ({ default: module.Finish })),
);
const Home = lazy(() =>
  import("./Home").then((module) => ({ default: module.Home })),
);
const Catalog = lazy(() =>
  import("./Catalog").then((module) => ({ default: module.Catalog })),
);
const Wizard = lazy(() =>
  import("./Wizard").then((module) => ({ default: module.Wizard })),
);
const Editor = lazy(() =>
  import("./Editor").then((module) => ({ default: module.Editor })),
);
const Audit = lazy(() =>
  import("./Audit").then((module) => ({ default: module.Audit })),
);
const Projects = lazy(() =>
  import("./Projects").then((module) => ({ default: module.Projects })),
);
const Demo = lazy(() =>
  import("./Demo").then((module) => ({ default: module.Demo })),
);
const Support = lazy(() =>
  import("./Support").then((module) => ({ default: module.Support })),
);
const Profile = lazy(() =>
  import("./Profile").then((module) => ({ default: module.Profile })),
);
const Requirements = lazy(() =>
  import("./Requirements").then((module) => ({ default: module.Requirements })),
);

export function Workspace({
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
    clearPendingGenerationJob();
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
        favoriteCount={favorites.length}
        onLogout={() => setPending("logout")}
        onNewPresentation={() => start("description")}
      >
        <Suspense
          fallback={
            <main className="page motion-page" id="main" tabIndex={-1}>
              <section className="empty" role="status">
                <i className="spinner" />
                <p>Готовим рабочее пространство…</p>
              </section>
            </main>
          }
        >
          <WorkspacePage route={route}>
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
                  <Home
                    {...catalog}
                    start={start}
                    open={open}
                    onError={setError}
                  />
                )}
                {(route === "templates" || route === "favorites") && (
                  <Catalog
                    key={route}
                    {...catalog}
                    onlyFavorites={route === "favorites"}
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
                    onRestart={() => start("description")}
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
                    imageGenerationAvailable={health?.image_generation}
                    health={health}
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
                {(route === "editor" ||
                  route === "audit" ||
                  route === "finish") &&
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
                {route === "requirements" && (
                  <Requirements health={health} templates={templates} />
                )}
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
          </WorkspacePage>
        </Suspense>
      </Shell>
      {preview && (
        <TemplatePreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onSelect={(template) => {
            start("description", template);
            setPreview(null);
          }}
        />
      )}
      {pending && (
        <LeaveWorkspaceDialog
          pending={pending}
          dirty={dirty}
          loggingOut={loggingOut}
          onClose={() => {
            if (!logoutLock.current) setPending(null);
          }}
          onConfirm={async () => {
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
        />
      )}
      <div id="toast" className={toast ? "show" : ""} role="status">
        {toast}
      </div>
    </>
  );
}
