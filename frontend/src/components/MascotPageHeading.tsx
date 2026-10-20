import type { ReactNode } from "react";
import { DecklyMascot, type MascotAnimation } from "./DecklyMascot";
import { Icon, type IconName } from "./Icon";

const headingThemes = {
  home: {
    icon: "home-idea",
    label: "От идеи к слайдам",
    detail: "home-inspiration",
    accent: "nav-templates",
  },
  favorites: {
    icon: "nav-favorites",
    label: "Коллекция вдохновения",
    detail: "nav-templates",
    accent: "nav-favorites",
  },
  projects: {
    icon: "nav-projects",
    label: "Ваше рабочее пространство",
    detail: "info-help-editing",
    accent: "editor-preview",
  },
  support: {
    icon: "nav-support",
    label: "Центр помощи",
    detail: "info-support-contact",
    accent: "info-support-reference",
  },
} satisfies Record<
  string,
  { icon: IconName; label: string; detail: IconName; accent: IconName }
>;

/** Page copy leads; the mascot is a supporting illustration inside the header. */
export function MascotPageHeading({
  children,
  action,
  animation,
  intro,
  message,
  variant,
}: {
  children: ReactNode;
  action: ReactNode;
  animation: MascotAnimation;
  intro?: MascotAnimation;
  message?: string;
  variant?: keyof typeof headingThemes;
}) {
  const theme = variant ? headingThemes[variant] : null;
  return (
    <header
      className={`heading mascot-page-heading${theme ? " mascot-page-heading--illustrated" : ""}`}
      data-variant={variant}
    >
      <div className="mascot-page-copy">
        {theme && (
          <div className="mascot-page-eyebrow">
            <span className="mascot-page-emblem">
              <Icon name={theme.icon} />
            </span>
            <span>{theme.label}</span>
          </div>
        )}
        {children}
      </div>
      <div className="mascot-page-action">{action}</div>
      <div className="mascot-page-art">
        {theme && (
          <div className="mascot-page-decoration" aria-hidden="true">
            <span className="mascot-page-orbit" />
            <span className="mascot-page-slide">
              <Icon name={theme.icon} />
              <i />
              <i />
              <i />
            </span>
            <span className="mascot-page-symbol mascot-page-symbol--top">
              <Icon name={theme.detail} />
            </span>
            <span className="mascot-page-symbol mascot-page-symbol--bottom">
              <Icon name={theme.accent} />
            </span>
          </div>
        )}
        <DecklyMascot
          animation={animation}
          intro={intro}
          size={152}
          message={message}
        />
      </div>
    </header>
  );
}
