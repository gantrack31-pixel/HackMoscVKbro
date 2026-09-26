import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Scene } from "../types";
import { Icon } from "./Icon";
import { SlidePreview } from "./SlidePreview";
import "../styles/presentation-viewer.css";

export function PresentationViewer({
  scenes,
  title,
  initialIndex = 0,
  onClose,
}: {
  scenes: Scene[];
  title: string;
  initialIndex?: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, scenes.length - 1)),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const current = Math.min(index, Math.max(0, scenes.length - 1));
  const scene = scenes[current];
  useEffect(() => {
    const element = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    const changed = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => {});
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === dialog.current)
        await document.exitFullscreen();
      else await dialog.current?.requestFullscreen();
      setNotice("");
    } catch {
      setNotice(
        "Полноэкранный режим недоступен. Просмотр открыт на всю область окна.",
      );
    }
  }
  return (
    <dialog
      className="presentation-viewer"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (
          [
            "ArrowRight",
            "PageDown",
            "ArrowLeft",
            "PageUp",
            "Home",
            "End",
          ].includes(event.key)
        ) {
          event.preventDefault();
          if (event.key === "Home") setIndex(0);
          else if (event.key === "End")
            setIndex(Math.max(0, scenes.length - 1));
          else
            setIndex((value) =>
              Math.max(
                0,
                Math.min(
                  scenes.length - 1,
                  value +
                    (["ArrowRight", "PageDown"].includes(event.key) ? 1 : -1),
                ),
              ),
            );
        }
      }}
    >
      <header className="presentation-viewer-header">
        <div>
          <span>Просмотр презентации</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="presentation-viewer-actions">
          {document.fullscreenEnabled && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={
                fullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
              }
            >
              {fullscreen ? (
                <Minimize2 size={20} aria-hidden="true" />
              ) : (
                <Maximize2 size={20} aria-hidden="true" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Закрыть просмотр"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="presentation-viewer-stage">
        {scene ? (
          <div
            className="presentation-viewer-slide"
            key={current}
            style={
              {
                aspectRatio: `${scene.width} / ${scene.height}`,
                "--viewer-ratio": scene.width / scene.height,
              } as CSSProperties
            }
          >
            <SlidePreview
              scene={scene}
              label={`Слайд ${current + 1} из ${scenes.length}`}
            />
          </div>
        ) : (
          <p>Слайды ещё не готовы к просмотру.</p>
        )}
      </div>
      <footer className="presentation-viewer-footer">
        <p className="presentation-viewer-hint">
          ← → для переключения · Esc, чтобы закрыть
        </p>
        <nav aria-label="Слайды презентации">
          <button
            type="button"
            onClick={() => setIndex(current - 1)}
            disabled={!scene || current === 0}
            aria-label="Предыдущий слайд"
          >
            <Icon name="back" />
          </button>
          <span role="status" aria-live="polite">
            {scene ? current + 1 : 0} <span>/ {scenes.length}</span>
          </span>
          <button
            type="button"
            onClick={() => setIndex(current + 1)}
            disabled={!scene || current >= scenes.length - 1}
            aria-label="Следующий слайд"
          >
            <Icon name="arrow" />
          </button>
        </nav>
        {notice && (
          <p className="presentation-viewer-notice" role="status">
            {notice}
          </p>
        )}
      </footer>
    </dialog>
  );
}
