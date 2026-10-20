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
  showMascot = true,
}: {
  kind: LibraryEmptyStateKind;
  title: string;
  description: string;
  children?: ReactNode;
  showMascot?: boolean;
}) {
  const titleId = useId();
  return (
    <section
      className={`library-empty-state library-empty-state--${kind}${showMascot ? "" : " library-empty-state--compact"}`}
      aria-labelledby={titleId}
    >
      {showMascot && (
        <div className="library-empty-mascot">
          <DecklyMascot
            animation={
              kind === "search"
                ? "think"
                : kind === "favorites"
                  ? "kiss"
                  : "laptop"
            }
            size={170}
            message={
              kind === "projects"
                ? "Здесь будет ваша первая история!"
                : kind === "favorites"
                  ? "Сохраним здесь всё, что нравится?"
                  : "Поищем ещё? Идея где-то рядом."
            }
          />
          <span className="library-mascot-badge">
            <Icon name={stateIcons[kind]} />
          </span>
        </div>
      )}
      <div className="library-empty-copy">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="library-empty-actions">{children}</div>}
    </section>
  );
}
