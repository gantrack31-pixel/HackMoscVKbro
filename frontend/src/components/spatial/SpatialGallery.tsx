import { useRef, useState } from "react";
import { TemplateCover } from "../TemplateCard";
import { Icon } from "../Icon";
import { gsap, useGSAP, motion } from "../../motion/animation";
import type { CatalogActions } from "../../pages/Home";

/** A spatial browse view alongside the complete, searchable catalog. */
export function SpatialGallery({
  templates,
  preview,
  select,
  favorites,
  toggleFavorite,
}: CatalogActions) {
  const [index, setIndex] = useState(0);
  const scope = useRef<HTMLElement>(null);
  const gesture = useRef<{ x: number; time: number } | null>(null);
  const suppressClick = useRef(false);
  const activeIndex = Math.min(index, Math.max(0, templates.length - 1));
  const active = templates[activeIndex];
  const previousIndex = useRef(activeIndex);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        {
          reduced: "(prefers-reduced-motion: reduce)",
          mobile: "(max-width: 700px)",
          desktop: "(min-width: 701px)",
        },
        (context) => {
          const cards =
            scope.current?.querySelectorAll<HTMLElement>(".gallery-slide");
          cards?.forEach((card, i) => {
            const distance = i - activeIndex;
            const previousDistance = i - previousIndex.current;
            const offset = context.conditions?.mobile ? 83 : 70;
            gsap.fromTo(
              card,
              {
                xPercent: previousDistance * offset,
                z: -Math.abs(previousDistance) * 145,
                rotationY:
                  previousDistance === 0
                    ? 0
                    : Math.sign(previousDistance) * -18,
                scale: previousDistance === 0 ? 1 : 0.85,
                opacity:
                  Math.abs(previousDistance) > 2
                    ? 0
                    : previousDistance === 0
                      ? 1
                      : 0.46,
              },
              {
                xPercent: distance * offset,
                z: -Math.abs(distance) * 145,
                rotationY: distance === 0 ? 0 : Math.sign(distance) * -18,
                scale: distance === 0 ? 1 : 0.85,
                opacity: Math.abs(distance) > 2 ? 0 : distance === 0 ? 1 : 0.46,
                duration: context.conditions?.reduced ? 0 : motion.reveal,
                ease: motion.ease,
                overwrite: true,
              },
            );
          });
          previousIndex.current = activeIndex;
        },
      );
      return () => media.revert();
    },
    { scope, dependencies: [activeIndex, templates], revertOnUpdate: true },
  );
  if (!active) return null;
  const move = (delta: number) =>
    setIndex(Math.max(0, Math.min(templates.length - 1, activeIndex + delta)));
  return (
    <section
      ref={scope}
      className="spatial-gallery"
      aria-label="Пространственная подборка шаблонов"
      aria-roledescription="карусель"
    >
      <div className="gallery-topline">
        <span className="eyebrow">НАЙДИТЕ СВОЙ РАКУРС</span>
        <span className="small muted">
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(templates.length).padStart(2, "0")}
        </span>
      </div>
      <div
        className="gallery-stage"
        onPointerDown={(event) => {
          gesture.current = { x: event.clientX, time: performance.now() };
          suppressClick.current = false;
        }}
        onPointerUp={(event) => {
          if (!gesture.current) return;
          const delta = event.clientX - gesture.current.x;
          const speed =
            Math.abs(delta) /
            Math.max(1, performance.now() - gesture.current.time);
          if (Math.abs(delta) > 55 || (Math.abs(delta) > 25 && speed > 0.5)) {
            suppressClick.current = true;
            move(delta < 0 ? 1 : -1);
          }
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {templates.map((template, i) => (
          <div
            className={`gallery-slide${i === activeIndex ? " is-active" : ""}`}
            key={template.id}
            style={{ zIndex: templates.length - Math.abs(i - activeIndex) }}
            inert={i !== activeIndex}
            aria-hidden={i !== activeIndex}
          >
            <button
              className="gallery-cover"
              onClick={() => preview(template)}
              aria-label={`Открыть пространственный предпросмотр ${template.name}`}
            >
              <TemplateCover template={template} decorative />
            </button>
          </div>
        ))}
      </div>
      <div className="gallery-bottom">
        <div data-testid="gallery-active-template" className="gallery-meta" aria-live="polite" aria-atomic="true">
          <h3>{active.name}</h3>
          <p>
            {active.metadata.category} · {active.metadata.count} слайдов
          </p>
        </div>
        <div className="gallery-actions">
          <button
            className="btn ghost icon-only gallery-favorite"
            onClick={() => toggleFavorite(active.id)}
            aria-label={`${favorites.includes(active.id) ? "Убрать из избранного" : "Добавить в избранное"}: ${active.name}`}
            aria-pressed={favorites.includes(active.id)}
            title={favorites.includes(active.id) ? "Убрать из избранного" : "Добавить в избранное"}
          >
            <Icon name="star" />
          </button>
          <button className="btn primary sm" onClick={() => select(active)}>
            Создать с этим шаблоном
            <Icon name="arrow" />
          </button>
        </div>
        <div className="gallery-navigation">
          <button
            className="btn icon-only"
            disabled={activeIndex === 0}
            onClick={() => move(-1)}
            aria-label="Предыдущий шаблон"
          >
            <Icon name="back" />
          </button>
          <button
            className="btn icon-only"
            disabled={activeIndex === templates.length - 1}
            onClick={() => move(1)}
            aria-label="Следующий шаблон"
          >
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </section>
  );
}
