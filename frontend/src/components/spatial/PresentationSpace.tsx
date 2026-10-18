import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Template } from "../../types";
import { TemplateCover } from "../TemplateCover";
import { AssemblyPoster } from "./AssemblyPoster";

const Scene = lazy(() => import("./SlideScene"));
export interface SpaceProps {
  templates: Template[];
  mode?: "hero" | "assembly";
  revision?: number;
}

function StaticSlides({ templates }: { templates: Template[] }) {
  return (
    <div className="spatial-fallback" data-testid="spatial-fallback">
      {templates.slice(0, 3).map((template) => (
        <div key={template.id}>
          <TemplateCover template={template} />
        </div>
      ))}
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Keep the HTML preview until the lazy scene is visible and successfully rendered. */
export function PresentationSpace({
  templates,
  mode = "hero",
  revision = 0,
}: SpaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!preference.matches);
    update();
    preference.addEventListener("change", update);
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((previous) => previous || entries[0].isIntersecting),
      { rootMargin: "160px" },
    );
    if (host.current) observer.observe(host.current);
    return () => {
      preference.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  const fallback =
    mode === "assembly" ? (
      <AssemblyPoster />
    ) : (
      <StaticSlides templates={templates} />
    );
  return (
    <div
      ref={host}
      className={`presentation-space space-${mode}${ready && enabled && !failed ? " is-ready" : ""}`}
      data-testid="presentation-space"
      aria-hidden="true"
    >
      <div className="space-glow" />
      <div className="space-static">{fallback}</div>
      {enabled && visible && !failed && (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={null}>
            <Scene
              templates={templates}
              mode={mode}
              revision={revision}
              onReady={() => setReady(true)}
              onFailure={() => {
                setFailed(true);
                setReady(false);
              }}
            />
          </Suspense>
        </SceneBoundary>
      )}
      <div className="space-caption">
        <span>
          DECKLY.AI /{" "}
          {mode === "hero" ? "ПРОСТРАНСТВО ИДЕЙ" : "ОТ МАТЕРИАЛА К ИСТОРИИ"}
        </span>
        <span>01 — 03</span>
      </div>
    </div>
  );
}
