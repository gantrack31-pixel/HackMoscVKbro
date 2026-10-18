import { useEffect } from "react";

/** Keep native summary keyboard/focus behavior; delay closing until the height transition ends. */
export function useDisclosureMotion() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const active = new Map<
      HTMLDetailsElement,
      { animation: Animation; expanded: boolean; overflow: string }
    >();
    const finish = (element: HTMLDetailsElement) => {
      const state = active.get(element);
      if (!state) return;
      active.delete(element);
      element.open = state.expanded;
      element.style.overflow = state.overflow;
      state.animation.cancel();
    };
    const toggle = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || preference.matches)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest("a, button, input, select, textarea")
      )
        return;
      const summary =
        event.target instanceof Element
          ? event.target.closest("summary")
          : null;
      const element = summary?.parentElement;
      if (
        !(element instanceof HTMLDetailsElement) ||
        !element.matches(".page details, .modern-dialog details")
      )
        return;
      event.preventDefault();
      const previous = active.get(element);
      const expanded = !(previous?.expanded ?? element.open);
      const from = element.getBoundingClientRect().height;
      const overflow = previous?.overflow ?? element.style.overflow;
      active.delete(element);
      previous?.animation.cancel();
      element.open = false;
      const closed = element.getBoundingClientRect().height;
      element.open = true;
      const to = expanded ? element.getBoundingClientRect().height : closed;
      element.style.overflow = "hidden";
      const animation = element.animate(
        [{ height: `${from}px` }, { height: `${to}px` }],
        {
          duration: 220,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "both",
        },
      );
      active.set(element, { animation, expanded, overflow });
      void animation.finished
        .then(() => {
          if (active.get(element)?.animation === animation) finish(element);
        })
        .catch(() => {});
    };
    const settle = () => {
      for (const element of active.keys()) finish(element);
    };
    const reduce = () => {
      if (preference.matches) settle();
    };
    document.addEventListener("click", toggle);
    preference.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("click", toggle);
      preference.removeEventListener("change", reduce);
      settle();
    };
  }, []);
}
