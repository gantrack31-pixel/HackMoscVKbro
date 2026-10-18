import { Maximize2 } from "lucide-react";
import { SlidePreview } from "./SlidePreview";
import type { Project } from "../types";

export function FinishPreview({
  project,
  index,
  onIndexChange,
  onPresent,
}: {
  project: Project;
  index: number;
  onIndexChange: (index: number) => void;
  onPresent: () => void;
}) {
  return (
    <section className="finish-preview panel">
      <div className="between">
        <h2>{project.title}</h2>
        <button type="button" className="btn sm" onClick={() => onPresent()}>
          <Maximize2 size={16} /> Смотреть
        </button>
      </div>
      <SlidePreview
        scene={project.variants[project.variant][index]}
        label={`Слайд ${index + 1}: ${project.content.slides[index].title}`}
      />
      <div className="finish-filmstrip">
        {project.content.slides.map((slide, i) => (
          <button
            key={i}
            className={i === index ? "active" : ""}
            aria-label={`Предпросмотр слайда ${i + 1}`}
            aria-pressed={index === i}
            onClick={() => onIndexChange(i)}
          >
            <SlidePreview
              scene={project.variants[project.variant][i]}
              label={slide.title}
            />
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="between small muted">
        <span>
          {project.template.name} · Слайд {index + 1} из{" "}
          {project.content.slides.length}
        </span>
        <a className="btn sm" href="#audit">
          Проверить слайды
        </a>
      </div>
    </section>
  );
}
