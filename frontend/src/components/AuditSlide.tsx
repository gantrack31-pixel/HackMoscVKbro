import { useEffect, useRef, useState } from "react";
import type { Issue, Scene } from "../types";
import { SlidePreview } from "./SlidePreview";
import { auditMarkers, issueRegion } from "./auditRegions";

export function AuditSlide({
  scene,
  issues,
  focus,
  locked,
  busy,
  onInspect,
}: {
  scene: Scene;
  issues: Issue[];
  focus: string;
  locked: boolean;
  busy: boolean;
  onInspect: (issue: Issue) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState("");
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const highlighted = issues.find((issue) => issue.id === (hovered || focus));
  const region = highlighted && issueRegion(highlighted, scene);
  const markers = auditMarkers(issues, scene, size.width, size.height);
  return (
    <div className="audit-slide-wrap" ref={wrap}>
      <SlidePreview scene={scene} />
      {region && (
        <svg
          className="audit-region-layer"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          aria-hidden="true"
        >
          <rect
            x={region.x}
            y={region.y}
            width={region.w}
            height={region.h}
            rx="5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {markers.map((marker) => {
        const selected = marker.issues.find((item) => item.issue.id === focus);
        const next =
          marker.issues[
            (marker.issues.findIndex((item) => item.issue.id === focus) + 1) %
              marker.issues.length
          ];
        const item = selected || marker.issues[0];
        return (
          <button
            type="button"
            key={marker.issues[0].issue.id}
            disabled={busy || (locked && !selected)}
            className={`audit-pin ${selected ? "focused" : ""} ${item.issue.severity === "info" ? "info" : ""}`}
            style={{ left: marker.x, top: marker.y }}
            aria-label={marker.issues
              .map(({ issue, number }) => `${number}. ${issue.title}`)
              .join(". ")}
            aria-pressed={Boolean(selected)}
            title={
              marker.issues.length > 1
                ? `${marker.issues.length} замечания к этому блоку. Нажмите для переключения.`
                : item.issue.title
            }
            onPointerEnter={() => setHovered(item.issue.id)}
            onPointerLeave={() => setHovered("")}
            onFocus={() => setHovered(item.issue.id)}
            onBlur={() => setHovered("")}
            onClick={() => onInspect(locked ? item.issue : next.issue)}
          >
            {item.number}
            {marker.issues.length > 1 && <sup>+</sup>}
          </button>
        );
      })}
    </div>
  );
}
