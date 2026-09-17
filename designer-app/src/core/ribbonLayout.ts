import type {
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonPreviewMode,
  RibbonSubgroup,
} from './types';

export const RIBBON_CELL = 32;
export const DEFAULT_GROUP_COLS = 8;
export const DEFAULT_GROUP_ROWS = 3;
export const MIN_GROUP_COLS = 3;
export const MAX_GROUP_COLS = 30;
export const FIXED_GROUP_ROWS = 3;

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

export const getFootprint = (
  type: ControlType,
  size: RibbonControlSize,
  variant?: RibbonControl['variant'],
  iconOnly?: boolean,
): Footprint => {
  // 设计器侧「图标」形态:small 下渲染 1×1 纯图标(Pro 端是否去文字由其自适应决定)
  if (iconOnly && size === 'small') return { w: 1, h: 1 };
  // menuStyle 按钮板在 Pro 实测渲染为带下拉箭头的大按钮(用户实机观察 2026-09-15),占格同 button
  if (variant === 'menuStyle') return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
  // 摊开式画廊(inline="true"):内容横铺不收进下拉,占格显著宽于下拉式;待 pro-ui-check 实机校准
  if (type === 'gallery' && variant === 'inline') {
    return size === 'large' ? { w: 5, h: 3 } : { w: 5, h: 1 };
  }
  // comboBox 小窗体形态(官方 toolbar 示例存在 size="small"),是窄横框而非 1×1 图标格;待实机校准
  if ((type === 'comboBox' || type === 'editBox') && size === 'small') return { w: 2, h: 1 };
  // gallery 小尺寸无实机证据,维持 1×1;其余小尺寸命令类 Pro 实机都带文字
  // (2026-09-17:捕捉/更多∨/刷新),不再是 1×1 图标格;占格可在检查器自行调整
  if (type === 'gallery' && size === 'small') return { w: 1, h: 1 };
  if (size === 'small') return { w: 2, h: 1 };
  if (type === 'comboBox' || type === 'editBox') return size === 'large' ? { w: 4, h: 1 } : { w: 3, h: 1 };
  if (type === 'gallery') return size === 'large' ? { w: 3, h: 3 } : { w: 3, h: 1 };
  // 工具板 Pro 实测为按钮形态(2026-09-17 容器页截图):large=大图标+文字+箭头(2×3),
  // middle=文字+箭头窄条(2×1);2×2 图标格是下拉展开后才有的形态,画布只画收起态
  if (type === 'toolPalette') return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
  // large 命令/容器控件一律占满整列 3 行(2026-09-16 实机确认):
  // 按钮大=图标区 2 行+文字行;分裂按钮大=图标+文字+下拉箭头行(箭头独占一行);
  // 菜单大=图标区 2 行+文字+箭头行。此前 menu 大误记 2×2,实机菜单组
  // 「图层管理」明显占满列高(排序/打印在旁列而非其下方),已改 2×3。
  if (type === 'menu' || type === 'splitButton') return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
  return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
};

export const footprintLabel = (
  type: ControlType,
  size: RibbonControlSize,
  variant?: RibbonControl['variant'],
  iconOnly?: boolean,
) => {
  const footprint = getFootprint(type, size, variant, iconOnly);
  return `${footprint.w}x${footprint.h}`;
};

// ===== Pro 分组的真实渲染规则（2026-09-16 官方 DAML 与实机截图确认）=====
// DAML 的 group 没有任何坐标属性：控件按声明顺序渲染,**连续同尺寸(small/middle/large)
// 的控件为一段**——尺寸一变就换新列,段内从上往下堆满 3 行再在段内开新列。
// 两条例外(均有实机证据):
// 1. large(3 行)独占整列——大按钮/大菜单/大分裂按钮/大画廊/大工具板都占满列高;
// 2. small 段若前一列剩余 ≥2 行,则并入该列接着排(实机菜单组:[排序,打印,视图] 列后,
//    「帮助(中)+更多(小)+分享(小)」同列;实机下拉框组:中尺寸列只剩 1 行,small 段另起新列)。
// 同段各列的列宽按段内最宽控件取齐(实机输入框组的框列对齐)。
// 设计器画布按同一规则派生显示位置,所见即 Pro 所得;存储的 layout 坐标仅作旧文档兼容。

// 输入类控件的估宽:Pro 渲染为「标签 + 框」,框宽与尺寸相关(comboBox)或随内容
// (editBox 的框显示 sizeString=标题);字宽按渲染字号近似:中文 12px、拉丁 6px。
// 以 32px 网格取整用 round(这两类宽度普遍带小数,ceil 会系统性偏宽)。
const inputTextWidth = (caption: string) =>
  [...caption].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 12 : 6), 0);

export function flowItemWidth(
  type: ControlType,
  size: RibbonControlSize,
  caption: string,
  iconOnly?: boolean,
): number {
  // 图标形态恒为 1 格宽
  if (iconOnly && size === 'small') return 1;
  const nominal = getFootprint(type, size, undefined, iconOnly).w;
  if (type === 'comboBox') {
    // small 无标签只有框;标签与框之间约 12px 间距,框宽 large 64 / middle 60 / small 56
    const boxW = size === 'large' ? 64 : size === 'middle' ? 60 : 56;
    return Math.max(1, Math.round(((size === 'small' ? 0 : inputTextWidth(caption)) + 12 + boxW) / 32));
  }
  if (type === 'editBox') {
    // 框内显示提示文字(=标题),框宽随内容但不小于 56;实测最小框约 56-66px
    const textW = inputTextWidth(caption);
    return Math.max(2, Math.round((textW + 6 + Math.max(56, textW + 8)) / 32));
  }
  if (type === 'checkBox') {
    // 勾选框+间距约 20px,再加文字;Pro 实机小/中尺寸都带文字,长文字按内容加宽
    const textW = [...caption].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 12 : 7), 0);
    return Math.max(2, Math.round((20 + textW) / 32));
  }
  // 中/小尺寸的命令按钮宽度都随文字增长（大按钮固定宽）
  const isTextButton =
    size !== 'large' &&
    (type === 'button' || type === 'tool' || type === 'splitButton' || type === 'menu');
  if (isTextButton) {
    const textW = [...caption].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 12 : 7), 0);
    return Math.max(nominal, Math.ceil((34 + textW) / 32));
  }
  return nominal;
}

export function flowLayout(
  items: Array<{
    id: string;
    type: ControlType;
    size: RibbonControlSize;
    caption: string;
    variant?: RibbonControl['variant'];
    iconOnly?: boolean;
  }>,
): GridRect[] {
  const rects: GridRect[] = [];
  let col = 0;
  let row = 0;
  let colWidth = 0;
  let prevSize: RibbonControlSize | null = null;
  for (const item of items) {
    // 尺寸类变化即换列(Pro 实机规则)。例外:small 段在前一列剩 ≥2 行时并入该列
    // (实机菜单组「帮助+更多+分享」同列);large 独占列的换列在下面 h>=3 分支处理
    const joinsPreviousColumn =
      prevSize !== null &&
      item.size !== prevSize &&
      item.size === 'small' &&
      colWidth > 0 &&
      3 - row >= 2;
    if (prevSize !== null && item.size !== prevSize && !joinsPreviousColumn) {
      col += colWidth;
      row = 0;
      colWidth = 0;
    }
    prevSize = item.size;
    const fp = getFootprint(item.type, item.size, item.variant, item.iconOnly);
    const w = flowItemWidth(item.type, item.size, item.caption, item.iconOnly);
    const h = fp.h;
    let x: number;
    let y: number;
    if (h >= 3) {
      // 大按钮独占一列：先把当前列推走
      if (row > 0) {
        col += colWidth;
        row = 0;
        colWidth = 0;
      }
      x = col;
      y = 0;
      col += w;
    } else {
      // 段内堆叠：按实际高度推进（大菜单/大分裂按钮 h=2 在剩余不足时换列）
      if (row + h > 3) {
        col += colWidth;
        row = 0;
        colWidth = 0;
      }
      x = col;
      y = row;
      row += h;
      colWidth = Math.max(colWidth, w);
    }
    rects.push({ i: item.id, x, y, w, h });
  }
  return rects;
}

export const getRenderedSize = (
  control: RibbonControl,
  _subgroup: RibbonSubgroup,
  _previewMode: RibbonPreviewMode,
) => control.size;

export const getRenderedFootprint = (
  control: RibbonControl,
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) =>
  getFootprint(
    control.type,
    getRenderedSize(control, subgroup, previewMode),
    control.variant,
    control.iconOnly,
  );

export const getGridSpec = (subgroup?: RibbonSubgroup, _previewMode?: RibbonPreviewMode): GridSpec => ({
  cols: subgroup?.layout?.columns ?? DEFAULT_GROUP_COLS,
  rows: FIXED_GROUP_ROWS,
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
    if (fallback) {
      existing.push(fallback);
      output.push(fallback);
    }
  }

  return output;
};

export const findFirstOpenSlot = (
  footprint: Footprint,
  existing: GridRect[],
  spec: GridSpec,
): GridRect | null => {
  for (let y = 0; y <= spec.rows - footprint.h; y += 1) {
    for (let x = 0; x <= spec.cols - footprint.w; x += 1) {
      const candidate = { i: '__candidate__', x, y, w: footprint.w, h: footprint.h };
      if (canPlaceRect(candidate, existing, spec)) return candidate;
    }
  }
  return null;
};

export const normalizeDocumentLayouts = (
  document: RibbonDocument,
  previewMode: RibbonPreviewMode = 'Large',
): RibbonDocument => {
  let controls = document.controls;

  for (const subgroup of document.subgroups) {
    const subgroupControls = getSubgroupControls({ ...document, controls }, subgroup);
    if (!subgroupControls.length) continue;
    const layout = getSubgroupLayout({ ...document, controls }, subgroup, previewMode);
    const byId = new Map(layout.map((item) => [item.i, item]));
    controls = controls.map((control) => {
      const item = byId.get(control.id);
      return item ? { ...control, layout: { x: item.x, y: item.y, w: item.w, h: item.h } } : control;
    });
  }

  return { ...document, controls };
};
