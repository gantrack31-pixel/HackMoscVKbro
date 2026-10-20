import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useDisclosureMotion } from "../motion/useDisclosureMotion";
import { Shell, WorkspacePage } from "../components/Shell";
import { LeaveWorkspaceDialog } from "../components/LeaveWorkspaceDialog";
import { Icon } from "../components/Icon";
import { TemplatePreviewDialog } from "../components/TemplatePreviewDialog";
import { readRoute, routes } from "../navigation/routes";
import { pageLoaders, prefetchPage } from "../navigation/pageLoaders";
import type { Health, Project, Route, Template, User } from "../types";

import { clearPendingGenerationJob } from "./wizard/pendingJob";
import { readAccount, writeAccount } from "../state/accountStorage";
import { archiveWizardDraft } from "./wizard/draft";

const Finish = lazy(pageLoaders.finish);
const Home = lazy(pageLoaders.home);
const Catalog = lazy(pageLoaders.templates);
const Wizard = lazy(pageLoaders.create);
const Editor = lazy(pageLoaders.editor);
const Audit = lazy(pageLoaders.audit);
const Projects = lazy(pageLoaders.projects);
const Demo = lazy(pageLoaders.demo);
const Support = lazy(pageLoaders.support);
const Profile = lazy(pageLoaders.profile);
const Requirements = lazy(pageLoaders.requirements);

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
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const [bootstrapErrors, setBootstrapErrors] = useState<Record<string, string>>({});
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoriteBusy = useRef(new Set<string>());
  const uploadInput = useRef<HTMLInputElement>(null);
  useDisclosureMotion();
  useEffect(() => {
    // Touch screens never hover the navigation, so warm the main working pages once idle.
    const warm = () => (["create", "editor", "templates"] as const).forEach(prefetchPage);
    if ("requestIdleCallback" in window) {
      const handle = requestIdleCallback(warm, { timeout: 4000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(warm, 2000);
    return () => clearTimeout(timer);
  }, []);
  const previewOrigin = useRef<HTMLElement | null>(null);
  const openPreview = (template: Template, source?: HTMLElement) => {
    const cover =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.closest(".template-cover, .gallery-cover")
        : null;
    previewOrigin.current =
      source ||
      cover?.querySelector<HTMLElement>(
        ":scope > .slide, :scope > .template-real-preview, :scope > .template-preview-placeholder",
      ) ||
      null;
    setPreview(template);
  };
  useEffect(() => {
    const change = () => {
      const next = readRoute();
      if (dirty && next !== route) {
        history.replaceState(null, "", "#" + route);
        setPending(next);
        return;
      }
      setRoute(next);
      setError("");
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
    const controller = new AbortController();
    setTemplatesLoading(true);
    setBootstrapErrors({});
    const fail = (section: string, e: Error) => {
      if (!controller.signal.aborted) setBootstrapErrors(previous => ({ ...previous, [section]: e.message }));
    };
    void api.templates(controller.signal).then(t => {
      if (controller.signal.aborted) return;
      setTemplates(t);
      const draft = readAccount<{templateId?: string}>(user.id, "wizard-draft");
      setSelected(previous => previous || t.find(item => item.id === draft?.templateId) || t[0] || null);
    }).catch(e => fail("Шаблоны", e)).finally(() => {
      if (!controller.signal.aborted) setTemplatesLoading(false);
    });
    void api.health().then(h => { if (!controller.signal.aborted) setHealth(h); }).catch(e => fail("Состояние AI", e));
    void api.favorites().then(f => { if (!controller.signal.aborted) setFavorites(f); }).catch(e => fail("Избранное", e));
    const id = readAccount<string>(user.id, "active-project");
    if (id) void api.project(id, controller.signal).then(p => {
      if (!controller.signal.aborted) { setProject(p); writeAccount(user.id, "active-project", p.id); localStorage.removeItem("deckly-active-project"); }
    }).catch(e => {
      if (controller.signal.aborted) return;
      if (e.status === 404) writeAccount(user.id, "active-project", null);
      else fail("Последняя презентация", e);
    });
    return () => controller.abort();
  }, [user.id, bootstrapRevision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function update(p: Project) {
    setProject(p);
    writeAccount(user.id, "active-project", p.id);
  }
  function open(p: Project) {
    update(p);
    setTemplates((prev) =>
      prev.some((t) => t.id === p.template.id) ? prev : [...prev, p.template],
    );
    location.hash = "editor";
  }
  function start(m: "text" | "description", t?: Template, reset = false) {
    if (reset) {
      if (!archiveWizardDraft(user.id)) return;
      clearPendingGenerationJob(user.id);
    }
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
      previewOrigin.current = null;
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
    preview: openPreview,
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
        onNewPresentation={() => start("description", undefined, true)}
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
                <Icon name="ui-notice" />
                <span>{error}</span>
                <button
                  className="btn ghost sm"
                  onClick={() => setError("")}
                  aria-label="Закрыть сообщение"
                >
                  Скрыть
                </button>
              </div>
            )}
            {Object.keys(bootstrapErrors).length > 0 && <div className="error-banner" role="alert">
              <span>{Object.entries(bootstrapErrors).map(([section, message]) => `${section}: ${message}`).join(" · ")}</span>
              <button className="btn sm" onClick={() => setBootstrapRevision(n => n + 1)}>Повторить загрузку</button>
            </div>}
            {uploading && (
              <div className="demo-notice" role="status">
                <i className="spinner" />
                Читаем структуру PPTX…
              </div>
            )}
            {templatesLoading && !templates.length ? (
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
                    accountId={user.id}
                    template={selected}
                    templates={templates}
                    initialMode={mode}
                    health={health}
                    onSelect={setSelected}
                    onOpen={open}
                    onError={setError}
                    onRestart={() => start("description", undefined, true)}
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
                    accountId={user.id}
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
                    accountId={user.id}
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
          origin={previewOrigin.current}
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
              setError("");
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
