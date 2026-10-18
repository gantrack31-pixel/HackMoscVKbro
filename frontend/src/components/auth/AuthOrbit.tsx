import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { Template } from "../../types";
import { TemplateCover } from "../TemplateCover";

const OrbitScene = lazy(() => import("./CreativeOrbitScene"));

class OrbitBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function AuthOrbit({ templates }: {
  templates: Template[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [tablet, setTablet] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mobile = matchMedia("(max-width: 700px)");
    const compact = matchMedia("(max-width: 1050px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEnabled(!mobile.matches && !reduced.matches);
      setTablet(compact.matches);
      setReady(false);
    };
    update();
    mobile.addEventListener("change", update);
    compact.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      compact.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  return (
    <div ref={host} className={`auth-orbit${ready && enabled && !failed ? " is-ready" : ""}`}>
      <div className="auth-orbit-static" aria-hidden="true">
        <div className="auth-orbit-static-slide">
          {templates[0]
            ? <TemplateCover template={templates[0]} />
            : <div className="auth-orbit-static-content"><small>DECKLY.AI / ПРЕЗЕНТАЦИЯ</small><strong>Идеи становятся историей.</strong><span>От первой мысли — к готовому слайду.</span></div>}
        </div>
      </div>
      {enabled && !failed && (
        <OrbitBoundary onFailure={() => setFailed(true)}>
          <Suspense fallback={null}>
            <OrbitScene key={tablet ? "tablet" : "desktop"} onReady={() => setReady(true)} onFailure={() => setFailed(true)} />
          </Suspense>
        </OrbitBoundary>
      )}
      <div className="auth-orbit-caption" aria-hidden="true">
        <span>DECKLY.AI / ПРОСТРАНСТВО ИДЕЙ</span>
        <span>ИДЕЯ → ПРЕЗЕНТАЦИЯ</span>
      </div>
    </div>
  );
}
