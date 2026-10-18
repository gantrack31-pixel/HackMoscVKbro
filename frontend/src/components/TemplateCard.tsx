import { gsap, useGSAP } from "../motion/animation";
import { useRef } from "react";
import { TemplateCover } from "./TemplateCover";
import "../motion/scroll";
import type { Template } from "../types";
import { Icon } from "./Icon";
export function TemplateCard({
  template,
  favorite,
  onFavorite,
  onSelect,
  onPreview,
}: {
  template: Template;
  favorite: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  onPreview: (origin: HTMLElement) => void;
}) {
  const card = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const element = card.current!;
        const scrollTilt = gsap.timeline({
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        });
        scrollTilt.fromTo(
          element,
          { "--template-scroll-tilt": "1.5deg" },
          { "--template-scroll-tilt": "-1.5deg", ease: "none" },
        );
      });
      return () => media.revert();
    },
    { scope: card },
  );
  return (
    <article ref={card} className="template spatial-card">
      <button
        className={`favorite ${favorite ? "on" : ""}`}
        onClick={onFavorite}
        aria-label={`${favorite ? "Убрать из избранного" : "Добавить в избранное"}: ${template.name}`}
        aria-pressed={favorite}
      >
        <Icon name="star" />
      </button>
      <button
        className="template-cover"
        onClick={(event) =>
          onPreview(event.currentTarget.firstElementChild as HTMLElement)
        }
        aria-label={`Посмотреть шаблон ${template.name}`}
      >
        <TemplateCover template={template} />
      </button>
      <div className="template-body">
        <div className="between">
          <h3>{template.name}</h3>
          <span className="badge">
            {Math.abs(template.metadata.ratio - 16 / 9) < 0.02
              ? "16:9"
              : `${template.metadata.ratio.toFixed(2)}:1`}
          </span>
        </div>
        <p>
          {template.metadata.category} ·{" "}
          {template.metadata.source === "pptx"
            ? "Ваш исходный PPTX"
            : "Авторская подборка"}
        </p>
        <div className="template-footer">
          <span className="tiny muted">
            {template.metadata.source === "pptx"
              ? `${template.metadata.count} слайдов`
              : "3 композиции"}
          </span>
          <button className="btn sm ghost" onClick={onSelect}>
            Выбрать вариант
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </article>
  );
}
