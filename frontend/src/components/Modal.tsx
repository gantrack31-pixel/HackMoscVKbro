import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import "../styles/modal-modern.css";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedOnBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  function dismiss() {
    if (closeDisabled || closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(
      () => {
        closeTimer.current = null;
        onClose();
        setClosing(false);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160,
    );
  }
  function isOutside(clientX: number, clientY: number) {
    const bounds = ref.current?.getBoundingClientRect();
    return Boolean(
      bounds &&
        (clientX < bounds.left ||
          clientX > bounds.right ||
          clientY < bounds.top ||
          clientY > bounds.bottom),
    );
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={`modern-dialog${wide ? " modern-dialog-wide" : ""}${closing ? " is-closing" : ""} ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onPointerDown={(event) => {
        startedOnBackdrop.current = isOutside(event.clientX, event.clientY);
      }}
      onClick={(event) => {
        if (
          startedOnBackdrop.current &&
          isOutside(event.clientX, event.clientY)
        )
          dismiss();
        startedOnBackdrop.current = false;
      }}
    >
      <div className="between modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button
          className="btn ghost icon-only"
          onClick={dismiss}
          disabled={closeDisabled}
          aria-label="Закрыть"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
