import { memo, useState, type CSSProperties } from "react";
import type { Template } from "../types";
import { Icon } from "./Icon";

export const TemplateCover = memo(function TemplateCover({
  template,
  title,
  decorative = false,
  loading = "eager",
}: {
  template: Template;
  title?: string;
  decorative?: boolean;
  loading?: "eager" | "lazy";
}) {
  const meta = template.metadata;
  const [failed, setFailed] = useState("");
  if (template.preview_url && failed !== template.preview_url)
    return (
      <img
        className="template-real-preview"
        crossOrigin="anonymous"
        src={template.preview_url}
        loading={loading}
        decoding="async"
        alt={decorative ? "" : `Первый слайд: ${template.name}`}
        style={{
          width: "100%",
          display: "block",
          aspectRatio: meta.ratio,
          objectFit: "contain",
          borderRadius: 12,
        }}
        onError={() => setFailed(template.preview_url!)}
      />
    );
  if (meta.source === "pptx")
    return (
      <div
        className="template-preview-placeholder"
        style={{
          aspectRatio: meta.ratio,
          display: "grid",
          placeContent: "center",
          gap: 8,
          padding: 24,
          textAlign: "center",
          background: "var(--surface-soft)",
          color: "var(--ink)",
          borderRadius: 12,
        }}
      >
        <Icon name="file" />
        <strong>Новый шаблон</strong>
        <span className="muted" style={{ overflowWrap: "anywhere" }}>
          {template.name}
        </span>
      </div>
    );
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
});
