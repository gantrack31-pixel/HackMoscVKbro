import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { readAccount, writeAccount, writeAccountDeferred } from "../state/accountStorage";
import { backupDraftAndReadLatest, isVersionConflict } from "../state/draftRecovery";
import { Icon } from "../components/Icon";
import { AuditCanvas } from "../components/AuditCanvas";
import { PresentationViewer } from "../components/PresentationViewer";
import { SlideFields } from "../components/SlideFields";
import { PresentationAssistant } from "../components/PresentationAssistant";
import { HistoryControls } from "../components/HistoryControls";
import { useLivePreview } from "../components/useLivePreview";
import type { Health, Issue, Project, Slide } from "../types";

export function Audit({
  accountId,
  project,
  health,
  onUpdate,
  onError,
  onDirty,
}: {
  accountId: string;
  project: Project;
  health: Health | null;
  onUpdate: (p: Project) => void;
  onError: (message: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [recovered] = useState(() => readAccount<{draft: Slide; index: number; baseVersion: string; focus?: string}>(accountId, `audit-draft:${project.id}`));
  const [baseVersion, setBaseVersion] = useState(recovered?.baseVersion || project.updated_at);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [index, setIndex] = useState(Math.min(recovered?.index || 0, project.content.slides.length - 1)),
    [focus, setFocus] = useState(recovered?.focus || "");
  const [draft, setDraft] = useState<Slide | null>(recovered?.draft || null);
  const [dirty, setDirty] = useState(Boolean(recovered)),
    [valid, setValid] = useState(true);
  const [actionBusy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [imageBusy, setImageBusy] = useState(false);
  const busy = actionBusy || imageBusy;
  const [conflict, setConflict] = useState(false);
  const stale = conflict || (dirty && baseVersion !== project.updated_at);
  const [loadError, setLoadError] = useState(""),
    [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const key = `audit-draft:${project.id}`;
    const report = (saved: boolean) => { if (!saved) setNotice("Не удалось сохранить черновик в браузере. Сохраните изменения перед закрытием."); };
    if (dirty) writeAccountDeferred(accountId, key, {draft, index, baseVersion, focus}, report);
    else report(writeAccount(accountId, key, null));
  }, [accountId, project.id, draft, dirty, index, baseVersion, focus]);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    onDirty(dirty || busy);
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api
      .audit(project.id, project.variant)
      .then((r) => {
        if (active) {
          setIssues(r.issues);
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
  const displayed = visible.filter((i) => i.severity !== "info");
  const actionable = issues.filter((issue) => issue.severity !== "info");
  const errors = actionable.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warnings = actionable.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const fixable = actionable.filter((issue) => issue.fixable).length;
  const slideIssueCounts = project.content.slides.map(
    (_, slide) => actionable.filter((issue) => issue.slide === slide).length,
  );
  const auditReady = !loading && !loadError;
  const locked = busy || dirty || stale;
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
      const result = await api.fix(project.id, ids, project.variant, project.updated_at);
      setDraft(null);
      setFocus("");
      onUpdate(result);
      setBaseVersion(result.updated_at);
      setNotice("Исправления сохранены. Проверяем результат заново.");
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!valid || !draft?.title.trim() || stale) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api.update(project.id, content, project.variant, baseVersion);
      setDirty(false);
      onDirty(false);
      setDraft(null);
      setFocus("");
      onUpdate(result);
      setBaseVersion(result.updated_at);
      setConflict(false);
      setNotice(
        "Изменения сохранены. Список замечаний обновляется по новым данным.",
      );
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function moveHistory(direction: "undo" | "redo") {
    setBusy(true);
    try {
      const result = await api[direction](project.id, project.updated_at);
      setDraft(null);
      setFocus("");
      setIndex((i) => Math.min(i, result.content.slides.length - 1));
      onUpdate(result);
      setBaseVersion(result.updated_at);
      setNotice(
        direction === "undo" ? "Изменение отменено." : "Изменение повторено.",
      );
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cancelDraft() {
    setDraft(null);
    setFocus("");
    setDirty(false);
    setValid(true);
    setBaseVersion(project.updated_at);
    onDirty(false);
  }
  async function recoverLatest() {
    setBusy(true);
    try {
      const latest = await backupDraftAndReadLatest(project, content, baseVersion, "audit", index);
      onUpdate(latest);
      setBaseVersion(latest.updated_at);
      setIndex(i => Math.min(i, latest.content.slides.length - 1));
      setDraft(null);
      setFocus("");
      setDirty(false);
      setValid(true);
      setConflict(false);
      setNotice("Копия черновика скачана. Открыта актуальная версия.");
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  }
  function draftEditor() {
    if (!draft) return null;
    return <>
      <fieldset disabled={actionBusy}>
        <SlideFields
          onImageBusy={setImageBusy}
          sectioned
          imageGenerationAvailable={health?.image_generation}
          templateAssets={project.template.metadata.assets}
          key={`${focus || "recovered"}-${baseVersion}`}
          slide={draft}
          onChange={patch => { setDraft(prev => prev ? {...prev, ...patch} : prev); setDirty(true); }}
          onValidity={value => { setValid(value); setDirty(true); }}
        />
      </fieldset>
      <div className="issue-editor-actions">
        <button className="btn primary" disabled={!dirty || !valid || busy || stale || !draft.title.trim()} onClick={save}>{busy ? "Сохраняем…" : "Сохранить и проверить"}</button>
        <button className="btn" disabled={busy} onClick={cancelDraft}>Отменить</button>
      </div>
    </>;
  }
  return (
    <section className="audit-page" aria-label="Проверка презентации">
      {stale && <div className="error-banner wrap" role="alert"><p>Презентация изменилась в другой вкладке. Сохраните копию вашего черновика и продолжите с актуальной версией.</p><button className="btn sm" style={{whiteSpace:"normal",maxWidth:"100%"}} disabled={busy} onClick={recoverLatest}>Скачать черновик и открыть актуальную версию</button></div>}
      <div className="heading between audit-heading">
        <div>
          <span className="audit-eyebrow">
            <Icon name="editor-audit" /> Проверка презентации
          </span>
          <h1 title={project.title}>{project.title}</h1>
          <p>Замечания на слайдах и исправления в одном месте.</p>
        </div>
        <div className="row presentation-actions">
          <a className="btn" href="#editor">
            <Icon name="editor-dirty" />В редактор
          </a>
          <a className="btn primary" href="#finish">
            <Icon name="editor-finish" />
            Завершить
          </a>
        </div>
      </div>
      {notice && (
        <p className="save-feedback" role="status">
          {notice}
        </p>
      )}
      <div
        className={`audit-overview ${loading ? "is-loading" : ""}`}
        aria-busy={loading}
      >
        <div className="audit-overview-intro" role="status">
          <span className="audit-overview-icon" aria-hidden="true">
            {loading ? (
              <span className="audit-check-spinner" />
            ) : (
              <Icon name="editor-audit" />
            )}
          </span>
          <div>
            <strong>
              {loading
                ? "Проверяем презентацию"
                : loadError
                  ? "Проверка не завершена"
                  : actionable.length
                    ? "Есть что улучшить"
                    : "Замечаний не найдено"}
            </strong>
            <p>
              {loading
                ? "Ищем замечания в оформлении и содержании."
                : loadError
                  ? "Повторите проверку, чтобы увидеть результат."
                  : actionable.length
                    ? "Выберите слайд и откройте замечание для исправления."
                    : "По доступным правилам. Финальный взгляд всегда за вами."}
            </p>
          </div>
        </div>
        <dl className="audit-overview-counts">
          <div className="audit-count-error">
            <dt>Важные</dt>
            <dd>{auditReady ? errors : "—"}</dd>
          </div>
          <div>
            <dt>Рекомендации</dt>
            <dd>{auditReady ? warnings : "—"}</dd>
          </div>
          <div>
            <dt>Автоисправление</dt>
            <dd>{auditReady ? fixable : "—"}</dd>
          </div>
        </dl>
      </div>
      <PresentationAssistant
          accountId={accountId}
        audit
        reviewIssues={(selected.length ? issues.filter(issue => selected.includes(issue.id)) : issues).slice(0, 30)}
        project={project}
        content={content}
        index={index}
        health={health}
        disabled={!valid || stale}
        busy={busy}
        onBusy={setBusy}
        onResult={(result) => {
          if (result.project) {
            setDraft(null);
            setIndex(i => Math.min(i, result.project!.content.slides.length - 1));
            setFocus("");
            setDirty(false);
            setValid(true);
            onUpdate(result.project);
                setBaseVersion(result.project.updated_at);
          }
        }}
      />
      <HistoryControls
        project={project}
        disabled={busy || dirty || stale}
        onMove={moveHistory}
      />
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
          <button className="btn sm" onClick={() => setRevision((r) => r + 1)}>
            Повторить
          </button>
        </div>
      )}
      <div className="audit-layout">
        <AuditCanvas
          project={project}
          index={index}
          scene={scene}
          displayed={displayed}
          slideIssueCounts={slideIssueCounts}
          loading={loading}
          loadError={loadError}
          focus={focus}
          locked={locked}
          busy={busy}
          dirty={dirty}
          previewError={preview.error}
          previewPending={preview.pending}
          onView={() => setViewing(true)}
          onSlideTo={slideTo}
          onInspect={inspect}
        />
        <aside className="audit-checklist panel">
          <div className="between audit-checklist-heading">
            <div>
              <span className="audit-section-label">
                Слайд {String(index + 1).padStart(2, "0")}
              </span>
              <h2>Что улучшить</h2>
            </div>
            <span
              className="audit-issue-count"
              aria-label={
                auditReady
                  ? `Замечаний: ${displayed.length}`
                  : "Результат пока недоступен"
              }
            >
              {loading ? "…" : loadError ? "—" : displayed.length}
            </span>
          </div>
          {loading && (
            <div className="audit-check-state" role="status">
              <span className="audit-check-spinner" aria-hidden="true" />
              <strong>Проверяем слайды…</strong>
              <p>Замечания появятся здесь.</p>
              <div className="audit-loading-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          {!loading && loadError && (
            <div className="audit-check-state">
              <Icon name="editor-audit" />
              <strong>Результат пока недоступен</strong>
              <p>Повторите проверку с помощью кнопки выше.</p>
            </div>
          )}
          <div className="audit-items">
            {dirty && draft && (loading || Boolean(loadError) || !displayed.some(issue => issue.id === focus)) && (
              <section className="audit-issue focused" aria-label="Восстановленный черновик">
                <h3>Ваши несохранённые изменения</h3>
                <p>Можно продолжить редактирование, сохранить правки или отменить их.</p>
                <div className="issue-editor">{draftEditor()}</div>
              </section>
            )}
            {!loading &&
              !loadError &&
              displayed.map((issue, n) => (
                <article
                  key={issue.id}
                  id={`issue-${issue.id}`}
                  className={`audit-issue ${focus === issue.id ? "focused" : ""} severity-${issue.severity}`}
                >
                  <div className="audit-issue-meta">
                    <span className={`audit-severity ${issue.severity}`}>
                      {issue.severity === "error"
                        ? "Важно исправить"
                        : "Рекомендация"}
                    </span>
                    {issue.fixable && (
                      <span className="audit-fixable-label">
                        Можно исправить автоматически
                      </span>
                    )}
                  </div>
                  <button
                    className="issue-heading"
                    disabled={busy || (dirty && focus !== issue.id)}
                    onClick={() => inspect(issue)}
                    aria-expanded={focus === issue.id}
                  >
                    <span className="audit-issue-number">{n + 1}</span>
                    <strong>{issue.title}</strong>
                    <span className="tiny muted">
                      {focus === issue.id ? "Открыто" : "Подробнее"}
                    </span>
                  </button>
                  <p>{issue.detail}</p>
                  {issue.source_bindings?.map((ref) => (
                    <blockquote key={`${ref.chunk_id}:${ref.start}`}>
                      {ref.quote}
                      <small>
                        Источник: {ref.chunk_id}, символы {ref.start}–{ref.end}
                      </small>
                    </blockquote>
                  ))}
                  {issue.fixable && (
                    <label className="row small audit-autofix">
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
                      {draftEditor()}
                    </div>
                  )}
                </article>
              ))}
            {!loading && !loadError && !displayed.length && (
              <div className="audit-clear-state">
                <Icon name="editor-audit-clear" />
                <strong>Всё выглядит аккуратно</strong>
                <p>По доступным правилам на этом слайде замечаний нет.</p>
                <span>
                  Слайд {String(index + 1).padStart(2, "0")} из{" "}
                  {project.content.slides.length}
                </span>
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="audit-selection-bar">
              <span>
                Выбрано замечаний: <strong>{selected.length}</strong>
              </span>
              <button
                className="btn primary"
                disabled={locked || loading}
                onClick={() => fix(selected)}
              >
                <Icon name="editor-repair" />
                Исправить выбранное ({selected.length})
              </button>
            </div>
          )}
          <p className="tiny muted audit-version-note">
            <Icon name="info-feature-history" />
            Каждое сохранение создаёт версию. Изменения можно отменить.
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
