import * as THREE from "three";
import { gsap } from "../../motion/animation";
import type { OrbitModel } from "./orbitModel";

const smooth = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

function updateModules(
  model: OrbitModel,
  progress: number,
  pointer: { x: number; y: number },
) {
  const assembly =
    smooth(0.27, 0.52, progress) * (1 - smooth(0.69, 0.94, progress));
  const glide = 1 - assembly * 0.82;
  model.modules.forEach(({ mesh, orbit, target, phase }, index) => {
    const angle = progress * Math.PI * 2 + phase;
    const orbitX = orbit.x + Math.sin(angle) * 0.28 * glide;
    const orbitY = orbit.y + Math.cos(angle + 0.25) * 0.22 * glide;
    const orbitZ = orbit.z + Math.sin(angle + 0.7) * 0.22 * glide;
    mesh.position.set(
      THREE.MathUtils.lerp(orbitX, target.x, assembly) +
        pointer.x * (orbitZ > 0 ? 0.08 : -0.05) * (1 - assembly),
      THREE.MathUtils.lerp(
        orbitY,
        target.y + model.board.position.y,
        assembly,
      ) +
        pointer.y * (orbitZ > 0 ? 0.06 : -0.04) * (1 - assembly),
      THREE.MathUtils.lerp(orbitZ, target.z, assembly),
    );
    mesh.rotation.set(
      (Math.sin(angle + index) * 0.09 + 0.035) * (1 - assembly),
      Math.cos(angle + index) * 0.16 * (1 - assembly) + pointer.x * 0.025,
      Math.sin(angle + index * 0.6) * 0.07 * (1 - assembly),
    );
  });
}

/** Own the GSAP loop, pointer damping, viewport events and render invalidation. */
export function startOrbitMotion({
  element,
  renderer,
  camera,
  model,
  tablet,
}: {
  element: HTMLDivElement;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  model: OrbitModel;
  tablet: boolean;
}) {
  const pointer = { x: 0, y: 0 };
  const damped = { x: 0, y: 0 };
  const progress = { value: 0 };
  const rig = { z: tablet ? 11.3 : 11, yaw: 0, pan: 0 };
  const startZ = rig.z;
  let disposed = false;
  let frame = 0;
  let visible = true;
  let pointerPosition: { x: number; y: number } | null = null;

  const invalidate = () => {
    if (!disposed && !frame && visible && !document.hidden)
      frame = requestAnimationFrame(render);
  };
  const timeline = gsap.timeline({
    repeat: -1,
    paused: true,
    onUpdate: invalidate,
  });
  timeline.to(progress, { value: 1, duration: 18, ease: "none" }, 0);
  timeline.to(
    rig,
    {
      z: startZ - 0.38,
      yaw: 0.07,
      pan: 0.11,
      duration: 5.3,
      ease: "sine.inOut",
    },
    5.1,
  );
  timeline.to(
    rig,
    { z: startZ, yaw: 0, pan: 0, duration: 5.3, ease: "sine.inOut" },
    12.7,
  );

  function render() {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (pointerPosition) {
      const bounds = element.getBoundingClientRect();
      pointer.x = ((pointerPosition.x - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = ((pointerPosition.y - bounds.top) / bounds.height - 0.5) * 2;
      pointerPosition = null;
    }
    damped.x += (pointer.x - damped.x) * 0.075;
    damped.y += (pointer.y - damped.y) * 0.075;
    camera.position.set(
      rig.pan + rig.yaw * 2.3 + damped.x * 0.16,
      -damped.y * 0.13,
      rig.z,
    );
    camera.lookAt(rig.pan * 0.25, 0, 0);
    model.board.rotation.y = -rig.yaw * 0.35 + damped.x * 0.045;
    model.board.rotation.x = damped.y * -0.03;
    updateModules(model, progress.value, damped);
    renderer.render(model.scene, camera);
    if (Math.abs(pointer.x - damped.x) + Math.abs(pointer.y - damped.y) > 0.003)
      invalidate();
  }

  const size = new THREE.Vector2();
  const resize = () => {
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    renderer.getSize(size);
    if (size.x === width && size.y === height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    invalidate();
  };
  const onMove = (event: PointerEvent) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    invalidate();
  };
  const onLeave = () => {
    pointerPosition = null;
    pointer.x = 0;
    pointer.y = 0;
    invalidate();
  };
  const onVisibility = () => {
    if (document.hidden) timeline.pause();
    else if (visible) {
      timeline.play();
      invalidate();
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) {
        timeline.play();
        invalidate();
      } else timeline.pause();
    },
    { threshold: 0.01 },
  );
  const resizeObserver = new ResizeObserver(resize);
  const interactionTarget = element.parentElement ?? element;
  observer.observe(element);
  resizeObserver.observe(element);
  interactionTarget.addEventListener("pointermove", onMove, { passive: true });
  interactionTarget.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", onVisibility);
  resize();
  cancelAnimationFrame(frame);
  render();
  timeline.play();

  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    timeline.kill();
    observer.disconnect();
    resizeObserver.disconnect();
    interactionTarget.removeEventListener("pointermove", onMove);
    interactionTarget.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
