import type { MaterialResource } from "../types";
import type { SourceBlock } from "../pages/wizard/draft";

const kindLabels: Record<MaterialResource["kind"], string> = {
  document: "Документ",
  image: "Изображение",
  icon: "Иконка",
  icon_pack: "Набор иконок",
  font: "Шрифт",
  palette: "Палитра",
};

function Details({ resource, block }: { resource: MaterialResource; block?: SourceBlock }) {
  if (resource.kind === "image" || resource.kind === "icon")
    return (
      <>
        <img
          className="material-preview-thumb"
          src={`/api/materials/${encodeURIComponent(resource.id)}/preview`}
          alt=""
          loading="lazy"
          decoding="async"
        />
        {resource.width && resource.height && (
          <small>{resource.width}×{resource.height}</small>
        )}
      </>
    );
  if (resource.kind === "palette")
    return (
      <div className="material-preview-swatches">
        {(resource.colors || []).map((color) => (
          <i key={color} style={{ background: color }} title={color} />
        ))}
      </div>
    );
  if (resource.kind === "font")
    return (
      <small>
        {[resource.family, resource.weight, resource.style].filter(Boolean).join(" · ")}
      </small>
    );
  if (resource.kind === "icon_pack") {
    const icons = resource.icons || [];
    return (
      <small>
        {icons.length} шт.{icons.length > 0 && `: ${icons.slice(0, 6).map((icon) => icon.name).join(", ")}${icons.length > 6 ? "…" : ""}`}
      </small>
    );
  }
  const characters = block?.characters ?? resource.characters ?? 0;
  return (
    <>
      <small>{characters.toLocaleString("ru-RU")} символов</small>
      {block?.text && (
        <details className="material-preview-text">
          <summary>Что извлечено</summary>
          <p>{block.text.slice(0, 1200)}{block.text.length > 1200 && "…"}</p>
        </details>
      )}
    </>
  );
}

export function MaterialsPreview({
  resources,
  sourceBlocks,
  busy,
  onRemove,
}: {
  resources: MaterialResource[];
  sourceBlocks: SourceBlock[];
  busy: boolean;
  onRemove: (id: string) => void | Promise<void>;
}) {
  return (
    <ul className="material-preview-list" aria-label="Ресурсы для презентации">
      {resources.map((resource) => (
        <li className={`material-preview material-${resource.kind}`} key={resource.id}>
          <div className="material-preview-head">
            <span className="material-preview-kind">{kindLabels[resource.kind]}</span>
            <strong title={resource.name}>{resource.name}</strong>
            <button
              type="button"
              className="material-resource-remove"
              aria-label={`Удалить ${resource.name}`}
              disabled={busy}
              onClick={() => onRemove(resource.id)}
            >
              ×
            </button>
          </div>
          <Details resource={resource} block={sourceBlocks.find((block) => block.id === resource.id)} />
        </li>
      ))}
    </ul>
  );
}
