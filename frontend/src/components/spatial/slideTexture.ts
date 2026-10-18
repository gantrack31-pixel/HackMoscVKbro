import * as THREE from "three";
import type { Template } from "../../types";

type Invalidate = () => void;
/** Textures use actual template metadata and the original first-slide image where available. */
export function slideTexture(
  template: Template,
  invalidate: Invalidate,
  textureSize = 1920,
) {
  const canvas = document.createElement("canvas");
  const resolution = Math.max(1024, Math.min(4096, textureSize));
  canvas.width = resolution;
  canvas.height = Math.max(512, Math.min(4096, Math.round(resolution / template.metadata.ratio)));
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let disposed = false;
  const draw = () => {
    const { width: w, height: h } = canvas;
    const meta = template.metadata;
    const background =
      template.id === "education"
        ? "#cef776"
        : template.id === "workspace"
          ? "#e0f3ff"
          : template.id === "tech"
            ? meta.accent
            : meta.background || "#ffffff";
    const ink = template.id === "tech" ? "#ffffff" : "#0f172a";
    context.fillStyle = background;
    context.fillRect(0, 0, w, h);
    context.fillStyle = ink;
    context.font = "650 25px Manrope, sans-serif";
    context.fillText(template.name, 58, 65, w - 120);
    context.font = "750 59px Manrope, sans-serif";
    const words = (meta.cover_title || template.name).split(/\s+/);
    let line = "",
      y = h * 0.34;
    for (const word of words) {
      if (context.measureText(line + word).width > w * 0.72 && line) {
        context.fillText(line, 58, y);
        y += 69;
        line = "";
      }
      if (y < h - 100) line += word + " ";
    }
    context.fillText(line, 58, Math.min(y, h - 100), w * 0.8);
    context.globalAlpha = 0.18;
    [0, 1, 2].forEach((i) => {
      context.fillRect(
        w * 0.72 + i * w * 0.075,
        h * 0.73 - i * h * 0.12,
        w * 0.045,
        h * 0.13 + i * h * 0.12,
      );
    });
    context.globalAlpha = 0.5;
    context.fillRect(58, h - 75, w * 0.43, 3);
    context.font = "500 17px Manrope, sans-serif";
    context.fillText(meta.category.toUpperCase(), 58, h - 32, w - 120);
    context.globalAlpha = 1;
    texture.needsUpdate = true;
    invalidate();
  };
  draw();
  if (template.preview_url) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      context.fillStyle = template.metadata.background || "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const scale = Math.min(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const w = image.width * scale,
        h = image.height * scale;
      context.drawImage(
        image,
        (canvas.width - w) / 2,
        (canvas.height - h) / 2,
        w,
        h,
      );
      texture.needsUpdate = true;
      invalidate();
    };
    image.src = template.preview_url;
    return {
      texture,
      dispose: () => {
        disposed = true;
        image.onload = null;
        image.onerror = null;
        texture.dispose();
      },
    };
  }
  void document.fonts.ready.then(() => {
    if (!disposed) draw();
  });
  return {
    texture,
    dispose: () => {
      disposed = true;
      texture.dispose();
    },
  };
}
