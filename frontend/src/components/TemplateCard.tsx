import { gsap, useGSAP, motion } from "../motion/animation";
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
  onPreview: () => void;
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
      media.add(
        "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const element = card.current!;
          const preview = element.querySelector<HTMLElement>(
            ".template-cover .template-real-preview",
          );
          const movePreviewX = preview
            ? gsap.quickTo(preview, "x", {
                duration: 0.45,
                ease: motion.settle,
              })
            : null;
          const movePreviewY = preview
            ? gsap.quickTo(preview, "y", {
                duration: 0.45,
                ease: motion.settle,
              })
            : null;
          let frame = 0;
          let pointerX = 0;
          let pointerY = 0;
          const animateTilt = () => {
            frame = 0;
            const bounds = element.getBoundingClientRect();
            const x = (pointerX - bounds.left) / bounds.width - 0.5;
            const y = (pointerY - bounds.top) / bounds.height - 0.5;
            gsap.to(element, {
              rotationX: -y * 8,
              rotationY: x * 8,
              transformPerspective: 1000,
              y: -3,
              duration: motion.fast,
              ease: motion.settle,
              overwrite: true,
            });
            movePreviewX?.(x * -5);
            movePreviewY?.(y * -4);
          };
          const tilt = (event: PointerEvent) => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            if (!frame) frame = requestAnimationFrame(animateTilt);
          };
          const reset = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            gsap.to(element, {
              rotationX: 0,
              rotationY: 0,
              y: 0,
              duration: motion.reveal,
              ease: motion.settle,
              overwrite: true,
            });
            movePreviewX?.(0);
            movePreviewY?.(0);
          };
          const enter = () => element.addEventListener("pointermove", tilt);
          const leave = () => {
            element.removeEventListener("pointermove", tilt);
            reset();
          };
          element.addEventListener("pointerenter", enter);
          element.addEventListener("pointerleave", leave);
          return () => {
            cancelAnimationFrame(frame);
            element.removeEventListener("pointerenter", enter);
            element.removeEventListener("pointerleave", leave);
            element.removeEventListener("pointermove", tilt);
            gsap.killTweensOf(element);
            if (preview) {
              gsap.killTweensOf(preview);
              gsap.set(preview, { clearProps: "transform" });
            }
            gsap.set(element, { clearProps: "transform" });
          };
        },
      );
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
        onClick={onPreview}
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
