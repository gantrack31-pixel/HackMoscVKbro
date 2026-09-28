import { Icon } from "./Icon";
import type { Project } from "../types";

export function HistoryControls({project, disabled, onMove}: {
  project: Project; disabled: boolean; onMove: (direction: "undo" | "redo") => void;
}) {
  return <div className="history-controls" role="group" aria-label="История изменений">
    <button className="btn sm" disabled={disabled || !project.can_undo} onClick={() => onMove("undo")}>
      <Icon name="undo" />Отменить изменение
    </button>
    <button className="btn sm" disabled={disabled || !project.can_redo} onClick={() => onMove("redo")}>
      <Icon name="redo" />Повторить изменение
    </button>
  </div>;
}
