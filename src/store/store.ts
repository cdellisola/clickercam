// src/store/store.ts
import type { ClickerSettings } from '../types';

export interface UiState extends ClickerSettings {
  status: string;
  building: boolean;
  hasParts: boolean;
  colorCount: number;
  palette: any[];
  view: any;
  showSwitch: boolean;
  importMode: 'image' | 'svg' | 'icon' | 'text';
  currentIconName: string;
  colorMode: 'normal' | 'limited';
  limitedColors: any[];
  bodyColorRgb: any;
  paletteOverrides: any[];
  baseColorOverride: any | null;
  partOverrides: Record<string, any>;
  editMode: any;
  edgeSettings: any[];
  extrudeHeight: number | null;
  componentHeights: Record<string, number>;
  selectedParts: string[];
  canUndo: boolean;
  canRedo: boolean;
  canRefresh: boolean;
}

export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<(s: T) => void>();
  return {
    get: () => state,
    set: (update: Partial<T>) => {
      state = { ...state, ...update };
      subs.forEach((s) => s(state));
    },
    subscribe: (fn: (s: T) => void) => {
      subs.add(fn);
      fn(state);
    }
  };
}
