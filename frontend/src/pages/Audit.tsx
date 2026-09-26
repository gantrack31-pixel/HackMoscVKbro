import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { AuditSlide } from "../components/AuditSlide";
import { PresentationViewer } from "../components/PresentationViewer";
import { SlideFields } from "../components/SlideFields";
import { useLivePreview } from "../components/useLivePreview";
import type { Health, Issue, Project, Slide } from "../types";
import "../styles/editor-polish.css";

export function Audit({
  project,
  health,
  onUpdate,
  onError,
  onDirty,
}: {
  project: Project;
  health: Health | null;
  onUpdate: (p: Project) => void;
  onError: (message: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [index, setIndex] = useState(0),
    [focus, setFocus] = useState("");
  const [draft, setDraft] = useState<Slide | null>(null);
  const [dirty, setDirty] = useState(false),
    [valid, setValid] = useState(true);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(""),
    [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState(""),
    [context, setContext] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState(false);
  const contextRequested = useRef(false);
  useEffect(() => {
    onDirty(dirty);
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, onDirty]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setContext(false);
    api
      .audit(project.id, project.variant)
      .then(async (r) => {
        const semantic = contextRequested.current
          ? await api.contentAudit(project.id)
          : null;
        if (active) {
          setIssues([...r.issues, ...(semantic?.issues || [])]);
          setContext(!!semantic);
          setSelected([]);
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.updated_at, project.variant, revision]);
  const content = useMemo(
    () =>
      draft
        ? {
            ...project.content,
            slides: project.content.slides.map((s, i) =>
              i === index ? draft : s,
            ),
          }
        : project.content,
    [draft, index, project.content],
  );
  const preview = useLivePreview(project, content, dirty && valid);
  const scene = preview.scenes[index];
  const visible = issues.filter((i) => i.slide === index);
  const locked = busy || dirty;
  function inspect(issue: Issue) {
    if (busy || (dirty && focus !== issue.id)) return;
    setIndex(issue.slide);
    setFocus(issue.id);
    if (!dirty) {
      setDraft(structuredClone(project.content.slides[issue.slide]));
      setValid(true);
    }
    requestAnimationFrame(() =>
      document.getElementById(`issue-${issue.id}`)?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
  }
  function slideTo(i: number) {
    if (!locked) {
      setIndex(i);
      setFocus("");
      setDraft(null);
    }
  }
  async function fix(ids: string[]) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api.fix(project.id, ids, project.variant);
      setDraft(null);
      setFocus("");
      onUpdate(result);
      setNotice("Исправления сохранены. Проверяем результат заново.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!valid || !draft?.title.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api.update(project.id, content, project.variant);
      setDirty(false);
      onDirty(false);
      setDraft(null);
      setFocus("");
      onUpdate(result);
      setNotice(
        "Изменения сохранены. Список замечаний обновляется по новым данным.",
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function semantics() {
    setBusy(true);
    try {
      const result = await api.contentAudit(project.id);
      contextRequested.current = true;
      setIssues((prev) => [
        ...prev.filter((i) => i.deterministic),
        ...result.issues,
      ]);
      setContext(true);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="audit-page" aria-label="Проверка презентации">
      <div className="heading between">
        <div>
          <h1>Уверенность в каждом слайде</h1>
          <p>Нажмите на замечание и исправьте его здесь же.</p>
        </div>
        <div className="row">
          <a className="btn" href="#editor">
            <Icon name="back" />В редактор
          </a>
          <a className="btn primary" href="#finish">
            Завершить
            <Icon name="arrow" />
          </a>
        </div>
      </div>
      <div className="audit-summary">
        <div>
          <span className="audit-score">
            <Icon name="shield" />
          </span>
          <div>
            <h2>
              {loading
                ? "Проверяем…"
                : loadError
                  ? "Проверка недоступна"
                  : `Замечаний: ${issues.length}`}
            </h2>
            <p>Геометрия, контраст и связь с источниками</p>
          </div>
        </div>
        <button
          className="btn"
          disabled={
            locked ||
            loading ||
            health?.mode !== "live" ||
            !health.context_audit
          }
          onClick={semantics}
        >
          <Icon name="spark" />
          {busy
            ? "Обрабатываем…"
            : context
              ? "Повторить смысловую проверку"
              : "Проверить смысл с LLM"}
        </button>
      </div>
      {notice && (
        <p className="save-feedback" role="status">
          {notice}
        </p>
      )}
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
          <button className="btn sm" onClick={() => setRevision((r) => r + 1)}>
            Повторить
          </button>
        </div>
      )}
      <div className="audit-layout">
        <section className="audit-canvas panel">
          <div className="between">
            <span className="label">
              Слайд {index + 1} / {project.content.slides.length}
            </span>
            <div className="row">
              <button
                className="btn sm"
                onClick={() => setViewing(true)}
                disabled={!scene}
              >
                <Icon name="play" />
                Смотреть
              </button>
              <button
                className="btn sm"
                aria-label="Предыдущий слайд"
                disabled={locked || index === 0}
                onClick={() => slideTo(index - 1)}
              >
                ←
              </button>
              <button
                className="btn sm"
                aria-label="Следующий слайд"
                disabled={locked || index === project.content.slides.length - 1}
                onClick={() => slideTo(index + 1)}
              >
                →
              </button>
            </div>
          </div>
          {scene && (
            <AuditSlide
              scene={scene}
              issues={loading || loadError ? [] : visible}
              focus={focus}
              locked={locked}
              busy={busy}
              onInspect={inspect}
            />
          )}
          <p className="tiny muted" role="status">
            {dirty
              ? preview.error ||
                (preview.pending
                  ? "Обновляем предпросмотр…"
                  : "Предпросмотр изменений. Нажмите «Сохранить и проверить».")
              : visible.length
                ? "Выберите метку или замечание. Рамка покажет связанный блок слайда."
                : "Здесь появятся отметки, если проверка найдёт замечания."}
          </p>
          <div className="slide-select-strip">
            {project.content.slides.map((_, i) => (
              <button
                key={i}
                disabled={locked}
                className={`btn sm ${i === index ? "primary" : ""}`}
                aria-label={`Перейти к слайду ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => slideTo(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <details className="audit-source">
            <summary>Исходный материал</summary>
            <pre>{project.source_text || "Материал не добавлен."}</pre>
          </details>
        </section>
        <aside className="audit-checklist panel">
          <div className="between">
            <h2>Что улучшить</h2>
            <span className="badge">{visible.length}</span>
          </div>
          <div className="audit-items">
            {!loadError &&
              visible.map((issue, n) => (
                <article
                  key={issue.id}
                  id={`issue-${issue.id}`}
                  className={`audit-issue ${focus === issue.id ? "focused" : ""} ${issue.severity === "info" ? "info" : ""}`}
                >
                  <button
                    className="issue-heading"
                    disabled={busy || (dirty && focus !== issue.id)}
                    onClick={() => inspect(issue)}
                    aria-expanded={focus === issue.id}
                  >
                    <span className="badge coral">{n + 1}</span>
                    <strong>{issue.title}</strong>
                    <Icon name="down" />
                  </button>
                  <p>{issue.detail}</p>
                  {issue.fixable && (
                    <label className="row small">
                      <input
                        type="checkbox"
                        disabled={locked || loading}
                        checked={selected.includes(issue.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, issue.id]
                              : prev.filter((id) => id !== issue.id),
                          )
                        }
                      />
                      Исправить автоматически
                    </label>
                  )}
                  {focus !== issue.id && (
                    <button
                      className="btn sm"
                      disabled={locked || loading}
                      onClick={() => inspect(issue)}
                    >
                      Открыть и исправить
                    </button>
                  )}
                  {focus === issue.id && draft && (
                    <div className="issue-editor">
                      {issue.fixable && (
                        <button
                          className="btn"
                          disabled={locked || loading}
                          onClick={() => fix([issue.id])}
                        >
                          Применить исправление
                        </button>
                      )}
                      <fieldset disabled={busy}>
                        <SlideFields
                          sectioned
                          key={`${issue.id}-${project.updated_at}`}
                          slide={draft}
                          onChange={(patch) => {
                            setDraft((prev) =>
                              prev ? { ...prev, ...patch } : prev,
                            );
                            setDirty(true);
                          }}
                          onValidity={(v) => {
                            setValid(v);
                            setDirty(true);
                          }}
                        />
                      </fieldset>
                      <div className="issue-editor-actions">
                        <button
                          className="btn primary"
                          disabled={
                            !dirty || !valid || busy || !draft.title.trim()
                          }
                          onClick={save}
                        >
                          {busy ? "Сохраняем…" : "Сохранить и проверить"}
                        </button>
                        <button
                          className="btn"
                          disabled={busy}
                          onClick={() => {
                            setDraft(null);
                            setFocus("");
                            setDirty(false);
                            setValid(true);
                            onDirty(false);
                          }}
                        >
                          Отменить
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            {!loading && !loadError && !visible.length && (
              <div className="empty">
                <Icon name="check" />
                <p>По доступным правилам замечаний нет.</p>
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <button
              className="btn primary"
              disabled={locked || loading}
              onClick={() => fix(selected)}
            >
              Исправить выбранное ({selected.length})
            </button>
          )}
          <p className="tiny muted">
            Каждое сохранение создаёт версию. Её можно отменить в редакторе.
          </p>
        </aside>
      </div>
      {viewing && (
        <PresentationViewer
          scenes={preview.scenes}
          title={project.title}
          initialIndex={index}
          onClose={() => setViewing(false)}
        />
      )}
    </section>
  );
}
