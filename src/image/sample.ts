// A synthetic multi-color test image (transparent background) so the full
// pipeline can be exercised without a manual upload. Doubles as a "Try sample".
import type { RgbaImage } from './decode';

export function makeSampleImage(): RgbaImage {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Face (yellow)
  ctx.fillStyle = '#f4c430';
  ctx.beginPath();
  ctx.arc(128, 132, 96, 0, Math.PI * 2);
  ctx.fill();

  // Cheeks (red)
  ctx.fillStyle = '#e8554e';
  ctx.beginPath();
  ctx.arc(86, 150, 18, 0, Math.PI * 2);
  ctx.arc(170, 150, 18, 0, Math.PI * 2);
  ctx.fill();

  // Eyes + smile (dark)
  ctx.fillStyle = '#241f1c';
  ctx.beginPath();
  ctx.arc(98, 110, 12, 0, Math.PI * 2);
  ctx.arc(158, 110, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#241f1c';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 138, 44, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export function makeHeartImage(): RgbaImage {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  
  ctx.fillStyle = '#e8554e';
  ctx.beginPath();
  ctx.moveTo(128, 70);
  ctx.bezierCurveTo(128, 66, 118, 40, 88, 40);
  ctx.bezierCurveTo(58, 40, 58, 85, 58, 85);
  ctx.bezierCurveTo(58, 120, 98, 160, 128, 195);
  ctx.bezierCurveTo(158, 160, 198, 120, 198, 85);
  ctx.bezierCurveTo(198, 85, 198, 40, 168, 40);
  ctx.bezierCurveTo(138, 40, 128, 66, 128, 70);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(95, 75, 10, 0, Math.PI * 2);
  ctx.fill();

  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export function makeStarImage(): RgbaImage {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f5c518';
  ctx.beginPath();
  const cx = 128;
  const cy = 128;
  const spikes = 5;
  const outerRadius = 85;
  const innerRadius = 38;
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#241f1c';
  ctx.beginPath();
  ctx.arc(110, 120, 6, 0, Math.PI * 2);
  ctx.arc(146, 120, 6, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#241f1c';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 125, 10, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export function makeGhostImage(): RgbaImage {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#0086d6';
  ctx.beginPath();
  ctx.arc(128, 110, 70, Math.PI, 0, false);
  ctx.lineTo(198, 180);
  ctx.lineTo(180, 170);
  ctx.lineTo(163, 180);
  ctx.lineTo(146, 170);
  ctx.lineTo(128, 180);
  ctx.lineTo(110, 170);
  ctx.lineTo(93, 180);
  ctx.lineTo(76, 170);
  ctx.lineTo(58, 180);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(105, 105, 15, 0, Math.PI * 2);
  ctx.arc(151, 105, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0a5cd5';
  ctx.beginPath();
  ctx.arc(112, 105, 7, 0, Math.PI * 2);
  ctx.arc(158, 105, 7, 0, Math.PI * 2);
  ctx.fill();

  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h };
}

export interface SampleInfo {
  name: string;
  creator: () => RgbaImage;
}

export const SAMPLES: SampleInfo[] = [
  { name: 'Cute Face', creator: makeSampleImage },
  { name: 'Retro Heart', creator: makeHeartImage },
  { name: 'Star Buddy', creator: makeStarImage },
  { name: 'Pac Ghost', creator: makeGhostImage },
];
