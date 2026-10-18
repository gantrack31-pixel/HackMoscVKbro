import * as THREE from "three";

export type Paint = (context: CanvasRenderingContext2D, width: number, height: number) => void;
export type Position = readonly [number, number, number];
export type OrbitModuleSpec = {
  width: number;
  height: number;
  orbit: Position;
  target: Position;
  phase: number;
  paint: Paint;
  desktopOnly?: boolean;
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

export function createTexture(width: number, height: number, paint: Paint) {
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

export const paintBoard: Paint = (ctx, w, h) => {
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
};

export const paintShadow: Paint = (ctx, w, h) => {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
  gradient.addColorStop(0, "#17234724");
  gradient.addColorStop(1, "#17234700");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
};

const paintConcept: Paint = (ctx, w, h) => {
  rounded(ctx, 0, 0, w, h, 12, "#ffffff");
  rounded(ctx, 20, h / 2 - 7, 14, 14, 7, blue);
  ctx.fillStyle = blue; ctx.font = "800 28px Manrope, sans-serif";
  ctx.fillText("01 / КОНЦЕПЦИЯ", 49, h / 2 + 10);
};

const paintHeadline: Paint = (ctx, w, h) => {
  rounded(ctx, 0, 0, w, h, 12, "#ffffff");
  ctx.fillStyle = ink; ctx.font = "800 56px Manrope, sans-serif";
  ctx.fillText("Идеи становятся", 24, h * 0.43);
  ctx.fillText("историей.", 24, h * 0.78);
  rounded(ctx, 25, h - 18, 106, 5, 2, coral);
};

const paintChart: Paint = (ctx, w, h) => {
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
};

const paintIllustration: Paint = (ctx, w, h) => {
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
};

const paintIcon: Paint = (ctx, w, h) => {
  rounded(ctx, 0, 0, w, h, 18, blue);
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 10; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.51); ctx.lineTo(w * 0.45, h * 0.66); ctx.lineTo(w * 0.72, h * 0.31); ctx.stroke();
};

const paintCredit: Paint = (ctx, w, h) => {
  rounded(ctx, 0, 0, w, h, 9, "#ffffff");
  ctx.fillStyle = "#7d8ba4"; ctx.font = "700 26px Manrope, sans-serif";
  ctx.fillText("СОЗДАНО В DECKLY.AI", 20, h * 0.62);
};

export const moduleSpecs: readonly OrbitModuleSpec[] = [
  { width: 1.32, height: 0.32, orbit: [-1.55, 1.78, 0.72], target: [-1.57, 1.13, 0.13], phase: 0.1, paint: paintConcept },
  { width: 2.28, height: 0.79, orbit: [-1.82, 0.79, 1.05], target: [-1.16, 0.59, 0.14], phase: 1.3, paint: paintHeadline },
  { width: 2.17, height: 0.92, orbit: [-1.77, -1.59, 0.48], target: [-1.18, -0.37, 0.14], phase: 2.5, paint: paintChart },
  { width: 2.03, height: 1.63, orbit: [1.88, 0.35, 0.75], target: [1.22, -0.06, 0.14], phase: 3.8, paint: paintIllustration },
  { width: 0.51, height: 0.51, orbit: [1.82, 1.8, 0.88], target: [1.95, 1.08, 0.14], phase: 5.1, paint: paintIcon },
  { width: 1.62, height: 0.27, orbit: [1.63, -1.7, -0.55], target: [-1.44, -1.09, 0.14], phase: 6.1, paint: paintCredit, desktopOnly: true },
];
