import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      style={{ width: wide ? "min(1000px,calc(100% - 32px))" : undefined }}
    >
      <div className="between modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button
          className="btn ghost icon-only"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
