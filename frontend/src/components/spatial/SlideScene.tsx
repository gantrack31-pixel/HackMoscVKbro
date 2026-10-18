import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap, useGSAP, motion } from "../../motion/animation";
import { ScrollTrigger } from "../../motion/scroll";
import { slideTexture } from "./slideTexture";
import { assemblyRegions, createAssemblyArtwork } from "./assemblyArtwork";
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
  opacity?: number;
}
export default function SlideScene({
  templates,
  mode = "hero",
  revision = 0,
  onReady,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const replay = useRef<(() => void) | null>(null);
  const previousRevision = useRef(revision);
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
      const assembly = mode === "assembly";
      let compactAssembly = element.clientWidth < 480;
      const box = new THREE.BoxGeometry(1, 1, 1);
      const roundedFace = assembly ? new THREE.BufferGeometry() : null;
      if (roundedFace) {
        const positions = [0, 0, 0],
          uvs = [0.5, 0.5],
          indices: number[] = [];
        for (let corner = 0; corner < 4; corner++) {
          const cx = corner === 0 || corner === 3 ? 0.48 : -0.48;
          const cy = corner < 2 ? 0.468 : -0.468;
          for (let step = 0; step <= 8; step++) {
            const angle = ((corner + step / 8) * Math.PI) / 2;
            const x = cx + Math.cos(angle) * 0.02;
            const y = cy + Math.sin(angle) * 0.032;
            positions.push(x, y, 0);
            uvs.push(x + 0.5, y + 0.5);
          }
        }
        const vertices = positions.length / 3 - 1;
        for (let i = 1; i <= vertices; i++)
          indices.push(0, i, i === vertices ? 1 : i + 1);
        roundedFace.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        roundedFace.setAttribute(
          "uv",
          new THREE.Float32BufferAttribute(uvs, 2),
        );
        roundedFace.setIndex(indices);
        roundedFace.computeVertexNormals();
      }
      const plane = new THREE.PlaneGeometry(1, 1);
      const { orbitGroup, ornaments, ornamentMaterials } = createSceneOrnaments(
        scene,
        spatialQualitySettings[quality].ornaments,
      );
      if (assembly) {
        orbitGroup.scale.setScalar(0.9);
        orbitGroup.position.z = -1.6;
        ornamentMaterials.forEach((material) => {
          material.opacity *= 0.45;
        });
      }
      const syncOrnaments = () => {
        orbitGroup.visible = spatialQualitySettings[quality].ornaments;
        renderer.domElement.dataset.orbitVisible = String(orbitGroup.visible);
      };
      syncOrnaments();
      const edge = new THREE.MeshStandardMaterial({
        color: assembly ? "#e7edf6" : "#526782",
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
        const body = new THREE.Mesh(
          roundedFace || box,
          assembly ? edge.clone() : edge,
        );
        if (assembly) materials.push(body.material);
        body.scale.set(width, width / ratio, assembly ? 1 : 0.105);
        group.add(body);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          toneMapped: false,
          transparent: assembly,
        });
        texture.anisotropy = Math.min(
          slideTextureQuality.anisotropy,
          renderer.capabilities.getMaxAnisotropy(),
        );
        materials.push(material);
        const face = new THREE.Mesh(roundedFace || plane, material);
        face.scale.set(
          width - (assembly ? 0.012 : 0.035),
          (width - (assembly ? 0.012 : 0.035)) / ratio,
          1,
        );
        face.position.z = assembly ? 0.012 : 0.054;
        group.add(face);
        const shadow = new THREE.Mesh(
          plane,
          assembly ? shadowMaterial.clone() : shadowMaterial,
        );
        if (assembly) materials.push(shadow.material);
        shadow.scale.set(width * 1.19, (width / ratio) * 1.3, 1);
        shadow.position.set(
          assembly ? 0.02 : 0.08,
          assembly ? -0.06 : -0.11,
          -0.075,
        );
        group.userData.face = material;
        group.add(shadow);
        scene.add(group);
        return group;
      }
      if (!assembly)
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
      if (assembly) {
        const artwork = createAssemblyArtwork(
          invalidate,
          quality === "low" ? 1024 : 1536,
        );
        textureCleanup.push(artwork.dispose);
        artwork.slides.forEach((texture, index) => {
          const group = makeBoard(texture, 1.6, index === 0 ? 4.7 : 3.85);
          const pose = {
            x: 0,
            y: 0,
            z: -0.1 - index * 0.3,
            ry: -0.12,
            rz: 0.02,
            scale: 0.001,
            opacity: 0,
          };
          boards.push({ group, pose, reveal: 1 });
        });
        const starts = [
          { x: -1.75, y: 1.05, z: 0.65, ry: 0.16, rz: 0.045 },
          { x: 1.75, y: 0.22, z: -0.2, ry: -0.2, rz: -0.045 },
          { x: -1.5, y: -1.35, z: 0.9, ry: 0.12, rz: -0.05 },
        ];
        artwork.pieces.forEach((texture, index) => {
          const region = assemblyRegions[index];
          const group = makeBoard(
            texture,
            region.width / region.height,
            (region.width / 1536) * 4.7,
          );
          fragments.push({
            group,
            pose: { ...starts[index], scale: 0.94, opacity: 0 },
          });
        });
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
          rig.z +
            (1 - entrance.value) * (assembly ? 0.6 : 2.4) +
            (assembly
              ? Math.max(
                  0,
                  (compactAssembly ? 6.2 : 7.3) /
                    (2 *
                      Math.tan(THREE.MathUtils.degToRad(39 / 2)) *
                      camera.aspect) -
                    8.8,
                )
              : 0),
        );
        const fieldOfView = assembly
          ? 39
          : (camera.aspect < 1 ? 49 : 39) + (8.8 - rig.z) * 0.72;
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
          const compactSide =
            assembly && compactAssembly && index > 0 && index < boards.length;
          group.position.set(
            pose.x * (compactSide ? 0.75 : 1) + damped.x * 0.1 * depth,
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
          if (assembly) {
            const opacity = pose.opacity ?? 1;
            group.visible = opacity > 0.001;
            group.children.forEach((child, i) => {
              const material = (child as THREE.Mesh).material as THREE.Material;
              material.transparent = true;
              material.opacity = opacity * (i === 2 ? 0.12 : 1);
              // Keep depth testing stable while fading in isolated pieces.
              material.depthWrite = i !== 2;
            });
          }
          group.scale.setScalar(
            Math.max(
              0.001,
              pose.scale * entrance.value * reveal * (compactSide ? 0.86 : 1),
            ),
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
      if (assembly) {
        fragments.forEach(({ pose }, index) => {
          const region = assemblyRegions[index];
          intro
            .to(
              pose,
              { opacity: 1, scale: 1, duration: 0.9, ease: "power3.out" },
              0.18 + index * 0.23,
            )
            .to(
              pose,
              {
                x: ((region.x + region.width / 2) / 1536 - 0.5) * 4.7,
                y: (0.5 - (region.y + region.height / 2) / 960) * (4.7 / 1.6),
                z: 0.35,
                ry: 0,
                rz: 0,
                duration: 1.8,
                ease: "power3.inOut",
              },
              2.15 + index * 0.16,
            );
        });
        // Swap matching artwork in one frame: crossfading overlapping card backs
        // changes their compositing/depth order and briefly washes out the image.
        intro
          .set(
            fragments.map(({ pose }) => pose),
            { opacity: 0 },
            4.5,
          )
          .set(
            boards[0].pose,
            { scale: 1, ry: 0, rz: 0, z: 0.35, opacity: 1 },
            4.5,
          )
          .to(
            boards[0].pose,
            {
              x: -0.12,
              y: 0.08,
              z: 0.65,
              ry: -0.14,
              rz: 0.025,
              duration: 1.8,
              ease: "power3.inOut",
            },
            4.95,
          );
        boards.slice(1).forEach(({ pose }, index) => {
          intro.set(pose, { scale: 1, opacity: 1 }, 4.95).to(
            pose,
            {
              x: index === 0 ? -1.62 : 1.55,
              y: index === 0 ? 0.7 : -0.52,
              z: index === 0 ? -1.3 : -1.1,
              ry: index === 0 ? 0.18 : -0.25,
              rz: index === 0 ? 0.065 : -0.055,
              duration: 1.8,
              ease: "power3.inOut",
            },
            4.95 + index * 0.15,
          );
        });
        intro.to(
          rig,
          { z: 9.15, x: 0.08, y: 0.12, duration: 6.6, ease: "sine.inOut" },
          0.25,
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
      replay.current = () => {
        pointerPosition = null;
        pointer.x = pointer.y = damped.x = damped.y = 0;
        last = slowFrames = 0;
        activeTween = true;
        intro.restart();
        invalidate();
      };
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
        compactAssembly = width < 480;
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
        replay.current = null;
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
        roundedFace?.dispose();
        scene.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    },
    {
      scope: host,
      dependencies: [templates, mode],
      revertOnUpdate: true,
    },
  );
  useEffect(() => {
    if (previousRevision.current !== revision) {
      previousRevision.current = revision;
      replay.current?.();
    }
  }, [revision]);
  return <div className="slide-scene" ref={host} />;
}
