import { Icon } from "./Icon";
import { DecklyMascot } from "./DecklyMascot";

export function ThinkingSkeleton({ label }: { label: string }) {
  return (
    <div className="thinking" role="status" aria-live="polite" aria-busy="true">
      <div className="thinking-intro">
        <DecklyMascot
          animation="think"
          size={148}
          working
          className="thinking-mascot"
        />
        <div className="thinking-copy">
          <span className="thinking-kicker">
            <Icon name="ui-thinking" size={16} />
            DECKLY · СТРУКТУРА
          </span>
          <strong className="thinking-label">{label}…</strong>
          <span className="thinking-caption">
            Выделяем главное и собираем план слайдов
          </span>
        </div>
      </div>
      <div className="thinking-slides" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            className="thinking-slide"
            key={i}
            style={{ animationDelay: `${i * 160}ms` }}
          >
            <i />
            <b />
            <span />
            <span />
            <div className="thinking-blocks">
              <span />
              <span />
              <span />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
