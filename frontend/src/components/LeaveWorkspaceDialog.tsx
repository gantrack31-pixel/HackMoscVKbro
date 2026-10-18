import { Modal } from "./Modal";
import type { Route } from "../types";

export function LeaveWorkspaceDialog({
  pending,
  dirty,
  loggingOut,
  onClose,
  onConfirm,
}: {
  pending: Route | "logout";
  dirty: boolean;
  loggingOut: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Modal
      closeDisabled={loggingOut}
      title={
        pending === "logout"
          ? "Вы уверены, что хотите выйти?"
          : "Изменения ещё не сохранены"
      }
      onClose={onClose}
    >
      <p className="muted">
        {pending === "logout"
          ? dirty
            ? "На этой странице есть несохранённые изменения. При выходе они будут потеряны."
            : "Сохранённые презентации останутся в вашем аккаунте."
          : "Сохраните изменения на текущей странице, чтобы продолжить работу с ними."}
      </p>
      <div className="form-footer">
        <button className="btn" disabled={loggingOut} onClick={onConfirm}>
          {loggingOut
            ? "Выходим…"
            : pending === "logout"
              ? "Выйти из аккаунта"
              : "Уйти без сохранения"}
        </button>
        <button
          className="btn primary"
          disabled={loggingOut}
          autoFocus
          onClick={onClose}
        >
          {pending === "logout" ? "Остаться" : "Остаться на странице"}
        </button>
      </div>
    </Modal>
  );
}
