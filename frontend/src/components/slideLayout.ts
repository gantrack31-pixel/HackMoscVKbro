import type { ObjectStyle, Scene, SceneObject, Slide, Variant } from "../types";

export type Box = Pick<SceneObject, "x" | "y" | "w" | "h">;
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type LayoutAction = "move" | ResizeHandle;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function editableObjects(scene: Scene) {
  return scene.objects.filter(
    (object) =>
      !["background", "canvas-background"].includes(object.id) &&
      [object.x, object.y, object.w, object.h].every(Number.isFinite) &&
      object.w >= 0 &&
      object.h >= 0 &&
      object.w + object.h > 0,
  );
}

/** Work in slide coordinates, independently of browser zoom and canvas size. */
export function changeBox(
  box: Box,
  action: LayoutAction,
  dx: number,
  dy: number,
  scene: Pick<Scene, "width" | "height">,
): Box {
  if (action === "move")
    return {
      w: box.w,
      h: box.h,
      x: clamp(box.x + dx, 0, Math.max(0, scene.width - box.w)),
      y: clamp(box.y + dy, 0, Math.max(0, scene.height - box.h)),
    };
  // Keep the opposite edge anchored and prevent inversion or leaving the slide.
  const minW = Math.min(16, box.w || 1),
    minH = Math.min(16, box.h || 1);
  let left = box.x,
    top = box.y,
    right = box.x + box.w,
    bottom = box.y + box.h;
  if (action.includes("w")) left = clamp(left + dx, 0, right - minW);
  if (action.includes("e")) right = clamp(right + dx, left + minW, scene.width);
  if (action.includes("n")) top = clamp(top + dy, 0, bottom - minH);
  if (action.includes("s"))
    bottom = clamp(bottom + dy, top + minH, scene.height);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function layoutStyle(object: SceneObject, box: Box): ObjectStyle {
  const style: ObjectStyle = { x: box.x, y: box.y, w: box.w, h: box.h };
  // Zero-width/height lines are legal in scenes; overrides require positive sizes.
  if (!box.w) delete style.w;
  if (!box.h) delete style.h;
  if (
    object.type === "text" &&
    object.font_size &&
    (box.w !== object.w || box.h !== object.h)
  ) {
    style.font_size = clamp(
      object.font_size * Math.min(box.w / object.w, box.h / object.h),
      8,
      160,
    );
  }
  return style;
}

export function updateSlideLayout(
  slide: Slide,
  variant: Variant,
  id: string,
  style: ObjectStyle,
  composition: NonNullable<Slide["design"]>["composition"] = "editorial",
): Partial<Slide> {
  const key = slide.layout || variant;
  const design = slide.designs?.[key] ||
    slide.design || {
      composition,
      density: "balanced" as const,
      layout_shift: 0 as const,
    };
  const updated = {
    ...design,
    objects: { ...design.objects, [id]: { ...design.objects?.[id], ...style } },
  };
  // Legacy decks use design directly; adding a designs map would change layout_shift semantics.
  return slide.designs && Object.keys(slide.designs).length
    ? { designs: { ...slide.designs, [key]: updated } }
    : { design: updated };
}

/** Immediate feedback during the gesture; the server reflows text on completion. */
export function transformLayoutScene(
  scene: Scene,
  object: SceneObject,
  box: Box,
): Scene {
  const sx = object.w ? box.w / object.w : 1,
    sy = object.h ? box.h / object.h : 1;
  const px = (x: number) => box.x + (x - object.x) * sx;
  const py = (y: number) => box.y + (y - object.y) * sy;
  const transform = (node: SceneObject): SceneObject => {
    const child =
      (object.type === "chart" || object.type === "table") &&
      node.id.startsWith(`${object.id}-`);
    if (node.id !== object.id && node.parent_id !== object.id && !child)
      return node;
    return {
      ...node,
      x: px(node.x),
      y: py(node.y),
      w: node.id === object.id ? box.w : node.w * sx,
      h: node.id === object.id ? box.h : node.h * sy,
      ...(node.font_size
        ? { font_size: clamp(node.font_size * Math.min(sx, sy), 8, 160) }
        : {}),
      ...(node.points
        ? {
            points: node.points.map(
              ([x, y]) => [px(x), py(y)] as [number, number],
            ),
          }
        : {}),
      ...(node.type === "line"
        ? {
            x1: px(node.x1!),
            x2:
              node.id === object.id && !object.w ? box.x + box.w : px(node.x2!),
            y1: py(node.y1!),
            y2:
              node.id === object.id && !object.h ? box.y + box.h : py(node.y2!),
          }
        : {}),
    };
  };
  return {
    ...scene,
    objects: scene.objects.map(transform),
    render_objects: scene.render_objects?.map(transform),
  };
}
