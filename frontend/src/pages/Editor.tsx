import { useEffect, useState } from "react";
import { SlideFields, slideKinds } from "../components/SlideFields";
import { useLivePreview } from "../components/useLivePreview";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { SlidePreview } from "../components/SlidePreview";
import { PresentationViewer } from "../components/PresentationViewer";
import "../styles/editor-polish.css";
import {
  blankSlide,
  variantNames,
  type Project,
  type Slide,
  type Variant,
} from "../types";

// Содержание меняется через React, сохранение и построение слайдов выполняет Python.
export function Editor({
  project,
  onUpdate,
  onError,
  onExport,
  onDirty,
}: {
  project: Project;
  onUpdate: (p: Project) => void;
  onError: (m: string) => void;
  onExport: () => void;
  onDirty: (value: boolean) => void;
}) {
  const [content, setContent] = useState(project.content),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [hasDataErrors, setHasDataErrors] = useState(false);
  const [viewing, setViewing] = useState(false);
  const preview = useLivePreview(project, content, dirty && !hasDataErrors);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const slide = content.slides[index];
  const scene = preview.scenes[index];
  function change(update: Partial<Slide>) {
    setContent({
      ...content,
      slides: content.slides.map((s, i) =>
        i === index ? { ...s, ...update } : s,
      ),
    });
    setDirty(true);
  }
  async function save(variant: Variant = project.variant) {
    if (hasDataErrors) {
      onError("Исправьте данные таблицы или диаграммы перед сохранением.");
      return;
    }
    setBusy(true);
    try {
      const p = await api.update(project.id, content, variant);
      onUpdate(p);
      setContent(p.content);
      setDirty(false);
      setHasDataErrors(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    setBusy(true);
    try {
      const p = await api.undo(project.id);
      onUpdate(p);
      setContent(p.content);
      setIndex(Math.min(index, p.content.slides.length - 1));
      setDirty(false);
      setHasDataErrors(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const source = project.sources[index]?.status;
  return (
    <section className="editor-page" aria-label="Редактор презентации">
      <div className="heading between editor-heading">
        <div className="editor-title-block">
          <div className="editor-title-field">
            <input
              className="project-title"
              disabled={busy}
              aria-label="Название презентации"
              value={content.title}
              maxLength={180}
              onChange={(e) => {
                setContent({ ...content, title: e.target.value });
                setDirty(true);
              }}
            />
            <Icon name="edit" />
          </div>
          <p className="editor-document-meta">
            <span>
              {project.template.name} · {content.slides.length} слайдов
            </span>
            <span
              className={`editor-save-status ${dirty ? "is-dirty" : ""}`}
              role="status"
            >
              <Icon name={dirty ? "edit" : "check"} />
              {busy ? "Сохраняем…" : dirty ? "Есть изменения" : "Сохранено"}
            </span>
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            disabled={busy || dirty}
            onClick={() => (location.hash = "audit")}
          >
            <Icon name="shield" />
            Проверить
          </button>
          <button
            className="btn primary"
            disabled={busy || dirty}
            onClick={onExport}
          >
            <Icon name="download" />
            Завершить
          </button>
        </div>
      </div>
      <div className="editor-toolbar between">
        <div className="row editor-toolbar-controls">
          <button
            className="btn sm"
            disabled={!project.can_undo || busy || dirty}
            onClick={undo}
          >
            <Icon name="undo" />
            Вернуть версию
          </button>
          <fieldset
            className="editor-style-picker"
            disabled={busy || hasDataErrors}
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
            hasDataErrors ||
            !dirty ||
            !content.title.trim() ||
            content.slides.some((s) => !s.title.trim())
          }
          onClick={() => save()}
        >
          <Icon name="check" />
          {busy
            ? "Сохраняем…"
            : dirty
              ? "Сохранить изменения"
              : "Всё сохранено"}
        </button>
      </div>
      <div className="editor-layout">
        <aside className="slide-rail" aria-label="Слайды">
          {content.slides.map((s, i) => (
            <button
              className={`thumbnail ${i === index ? "active" : ""}`}
              disabled={busy || hasDataErrors}
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Слайд ${i + 1}: ${s.title}`}
              aria-current={i === index ? "true" : undefined}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {preview.scenes[i] ? (
                <SlidePreview scene={preview.scenes[i]} />
              ) : (
                <div className="new-thumb">Новый слайд</div>
              )}
            </button>
          ))}
          <button
            className="btn sm"
            disabled={busy || hasDataErrors || content.slides.length >= 30}
            onClick={() => {
              setContent({
                ...content,
                slides: [...content.slides, blankSlide()],
              });
              setIndex(content.slides.length);
              setDirty(true);
            }}
          >
            <Icon name="plus" />
            Слайд
          </button>
        </aside>
        <section className="canvas-workspace">
          <div className="canvas-top">
            <span className="label">Слайд {index + 1}</span>
            <span className="badge">{slideKinds[slide.kind]}</span>
            <button
              className="btn sm editor-preview-button"
              onClick={() => setViewing(true)}
              disabled={!scene}
            >
              <Icon name="play" />
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
          <section className="source-card">
            <div className="between">
              <h3>
                <Icon name="link" />
                Опора на источник
              </h3>
              <span
                className={`badge ${source === "matched" ? "green" : "coral"}`}
              >
                {source === "matched"
                  ? "Цитата найдена"
                  : source === "not_found"
                    ? "Цитата не найдена"
                    : "Без цитаты"}
              </span>
            </div>
            <blockquote>
              {slide.source_quote ||
                "Добавьте точную цитату из исходного материала в поле справа."}
            </blockquote>
            <p className="tiny muted">
              Проверяется совпадение текста. Смысловую связь тезиса с цитатой
              необходимо проверить отдельно.
            </p>
            <details>
              <summary>Исходный материал</summary>
              <pre>{project.source_text || "Материал не добавлен."}</pre>
            </details>
          </section>
        </section>
        <fieldset className="inspector panel" disabled={busy}>
          <span className="label">Содержание слайда</span>
          <SlideFields
            sectioned
            key={`${index}-${project.updated_at}`}
            slide={slide}
            onChange={change}
            onValidity={(valid) => {
              setHasDataErrors(!valid);
              setDirty(true);
            }}
          />
          <button
            className="btn sm"
            disabled={content.slides.length === 1 || hasDataErrors}
            onClick={() => {
              setContent({
                ...content,
                slides: content.slides.filter((_, i) => i !== index),
              });
              setIndex(Math.max(0, index - 1));
              setDirty(true);
            }}
          >
            <Icon name="trash" />
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
