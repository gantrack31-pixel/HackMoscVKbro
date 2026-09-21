import { useState } from "react";
import { api } from "../api";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import type { Project } from "../types";
export function ExportPanel({
  project,
  onClose,
  embedded = false,
}: {
  project: Project;
  onClose: () => void;
  embedded?: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [done, setDone] = useState(""),
    [error, setError] = useState("");
  async function download(format: string) {
    setBusy(format);
    setError("");
    setDone("");
    try {
      const response = await fetch(
        api.exportUrl(project.id, format, project.variant),
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({
          detail: "Не удалось подготовить файл. Повторите попытку.",
        }));
        throw new Error(data.detail);
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 90) || "Deckly"}-${project.variant}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDone(format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const body = (
    <>
      <p className="small muted">
        {project.title} · {project.content.slides.length} слайдов · вариант{" "}
        {project.variant.toUpperCase()}
      </p>
      <div className="export-options">
        {[
          [
            "pptx",
            "PowerPoint",
            "Текст, таблицы и диаграммы можно редактировать",
          ],
          ["pdf", "PDF", "Для просмотра, отправки и печати"],
          ["html", "HTML", "Автономная презентация в браузере"],
        ].map(([format, title, detail]) => (
          <button
            className={`export-option ${done === format ? "downloaded" : ""}`}
            key={format}
            disabled={Boolean(busy)}
            onClick={() => download(format)}
          >
            <span className={`file-format format-${format}`}>
              {format.toUpperCase()}
            </span>
            <span>
              <strong>{title}</strong>
              <small>
                {busy === format
                  ? "Подготавливаем файл…"
                  : done === format
                    ? "Файл передан браузеру для скачивания"
                    : detail}
              </small>
            </span>
            {busy === format ? (
              <i className="spinner" />
            ) : (
              <Icon name={done === format ? "check" : "download"} />
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="export-hint">
        <Icon name="file" />
        <p>
          PPTX сохраняет ресурсы исходного мастера. PDF и HTML используют схему
          размещения без графики мастеров.
        </p>
      </div>
    </>
  );
  return embedded ? (
    <div className="download-options">{body}</div>
  ) : (
    <Modal title="Ваша история готова к выходу" onClose={onClose}>
      {body}
    </Modal>
  );
}
