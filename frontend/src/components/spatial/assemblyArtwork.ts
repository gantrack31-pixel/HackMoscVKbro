import * as THREE from "three";

// Regions of the same artwork meet exactly: the floating pieces become the slide.
export const assemblyRegions = [
  { x: 0, y: 0, width: 768, height: 580 },
  { x: 768, y: 0, width: 768, height: 960 },
  { x: 0, y: 580, width: 768, height: 380 },
];

export function createAssemblyArtwork(
  invalidate: () => void,
  resolution: number,
) {
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = Math.round((resolution * 960) / 1536);
    return canvas;
  });
  const slides = canvases.map((canvas) => new THREE.CanvasTexture(canvas));
  const pieces = assemblyRegions.map((region) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((region.width / 1536) * resolution);
    canvas.height = Math.round((region.height / 1536) * resolution);
    return new THREE.CanvasTexture(canvas);
  });
  let disposed = false;
  function draw() {
    if (disposed) return;
    canvases.forEach((canvas, index) => {
      const c = canvas.getContext("2d")!;
      c.setTransform(canvas.width / 1536, 0, 0, canvas.height / 960, 0, 0);
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, 1536, 960);
      c.fillStyle = "#0077ff";
      c.font = "750 26px Manrope, sans-serif";
      c.fillText("DECKLY.AI", 72, 91);
      c.fillStyle = "#738296";
      c.font = "550 18px Manrope, sans-serif";
      c.fillText(
        ["01 / ИСТОРИЯ", "02 / СТРУКТУРА", "03 / РЕЗУЛЬТАТ"][index],
        72,
        145,
      );
      c.fillStyle = "#14243a";
      c.font = "700 69px Manrope, sans-serif";
      const titles = [
        ["Идеи обретают", "свою форму."],
        ["Всё начинается", "с главного."],
        ["Каждая деталь", "на своём месте."],
      ][index];
      titles.forEach((line, i) => c.fillText(line, 72, 292 + i * 88));
      c.fillStyle = "#7c8898";
      c.font = "450 24px Manrope, sans-serif";
      c.fillText("От первого замысла — к целой истории", 76, 466);
      c.fillStyle = "#e9eef5";
      c.fillRect(76, 550, 610, 2);
      c.fillStyle = "#14243a";
      c.font = "650 23px Manrope, sans-serif";
      c.fillText("Ясность в каждой детали", 76, 642);
      const heights = [70, 113, 94, 153, 184];
      heights.forEach((h, i) => {
        c.fillStyle = i === 4 ? "#0077ff" : "#dbeaff";
        c.beginPath();
        c.roundRect(78 + i * 119, 872 - h, 76, h, [10, 10, 0, 0]);
        c.fill();
      });
      c.fillStyle = "#91a0b2";
      c.font = "500 15px Manrope, sans-serif";
      c.fillText("МЫСЛЬ", 76, 919);
      c.fillText("ИСТОРИЯ", 555, 919);
      // An editorial landscape: restrained depth, light and a clear blue accent.
      c.save();
      c.beginPath();
      c.rect(768, 0, 768, 960);
      c.clip();
      const sky = c.createLinearGradient(768, 0, 1400, 960);
      sky.addColorStop(0, "#e8f3ff");
      sky.addColorStop(0.65, "#a8d1ff");
      sky.addColorStop(1, "#609ff3");
      c.fillStyle = sky;
      c.fillRect(768, 0, 768, 960);
      c.fillStyle = "#ffffffb8";
      c.beginPath();
      c.arc(1290, 231, 91, 0, Math.PI * 2);
      c.fill();
      [
        ["#8ebbef", 695, 1300, 300],
        ["#458de6", 830, 1000, 340],
        ["#0069e7", 1030, 1380, 470],
      ].forEach(([color, y, x, radius]) => {
        c.fillStyle = color as string;
        c.beginPath();
        c.ellipse(
          x as number,
          y as number,
          radius as number,
          355,
          -0.37,
          0,
          Math.PI * 2,
        );
        c.fill();
      });
      c.strokeStyle = "#ffffff70";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(1200, 980, 400, 240, -0.37, Math.PI, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#ffffff";
      c.font = "600 19px Manrope, sans-serif";
      c.fillText("ПРОСТРАНСТВО ДЛЯ ИДЕЙ", 834, 899);
      c.restore();
      slides[index].needsUpdate = true;
    });
    pieces.forEach((texture, i) => {
      const { x, y, width, height } = assemblyRegions[i];
      const canvas = texture.image as HTMLCanvasElement;
      const scale = canvases[0].width / 1536;
      canvas
        .getContext("2d")!
        .drawImage(
          canvases[0],
          x * scale,
          y * scale,
          width * scale,
          height * scale,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      texture.needsUpdate = true;
    });
    invalidate();
  }
  draw();
  void document.fonts.ready.then(draw);
  return {
    slides,
    pieces,
    dispose() {
      disposed = true;
      [...slides, ...pieces].forEach((texture) => texture.dispose());
    },
  };
}
