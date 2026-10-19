import { Icon } from "./Icon";
import type { Project } from "../types";

export function HistoryControls({
  project,
  disabled,
  onMove,
}: {
  project: Project;
  disabled: boolean;
  onMove: (direction: "undo" | "redo") => void;
}) {
  return (
    <div
      className="history-controls"
      role="group"
      aria-label="История изменений"
    >
      <button
        className="btn sm"
        aria-label="Отменить изменение"
        title="Отменить изменение"
        disabled={disabled || !project.can_undo}
        onClick={() => onMove("undo")}
      >
        <Icon name="editor-undo" />
        <span>Отменить изменение</span>
      </button>
      <button
        className="btn sm"
        aria-label="Повторить изменение"
        title="Повторить изменение"
        disabled={disabled || !project.can_redo}
        onClick={() => onMove("redo")}
      >
        <Icon name="editor-redo" />
        <span>Повторить изменение</span>
      </button>
    </div>
  );
}
