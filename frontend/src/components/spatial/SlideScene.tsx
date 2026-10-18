import { useRef } from "react";
import * as THREE from "three";
import { gsap, useGSAP, motion } from "../../motion/animation";
import { ScrollTrigger } from "../../motion/scroll";
import { slideTexture, fragmentTexture } from "./slideTexture";
import { createSceneOrnaments } from "./sceneOrnaments";
import type { SpaceProps } from "./PresentationSpace";
import {
  initialSpatialQuality,
  lowerSpatialQuality,
  spatialQualitySettings,
} from "./quality";

interface Props extends SpaceProps {
  onReady: () => void;
  onFailure: () => void;
}
interface Pose {
  x: number;
  y: number;
  z: number;
  ry: number;
  rz: number;
  scale: number;
}
export default function SlideScene({
  templates,
  mode = "hero",
  revision = 0,
  onReady,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const element = host.current!;
      const mobile = matchMedia("(max-width: 700px)").matches;
      const connection = (
        navigator as Navigator & {
          connection?: { saveData?: boolean };
        }
      ).connection;
      const cores = navigator.hardwareConcurrency;
      const memory = (navigator as Navigator & { deviceMemory?: number })
        .deviceMemory;
      const qualityHints = {
        deviceMemory: memory,
        hardwareConcurrency: cores,
        maxTextureSize: 4096,
        saveData: Boolean(connection?.saveData),
        mobile,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      let quality = initialSpatialQuality(qualityHints);
      const performanceTier = quality;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: !mobile && performanceTier === "high",
          powerPreference:
            performanceTier === "high" ? "high-performance" : "low-power",
        });
      } catch {
        onFailure();
        return;
      }
      quality = initialSpatialQuality({
        ...qualityHints,
        maxTextureSize: renderer.capabilities.maxTextureSize,
      });
      const applyQuality = () => {
        const budget = spatialQualitySettings[quality];
        const ratio = Math.min(
          devicePixelRatio,
          mobile ? budget.mobileDpr : budget.desktopDpr,
        );
        if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
        renderer.domElement.dataset.quality = quality;
      };
      applyQuality();
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0x000000, 0);
      element.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 60);
      const rig = { x: 0, y: 0.1, z: 8.8, lookX: 0, lookY: 0 };
      const story = element.closest(".spatial-story");
      const entrance = { value: 0 };
      const pointer = { x: 0, y: 0 },
        damped = { x: 0, y: 0 };
      let pointerPosition: { x: number; y: number } | null = null;
      const boards: { group: THREE.Group; pose: Pose; reveal: number }[] = [];
      const fragments: { group: THREE.Group; pose: Pose }[] = [];
      const box = new THREE.BoxGeometry(1, 1, 1);
      const plane = new THREE.PlaneGeometry(1, 1);
      const { orbitGroup, ornaments, ornamentMaterials } = createSceneOrnaments(
        scene,
        spatialQualitySettings[quality].ornaments,
      );
      const syncOrnaments = () => {
        orbitGroup.visible = spatialQualitySettings[quality].ornaments;
        renderer.domElement.dataset.orbitVisible = String(orbitGroup.visible);
      };
      syncOrnaments();
      const edge = new THREE.MeshStandardMaterial({
        color: "#526782",
        roughness: 0.66,
        metalness: quality === "high" ? 0.28 : 0.14,
      });
      const materials: THREE.Material[] = [edge, ...ornamentMaterials];
      const textureCleanup: (() => void)[] = [];
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.width = 512;
      shadowCanvas.height = 320;
      const shadowContext = shadowCanvas.getContext("2d")!;
      shadowContext.shadowColor = "#0f172a";
      shadowContext.shadowBlur = 28;
      shadowContext.fillStyle = "#0f172a";
      shadowContext.beginPath();
      shadowContext.roundRect(46, 46, 420, 228, 18);
      shadowContext.fill();
      const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      });
      materials.push(shadowMaterial);
      textureCleanup.push(() => shadowTexture.dispose());
      const ambient = new THREE.AmbientLight(0xffffff, 2.1);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-3, 6, 9);
      scene.add(key);
      if (quality !== "low") {
        const blue = new THREE.PointLight(0x0077ff, 35, 20);
        blue.position.set(4, -1, 5);
        scene.add(blue);
      }
      let disposed = false,
        frame = 0,
        inView = true,
        activeTween = true,
        scrollActive = false,
        slowFrames = 0,
        last = 0;
      function invalidate() {
        if (!disposed && !frame && inView && !document.hidden)
          frame = requestAnimationFrame(render);
      }
      function makeBoard(texture: THREE.Texture, ratio: number, width: number) {
        const slideTextureQuality = spatialQualitySettings[quality];
        if (texture.image instanceof HTMLCanvasElement) {
          const maxDimension = renderer.capabilities.maxTextureSize;
          const sourceScale = Math.min(
            1,
            maxDimension / texture.image.width,
            maxDimension / texture.image.height,
          );
          if (sourceScale < 1) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(
              1,
              Math.floor(texture.image.width * sourceScale),
            );
            canvas.height = Math.max(
              1,
              Math.floor(texture.image.height * sourceScale),
            );
            const context = canvas.getContext("2d", { alpha: false });
            if (context) {
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "high";
              context.drawImage(
                texture.image,
                0,
                0,
                canvas.width,
                canvas.height,
              );
              texture.image = canvas;
            }
          }
        }
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        const group = new THREE.Group();
        const body = new THREE.Mesh(box, edge);
        body.scale.set(width, width / ratio, 0.105);
        group.add(body);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          toneMapped: false,
        });
        texture.anisotropy = Math.min(
          slideTextureQuality.anisotropy,
          renderer.capabilities.getMaxAnisotropy(),
        );
        materials.push(material);
        const face = new THREE.Mesh(plane, material);
        face.scale.set(width - 0.035, (width - 0.035) / ratio, 1);
        face.position.z = 0.054;
        group.add(face);
        const shadow = new THREE.Mesh(plane, shadowMaterial);
        shadow.scale.set(width * 1.19, (width / ratio) * 1.3, 1);
        shadow.position.set(0.08, -0.11, -0.075);
        group.add(shadow);
        scene.add(group);
        return group;
      }
      templates.slice(0, 3).forEach((template, index) => {
        const resource = slideTexture(
          template,
          invalidate,
          spatialQualitySettings[quality].textureSize,
        );
        textureCleanup.push(resource.dispose);
        const group = makeBoard(
          resource.texture,
          template.metadata.ratio,
          index === 0 ? 4.15 : 2.55,
        );
        const pose: Pose = [
          { x: 0.05, y: 0, z: 0.45, ry: -0.09, rz: -0.025, scale: 1 },
          { x: -2.75, y: 0.78, z: -2.45, ry: 0.18, rz: 0.045, scale: 1 },
          { x: 2.75, y: -0.72, z: -2.2, ry: -0.2, rz: -0.045, scale: 1 },
        ][index];
        boards.push({ group, pose, reveal: mode === "hero" ? 0 : 1 });
      });
      if (mode === "assembly") {
        const fragmentsPerScene =
          quality === "low" ? 3 : quality === "medium" || mobile ? 4 : 5;
        for (let i = 0; i < fragmentsPerScene; i++) {
          const texture = fragmentTexture(i);
          textureCleanup.push(() => texture.dispose());
          const group = makeBoard(texture, 512 / 300, 1.75);
          fragments.push({
            group,
            pose: {
              x: (i - 2) * 1.6,
              y: i % 2 ? 1.3 : -1.3,
              z: 1 + i * 0.3,
              ry: (i - 2) * -0.2,
              rz: (i - 2) * 0.07,
              scale: 0,
            },
          });
        }
      }
      function render(time: number) {
        frame = 0;
        if (disposed || !inView || document.hidden) return;
        if (pointerPosition) {
          const bounds = area.getBoundingClientRect();
          pointer.x = THREE.MathUtils.clamp(
            ((pointerPosition.x - bounds.left) / bounds.width) * 2 - 1,
            -1,
            1,
          );
          pointer.y = THREE.MathUtils.clamp(
            1 - ((pointerPosition.y - bounds.top) / bounds.height) * 2,
            -1,
            1,
          );
          pointerPosition = null;
        }
        const elapsed = time - (last || time - 16.67);
        const delta = Math.min(elapsed / 16.67, 3);
        last = time;
        const budget = spatialQualitySettings[quality];
        const damping = 1 - Math.pow(1 - budget.settle, delta);
        // Scroll scrubbing intentionally drives continuous renders; don't mistake it for device slowdown.
        if (!scrollActive)
          slowFrames =
            elapsed > 23 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames >= 45 && quality !== "low") {
          quality = lowerSpatialQuality(quality);
          slowFrames = 0;
          applyQuality();
          syncOrnaments();
          const { width, height } = element.getBoundingClientRect();
          renderer.setSize(width, height);
        }
        damped.x += (pointer.x - damped.x) * damping;
        damped.y += (pointer.y - damped.y) * damping;
        camera.position.set(
          rig.x + damped.x * 0.26 + Math.sin(damped.x * 0.38) * 0.12,
          rig.y + damped.y * 0.17 + Math.sin(damped.y * 0.32) * 0.08,
          rig.z + (1 - entrance.value) * 2.4,
        );
        const fieldOfView =
          (camera.aspect < 1 ? 49 : 39) + (8.8 - rig.z) * 0.72;
        if (Math.abs(camera.fov - fieldOfView) > 0.01) {
          camera.fov = fieldOfView;
          camera.updateProjectionMatrix();
        }
        camera.lookAt(
          rig.lookX + damped.x * 0.09,
          rig.lookY + damped.y * 0.06,
          -0.6,
        );
        orbitGroup.rotation.set(damped.y * 0.035, damped.x * 0.045, 0);
        const updatePose = (
          item: { group: THREE.Group; pose: Pose },
          index: number,
          reveal: number,
        ) => {
          const { group, pose } = item;
          const depth = index === 0 ? 1 : 0.5;
          group.position.set(
            pose.x + damped.x * 0.1 * depth,
            pose.y +
              damped.y * 0.09 * depth -
              (1 - entrance.value) * (0.9 + index * 0.12),
            pose.z,
          );
          group.rotation.set(
            damped.y * -0.035,
            pose.ry + damped.x * 0.075 * depth,
            pose.rz,
          );
          group.scale.setScalar(
            Math.max(0.001, pose.scale * entrance.value * reveal),
          );
        };
        for (let index = 0; index < boards.length; index++)
          updatePose(boards[index], index, boards[index].reveal);
        for (let index = 0; index < fragments.length; index++)
          updatePose(fragments[index], boards.length + index, 1);
        renderer.render(scene, camera);
        if (
          activeTween ||
          Math.abs(pointer.x - damped.x) + Math.abs(pointer.y - damped.y) >
            0.001
        )
          invalidate();
        else last = 0;
      }
      const intro = gsap.timeline({
        onUpdate: invalidate,
        onComplete: () => {
          activeTween = false;
          invalidate();
        },
      });
      intro.to(entrance, {
        value: 1,
        duration: motion.scene,
        ease: motion.ease,
      });
      if (mode === "hero")
        intro.to(
          boards,
          { reveal: 1, duration: 1.35, stagger: 0.22, ease: "power3.inOut" },
          0.1,
        );
      if (mode === "assembly") {
        boards.forEach(({ pose }) => {
          pose.scale = 0.001;
        });
        fragments.forEach(({ pose }, index) => {
          intro
            .to(
              pose,
              { scale: 1, duration: 0.65, ease: motion.ease },
              0.35 + index * 0.3,
            )
            .to(
              pose,
              {
                x: (index % 2 ? 1 : -1) * 0.7,
                y: ((index % 3) - 1) * 0.42,
                z: 0.8,
                ry: 0,
                rz: 0,
                duration: 1.5,
                ease: motion.settle,
              },
              2.5 + index * 0.12,
            )
            .to(
              pose,
              { scale: 0.001, duration: 0.65, ease: "power2.in" },
              4.3 + index * 0.09,
            );
        });
        boards.forEach(({ pose }, index) => {
          intro.to(
            pose,
            { scale: 1, duration: 1.1, ease: motion.ease },
            4.7 + index * 0.25,
          );
        });
        intro
          .to(rig, { z: 7, x: 0.6, duration: 2, ease: motion.settle }, 1.2)
          .to(
            rig,
            { z: 10.6, x: -0.4, duration: 2.2, ease: motion.settle },
            4.4,
          );
      } else {
        if (story) {
          const media = gsap.matchMedia();
          media.add("(min-width: 701px)", () => {
            const scroll = gsap.timeline({
              scrollTrigger: {
                trigger: story,
                start: "top top+=80",
                end: "bottom center",
                scrub: 0.85,
                invalidateOnRefresh: true,
                onToggle: (self) => {
                  scrollActive = self.isActive;
                  slowFrames = 0;
                },
              },
              onUpdate: () => {
                syncOrnaments();
                invalidate();
              },
            });
            scroll
              .to(
                rig,
                {
                  z: 6.4,
                  x: 0.38,
                  y: 0.16,
                  lookX: 0.12,
                  lookY: -0.04,
                  duration: 1.2,
                  ease: "none",
                },
                0,
              )
              .to(
                rig,
                {
                  z: 7.7,
                  x: -0.3,
                  y: -0.08,
                  lookX: -0.08,
                  lookY: 0.02,
                  duration: 1,
                  ease: "none",
                },
                1.2,
              );
            boards.forEach(({ pose }, index) => {
              scroll
                .to(
                  pose,
                  {
                    x: index === 0 ? 0.12 : index === 1 ? -3.5 : 3.5,
                    y: index === 0 ? -0.08 : index === 1 ? 0.58 : -0.5,
                    z: index === 0 ? 0.15 : -0.1,
                    ry: index === 0 ? 0.04 : index === 1 ? 0.4 : -0.4,
                    rz: index === 0 ? -0.015 : index === 1 ? 0.03 : -0.03,
                    duration: 1.2,
                    ease: "none",
                  },
                  0,
                )
                .to(
                  pose,
                  {
                    x: (index - 1) * 2.72,
                    y: (index - 1) * 0.24,
                    z: index === 0 ? 0.35 : -index * 0.45,
                    scale: index === 0 ? 0.94 : 0.68,
                    ry: index === 0 ? -0.08 : index === 1 ? -0.28 : 0.28,
                    rz: index === 0 ? -0.025 : index === 1 ? 0.035 : -0.035,
                    duration: 1,
                    ease: "none",
                  },
                  1.2,
                );
            });
            const line = story.querySelector(".space-progress i");
            if (line)
              scroll.fromTo(
                line,
                { scaleX: 0 },
                { scaleX: 1, duration: 2.2, ease: "none" },
                0,
              );
          });
        }
      }
      const area = element.parentElement!;
      const move = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        pointerPosition = { x: event.clientX, y: event.clientY };
        invalidate();
      };
      const leave = () => {
        pointerPosition = null;
        pointer.x = pointer.y = 0;
        invalidate();
      };
      area.addEventListener("pointermove", move, { passive: true });
      area.addEventListener("pointerleave", leave);
      const size = new THREE.Vector2();
      const resize = new ResizeObserver(() => {
        const { width, height } = element.getBoundingClientRect();
        if (!width || !height) return;
        renderer.getSize(size);
        const previousRatio = renderer.getPixelRatio();
        applyQuality();
        if (size.x === width && size.y === height) {
          if (renderer.getPixelRatio() !== previousRatio) invalidate();
          return;
        }
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        if (story) ScrollTrigger.refresh();
        invalidate();
      });
      resize.observe(element);
      const intersection = new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        if (!inView) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else {
          last = 0;
          syncOrnaments();
          ScrollTrigger.update();
          invalidate();
        }
      });
      intersection.observe(element);
      const visibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else {
          last = 0;
          invalidate();
        }
      };
      document.addEventListener("visibilitychange", visibility);
      const lost = (event: Event) => {
        event.preventDefault();
        onFailure();
      };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      renderer.domElement.dataset.orbitVisible = String(orbitGroup.visible);
      // Signal readiness only after a sized first render; the fallback avoids an empty lazy-loading frame.
      renderer.setSize(element.clientWidth || 1, element.clientHeight || 1);
      camera.aspect = (element.clientWidth || 1) / (element.clientHeight || 1);
      camera.updateProjectionMatrix();
      invalidate();
      onReady();
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        intro.kill();
        resize.disconnect();
        intersection.disconnect();
        area.removeEventListener("pointermove", move);
        area.removeEventListener("pointerleave", leave);
        document.removeEventListener("visibilitychange", visibility);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        textureCleanup.forEach((dispose) => dispose());
        materials.forEach((material) => material.dispose());
        ornaments.forEach((geometry) => geometry.dispose());
        box.dispose();
        plane.dispose();
        scene.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    },
    {
      scope: host,
      dependencies: [templates, mode, revision],
      revertOnUpdate: true,
    },
  );
  return <div className="slide-scene" ref={host} />;
}
