import { resolveRenderedSize } from '../ribbon';
import type {
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonPreviewMode,
  RibbonSubgroup,
} from '../types';

export const RIBBON_CELL = 32;
export const DEFAULT_GROUP_COLS = 8;
export const DEFAULT_GROUP_ROWS = 3;
export const MIN_GROUP_COLS = 3;
export const MAX_GROUP_COLS = 18;
export const MIN_GROUP_ROWS = 1;
export const MAX_GROUP_ROWS = 8;

export interface Footprint {
  w: number;
  h: number;
}

export interface GridRect extends Footprint {
  i: string;
  x: number;
  y: number;
}

export interface GridSpec {
  cols: number;
  rows: number;
}

export const getFootprint = (type: ControlType, size: RibbonControlSize): Footprint => {
  if (size === 'small') return { w: 1, h: 1 };
  if (type === 'comboBox' || type === 'editBox') return size === 'large' ? { w: 4, h: 1 } : { w: 3, h: 1 };
  if (type === 'gallery' || type === 'toolPalette') return size === 'large' ? { w: 3, h: 3 } : { w: 3, h: 1 };
  if (type === 'menu' || type === 'splitButton') return size === 'large' ? { w: 2, h: 2 } : { w: 2, h: 1 };
  return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
};

export const footprintLabel = (type: ControlType, size: RibbonControlSize) => {
  const footprint = getFootprint(type, size);
  return `${footprint.w}x${footprint.h}`;
};

export const getRenderedSize = (
  control: RibbonControl,
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) => resolveRenderedSize(subgroup.sizeMode, previewMode, control.supportedSizes, control.size);

export const getRenderedFootprint = (
  control: RibbonControl,
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) => getFootprint(control.type, getRenderedSize(control, subgroup, previewMode));

export const getGridSpec = (subgroup?: RibbonSubgroup): GridSpec => ({
  cols: subgroup?.layout?.columns ?? DEFAULT_GROUP_COLS,
  rows: subgroup?.layout?.rows ?? DEFAULT_GROUP_ROWS,
});

export const isInsideGrid = ({ x, y, w, h }: Omit<GridRect, 'i'>, spec: GridSpec) =>
  x >= 0 && y >= 0 && x + w <= spec.cols && y + h <= spec.rows;

export const rectsCollide = (a: Omit<GridRect, 'i'>, b: Omit<GridRect, 'i'>) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const canPlaceRect = (
  candidate: GridRect,
  existing: GridRect[],
  spec: GridSpec,
  ignoreId?: string,
) =>
  isInsideGrid(candidate, spec) &&
  !existing.some((item) => item.i !== ignoreId && rectsCollide(candidate, item));

export const packRects = (items: { id: string; footprint: Footprint }[], spec: GridSpec): GridRect[] => {
  const placed: GridRect[] = [];

  for (const item of items) {
    let found: GridRect | null = null;
    for (let y = 0; y <= spec.rows - item.footprint.h && !found; y += 1) {
      for (let x = 0; x <= spec.cols - item.footprint.w && !found; x += 1) {
        const candidate = { i: item.id, x, y, w: item.footprint.w, h: item.footprint.h };
        if (canPlaceRect(candidate, placed, spec)) found = candidate;
      }
    }
    if (found) placed.push(found);
  }

  return placed;
};

export const getSubgroupControls = (document: RibbonDocument, subgroup: RibbonSubgroup) =>
  subgroup.controlIds
    .map((controlId) => document.controls.find((control) => control.id === controlId))
    .filter(Boolean) as RibbonControl[];

export const getSubgroupLayout = (
  document: RibbonDocument,
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
): GridRect[] => {
  const controls = getSubgroupControls(document, subgroup);
  const spec = getGridSpec(subgroup);
  const existing: GridRect[] = [];
  const output: GridRect[] = [];

  for (const control of controls) {
    const footprint = getRenderedFootprint(control, subgroup, previewMode);
    const saved = control.layout
      ? { i: control.id, x: control.layout.x, y: control.layout.y, w: footprint.w, h: footprint.h }
      : null;
    if (saved && canPlaceRect(saved, existing, spec)) {
      existing.push(saved);
      output.push(saved);
      continue;
    }
    let fallback: GridRect | null = null;
    for (let y = 0; y <= spec.rows - footprint.h && !fallback; y += 1) {
      for (let x = 0; x <= spec.cols - footprint.w && !fallback; x += 1) {
        const candidate = { i: control.id, x, y, w: footprint.w, h: footprint.h };
        if (canPlaceRect(candidate, existing, spec)) fallback = candidate;
      }
    }
    fallback ??= { i: control.id, x: 0, y: 0, w: footprint.w, h: footprint.h };
    existing.push(fallback);
    output.push(fallback);
  }

  return output;
};

export const normalizeDocumentLayouts = (
  document: RibbonDocument,
  previewMode: RibbonPreviewMode = 'Large',
): RibbonDocument => {
  let controls = document.controls;

  for (const subgroup of document.subgroups) {
    const subgroupControls = getSubgroupControls({ ...document, controls }, subgroup);
    const spec = getGridSpec(subgroup);
    const layout = packRects(
      subgroupControls.map((control) => ({
        id: control.id,
        footprint: getRenderedFootprint(control, subgroup, previewMode),
      })),
      spec,
    );
    const byId = new Map(layout.map((item) => [item.i, item]));
    controls = controls.map((control) => {
      const item = byId.get(control.id);
      return item ? { ...control, layout: { x: item.x, y: item.y, w: item.w, h: item.h } } : control;
    });
  }

  return { ...document, controls };
};
