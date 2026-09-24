import { useEffect, useState, type RefObject } from "react";

/** Один фон перемещается между ссылками; текст и фокус остаются на месте. */
export function SelectionIndicator({ container, activeKey }: {
  container: RefObject<HTMLElement | null>; activeKey: string;
}) {
  const [position, setPosition] = useState<{ top: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const nav = container.current;
    if (!nav) return;
    const measure = () => {
      const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setVisible(Boolean(selected));
      if (!selected) return;
      setPosition({ top: selected.offsetTop, height: selected.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    nav.querySelectorAll("a").forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [container, activeKey]);
  return position && <span aria-hidden="true" className="nav-selection"
    style={{ transform: `translateY(${position.top}px)`, height: position.height, opacity: visible ? 1 : 0 }}>
    <span key={activeKey} className="nav-selection-fill" />
  </span>;
}
