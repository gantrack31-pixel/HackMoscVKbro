import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { DecklyMascot } from "./DecklyMascot";

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
  return (
    <section
      className={`library-empty-state library-empty-state--${kind}`}
      aria-labelledby={titleId}
    >
      <div className="library-empty-mascot" aria-hidden="true">
        <DecklyMascot
          animation={kind === "search" ? "think" : "wave"}
          size={170}
        />
        <span className="library-mascot-badge">
          <Icon name={stateIcons[kind]} />
        </span>
      </div>
      <div className="library-empty-copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="library-empty-actions">{children}</div>}
    </section>
  );
}
