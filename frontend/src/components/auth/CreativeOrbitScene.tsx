import { useRef } from "react";
import * as THREE from "three";
import { gsap, useGSAP } from "../../motion/animation";

type Paint = (context: CanvasRenderingContext2D, width: number, height: number) => void;
type Module = {
  mesh: THREE.Group;
  orbit: THREE.Vector3;
  target: THREE.Vector3;
  phase: number;
};

const ink = "#172347";
const blue = "#0077ff";
const coral = "#ff817b";

function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string | CanvasGradient | CanvasPattern) {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function texture(width: number, height: number, paint: Paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true })!;
  paint(context, width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  return map;
}

const smooth = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export default function CreativeOrbitScene({ onReady, onFailure }: { onReady: () => void; onFailure: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const element = host.current;
    if (!element) return;
    const tablet = matchMedia("(max-width: 1050px)").matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lean = tablet || (memory !== undefined && memory <= 4) || navigator.hardwareConcurrency <= 4;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !lean, powerPreference: lean ? "low-power" : "high-performance" });
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    const root = new THREE.Group();
    root.scale.setScalar(tablet ? 0.68 : 1);
    scene.add(root);
    scene.add(new THREE.AmbientLight(0xffffff, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-3, 5, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffa49f, 1.5);
    rim.position.set(3, -2, -2);
    scene.add(rim);

    const plane = new THREE.PlaneGeometry(1, 1);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edge = new THREE.MeshStandardMaterial({ color: "#bbc9db", roughness: 0.68, metalness: 0.08 });
    const maps: THREE.Texture[] = [];
    const materials: THREE.Material[] = [edge];
    const makeCard = (width: number, height: number, map: THREE.Texture, thickness = 0.065) => {
      maps.push(map);
      const group = new THREE.Group();
      const body = new THREE.Mesh(box, edge);
      body.scale.set(width, height, thickness);
      group.add(body);
      const faceMaterial = new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: true });
      materials.push(faceMaterial);
      const face = new THREE.Mesh(plane, faceMaterial);
      face.scale.set(width - 0.015, height - 0.015, 1);
      face.position.z = thickness / 2 + 0.002;
      group.add(face);
      return group;
    };

    const boardMap = texture(1280, 720, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 18, "#fbfcff");
      rounded(ctx, 42, 42, 1196, 636, 12, "#ffffff");
      rounded(ctx, 70, 73, 8, 8, 4, blue);
      ctx.fillStyle = "#7d8ba4";
      ctx.font = "700 19px Manrope, sans-serif";
      ctx.fillText("DECKLY.AI", 94, 91);
      ctx.textAlign = "right";
      ctx.fillText("ПРЕЗЕНТАЦИЯ / 01", 1194, 91);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e8edf6";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(72, 121); ctx.lineTo(1208, 121); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(72, 643); ctx.lineTo(1208, 643); ctx.stroke();
      ctx.fillStyle = "#c6cfdd";
      ctx.font = "600 17px Manrope, sans-serif";
      ctx.fillText("ОТ ИДЕИ К ЯСНОЙ ИСТОРИИ", 78, 674);
      ctx.textAlign = "right";
      ctx.fillText("16:9", 1205, 674);
      ctx.textAlign = "left";
    });
    const board = makeCard(5, 2.8125, boardMap, 0.12);
    board.position.y = 0.08;
    root.add(board);
    const shadowMap = texture(512, 320, (ctx, w, h) => {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, "#17234724");
      gradient.addColorStop(1, "#17234700");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
    maps.push(shadowMap);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
    materials.push(shadowMaterial);
    const shadow = new THREE.Mesh(plane, shadowMaterial);
    shadow.scale.set(6.6, 4.05, 1);
    shadow.position.set(0, board.position.y - 0.13, -0.2);
    root.add(shadow);

    const modules: Module[] = [];
    const addModule = (width: number, height: number, orbit: [number, number, number], target: [number, number, number], phase: number, paint: Paint) => {
      const resolution = lean ? 440 : 640;
      const map = texture(resolution, Math.round(resolution * height / width), paint);
      const mesh = makeCard(width, height, map);
      root.add(mesh);
      modules.push({ mesh, orbit: new THREE.Vector3(...orbit), target: new THREE.Vector3(...target), phase });
    };

    addModule(1.32, 0.32, [-1.55, 1.78, 0.72], [-1.57, 1.13, 0.13], 0.1, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 12, "#ffffff");
      rounded(ctx, 20, h / 2 - 7, 14, 14, 7, blue);
      ctx.fillStyle = blue; ctx.font = "800 28px Manrope, sans-serif";
      ctx.fillText("01 / КОНЦЕПЦИЯ", 49, h / 2 + 10);
    });
    addModule(2.28, 0.79, [-1.82, 0.79, 1.05], [-1.16, 0.59, 0.14], 1.3, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 12, "#ffffff");
      ctx.fillStyle = ink; ctx.font = "800 56px Manrope, sans-serif";
      ctx.fillText("Идеи становятся", 24, h * 0.43);
      ctx.fillText("историей.", 24, h * 0.78);
      rounded(ctx, 25, h - 18, 106, 5, 2, coral);
    });
    addModule(2.17, 0.92, [-1.77, -1.59, 0.48], [-1.18, -0.37, 0.14], 2.5, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 12, "#ffffff");
      ctx.fillStyle = ink; ctx.font = "750 26px Manrope, sans-serif";
      ctx.fillText("Рост вовлечённости", 25, 47);
      ctx.fillStyle = "#8090a8"; ctx.font = "600 18px Manrope, sans-serif";
      ctx.fillText("Данные превращаются в выводы", 25, 76);
      const values = [0.34, 0.48, 0.62, 0.53, 0.79, 0.91];
      const chartTop = 96; const chartHeight = h - 130;
      values.forEach((value, index) => {
        rounded(ctx, 29 + index * 92, chartTop + chartHeight * (1 - value), 60, chartHeight * value, 7, index === 5 ? blue : index === 4 ? coral : "#cfdef8");
      });
    });
    addModule(2.03, 1.63, [1.88, 0.35, 0.75], [1.22, -0.06, 0.14], 3.8, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 12, "#eaf2ff");
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "#d7e9ff"); gradient.addColorStop(1, "#fff2f1");
      rounded(ctx, 18, 18, w - 36, h - 36, 16, gradient);
      ctx.save(); ctx.translate(w * 0.11, h * 0.14); ctx.rotate(-0.09);
      ctx.shadowColor = "#283a5a40"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 18;
      rounded(ctx, 0, 0, w * 0.74, h * 0.64, 18, "#ffffff");
      ctx.shadowColor = "transparent";
      rounded(ctx, 24, 24, w * 0.17, 10, 4, coral);
      ctx.fillStyle = ink; ctx.font = "800 32px Manrope, sans-serif";
      ctx.fillText("Продукт", 24, h * 0.22);
      ctx.fillStyle = "#63758f"; ctx.font = "600 20px Manrope, sans-serif";
      ctx.fillText("Ключевые идеи", 24, h * 0.30);
      rounded(ctx, 24, h * 0.36, w * 0.58, 7, 3, "#dce7f8");
      rounded(ctx, 24, h * 0.42, w * 0.46, 7, 3, "#dce7f8");
      ctx.restore();
      rounded(ctx, w * 0.65, h * 0.68, w * 0.25, h * 0.16, 12, blue);
      ctx.fillStyle = "#ffffff"; ctx.font = "800 24px Manrope, sans-serif";
      ctx.fillText("AI", w * 0.715, h * 0.775);
    });
    addModule(0.51, 0.51, [1.82, 1.8, 0.88], [1.95, 1.08, 0.14], 5.1, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 18, blue);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.51); ctx.lineTo(w * 0.45, h * 0.66); ctx.lineTo(w * 0.72, h * 0.31); ctx.stroke();
    });
    if (!lean) addModule(1.62, 0.27, [1.63, -1.7, -0.55], [-1.44, -1.09, 0.14], 6.1, (ctx, w, h) => {
      rounded(ctx, 0, 0, w, h, 9, "#ffffff");
      ctx.fillStyle = "#7d8ba4"; ctx.font = "700 26px Manrope, sans-serif";
      ctx.fillText("СОЗДАНО В DECKLY.AI", 20, h * 0.62);
    });

    maps.forEach((map) => { map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });
    const pointer = { x: 0, y: 0 };
    const damped = { x: 0, y: 0 };
    const progress = { value: 0 };
    const rig = { z: tablet ? 11.3 : 11, yaw: 0, pan: 0 };
    let disposed = false;
    let frame = 0;
    let visible = true;
    const startZ = rig.z;
    const invalidate = () => {
      if (!disposed && !frame && visible && !document.hidden) frame = requestAnimationFrame(render);
    };
    const timeline = gsap.timeline({ repeat: -1, paused: true, onUpdate: invalidate });
    timeline.to(progress, { value: 1, duration: 18, ease: "none" }, 0);
    timeline.to(rig, { z: startZ - 0.38, yaw: 0.07, pan: 0.11, duration: 5.3, ease: "sine.inOut" }, 5.1);
    timeline.to(rig, { z: startZ, yaw: 0, pan: 0, duration: 5.3, ease: "sine.inOut" }, 12.7);

    function render() {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      const p = progress.value;
      const assembly = smooth(0.27, 0.52, p) * (1 - smooth(0.69, 0.94, p));
      const glide = 1 - assembly * 0.82;
      damped.x += (pointer.x - damped.x) * 0.075;
      damped.y += (pointer.y - damped.y) * 0.075;
      camera.position.set(rig.pan + rig.yaw * 2.3 + damped.x * 0.16, -damped.y * 0.13, rig.z);
      camera.lookAt(rig.pan * 0.25, 0, 0);
      board.rotation.y = -rig.yaw * 0.35 + damped.x * 0.045;
      board.rotation.x = damped.y * -0.03;
      modules.forEach(({ mesh, orbit, target, phase }, index) => {
        const angle = p * Math.PI * 2 + phase;
        const orbitX = orbit.x + Math.sin(angle) * 0.28 * glide;
        const orbitY = orbit.y + Math.cos(angle + 0.25) * 0.22 * glide;
        const orbitZ = orbit.z + Math.sin(angle + 0.7) * 0.22 * glide;
        mesh.position.set(
          THREE.MathUtils.lerp(orbitX, target.x, assembly) + damped.x * (orbitZ > 0 ? 0.08 : -0.05) * (1 - assembly),
          THREE.MathUtils.lerp(orbitY, target.y + board.position.y, assembly) + damped.y * (orbitZ > 0 ? 0.06 : -0.04) * (1 - assembly),
          THREE.MathUtils.lerp(orbitZ, target.z, assembly),
        );
        mesh.rotation.set(
          (Math.sin(angle + index) * 0.09 + 0.035) * (1 - assembly),
          Math.cos(angle + index) * 0.16 * (1 - assembly) + damped.x * 0.025,
          Math.sin(angle + index * 0.6) * 0.07 * (1 - assembly),
        );
      });
      renderer.render(scene, camera);
      if (Math.abs(pointer.x - damped.x) + Math.abs(pointer.y - damped.y) > 0.003) invalidate();
    }

    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      invalidate();
    };
    const onMove = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      invalidate();
    };
    const onLeave = () => { pointer.x = 0; pointer.y = 0; invalidate(); };
    const onVisibility = () => {
      if (document.hidden) timeline.pause();
      else if (visible) { timeline.play(); invalidate(); }
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) { timeline.play(); invalidate(); }
      else timeline.pause();
    }, { threshold: 0.01 });
    const resizeObserver = new ResizeObserver(resize);
    const interactionTarget = element.parentElement ?? element;
    observer.observe(element);
    resizeObserver.observe(element);
    interactionTarget.addEventListener("pointermove", onMove, { passive: true });
    interactionTarget.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    render();
    timeline.play();
    onReady();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      timeline.kill();
      observer.disconnect();
      resizeObserver.disconnect();
      interactionTarget.removeEventListener("pointermove", onMove);
      interactionTarget.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      maps.forEach((map) => map.dispose());
      materials.forEach((material) => material.dispose());
      plane.dispose(); box.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, { scope: host });
  return <div ref={host} className="auth-orbit-canvas" aria-hidden="true" />;
}
