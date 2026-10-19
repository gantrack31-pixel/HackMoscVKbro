import { useSlideMotion } from "../motion/animation";
import { useEffect, useState } from "react";
import { SlideFields, slideKinds } from "../components/SlideFields";
import { useLivePreview } from "../components/useLivePreview";
import { api } from "../api";
import { readAccount, writeAccount } from "../state/accountStorage";
import { backupDraftAndReadLatest, isVersionConflict } from "../state/draftRecovery";
import type { DeckContent } from "../types";
import { GenerationPassport } from "../components/GenerationPassport";
import { PresentationAssistant } from "../components/PresentationAssistant";
import { HistoryControls } from "../components/HistoryControls";
import { Icon } from "../components/Icon";
import { SlidePreview } from "../components/SlidePreview";
import { PresentationViewer } from "../components/PresentationViewer";
import { EditorSlideRail } from "../components/EditorSlideRail";
import { SlideSourceCard } from "../components/SlideSourceCard";
import {
  blankSlide,
  variantNames,
  type Project,
  type Slide,
  type Variant,
  type Health,
} from "../types";

// Содержание меняется через React, сохранение и построение слайдов выполняет Python.
export function Editor({
  accountId,
  project,
  onUpdate,
  onError,
  onExport,
  onDirty,
  imageGenerationAvailable = false,
  health = null,
}: {
  accountId: string;
  project: Project;
  onUpdate: (p: Project) => void;
  onError: (m: string) => void;
  onExport: () => void;
  onDirty: (value: boolean) => void;
  imageGenerationAvailable?: boolean;
  health?: Health | null;
}) {
  const [recovered] = useState(() => readAccount<{ content: DeckContent; baseVersion: string }>(accountId, `editor-draft:${project.id}`));
  const [baseVersion, setBaseVersion] = useState(recovered?.baseVersion || project.updated_at);
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [content, setContent] = useState(recovered?.content || project.content),
    [index, setIndex] = useState(0),
    [actionBusy, setBusy] = useState(false),
    [dirty, setDirty] = useState(Boolean(recovered));
  const [imageBusy, setImageBusy] = useState(false);
  const busy = actionBusy || imageBusy;
  const stale = conflict || (dirty && baseVersion !== project.updated_at);
  const [hasDataErrors, setHasDataErrors] = useState(false);
  const [viewing, setViewing] = useState(false);
  const motionScope = useSlideMotion(index, ".slide-canvas > .deck-slide");
  const preview = useLivePreview(project, content, dirty && !hasDataErrors);
  useEffect(() => {
    setStorageError(!writeAccount(accountId, `editor-draft:${project.id}`, dirty ? { content, baseVersion } : null));
  }, [accountId, project.id, content, dirty, baseVersion]);

  useEffect(() => {
    onDirty(dirty || busy);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, busy]);
  const slide = content.slides[index];
  const scene = preview.scenes[index];
  function change(update: Partial<Slide>) {
    setContent((current) => ({
      ...current,
      slides: current.slides.map((s, i) =>
        i === index ? { ...s, ...update } : s,
      ),
    }));
    setDirty(true);
  }
  async function save(variant: Variant = project.variant) {
    if (stale) return;
    if (hasDataErrors) {
      onError("Исправьте данные таблицы или диаграммы перед сохранением.");
      return;
    }
    setBusy(true);
    try {
      const p = await api.update(project.id, content, variant, baseVersion);
      onUpdate(p);
      setBaseVersion(p.updated_at);
      setContent(p.content);
      setDirty(false);
      setConflict(false);
      setHasDataErrors(false);
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
      const p = await api[direction](project.id, project.updated_at);
      onUpdate(p);
      setBaseVersion(p.updated_at);
      setContent(p.content);
      setIndex(Math.min(index, p.content.slides.length - 1));
      setDirty(false);
      setHasDataErrors(false);
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recoverLatest() {
    setBusy(true);
    try {
      const latest = await backupDraftAndReadLatest(project, content, baseVersion, "editor", index);
      onUpdate(latest);
      setContent(latest.content);
      setBaseVersion(latest.updated_at);
      setIndex(i => Math.min(i, latest.content.slides.length - 1));
      setDirty(false);
      setConflict(false);
      setHasDataErrors(false);
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section
      ref={motionScope}
      className="editor-page motion-surface"
      aria-label="Редактор презентации"
    >
      {storageError && <p className="error-banner" role="alert">Не удалось сохранить черновик в браузере. Сохраните презентацию перед закрытием вкладки.</p>}
      {stale && <div className="error-banner wrap" role="alert"><p>Презентация изменилась в другой вкладке. Сохраните копию вашего черновика и продолжите с актуальной версией.</p><button className="btn sm" style={{whiteSpace:"normal",maxWidth:"100%"}} disabled={busy} onClick={recoverLatest}>Скачать черновик и открыть актуальную версию</button></div>}
      <div className="editor-document-header">
        <div className="heading between editor-heading">
          <div className="editor-title-block">
            <span className="editor-eyebrow">Редактор презентации</span>
            <div className="editor-title-field">
              <input
                className="project-title"
                disabled={busy}
                aria-label="Название презентации"
                title={content.title}
                value={content.title}
                maxLength={180}
                onChange={(e) => {
                  setContent({ ...content, title: e.target.value });
                  setDirty(true);
                }}
              />
              <Icon name="editor-title" />
            </div>
            <p className="editor-document-meta">
              <span>
                {project.template.name} · {content.slides.length} слайдов
              </span>
              <span
                className={`editor-save-status ${dirty ? "is-dirty" : ""}`}
                role="status"
                data-save-state={busy ? "saving" : dirty ? "dirty" : "saved"}
              >
                <span
                  className="save-state-icon"
                  key={busy ? "saving" : dirty ? "dirty" : "saved"}
                  aria-hidden="true"
                >
                  {busy ? (
                    <i className="spinner" />
                  ) : (
                    <Icon name={dirty ? "editor-dirty" : "editor-saved"} />
                  )}
                </span>
                {busy ? "Сохраняем…" : dirty ? "Есть изменения" : "Сохранено"}
              </span>
            </p>
          </div>
          <div className="row presentation-actions">
            <button
              className="btn"
              disabled={busy || dirty || stale}
              onClick={() => (location.hash = "audit")}
            >
              <Icon name="editor-audit" />
              Проверить
            </button>
            <button
              className="btn primary"
              disabled={busy || dirty || stale}
              onClick={onExport}
            >
              <Icon name="editor-finish" />
              Завершить
            </button>
          </div>
        </div>
        <div className="editor-toolbar between">
          <div className="row editor-toolbar-controls">
            <HistoryControls
              project={project}
              disabled={busy || dirty || stale}
              onMove={moveHistory}
            />
            <fieldset
              className="editor-style-picker"
              disabled={busy || hasDataErrors || stale}
            >
              <legend>Оформление</legend>
              <div className="editor-style-options">
                {(["a", "b", "c"] as const).map((v) => (
                  <label key={v} className="editor-style-option">
                    <input
                      type="radio"
                      name="editor-variant"
                      value={v}
                      checked={project.variant === v}
                      onChange={() => save(v)}
                    />
                    <span>{variantNames[v]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <button
            className="btn primary sm editor-save-button"
            disabled={
              busy ||
              stale ||
              hasDataErrors ||
              !dirty ||
              !content.title.trim() ||
              content.slides.some((s) => !s.title.trim())
            }
            onClick={() => save()}
          >
            <Icon name="editor-save" />
            {busy
              ? "Сохраняем…"
              : dirty
                ? "Сохранить изменения"
                : "Всё сохранено"}
          </button>
        </div>
      </div>
      <GenerationPassport project={project} />
      <PresentationAssistant
          accountId={accountId}
        project={project}
        content={content}
        index={index}
        health={health}
        disabled={hasDataErrors || stale}
        busy={busy}
        onBusy={setBusy}
        onResult={(result) => {
          if (result.project) {
            onUpdate(result.project);
                setBaseVersion(result.project.updated_at);
            setContent(result.project.content);
            setDirty(false);
            setHasDataErrors(false);
          }
        }}
      />
      <div className="editor-layout">
        <EditorSlideRail
          slides={content.slides}
          scenes={preview.scenes}
          index={index}
          busy={busy}
          hasDataErrors={hasDataErrors}
          onSelect={setIndex}
          onAddSlide={() => {
            setContent({
              ...content,
              slides: [...content.slides, blankSlide()],
            });
            setIndex(content.slides.length);
            setDirty(true);
          }}
        />
        <section className="canvas-workspace">
          <div className="canvas-top">
            <div className="canvas-slide-context">
              <span className="canvas-slide-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="label">
                  Слайд {index + 1} из {content.slides.length}
                </span>
                <span className="canvas-slide-kind">
                  {slideKinds[slide.kind]}
                </span>
              </div>
            </div>
            <button
              className="btn sm editor-preview-button"
              onClick={() => setViewing(true)}
              disabled={!scene}
            >
              <Icon name="editor-preview" />
              Смотреть
            </button>
          </div>
          <div className="slide-canvas" key={index}>
            {scene ? (
              <SlidePreview scene={scene} />
            ) : (
              <div className="empty">Готовим новый слайд…</div>
            )}
          </div>
          {dirty && (
            <p className="overflow-warning">
              {preview.error ||
                (hasDataErrors
                  ? "Исправьте данные для обновления макета."
                  : preview.pending
                    ? "Обновляем предпросмотр…"
                    : "Предпросмотр обновлён. Сохраните изменения, чтобы продолжить.")}
            </p>
          )}
          <SlideSourceCard project={project} slide={slide} index={index} />
        </section>
        <fieldset className="inspector panel" disabled={actionBusy}>
          <div className="inspector-heading">
            <div>
              <h2>Содержание</h2>
              <span>Текст и детали слайда</span>
            </div>
            <span className="inspector-slide-number">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <SlideFields
            onImageBusy={setImageBusy}
            sectioned
            imageGenerationAvailable={imageGenerationAvailable}
            templateAssets={project.template.metadata.assets}
            key={`${index}-${project.updated_at}`}
            slide={slide}
            onChange={change}
            onValidity={(valid) => {
              setHasDataErrors(!valid);
              setDirty(true);
            }}
          />
          <button
            className="btn sm editor-delete-slide"
            disabled={busy || content.slides.length === 1 || hasDataErrors}
            onClick={() => {
              setContent({
                ...content,
                slides: content.slides.filter((_, i) => i !== index),
              });
              setIndex(Math.max(0, index - 1));
              setDirty(true);
            }}
          >
            <Icon name="editor-delete" />
            Удалить слайд
          </button>
        </fieldset>
      </div>
      {viewing && (
        <PresentationViewer
          scenes={preview.scenes}
          title={content.title}
          initialIndex={index}
          onClose={() => setViewing(false)}
        />
      )}
    </section>
  );
}
