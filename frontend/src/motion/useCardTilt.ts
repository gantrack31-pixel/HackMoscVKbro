import type { DependencyList, RefObject } from "react";
import { gsap, useGSAP } from "./animation";

/** Tilt the cover surface, leaving carousel placement and scroll transforms with their owners. */
export function useCardTilt(
  scope: RefObject<HTMLElement | null>,
  selector?: string,
  dependencies: DependencyList = [],
) {
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const element = selector
            ? scope.current?.querySelector<HTMLElement>(selector)
            : scope.current;
          if (!element) return;
          const glare = element.querySelector<HTMLElement>(".template-glare");
          gsap.set(element, { transformPerspective: 1000 });
          const settings = { duration: 0.32, ease: "power3.out" };
          const rotateX = gsap.quickTo(element, "rotationX", settings);
          const rotateY = gsap.quickTo(element, "rotationY", settings);
          const lift = gsap.quickTo(element, "y", settings);
          const lightX = glare
            ? gsap.quickTo(glare, "xPercent", settings)
            : null;
          const lightY = glare
            ? gsap.quickTo(glare, "yPercent", settings)
            : null;
          const lightAlpha = glare
            ? gsap.quickTo(glare, "opacity", settings)
            : null;
          let frame = 0;
          let x = 0,
            y = 0;
          const draw = () => {
            frame = 0;
            const bounds = element.getBoundingClientRect();
            const px = gsap.utils.clamp(
              -0.5,
              0.5,
              (x - bounds.left) / bounds.width - 0.5,
            );
            const py = gsap.utils.clamp(
              -0.5,
              0.5,
              (y - bounds.top) / bounds.height - 0.5,
            );
            rotateX(-py * 6);
            rotateY(px * 6);
            lift(-3);
            lightX?.(px * 35);
            lightY?.(py * 25);
            lightAlpha?.(0.32);
          };
          const move = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            x = event.clientX;
            y = event.clientY;
            if (!frame) frame = requestAnimationFrame(draw);
          };
          const leave = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            rotateX(0);
            rotateY(0);
            lift(0);
            lightAlpha?.(0);
          };
          element.addEventListener("pointerenter", move);
          element.addEventListener("pointermove", move, { passive: true });
          element.addEventListener("pointerleave", leave);
          element.addEventListener("pointercancel", leave);
          return () => {
            cancelAnimationFrame(frame);
            element.removeEventListener("pointerenter", move);
            element.removeEventListener("pointermove", move);
            element.removeEventListener("pointerleave", leave);
            element.removeEventListener("pointercancel", leave);
          };
        },
      );
      return () => media.revert();
    },
    { scope, dependencies: [...dependencies], revertOnUpdate: true },
  );
}
