import { Icon } from "./Icon";
import { SlidePreview } from "./SlidePreview";
import type { DeckContent, Scene } from "../types";

export function EditorSlideRail({
  slides,
  scenes,
  index,
  busy,
  hasDataErrors,
  onSelect,
  onAddSlide,
}: {
  slides: DeckContent["slides"];
  scenes: Scene[];
  index: number;
  busy: boolean;
  hasDataErrors: boolean;
  onSelect: (index: number) => void;
  onAddSlide: () => void;
}) {
  return (
    <aside className="slide-rail" aria-label="Слайды">
      {slides.map((s, i) => (
        <button
          className={`thumbnail ${i === index ? "active" : ""}`}
          disabled={busy || hasDataErrors}
          key={i}
          onClick={() => onSelect(i)}
          aria-label={`Слайд ${i + 1}: ${s.title}`}
          aria-current={i === index ? "true" : undefined}
        >
          <span>{String(i + 1).padStart(2, "0")}</span>
          {scenes[i] ? (
            <SlidePreview scene={scenes[i]} />
          ) : (
            <div className="new-thumb">Новый слайд</div>
          )}
        </button>
      ))}
      <button
        className="btn sm"
        disabled={busy || hasDataErrors || slides.length >= 30}
        onClick={onAddSlide}
      >
        <Icon name="plus" />
        Слайд
      </button>
    </aside>
  );
}
