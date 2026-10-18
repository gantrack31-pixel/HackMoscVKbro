import { gsap, useGSAP, motion } from "../motion/animation";
import { useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { animateSharedCover } from "../motion/sharedCover";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  closeDisabled = false,
  origin,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  closeDisabled?: boolean;
  origin?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [closing, setClosing] = useState(false);
  const closingLock = useRef(false);
  const sharedCleanup = useRef<(() => void) | null>(null);
  const activeTween = useRef<gsap.core.Tween | null>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const startedOnBackdrop = useRef(false);
  const { contextSafe } = useGSAP(
    () => {
      closingLock.current = false;
      const dialog = ref.current!;
      const previousFocus =
        origin?.closest<HTMLElement>("button") ||
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      const previousOverflow = document.body.style.overflow;
      const originalVisibility = origin?.style.visibility || "";
      const preference = matchMedia("(prefers-reduced-motion: reduce)");
      dialog.showModal();
      document.body.style.overflow = "hidden";
      if (!preference.matches) {
        sharedCleanup.current = animateSharedCover(dialog, origin);
        if (sharedCleanup.current && origin) {
          origin.style.visibility = "hidden";
          activeTween.current = gsap.fromTo(
            dialog.querySelectorAll(".modal-heading, .template-details"),
            { opacity: 0, y: 6 },
            {
              opacity: 1,
              y: 0,
              delay: 0.12,
              duration: 0.24,
              clearProps: "opacity,transform",
            },
          );
        } else {
          activeTween.current = gsap.fromTo(
            dialog,
            { opacity: 0, y: 10, scale: 0.99 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.32,
              ease: motion.ease,
              clearProps: "transform,opacity",
            },
          );
        }
      }
      const reduce = () => {
        if (!preference.matches) return;
        sharedCleanup.current?.();
        sharedCleanup.current = null;
        if (closingLock.current) {
          activeTween.current?.kill();
          closeCallback.current();
        } else activeTween.current?.progress(1);
      };
      preference.addEventListener("change", reduce);
      return () => {
        closingLock.current = true;
        preference.removeEventListener("change", reduce);
        sharedCleanup.current?.();
        sharedCleanup.current = null;
        dialog.close();
        document.body.style.overflow = previousOverflow;
        if (origin) origin.style.visibility = originalVisibility;
        if (previousFocus?.isConnected) previousFocus.focus();
      };
    },
    { scope: ref },
  );
  const dismiss = contextSafe(() => {
    if (closeDisabled || closingLock.current) return;
    closingLock.current = true;
    setClosing(true);
    const currentBounds = ref.current
      ?.querySelector<HTMLElement>("[data-shared-cover]")
      ?.getBoundingClientRect();
    sharedCleanup.current?.();
    sharedCleanup.current = null;
    activeTween.current?.progress(1);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    sharedCleanup.current = animateSharedCover(
      ref.current!,
      origin,
      true,
      onClose,
      currentBounds,
    );
    if (!sharedCleanup.current)
      activeTween.current = gsap.to(ref.current, {
        opacity: 0,
        y: 6,
        duration: motion.fast,
        ease: "power2.in",
        overwrite: true,
        onComplete: onClose,
      });
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
