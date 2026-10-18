import { gsap } from "./animation";

/** Fly a decorative copy in the dialog's top layer, with both layouts left intact. */
export function animateSharedCover(
  dialog: HTMLDialogElement,
  origin: HTMLElement | null | undefined,
  returning = false,
  complete: () => void = () => {},
  initialBounds?: DOMRect,
): (() => void) | null {
  const artwork = dialog.querySelector<HTMLElement>("[data-preview-cover]");
  if (!origin?.isConnected || !artwork) return null;
  const card = origin.getBoundingClientRect();
  const preview = artwork.getBoundingClientRect();
  if (
    !card.width ||
    !preview.width ||
    card.bottom <= 0 ||
    card.top >= innerHeight ||
    preview.bottom <= 0 ||
    preview.top >= innerHeight
  )
    return null;
  const clone = (returning ? artwork.firstElementChild : origin)?.cloneNode(
    true,
  ) as HTMLElement | undefined;
  if (!clone) return null;
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  clone.dataset.sharedCover = "";
  if (clone instanceof HTMLImageElement) {
    clone.loading = "eager";
    clone.decoding = "sync";
    clone.alt = "";
  }
  Object.assign(clone.style, {
    position: "fixed",
    left: `${preview.left}px`,
    top: `${preview.top}px`,
    width: `${preview.width}px`,
    height: `${preview.height}px`,
    margin: "0",
    zIndex: "20",
    pointerEvents: "none",
    transformOrigin: "0 0",
    visibility: "visible",
  });
  const visibility = artwork.style.visibility;
  artwork.style.visibility = "hidden";
  dialog.appendChild(clone);
  if (returning) dialog.dataset.sharedReturning = "";
  const offset = {
    x: card.left - preview.left,
    y: card.top - preview.top,
    scaleX: card.width / preview.width,
    scaleY: card.height / preview.height,
  };
  const full = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const current = initialBounds
    ? {
        x: initialBounds.left - preview.left,
        y: initialBounds.top - preview.top,
        scaleX: initialBounds.width / preview.width,
        scaleY: initialBounds.height / preview.height,
      }
    : full;
  const remove = () => {
    clone.remove();
    if (returning) delete dialog.dataset.sharedReturning;
    artwork.style.visibility = visibility;
  };
  const tween = gsap.fromTo(clone, returning ? current : offset, {
    ...(returning ? offset : full),
    duration: 0.38,
    ease: "power3.inOut",
    onComplete: () => {
      remove();
      complete();
    },
  });
  return () => {
    tween.kill();
    remove();
  };
}
