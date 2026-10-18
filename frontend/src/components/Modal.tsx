import { gsap, useGSAP, motion } from "../motion/animation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
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
  const closingLock = useRef(false);
  const { contextSafe } = useGSAP(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      gsap.fromTo(ref.current, { opacity: 0, y: 14, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: motion.reveal, ease: motion.ease, clearProps: "transform,opacity" });
  }, { scope: ref });
  const startedOnBackdrop = useRef(false);
  useEffect(() => {
    closingLock.current = false;
    const dialog = ref.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      closingLock.current = true;
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const dismiss = contextSafe(() => {
    if (closeDisabled || closingLock.current) return;
    closingLock.current = true;
    setClosing(true);
    gsap.to(ref.current, { opacity: 0, y: 6, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : motion.fast,
      ease: "power2.in", overwrite: true, onComplete: onClose });
  });
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
      className={`modern-dialog motion-dialog${wide ? " modern-dialog-wide" : ""}${closing ? " is-closing" : ""} ${className}`}
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
