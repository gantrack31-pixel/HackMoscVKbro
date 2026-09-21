import type { Scene, SceneObject } from "../types";
function ObjectView({ object: o }: { object: SceneObject }) {
  if (o.type === "rect")
    return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill} />;
  if (o.type === "text")
    return (
      <text
        fontFamily="Manrope, Arial"
        fontSize={o.font_size}
        fontWeight={o.bold ? 750 : 400}
        fill={o.color}
      >
        {o.lines?.map((line, i) => (
          <tspan
            key={i}
            x={o.x}
            y={o.y + (o.font_size || 24) + i * (o.font_size || 24) * 1.28}
          >
            {line}
          </tspan>
        ))}
      </text>
    );
  if (o.type === "chart") {
    const values = o.values || [],
      labels = o.labels || [],
      min = Math.min(0, ...values),
      max = Math.max(1, ...values),
      span = max - min;
    const plotX = o.x + 190,
      plotWidth = Math.max(100, o.w - 340),
      zero = plotX + (-min / span) * plotWidth,
      row = o.h / Math.max(1, values.length);
    return (
      <g>
        {values.map((value, i) => {
          const point = plotX + ((value - min) / span) * plotWidth;
          return (
            <g key={i}>
              <text x={o.x} y={o.y + i * row + 22} fontSize="18" fill="#0f172a">
                {labels[i]}
              </text>
              <rect
                x={Math.min(point, zero)}
                y={o.y + i * row}
                width={Math.max(2, Math.abs(point - zero))}
                height={Math.max(8, row - 16)}
                fill={o.fill}
              />
              <text
                x={o.x + o.w - 130}
                y={o.y + i * row + 22}
                fontSize="18"
                fill="#0f172a"
              >
                {value} {o.unit}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  if (o.type === "table") {
    const rows = o.rows || [],
      h = o.h / Math.max(1, rows.length),
      w = o.w / Math.max(1, rows[0]?.length || 1);
    return (
      <g>
        {rows.flatMap((row, ri) =>
          row.map((cell, ci) => (
            <g key={`${ri}-${ci}`}>
              <rect
                x={o.x + ci * w}
                y={o.y + ri * h}
                width={w - 2}
                height={h - 2}
                fill={ri === 0 ? "#eaf3ff" : "#f8fafc"}
              />
              <text
                x={o.x + ci * w + 12}
                y={o.y + ri * h + 28}
                fontSize={o.font_size || 20}
                fill="#0f172a"
              >
                {cell}
              </text>
            </g>
          )),
        )}
      </g>
    );
  }
  return null;
}
export function SlidePreview({
  scene,
  label = "Слайд",
}: {
  scene: Scene;
  label?: string;
}) {
  return (
    <svg
      className="deck-slide"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      role="img"
      aria-label={label}
    >
      {(scene.render_objects || scene.objects).map((o) => (
        <ObjectView key={o.id} object={o} />
      ))}
    </svg>
  );
}
