import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type LibraryEmptyStateKind = "projects" | "favorites" | "search";

const stateIcons: Record<LibraryEmptyStateKind, IconName> = {
  projects: "library-empty-projects",
  favorites: "library-empty-favorites",
  search: "library-empty-search",
};

export function LibraryEmptyState({
  kind,
  title,
  description,
  children,
}: {
  kind: LibraryEmptyStateKind;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let inView = false;
    const updateVisibility = () => setVisible(inView && !document.hidden);
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return (
    <section
      ref={container}
      className={`library-empty-state library-empty-state--${kind}`}
      aria-labelledby={titleId}
      data-visible={visible}
    >
      <div className="library-empty-art" aria-hidden="true">
        <span className="library-empty-orbit" />
        <div className="library-empty-float">
          <span className="library-empty-sheet library-empty-sheet--back" />
          <span className="library-empty-sheet library-empty-sheet--middle" />
          <span className="library-empty-sheet library-empty-sheet--front">
            <span className="library-empty-slide-top">
              <i />
              <i />
              <i />
            </span>
            <span className="library-empty-slide-heading" />
            <span className="library-empty-slide-line" />
            <span className="library-empty-slide-bars">
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="library-empty-badge">
            <Icon name={stateIcons[kind]} />
          </span>
        </div>
        <span className="library-empty-spark library-empty-spark--two" />
      </div>
      <div className="library-empty-copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="library-empty-actions">{children}</div>}
    </section>
  );
}
