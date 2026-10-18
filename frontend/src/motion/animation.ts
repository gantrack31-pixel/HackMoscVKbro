import { useRef, type DependencyList } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);
export { gsap, useGSAP };
export const motion = {
  fast: 0.22,
  reveal: 0.65,
  scene: 1.45,
  ease: "power3.out",
  settle: "power2.inOut",
} as const;

/** Animate only explicitly owned surfaces; React and navigation keep their lifecycle. */
export function useSurfaceMotion(
  dependencies: DependencyList,
  selector: string,
  opacityOnly = false,
) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const elements = scope.current?.querySelectorAll(selector);
        if (elements?.length)
          gsap.fromTo(
            elements,
            { opacity: 0.35, ...(opacityOnly ? {} : { y: 12 }) },
            {
              opacity: 1,
              ...(opacityOnly ? {} : { y: 0 }),
              duration: motion.reveal,
              ease: motion.ease,
              stagger: 0.045,
              clearProps: opacityOnly ? "opacity" : "opacity,transform",
            },
          );
      });
      return () => media.revert();
    },
    { scope, dependencies: [...dependencies], revertOnUpdate: true },
  );
  return scope;
}

/** Route reveal targets parent surfaces; nested scenes keep control of their own transforms. */
export function usePageMotion(route: string) {
  const scope = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const page = scope.current;
        if (!page) return;
        const children = [...page.children].filter(
          (node) =>
            node instanceof HTMLElement &&
            !node.matches("input, .error-banner, .toast"),
        );
        gsap.fromTo(
          children,
          { opacity: 0.25, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.32,
            stagger: { each: 0.04, amount: 0.12 },
            ease: "power3.out",
            clearProps: "opacity,transform",
          },
        );
      });
      return () => media.revert();
    },
    { scope, dependencies: [route], revertOnUpdate: true },
  );
  return scope;
}

/** Only a slide number change triggers motion; typing updates its contents in place. */
export function useSlideMotion(index: number, selector: string) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const slide = scope.current?.querySelector(selector);
        if (slide)
          gsap.fromTo(
            slide,
            { opacity: 0.6, scale: 0.985, z: -12, transformPerspective: 1000 },
            {
              opacity: 1,
              scale: 1,
              z: 0,
              duration: 0.24,
              ease: "power3.out",
              clearProps: "opacity,transform",
            },
          );
      });
      return () => media.revert();
    },
    { scope, dependencies: [index], revertOnUpdate: true },
  );
  return scope;
}
