import { Sparkles } from "lucide-react";
export function ThinkingSkeleton({ label }: { label: string }) {
  return (
    <div className="thinking" role="status" aria-live="polite" aria-busy="true">
      <div className="thinking-label">
        <Sparkles size={20} />
        <span>{label}…</span>
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
