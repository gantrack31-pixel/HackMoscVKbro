import { useRef, type DependencyList } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);
export { gsap, useGSAP, ScrollTrigger };
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
