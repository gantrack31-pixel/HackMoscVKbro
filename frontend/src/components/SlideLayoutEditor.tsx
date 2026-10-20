import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { ObjectStyle, Scene, SceneObject } from "../types";
import { SlidePreview } from "./SlidePreview";
import {
  changeBox,
  editableObjects,
  layoutStyle,
  transformLayoutScene,
  type Box,
  type LayoutAction,
  type ResizeHandle,
} from "./slideLayout";

const handles: [ResizeHandle, number, number, string][] = [
  ["nw", 0, 0, "сверху слева"],
  ["n", 0.5, 0, "сверху"],
  ["ne", 1, 0, "сверху справа"],
  ["e", 1, 0.5, "справа"],
  ["se", 1, 1, "снизу справа"],
  ["s", 0.5, 1, "снизу"],
  ["sw", 0, 1, "снизу слева"],
  ["w", 0, 0.5, "слева"],
];
function objectLabel(object: SceneObject) {
  if (object.id === "title") return "Заголовок";
  if (object.id === "body") return "Основной текст";
  const names: Record<SceneObject["type"], string> = {
    text: "Текст",
    image: "Изображение",
    chart: "Диаграмма",
    table: "Таблица",
    rect: "Прямоугольник",
    ellipse: "Эллипс",
    line: "Линия",
    polygon: "Многоугольник",
    hexagon: "Шестиугольник",
  };
  return `${names[object.type]} · ${object.id}`;
}
type Gesture = {
  pointerId: number;
  object: SceneObject;
  action: LayoutAction;
  start: DOMPoint;
  box: Box;
  moved: boolean;
};

export function SlideLayoutEditor({
  scene,
  disabled = false,
  onChange,
}: {
  scene: Scene;
  disabled?: boolean;
  onChange: (id: string, style: ObjectStyle) => void;
}) {
  const overlay = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [optimistic, setOptimistic] = useState<{
    source: Scene;
    object: SceneObject;
    box: Box;
  } | null>(null);
  const [active, setActive] = useState(false);
  const [scale, setScale] = useState(1);
  const display =
    optimistic?.source === scene
      ? transformLayoutScene(scene, optimistic.object, optimistic.box)
      : scene;
  const objects = editableObjects(display);
  const selected = objects.find((object) => object.id === selectedId);
  useEffect(() => {
    const svg = overlay.current;
    if (!svg) return;
    const observer = new ResizeObserver(() =>
      setScale(scene.width / Math.max(1, svg.getBoundingClientRect().width)),
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, [scene.width]);

  function point(event: PointerEvent<SVGElement>) {
    const matrix = overlay.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : null;
  }
  function start(
    event: PointerEvent<SVGElement>,
    object: SceneObject,
    action: LayoutAction,
  ) {
    if (disabled || gesture.current || event.button !== 0 || !event.isPrimary)
      return;
    const origin = point(event);
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(object.id);
    event.currentTarget.focus();
    overlay.current!.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      object,
      action,
      start: origin,
      box: object,
      moved: false,
    };
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current,
      cursor = point(event);
    if (!current || current.pointerId !== event.pointerId || !cursor) return;
    // A click selects without creating a draft or a history entry.
    if (
      !current.moved &&
      Math.hypot(cursor.x - current.start.x, cursor.y - current.start.y) <
        3 * scale
    )
      return;
    current.moved = true;
    current.box = changeBox(
      current.object,
      current.action,
      cursor.x - current.start.x,
      cursor.y - current.start.y,
      scene,
    );
    setOptimistic({ source: scene, object: current.object, box: current.box });
    setActive(true);
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel) move(event);
    gesture.current = null;
    setActive(false);
    if (overlay.current?.hasPointerCapture(event.pointerId))
      overlay.current.releasePointerCapture(event.pointerId);
    if (cancel) setOptimistic(null);
    else if (
      current.moved &&
      ["x", "y", "w", "h"].some(
        (key) =>
          current.box[key as keyof Box] !== current.object[key as keyof Box],
      )
    ) {
      onChange(current.object.id, layoutStyle(current.object, current.box));
    }
  }
  function keyDown(
    event: KeyboardEvent<SVGElement>,
    object?: SceneObject,
    action: LayoutAction = "move",
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      const current = gesture.current;
      gesture.current = null;
      setActive(false);
      if (current) {
        setOptimistic(null);
        if (overlay.current?.hasPointerCapture(current.pointerId))
          overlay.current.releasePointerCapture(current.pointerId);
      } else setSelectedId("");
      event.stopPropagation();
      return;
    }
    if (!object || disabled || gesture.current) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(object.id);
      return;
    }
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const box = changeBox(
      object,
      action,
      offset[0] * step,
      offset[1] * step,
      scene,
    );
    if (
      box.x === object.x &&
      box.y === object.y &&
      box.w === object.w &&
      box.h === object.h
    )
      return;
    setSelectedId(object.id);
    setOptimistic({ source: scene, object, box });
    onChange(object.id, layoutStyle(object, box));
  }
  return (
    <div className="slide-layout-editor">
      <div
        className={`slide-layout-surface${active ? " is-transforming" : ""}`}
      >
        <SlidePreview scene={display} />
        <svg
          ref={overlay}
          className="slide-layout-overlay"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          role="group"
          aria-label="Управление элементами слайда"
          aria-disabled={disabled}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId("");
          }}
          onPointerMove={move}
          onPointerUp={(event) => finish(event)}
          onPointerCancel={(event) => finish(event, true)}
          onLostPointerCapture={(event) => finish(event, true)}
          onKeyDown={(event) => keyDown(event)}
        >
          {objects.map((object) => (
            <rect
              key={object.id}
              className="slide-layout-hit"
              data-object-id={object.id}
              x={object.x}
              y={object.y}
              width={Math.max(object.w, 6 * scale)}
              height={Math.max(object.h, 6 * scale)}
              fill="transparent"
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`Переместить: ${objectLabel(object)}`}
              aria-pressed={selectedId === object.id}
              aria-disabled={disabled}
              onFocus={() => setSelectedId(object.id)}
              onPointerDown={(event) => start(event, object, "move")}
              onKeyDown={(event) => keyDown(event, object)}
            />
          ))}
          {selected && (
            <g className="slide-layout-selection">
              <rect
                x={selected.x}
                y={selected.y}
                width={selected.w}
                height={selected.h}
                className="slide-layout-outline"
                vectorEffect="non-scaling-stroke"
              />
              {handles.map(([handle, x, y, label]) => (
                <rect
                  key={handle}
                  className="slide-layout-handle"
                  data-handle={handle}
                  x={selected.x + selected.w * x - 5 * scale}
                  y={selected.y + selected.h * y - 5 * scale}
                  width={10 * scale}
                  height={10 * scale}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: `${handle}-resize` }}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={`Изменить размер ${label}`}
                  aria-disabled={disabled}
                  onPointerDown={(event) => start(event, selected, handle)}
                  onKeyDown={(event) => keyDown(event, selected, handle)}
                />
              ))}
            </g>
          )}
        </svg>
      </div>
      <p className="slide-layout-hint" role="status">
        {selected
          ? `${objectLabel(selected)} · ${Math.round(selected.w)} × ${Math.round(selected.h)} · тяните рамку или маркеры. Esc — отменить жест.`
          : "Выберите элемент и перетащите мышью. Для изменения размера потяните маркер рамки."}
      </p>
    </div>
  );
}
