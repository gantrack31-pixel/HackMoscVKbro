import { useRef } from "react";
import * as THREE from "three";
import { useGSAP } from "../../motion/animation";
import { createOrbitModel } from "./orbitModel";
import { startOrbitMotion } from "./orbitMotion";

function sceneQuality() {
  const tablet = matchMedia("(max-width: 1050px)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const lean =
    tablet ||
    (memory !== undefined && memory <= 4) ||
    navigator.hardwareConcurrency <= 4;
  return { tablet, lean };
}

export default function CreativeOrbitScene({
  onReady,
  onFailure,
}: {
  onReady: () => void;
  onFailure: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const element = host.current;
      if (!element) return;
      const { tablet, lean } = sceneQuality();
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: !lean,
          powerPreference: lean ? "low-power" : "high-performance",
        });
      } catch {
        onFailure();
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, lean ? 1.25 : 1.7));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.65;
      renderer.setClearColor(0x000000, 0);
      element.appendChild(renderer.domElement);
      const disposeRenderer = () => {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      const lost = (event: Event) => {
        event.preventDefault();
        onFailure();
      };

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      let model: ReturnType<typeof createOrbitModel>;
      try {
        model = createOrbitModel(renderer, tablet, lean);
      } catch {
        disposeRenderer();
        onFailure();
        return;
      }
      let stopMotion: () => void;
      try {
        stopMotion = startOrbitMotion({
          element,
          renderer,
          camera,
          model,
          tablet,
        });
      } catch {
        model.dispose();
        disposeRenderer();
        onFailure();
        return;
      }
      renderer.domElement.addEventListener("webglcontextlost", lost);
      onReady();
      return () => {
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        stopMotion();
        model.dispose();
        disposeRenderer();
      };
    },
    { scope: host },
  );
  return <div ref={host} className="auth-orbit-canvas" aria-hidden="true" />;
}
