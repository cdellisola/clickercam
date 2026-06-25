// Sidebar UI. Plain DOM, no framework. Emits intent via callbacks; reflects
// state via update(). Color panel mirrors a filament-picker workflow: each
// detected color maps to a filament swatch + a height level (3D relief).
import type { BaseShapeKind, PaletteEntry, ViewMode } from '../types';
import type { SectionAxis } from '../viewer/viewer';
import { SAMPLES } from '../image/sample';
import type { RgbaImage } from '../image/decode';

export interface UiState {
  status: string;
  building: boolean;
  hasParts: boolean;
  colorCount: number;
  palette: PaletteEntry[];
  baseShape: BaseShapeKind;
  capWidthMm: number;
  topThickness: number;
  imageDepth: number;
  tolerance: number;
  smoothing: number;
  keychain: boolean;
  removeBg: boolean;
  view: ViewMode;
  showSwitch: boolean;
}

export interface UiCallbacks {
  onUpload(file: File): void;
  onSample(creator: () => RgbaImage): void;
  onColorCount(n: number): void;
  onSmoothing(v: number): void;
  onFilament(index: number, hex: string): void;
  onHeight(index: number, level: number): void;
  onShape(kind: BaseShapeKind): void;
  onWidth(mm: number): void;
  onTopThickness(mm: number): void;
  onImageDepth(mm: number): void;
  onTolerance(mm: number): void;
  onKeychain(on: boolean): void;
  onRemoveBg(on: boolean): void;
  onView(mode: ViewMode): void;
  onShowSwitch(on: boolean): void;
  onSection(axis: SectionAxis, pos: number): void;
  onExport(): void;
  onRenderPng(): void;
  onAiPrompt(): void;
  onSaveProject(): void;
  onLoadProject(file: File): void;
}

// Real filament rolls (Bambu Basic-ish). Color slots are assigned from THIS
// palette only — no freeform RGB, since each color is a physical spool.
const FILAMENTS: [string, string][] = [
  ['Black', '#161616'],
  ['White', '#f7f7f5'],
  ['Gray', '#8c8c90'],
  ['Silver', '#cfd0d2'],
  ['Red', '#c8102e'],
  ['Orange', '#ff6a13'],
  ['Yellow', '#f5c518'],
  ['Green', '#00ae42'],
  ['Cyan', '#0086d6'],
  ['Blue', '#0a5cd5'],
  ['Purple', '#8e44ad'],
  ['Pink', '#e6398b'],
  ['Brown', '#7a5230'],
  ['Beige', '#d9c8a9'],
];

const rgbHex = (rgb: [number, number, number]) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export function createUi(
  sidebarLeft: HTMLElement,
  sidebarRight: HTMLElement,
  statusEl: HTMLElement,
  cb: UiCallbacks
) {
  // Populate Left Sidebar (Settings + Preview)
  sidebarLeft.innerHTML = `
    <h1>Clicker Generator <span class="sub">image → printable clicker</span></h1>

    <div class="section">
      <span class="label">Preview &amp; View</span>
      <div class="tabs" id="viewTabs" role="tablist" style="margin-bottom: 12px;">
        <button class="tab active" data-view="assembled" type="button">Assembled</button>
        <button class="tab" data-view="exploded" type="button">Exploded</button>
      </div>
      <div class="switch-row">
        <span class="switch-label">Show MX switch</span>
        <label class="toggle"><input id="showswitch" type="checkbox" /><span class="slider"></span></label>
      </div>
    </div>

    <div class="section">
      <span class="label">1 · Colors &amp; Smoothing</span>
      <div class="field">
        <label for="ccount">Colors</label>
        <select id="ccount">
          <option value="2">2 Colors</option>
          <option value="3">3 Colors</option>
          <option value="4">4 Colors</option>
          <option value="5">5 Colors</option>
          <option value="6">6 Colors</option>
          <option value="7">7 Colors</option>
          <option value="8">8 Colors</option>
          <option value="9">9 Colors</option>
          <option value="10">10 Colors</option>
          <option value="11">11 Colors</option>
          <option value="12">12 Colors</option>
        </select>
      </div>
      <div class="prow">
        <label for="smooth">Smoothing</label>
        <input type="range" id="smooth" min="0" max="1" step="0.05" />
        <span class="val" id="smoothVal"></span>
      </div>
      <div class="palette" id="palette">
        <div class="hint">Load an image to pick colors.</div>
      </div>
    </div>

    <div class="section">
      <span class="label">2 · Shape &amp; Size</span>
      <div class="field">
        <label>Base style</label>
        <div class="tabs" id="shapeTypeTabs" role="tablist">
          <button class="tab" data-style="outline" type="button">Outline</button>
          <button class="tab" data-style="shape" type="button">Shape</button>
        </div>
      </div>
      <div class="field" id="shapeSelectField">
        <label for="shapeSelect">Shape geometry</label>
        <select id="shapeSelect">
          <option value="circle">Circle</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div class="prow">
        <label for="width">Cap width</label>
        <input type="range" id="width" min="20" max="70" step="1" />
        <span class="val" id="widthVal"></span>
      </div>
      <div class="prow">
        <label for="topthick">Top thickness</label>
        <input type="range" id="topthick" min="1" max="4" step="0.1" />
        <span class="val" id="topthickVal"></span>
      </div>
      <div class="prow">
        <label for="imgdepth">Image depth</label>
        <input type="range" id="imgdepth" min="0.2" max="3" step="0.1" />
        <span class="val" id="imgdepthVal"></span>
      </div>
      <div class="prow">
        <label for="tol">Fit tolerance</label>
        <input type="range" id="tol" min="0.2" max="0.8" step="0.05" />
        <span class="val" id="tolVal"></span>
      </div>
      <div class="switch-row">
        <span class="switch-label">Keychain loop</span>
        <label class="toggle"><input id="keychain" type="checkbox" /><span class="slider"></span></label>
      </div>
    </div>
  `;

  // Populate Right Sidebar (Import, Export)
  sidebarRight.innerHTML = `
    <div class="section">
      <span class="label">Image Import</span>
      <div class="drop" id="drop">
        Drop an image, or <u>click to browse</u><br/>
        <span style="font-size:10px; opacity:0.8; display:block; margin-top:4px;">PNG with transparency works best</span>
      </div>
      <input type="file" id="file" accept="image/*" hidden />
      <button class="secondary" id="sample" style="width:100%; margin-top:10px">Choose sample image</button>
      <div class="switch-row">
        <span class="switch-label">Remove background</span>
        <label class="toggle"><input id="removebg" type="checkbox" /><span class="slider"></span></label>
      </div>
    </div>

    <div class="section">
      <span class="label">Export</span>
      <button class="primary" id="export" style="width:100%; margin-bottom:10px">Download 3MF</button>
      <div class="btn-row" style="margin-bottom:8px">
        <button id="render" class="secondary">Save render PNG</button>
        <button id="aiPrompt" class="secondary">AI prompt</button>
      </div>
      <div class="btn-row">
        <button id="saveProj" class="secondary">Save project</button>
        <button id="loadProj" class="secondary">Load project</button>
        <input type="file" id="projFile" accept="application/json" hidden />
      </div>
    </div>
  `;

  // Global ID helper
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // --- Image ---
  const drop = $('drop');
  const file = $<HTMLInputElement>('file');
  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (file.files?.[0]) cb.onUpload(file.files[0]);
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) cb.onUpload(f);
  });

  // Choose Sample Picker Modal
  $('sample').addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'wz-overlay';
    modal.innerHTML = `
      <div class="wz-modal" style="width: 460px;">
        <div class="wz-head">Choose Sample Image</div>
        <div class="wz-body">
          <div class="sample-grid">
            ${SAMPLES.map((s, idx) => `
              <div class="sample-item" data-idx="${idx}">
                <canvas width="80" height="80" style="width: 80px; height: 80px;"></canvas>
                <span>${s.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="wz-foot">
          <button class="secondary" id="closeSampleModal" style="width: auto;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Draw procedural previews onto canvases
    SAMPLES.forEach((s, idx) => {
      const item = modal.querySelector(`.sample-item[data-idx="${idx}"]`)!;
      const canvas = item.querySelector('canvas')!;
      const ctx = canvas.getContext('2d')!;
      const imgData = s.creator();
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imgData.width;
      tempCanvas.height = imgData.height;
      tempCanvas.getContext('2d')!.putImageData(
        new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height),
        0,
        0
      );
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    });

    modal.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.sample-item') as HTMLElement | null;
      if (item) {
        const idx = parseInt(item.dataset.idx!);
        cb.onSample(SAMPLES[idx].creator);
        modal.remove();
      }
    });

    modal.querySelector('#closeSampleModal')!.addEventListener('click', () => {
      modal.remove();
    });
  });

  $<HTMLInputElement>('removebg').addEventListener('change', (e) =>
    cb.onRemoveBg((e.target as HTMLInputElement).checked)
  );

  // --- Colors ---
  const ccount = $<HTMLSelectElement>('ccount');
  ccount.addEventListener('change', () => cb.onColorCount(+ccount.value));
  const smooth = $<HTMLInputElement>('smooth');
  smooth.addEventListener('input', () => cb.onSmoothing(+smooth.value));

  // --- Shape ---
  const shapeTypeTabs = $('shapeTypeTabs');
  const shapeSelect = $<HTMLSelectElement>('shapeSelect');

  shapeTypeTabs.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-style]') as HTMLElement | null;
    if (!t) return;
    const style = t.dataset.style;
    if (style === 'outline') {
      cb.onShape('outline');
    } else {
      cb.onShape(shapeSelect.value as BaseShapeKind);
    }
  });

  shapeSelect.addEventListener('change', () => {
    cb.onShape(shapeSelect.value as BaseShapeKind);
  });

  // --- Size sliders ---
  const width = $<HTMLInputElement>('width');
  width.addEventListener('input', () => cb.onWidth(+width.value));
  const topthick = $<HTMLInputElement>('topthick');
  topthick.addEventListener('input', () => cb.onTopThickness(+topthick.value));
  const imgdepth = $<HTMLInputElement>('imgdepth');
  imgdepth.addEventListener('input', () => cb.onImageDepth(+imgdepth.value));
  const tol = $<HTMLInputElement>('tol');
  tol.addEventListener('input', () => cb.onTolerance(+tol.value));
  const keychain = $<HTMLInputElement>('keychain');
  keychain.addEventListener('change', () => cb.onKeychain(keychain.checked));

  // --- View tabs ---
  const viewTabs = $('viewTabs');
  viewTabs.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
    if (t) cb.onView(t.dataset.view as ViewMode);
  });

  $<HTMLInputElement>('showswitch').addEventListener('change', (e) =>
    cb.onShowSwitch((e.target as HTMLInputElement).checked)
  );

  // --- Export and Utility actions ---
  $('export').addEventListener('click', () => cb.onExport());
  $('render').addEventListener('click', () => cb.onRenderPng());
  $('aiPrompt').addEventListener('click', () => cb.onAiPrompt());
  $('saveProj').addEventListener('click', () => cb.onSaveProject());
  const projFile = $<HTMLInputElement>('projFile');
  $('loadProj').addEventListener('click', () => projFile.click());
  projFile.addEventListener('change', () => {
    if (projFile.files?.[0]) cb.onLoadProject(projFile.files[0]);
    projFile.value = '';
  });

  let focusedColor = 0;

  function renderPalette(palette: PaletteEntry[]) {
    const pal = $('palette');
    if (palette.length === 0) {
      pal.innerHTML = '<div class="hint">Load an image to pick colors.</div>';
      return;
    }
    if (focusedColor >= palette.length) focusedColor = 0;
    pal.innerHTML = '';
    palette.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'fil-row';
      row.innerHTML = `
        <span class="slot-no">${i + 1}</span>
        <span class="swatch" style="background:${rgbHex(entry.quantRgb)}" title="detected color"></span>
        <span class="arrow">→</span>
        <span class="fil-chip" title="filament" style="background:${rgbHex(entry.filamentRgb)}"></span>
        <span class="cov">${Math.round(entry.coverage * 100)}%</span>
        <span class="stepper" title="3D height (raises this color)">
          <button class="dn">−</button>
          <span class="lvl">${entry.heightLevel}</span>
          <button class="up">+</button>
        </span>`;
      row.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.stepper')) return;
        focusedColor = i;
        pal.querySelectorAll('.fil-row').forEach((x) => x.classList.remove('focused'));
        row.classList.add('focused');
      });
      row.querySelector<HTMLButtonElement>('.up')!.addEventListener('click', () =>
        cb.onHeight(i, entry.heightLevel + 1)
      );
      row.querySelector<HTMLButtonElement>('.dn')!.addEventListener('click', () =>
        cb.onHeight(i, entry.heightLevel - 1)
      );
      pal.appendChild(row);
    });

    // Filament palette: pick a roll for the selected slot.
    const lib = document.createElement('div');
    lib.className = 'lib';
    lib.innerHTML = `
      <div class="lib-label">Filament — pick a color for the selected slot</div>
      <div class="lib-row"></div>
    `;
    const libRow = lib.querySelector('.lib-row')!;
    FILAMENTS.forEach(([name, hex]) => {
      const chip = document.createElement('button');
      chip.className = 'lib-chip';
      chip.style.background = hex;
      chip.title = name;
      chip.addEventListener('click', () => {
        if (focusedColor >= 0 && focusedColor < palette.length) cb.onFilament(focusedColor, hex);
      });
      libRow.appendChild(chip);
    });
    pal.appendChild(lib);

    pal.querySelectorAll<HTMLElement>('.fil-row')[focusedColor]?.classList.add('focused');
  }

  function update(state: UiState) {
    statusEl.innerHTML = (state.building ? '<span class="spinner"></span> ' : '') + state.status;

    ccount.value = String(state.colorCount);
    smooth.value = String(state.smoothing);
    $('smoothVal').textContent = Math.round(state.smoothing * 100) + '%';
    width.value = String(state.capWidthMm);
    $('widthVal').textContent = state.capWidthMm + ' mm';
    topthick.value = String(state.topThickness);
    $('topthickVal').textContent = state.topThickness.toFixed(1) + ' mm';
    imgdepth.value = String(state.imageDepth);
    $('imgdepthVal').textContent = state.imageDepth.toFixed(1) + ' mm';
    tol.value = String(state.tolerance);
    $('tolVal').textContent = state.tolerance.toFixed(2) + ' mm';
    keychain.checked = state.keychain;
    $<HTMLInputElement>('removebg').checked = state.removeBg;
    $<HTMLInputElement>('showswitch').checked = state.showSwitch;

    // Update Shape controls
    const isOutline = state.baseShape === 'outline';
    for (const btn of shapeTypeTabs.querySelectorAll<HTMLElement>('button')) {
      btn.classList.toggle('active', btn.dataset.style === (isOutline ? 'outline' : 'shape'));
    }

    if (isOutline) {
      shapeSelect.disabled = true;
    } else {
      shapeSelect.disabled = false;
      shapeSelect.value = state.baseShape;
    }

    // Update View tabs
    for (const b of viewTabs.querySelectorAll<HTMLElement>('button')) {
      b.classList.toggle('active', b.dataset.view === state.view);
    }

    const exportBtn = $<HTMLButtonElement>('export');
    exportBtn.disabled = !state.hasParts || state.building;

    renderPalette(state.palette);
  }

  return { update, hexRgb };
}
