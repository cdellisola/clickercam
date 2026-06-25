// Bambu-style image → model wizard. Three modal steps:
//   1) Preprocessing  — crop ratio, keep background, thickness, tone/color sliders
//   2) Conversion preview — shows the processed (matte-applied) result
//   3) Auto matching  — pick 4 / 8 / 12 colors, preview the color→slot mapping
// On confirm it hands the adjusted image (background intact) + params back; the
// caller runs the trace/build pipeline (background removal is re-derived there).
import type { RgbaImage } from '../image/decode';
import { preprocessImage } from '../image/adjust';
import { removeBackground } from '../image/matte';
import { quantize, type QuantizeResult } from '../image/quantize';
import { DEFAULT_PREPROCESS, FILAMENTS, type CropRatio, type PreprocessParams, type RGB } from '../types';

export interface WizardResult {
  adjusted: RgbaImage; // cropped + tone-adjusted, background still present
  preprocess: PreprocessParams;
  colorCount: number;
  colorMode: 'normal' | 'limited';
  limitedColors?: RGB[];
  paletteOverrides?: RGB[];
}

interface WizardOpts {
  baseImage: RgbaImage;
  initialColorCount: number;
  onComplete(result: WizardResult): void;
  onCancel?(): void;
}

const SLIDERS: [keyof PreprocessParams, string][] = [
  ['exposure', 'Exposure'],
  ['contrast', 'Contrast'],
  ['saturation', 'Saturation'],
  ['brightness', 'Brightness'],
  ['whiteBalance', 'White Balance'],
  ['highlights', 'Highlights'],
  ['shadows', 'Shadows'],
];

const RATIOS: [CropRatio, string][] = [
  ['free', 'Free'],
  ['1:1', '1:1'],
  ['4:3', '4:3'],
  ['3:2', '3:2'],
  ['16:9', '16:9'],
];

function imageToCanvas(img: RgbaImage): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

export function runWizard(opts: WizardOpts) {
  const params: PreprocessParams = { ...DEFAULT_PREPROCESS };
  let colorCount = [4, 8, 12].includes(opts.initialColorCount) ? opts.initialColorCount : 4;
  let colorMode: 'normal' | 'limited' = 'normal';
  let limitedColors: RGB[] = [];
  let wizardPaletteOverrides: RGB[] = [];

  const overlay = document.createElement('div');
  overlay.className = 'wz-overlay';
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  const cancel = () => {
    close();
    opts.onCancel?.();
  };

  // Adjusted image (background intact) for the current params.
  const adjusted = () => preprocessImage(opts.baseImage, params);
  // Processed image used for preview / matching (background removed unless kept).
  const processed = (): RgbaImage => {
    const a = adjusted();
    if (!params.keepBackground) removeBackground(a);
    return a;
  };

  function hexRgb(hex: string): RGB {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function getQuantizedImage(img: RgbaImage, q: QuantizeResult, overrides: RGB[]): RgbaImage {
    const data = new Uint8ClampedArray(img.width * img.height * 4);
    for (let i = 0; i < q.indices.length; i++) {
      const idx = q.indices[i];
      if (idx === -1) {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 0;
      } else {
        const rgb = overrides[idx] || q.palette[idx].rgb;
        data[i * 4] = rgb[0];
        data[i * 4 + 1] = rgb[1];
        data[i * 4 + 2] = rgb[2];
        data[i * 4 + 3] = 255;
      }
    }
    return { data, width: img.width, height: img.height };
  }

  function setupInteractivePreview(canvasEl: HTMLCanvasElement, q: QuantizeResult, img: RgbaImage, onUpdate: () => void) {
    canvasEl.style.cursor = 'pointer';
    canvasEl.title = 'Click any part of the image to change its color';
    canvasEl.addEventListener('click', (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const imgX = Math.floor((clickX / rect.width) * img.width);
      const imgY = Math.floor((clickY / rect.height) * img.height);
      
      if (imgX >= 0 && imgX < img.width && imgY >= 0 && imgY < img.height) {
        const pixelIdx = imgY * img.width + imgX;
        const colorIdx = q.indices[pixelIdx];
        if (colorIdx !== -1) {
          showColorSelector(colorIdx, e.clientX, e.clientY, onUpdate);
        }
      }
    });
  }

  function showColorSelector(colorIdx: number, x: number, y: number, onUpdate: () => void) {
    const existing = document.getElementById('wzColorPopover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.id = 'wzColorPopover';
    popover.style.position = 'fixed';
    popover.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    popover.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    popover.style.background = 'var(--panel)';
    popover.style.border = '1px solid var(--line)';
    popover.style.borderRadius = '12px';
    popover.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    popover.style.padding = '12px';
    popover.style.zIndex = '1000';
    popover.style.display = 'flex';
    popover.style.flexDirection = 'column';
    popover.style.gap = '8px';
    popover.style.width = '200px';

    const label = document.createElement('div');
    label.textContent = `Select color for slot ${colorIdx + 1}:`;
    label.style.fontSize = '12px';
    label.style.fontWeight = '600';
    label.style.color = 'var(--text)';
    popover.appendChild(label);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gap = '6px';

    const options = colorMode === 'limited' ? limitedColors : FILAMENTS.map(f => hexRgb(f[1]));

    options.forEach((rgb) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.width = '32px';
      btn.style.height = '32px';
      btn.style.borderRadius = '50%';
      btn.style.background = rgbHex(rgb);
      btn.style.border = '1px solid rgba(0,0,0,0.15)';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'transform 0.1s';
      
      btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.1)');
      btn.addEventListener('mouseleave', () => btn.style.transform = 'none');
      btn.addEventListener('click', () => {
        wizardPaletteOverrides[colorIdx] = rgb;
        popover.remove();
        onUpdate();
      });
      grid.appendChild(btn);
    });

    popover.appendChild(grid);

    const dismiss = (e: MouseEvent) => {
      if (!popover.contains(e.target as Node)) {
        popover.remove();
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', dismiss);
    }, 50);

    document.body.appendChild(popover);
  }

  function rgbHex(rgb: RGB): string {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  // ---------- Step 0: color mode selection ----------
  function stepChooseColorMode() {
    overlay.innerHTML = `
      <div class="wz-modal" style="max-width: 480px; width: 90vw;">
        <div class="wz-head" style="text-align: center;">Color Generation Mode</div>
        <div class="wz-body col" style="gap: 20px; padding: 25px 30px;">
          <div class="wz-sub" style="text-align: center; font-size: 15px; margin-bottom: 5px;">
            Choose how you want to handle the colors for your 3D printed clicker:
          </div>
          
          <button class="mode-select-btn" id="modeNormal" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); width: 100%; cursor: pointer; transition: all 0.15s ease; border-style: solid;">
            <strong style="font-size: 16px; color: var(--text); margin-bottom: 6px;">Generate Normally</strong>
            <span style="font-size: 13px; color: var(--muted); line-height: 1.4;">
              Automatically extracts colors from the image (median-cut). You can map them to filaments later.
            </span>
          </button>
          
          <button class="mode-select-btn" id="modeLimited" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); width: 100%; cursor: pointer; transition: all 0.15s ease; border-style: solid;">
            <strong style="font-size: 16px; color: var(--text); margin-bottom: 6px;">Use Limited Colors</strong>
            <span style="font-size: 13px; color: var(--muted); line-height: 1.4;">
              Choose the colors of the filament you have available, so we generate the image using <strong>just</strong> the colors that you have and can print in.
            </span>
          </button>
        </div>
        <div class="wz-foot" style="justify-content: center;">
          <button id="wzCancel" style="min-width: 120px;">Cancel</button>
        </div>
      </div>`;

    const btnNormal = overlay.querySelector('#modeNormal')!;
    const btnLimited = overlay.querySelector('#modeLimited')!;
    
    const addEffects = (btn: HTMLElement) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--accent)';
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = 'var(--line)';
        btn.style.transform = 'none';
        btn.style.boxShadow = 'none';
      });
    };
    addEffects(btnNormal as HTMLElement);
    addEffects(btnLimited as HTMLElement);

    btnNormal.addEventListener('click', () => {
      colorMode = 'normal';
      stepPreprocess();
    });

    btnLimited.addEventListener('click', () => {
      colorMode = 'limited';
      stepLimitedColorPicker();
    });

    overlay.querySelector('#wzCancel')!.addEventListener('click', cancel);
  }

  // ---------- Step 0.5: limited color picker ----------
  function stepLimitedColorPicker() {
    overlay.innerHTML = `
      <div class="wz-modal" style="max-width: 500px; width: 90vw;">
        <div class="wz-head">Select Available Filaments</div>
        <div class="wz-body col" style="gap: 15px;">
          <div class="wz-sub" style="font-size: 14px; text-align: left; width: 100%;">
            Choose the colors of the filament you have available. We will generate the image using <strong>just</strong> the colors that you have and can print in.
          </div>
          
          <div style="font-size: 13px; font-weight: 600; width: 100%; display: flex; justify-content: space-between;">
            <span>Select 2 to 12 colors:</span>
            <span id="wzSelCount">0 selected</span>
          </div>
          
          <div class="wz-filament-grid" id="wzFilGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; margin: 10px 0;">
            ${FILAMENTS.map(([name, hex], i) => `
              <button class="wz-fil-btn" data-idx="${i}" data-hex="${hex}" type="button" style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); cursor: pointer; transition: all 0.12s; border-style: solid;">
                <span style="display: block; width: 24px; height: 24px; border-radius: 50%; background: ${hex}; border: 1px solid rgba(0,0,0,0.15);"></span>
                <span style="font-size: 11px; color: var(--text); font-weight: 500; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${name}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="wz-foot">
          <button id="wzBackMode">Back</button>
          <button class="primary" id="wzNextMode" disabled>Next</button>
        </div>
      </div>`;

    const btns = overlay.querySelectorAll<HTMLButtonElement>('.wz-fil-btn');
    const selectedIndices = new Set<number>();
    const countEl = overlay.querySelector('#wzSelCount')!;
    const nextBtn = overlay.querySelector<HTMLButtonElement>('#wzNextMode')!;

    const updateSelection = () => {
      countEl.textContent = `${selectedIndices.size} selected`;
      if (selectedIndices.size >= 2 && selectedIndices.size <= 12) {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
      } else {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
      }
      
      btns.forEach((btn, idx) => {
        const isSelected = selectedIndices.has(idx);
        btn.style.borderColor = isSelected ? 'var(--accent)' : 'var(--line)';
        btn.style.background = isSelected ? 'rgba(142, 68, 173, 0.1)' : 'var(--panel-2)';
        btn.style.borderWidth = isSelected ? '2px' : '1px';
      });
    };

    btns.forEach((btn) => {
      const idx = parseInt(btn.dataset.idx!);
      btn.addEventListener('click', () => {
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx);
        } else {
          if (selectedIndices.size < 12) {
            selectedIndices.add(idx);
          }
        }
        updateSelection();
      });
    });

    overlay.querySelector('#wzBackMode')!.addEventListener('click', stepChooseColorMode);
    nextBtn.addEventListener('click', () => {
      limitedColors = Array.from(selectedIndices).map(idx => hexRgb(FILAMENTS[idx][1]));
      stepPreprocess();
    });

    updateSelection();
  }

  // ---------- Step 1: preprocessing ----------
  function stepPreprocess() {
    overlay.innerHTML = `
      <div class="wz-modal lg">
        <div class="wz-head">Image Preprocessing</div>
        <div class="wz-body">
          <div class="wz-canvas checker" id="wzPrev"></div>
          <div class="wz-controls">
            <div class="wz-label">Crop Ratio</div>
            <div class="seg" id="wzRatio">${RATIOS.map(
              ([k, l]) => `<button data-r="${k}">${l}</button>`,
            ).join('')}</div>

            <div class="wz-row spread">
              <span class="wz-label">Keep Background</span>
              <label class="toggle"><input type="checkbox" id="wzKeep" /><span class="track"></span></label>
            </div>

            <div class="wz-row spread">
              <span class="wz-label">Image Thickness</span>
              <span class="wz-num"><input type="number" id="wzThick" min="0.2" max="10" step="0.2" /> mm</span>
            </div>

            <div class="wz-label">Image Adjustment</div>
            ${SLIDERS.map(
              ([k, l]) => `
              <div class="wz-adj">
                <span>${l}</span>
                <input type="range" data-k="${k}" min="0" max="2" step="0.05" />
                <span class="wz-num"><input type="number" data-n="${k}" min="0" max="2" step="0.05" /></span>
              </div>`,
            ).join('')}
          </div>
        </div>
        <div class="wz-foot">
          <button id="wzCancel">Cancel</button>
          <button class="primary" id="wzNext">Confirm</button>
        </div>
      </div>`;

    const prev = overlay.querySelector<HTMLElement>('#wzPrev')!;
    const redraw = () => {
      prev.innerHTML = '';
      const adj = adjusted();
      let displayImg = adj;
      if (colorMode === 'limited' && limitedColors.length > 0) {
        const tempImg = { data: new Uint8ClampedArray(adj.data), width: adj.width, height: adj.height };
        if (!params.keepBackground) removeBackground(tempImg);
        const q = quantize(tempImg, limitedColors.length, limitedColors);
        if (wizardPaletteOverrides.length !== q.palette.length) {
          wizardPaletteOverrides = q.palette.map(p => p.rgb);
        }
        displayImg = getQuantizedImage(tempImg, q, wizardPaletteOverrides);
      }
      prev.appendChild(imageToCanvas(displayImg));
    };
    redraw();

    for (const b of overlay.querySelectorAll<HTMLElement>('#wzRatio button')) {
      b.classList.toggle('active', b.dataset.r === params.cropRatio);
      b.addEventListener('click', () => {
        params.cropRatio = b.dataset.r as CropRatio;
        for (const x of overlay.querySelectorAll('#wzRatio button')) x.classList.remove('active');
        b.classList.add('active');
        redraw();
      });
    }

    const keep = overlay.querySelector<HTMLInputElement>('#wzKeep')!;
    keep.checked = params.keepBackground;
    keep.addEventListener('change', () => (params.keepBackground = keep.checked));

    const thick = overlay.querySelector<HTMLInputElement>('#wzThick')!;
    thick.value = String(params.thicknessMm);
    thick.addEventListener('input', () => (params.thicknessMm = +thick.value || 1));

    let raf = 0;
    const scheduleRedraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(redraw);
    };
    for (const [k] of SLIDERS) {
      const range = overlay.querySelector<HTMLInputElement>(`input[data-k="${k}"]`)!;
      const num = overlay.querySelector<HTMLInputElement>(`input[data-n="${k}"]`)!;
      range.value = num.value = String(params[k]);
      const apply = (v: number) => {
        (params[k] as number) = v;
        range.value = num.value = String(v);
        scheduleRedraw();
      };
      range.addEventListener('input', () => apply(+range.value));
      num.addEventListener('input', () => apply(+num.value));
    }

    overlay.querySelector('#wzCancel')!.addEventListener('click', cancel);
    overlay.querySelector('#wzNext')!.addEventListener('click', stepConversion);
  }

  // ---------- Step 2: conversion preview ----------
  function stepConversion() {
    overlay.innerHTML = `
      <div class="wz-modal">
        <div class="wz-head">${colorMode === 'limited' ? 'Conversion Preview (Limited Colors)' : 'Image Conversion Preview'}</div>
        <div class="wz-body center">
          <div class="wz-canvas checker big" id="wzConv"></div>
        </div>
        <div class="wz-foot">
          <button id="wzBack">↻ Try Again</button>
          <button class="primary" id="wzNext">${colorMode === 'limited' ? 'Confirm' : 'Next'}</button>
        </div>
      </div>`;
    
    const proc = processed();
    
    let q: QuantizeResult | null = null;
    if (colorMode === 'limited' && limitedColors.length > 0) {
      q = quantize({ data: new Uint8ClampedArray(proc.data), width: proc.width, height: proc.height }, limitedColors.length, limitedColors);
      if (wizardPaletteOverrides.length !== q.palette.length) {
        wizardPaletteOverrides = q.palette.map(p => p.rgb);
      }
    }

    const render = () => {
      const convEl = overlay.querySelector('#wzConv')!;
      convEl.innerHTML = '';
      let displayImg = proc;
      if (colorMode === 'limited' && q) {
        displayImg = getQuantizedImage(proc, q, wizardPaletteOverrides);
      }
      const canvas = imageToCanvas(displayImg);
      convEl.appendChild(canvas);
      
      if (colorMode === 'limited' && q) {
        setupInteractivePreview(canvas, q, proc, render);
      }
    };

    render();
    
    overlay.querySelector('#wzBack')!.addEventListener('click', () => {
      if (colorMode === 'limited') {
        stepLimitedColorPicker();
      } else {
        stepPreprocess();
      }
    });

    overlay.querySelector('#wzNext')!.addEventListener('click', () => {
      if (colorMode === 'limited') {
        close();
        opts.onComplete({
          adjusted: adjusted(),
          preprocess: { ...params },
          colorCount: limitedColors.length,
          colorMode,
          limitedColors,
          paletteOverrides: wizardPaletteOverrides,
        });
      } else {
        stepMatching();
      }
    });
  }

  // ---------- Step 3: auto matching ----------
  function stepMatching() {
    overlay.innerHTML = `
      <div class="wz-modal">
        <div class="wz-head">Auto Matching</div>
        <div class="wz-body col">
          <div class="seg center" id="wzCount">
            ${[4, 8, 12].map((n) => `<button data-n="${n}">${n} Color</button>`).join('')}
          </div>
          <div class="wz-sub">Colors are automatically matched to the chosen number. Click any part of the preview to change its color.</div>
          <div class="wz-canvas checker" id="wzMatchPrev"></div>
          <div class="wz-chips" id="wzChips"></div>
        </div>
        <div class="wz-foot">
          <button id="wzCancel">Cancel</button>
          <button class="primary" id="wzDone">Confirm</button>
        </div>
      </div>`;

    const proc = processed();

    const renderChipsAndPreview = () => {
      const q = quantize({ data: new Uint8ClampedArray(proc.data), width: proc.width, height: proc.height }, colorCount);

      if (wizardPaletteOverrides.length !== q.palette.length) {
        wizardPaletteOverrides = q.palette.map(p => p.rgb);
      }

      const prevEl = overlay.querySelector('#wzMatchPrev')!;
      prevEl.innerHTML = '';
      const displayImg = getQuantizedImage(proc, q, wizardPaletteOverrides);
      const canvas = imageToCanvas(displayImg);
      prevEl.appendChild(canvas);

      setupInteractivePreview(canvas, q, proc, renderChipsAndPreview);

      const chips = overlay.querySelector<HTMLElement>('#wzChips')!;
      chips.innerHTML = q.palette
        .map((p, i) => {
          const rgb = wizardPaletteOverrides[i] || p.rgb;
          const hex = rgbHex(rgb);
          return `<span class="wz-chip"><span class="dot" style="background:${hex}"></span>→<span class="slot">${i + 1}</span></span>`;
        })
        .join('');
    };

    for (const b of overlay.querySelectorAll<HTMLElement>('#wzCount button')) {
      b.classList.toggle('active', +b.dataset.n! === colorCount);
      b.addEventListener('click', () => {
        colorCount = +b.dataset.n!;
        for (const x of overlay.querySelectorAll('#wzCount button')) x.classList.remove('active');
        b.classList.add('active');
        wizardPaletteOverrides = [];
        renderChipsAndPreview();
      });
    }
    renderChipsAndPreview();

    overlay.querySelector('#wzCancel')!.addEventListener('click', cancel);
    overlay.querySelector('#wzDone')!.addEventListener('click', () => {
      close();
      opts.onComplete({
        adjusted: adjusted(),
        preprocess: { ...params },
        colorCount,
        colorMode: 'normal',
        paletteOverrides: wizardPaletteOverrides,
      });
    });
  }

  stepChooseColorMode();
}
