import { gsap, useGSAP, motion } from "../motion/animation";
import { useRef, useState, type CSSProperties } from "react";
import type { Template } from "../types";
import { Icon } from "./Icon";
export function TemplateCover({
  template,
  title,
  decorative = false,
}: {
  template: Template;
  title?: string;
  decorative?: boolean;
}) {
  const meta = template.metadata;
  const [failed,setFailed]=useState("");
  if(template.preview_url && failed!==template.preview_url)
    return <img className="template-real-preview" src={template.preview_url} alt={decorative ? "" : `Первый слайд: ${template.name}`} style={{width:"100%",display:"block",aspectRatio:meta.ratio,objectFit:"contain",borderRadius:12}} onError={()=>setFailed(template.preview_url!)} />;
  if(meta.source==="pptx")
    return <div className="template-preview-placeholder" style={{aspectRatio:meta.ratio,display:"grid",placeContent:"center",gap:8,padding:24,textAlign:"center",background:"var(--surface-soft)",color:"var(--ink)",borderRadius:12}}><Icon name="file"/><strong>Новый шаблон</strong><span className="muted" style={{overflowWrap:"anywhere"}}>{template.name}</span></div>;
  const coverTitle = title || meta.cover_title || template.name;
  const style = {
    "--theme-accent": meta.accent,
    "--slide-ink": meta.composition ? meta.accent : undefined,
    "--slide-bg":
      template.id === "education"
        ? "#cef776"
        : template.id === "workspace"
          ? "#e0f3ff"
          : template.id === "tech"
            ? meta.accent
            : meta.composition
              ? meta.background
              : undefined,
  } as CSSProperties;
  return (
    <div
      className={`slide ${template.id === "workspace" ? "workspace-cover" : template.id} ${meta.composition ? "composition-" + meta.composition : ""}`}
      style={style}
      data-cover-style={meta.composition || "brand"}
      data-long-title={coverTitle.length > 60 || undefined}
    >
      <span className="slide-brand">{template.name}</span>
      <h3 title={coverTitle}>{coverTitle}</h3>
      <div className="slide-rule" />
      <div className="slide-layout" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="slide-meta">
        <span>ПРЕЗЕНТАЦИЯ</span>
        <span>
          {Math.abs(meta.ratio - 16 / 9) < 0.02
            ? "16:9"
            : `${meta.ratio.toFixed(2)}:1`}
        </span>
      </div>
    </div>
  );
}
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
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
      const element = card.current!;
      const tilt = (event: PointerEvent) => {
        const bounds = element.getBoundingClientRect();
        gsap.to(element, { rotationX: -(event.clientY - bounds.top - bounds.height / 2) / bounds.height * 5,
          rotationY: (event.clientX - bounds.left - bounds.width / 2) / bounds.width * 7,
          transformPerspective: 1000, y: -5, duration: motion.reveal, ease: motion.ease, overwrite: true });
      };
      const reset = () => gsap.to(element, { rotationX: 0, rotationY: 0, y: 0, duration: motion.reveal, ease: motion.ease, overwrite: true });
      const enter = () => element.addEventListener("pointermove", tilt);
      const leave = () => { element.removeEventListener("pointermove", tilt); reset(); };
      element.addEventListener("pointerenter", enter); element.addEventListener("pointerleave", leave);
      return () => { element.removeEventListener("pointerenter", enter); element.removeEventListener("pointerleave", leave); element.removeEventListener("pointermove", tilt); gsap.killTweensOf(element); gsap.set(element, { clearProps: "transform" }); };
    });
    return () => media.revert();
  }, { scope: card });
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
