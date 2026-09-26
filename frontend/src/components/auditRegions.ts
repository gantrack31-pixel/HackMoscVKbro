import type { Issue, Scene } from "../types";

export interface AuditRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AuditMarker {
  issues: { issue: Issue; number: number }[];
  region: AuditRegion;
  x: number;
  y: number;
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Geometry is resolved against the current preview, never a guessed slide position. */
export function issueRegion(issue: Issue, scene: Scene): AuditRegion | null {
  const object =
    scene.objects.find((item) => item.id === issue.object_id) ||
    scene.render_objects?.find((item) => item.id === issue.object_id);
  if (!object || scene.width <= 0 || scene.height <= 0) return null;
  const x = clamp(object.x, 0, scene.width);
  const y = clamp(object.y, 0, scene.height);
  const w = Math.min(object.w, scene.width - x);
  const h = Math.min(
    Math.max(object.h, object.used_height || 0),
    scene.height - y,
  );
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Shared regions get one marker. Pixel spacing is recalculated when the canvas resizes. */
export function auditMarkers(
  issues: Issue[],
  scene: Scene,
  width: number,
  height: number,
): AuditMarker[] {
  if (width < 40 || height < 40) return [];
  const groups = new Map<string, Omit<AuditMarker, "x" | "y">>();
  issues.forEach((issue, index) => {
    const region = issueRegion(issue, scene);
    if (!region) return;
    const key = [region.x, region.y, region.w, region.h]
      .map(Math.round)
      .join(":");
    const group = groups.get(key) || { region, issues: [] };
    group.issues.push({ issue, number: index + 1 });
    groups.set(key, group);
  });
  const markers: AuditMarker[] = [];
  for (const group of groups.values()) {
    const left = (group.region.x / scene.width) * width;
    const top = (group.region.y / scene.height) * height;
    const right = ((group.region.x + group.region.w) / scene.width) * width;
    const bottom = ((group.region.y + group.region.h) / scene.height) * height;
    const candidates = [
      [left - 18, top + 14],
      [right + 18, top + 14],
      [left + 14, top - 18],
      [right - 14, top - 18],
      [left - 18, bottom - 14],
      [right + 18, bottom - 14],
    ];
    for (let shift = 0; shift < height; shift += 36)
      candidates.push([18, top + shift], [width - 18, top + shift]);
    const position = candidates.find(
      ([x, y]) =>
        x >= 16 &&
        x <= width - 16 &&
        y >= 16 &&
        y <= height - 16 &&
        markers.every((marker) => Math.hypot(marker.x - x, marker.y - y) >= 36),
    );
    if (position) markers.push({ ...group, x: position[0], y: position[1] });
  }
  return markers;
}
