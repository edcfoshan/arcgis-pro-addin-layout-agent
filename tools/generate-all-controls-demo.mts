// 全控件演示布局生成器:9 种控件类型 × 各自支持的尺寸(共 21 个),每种绑一个互不重复的
// Pro 原生亮色图标对,用于打包「测试模式」演示包给 ArcGIS Pro 人工验收。
// 用法:node --experimental-strip-types tools/generate-all-controls-demo.mts [--out <路径>]
// 输出:00测试包/all-controls-layout.json(UTF-8 无 BOM,Node writeFileSync 默认即无 BOM)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type ControlType =
  | 'button'
  | 'tool'
  | 'splitButton'
  | 'toolPalette'
  | 'menu'
  | 'gallery'
  | 'checkBox'
  | 'comboBox'
  | 'editBox';
type RibbonControlSize = 'small' | 'middle' | 'large';
interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 与 designer-app/src/core/ribbonLayout.ts 的 getFootprint 同值
const getFootprint = (type: ControlType, size: RibbonControlSize): PlacedRect => {
  if (size === 'small') return { x: 0, y: 0, w: 1, h: 1 };
  if (type === 'comboBox' || type === 'editBox')
    return size === 'large' ? { x: 0, y: 0, w: 4, h: 1 } : { x: 0, y: 0, w: 3, h: 1 };
  if (type === 'gallery' || type === 'toolPalette')
    return size === 'large' ? { x: 0, y: 0, w: 3, h: 3 } : { x: 0, y: 0, w: 3, h: 1 };
  if (type === 'menu' || type === 'splitButton')
    return size === 'large' ? { x: 0, y: 0, w: 2, h: 2 } : { x: 0, y: 0, w: 2, h: 1 };
  return size === 'large' ? { x: 0, y: 0, w: 2, h: 3 } : { x: 0, y: 0, w: 2, h: 1 };
};

const ROWS = 3;
const MAX_COLS = 18;

const rectsCollide = (a: PlacedRect, b: PlacedRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 行序装箱:优先填低行,找不到空位返回 null
const findOpenSlot = (w: number, h: number, placed: PlacedRect[], cols: number): { x: number; y: number } | null => {
  for (let y = 0; y + h <= ROWS; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      const candidate = { x, y, w, h };
      if (!placed.some((item) => rectsCollide(candidate, item))) return { x, y };
    }
  }
  return null;
};

interface DemoSpec {
  type: ControlType;
  size: RibbonControlSize;
  caption: string;
  iconBase: string; // tools/icon-cache 中已验证存在的亮色图标语义名(images_<base>16/32.png)
  behavior: { commandType: string; className: string; target: string; arguments: Record<string, string> };
}

const DEFAULT_BEHAVIOR: Record<ControlType, DemoSpec['behavior']> = {
  button: { commandType: 'button', className: 'ExportCommand', target: 'currentView', arguments: {} },
  tool: { commandType: 'tool', className: 'SelectTool', target: 'map', arguments: {} },
  splitButton: { commandType: 'splitButton', className: 'AddLayerSplitButton', target: 'menu', arguments: {} },
  toolPalette: { commandType: 'toolPalette', className: 'DrawPalette', target: 'map', arguments: {} },
  menu: { commandType: 'menu', className: 'OptionsMenu', target: 'menu', arguments: {} },
  gallery: { commandType: 'gallery', className: 'FillStyleGallery', target: 'selection', arguments: {} },
  comboBox: { commandType: 'comboBox', className: 'AdminSelector', target: 'selection', arguments: {} },
  editBox: { commandType: 'editBox', className: 'PathEditor', target: 'form', arguments: {} },
  checkBox: { commandType: 'checkBox', className: 'ToggleLabel', target: 'settings', arguments: {} },
};

const SIZE_LABEL: Record<RibbonControlSize, string> = { small: '小', middle: '中', large: '大' };
const TYPE_LABEL: Record<ControlType, string> = {
  button: '按钮',
  tool: '交互工具',
  splitButton: '分裂按钮',
  toolPalette: '工具板',
  menu: '菜单',
  gallery: '画廊',
  comboBox: '下拉框',
  editBox: '输入框',
  checkBox: '复选框',
};

// 与控件库 supportedSizes 一致(README 尺寸表)
const SUPPORTED_SIZES: Record<ControlType, RibbonControlSize[]> = {
  button: ['small', 'middle', 'large'],
  tool: ['small', 'middle', 'large'],
  splitButton: ['middle', 'large'],
  toolPalette: ['middle', 'large'],
  menu: ['small', 'middle', 'large'],
  gallery: ['middle', 'large'],
  comboBox: ['middle', 'large'],
  editBox: ['middle', 'large'],
  checkBox: ['small', 'middle'],
};

// 每组:大尺寸在前更利于装箱;图标语义名均已逐个验证存在(亮色 images_*)
const GROUPS: { caption: string; specs: DemoSpec[] }[] = [
  {
    caption: '命令按钮类',
    specs: [
      { type: 'button', size: 'large', caption: '', iconBase: 'addarea', behavior: DEFAULT_BEHAVIOR.button },
      { type: 'tool', size: 'large', caption: '', iconBase: 'addfilter', behavior: DEFAULT_BEHAVIOR.tool },
      { type: 'menu', size: 'large', caption: '', iconBase: 'addin', behavior: DEFAULT_BEHAVIOR.menu },
      { type: 'splitButton', size: 'large', caption: '', iconBase: 'addlist', behavior: DEFAULT_BEHAVIOR.splitButton },
      { type: 'button', size: 'middle', caption: '', iconBase: 'addline', behavior: DEFAULT_BEHAVIOR.button },
      { type: 'tool', size: 'middle', caption: '', iconBase: 'addquery', behavior: DEFAULT_BEHAVIOR.tool },
      { type: 'menu', size: 'middle', caption: '', iconBase: 'addnotebook', behavior: DEFAULT_BEHAVIOR.menu },
      { type: 'splitButton', size: 'middle', caption: '', iconBase: 'addsearch', behavior: DEFAULT_BEHAVIOR.splitButton },
      { type: 'button', size: 'small', caption: '', iconBase: 'addpoint', behavior: DEFAULT_BEHAVIOR.button },
      { type: 'tool', size: 'small', caption: '', iconBase: 'addraster', behavior: DEFAULT_BEHAVIOR.tool },
      { type: 'menu', size: 'small', caption: '', iconBase: 'addcamera', behavior: DEFAULT_BEHAVIOR.menu },
    ],
  },
  {
    caption: '面板与画廊',
    specs: [
      { type: 'toolPalette', size: 'large', caption: '', iconBase: 'addguides', behavior: DEFAULT_BEHAVIOR.toolPalette },
      { type: 'gallery', size: 'large', caption: '', iconBase: 'addcomments', behavior: DEFAULT_BEHAVIOR.gallery },
      { type: 'toolPalette', size: 'middle', caption: '', iconBase: 'addvoxel', behavior: DEFAULT_BEHAVIOR.toolPalette },
      { type: 'gallery', size: 'middle', caption: '', iconBase: 'addcontent', behavior: DEFAULT_BEHAVIOR.gallery },
    ],
  },
  {
    caption: '输入与选择',
    specs: [
      { type: 'comboBox', size: 'large', caption: '', iconBase: 'addallvalues', behavior: DEFAULT_BEHAVIOR.comboBox },
      { type: 'editBox', size: 'large', caption: '', iconBase: 'addquerylayer', behavior: DEFAULT_BEHAVIOR.editBox },
      { type: 'comboBox', size: 'middle', caption: '', iconBase: 'addattachments', behavior: DEFAULT_BEHAVIOR.comboBox },
      { type: 'editBox', size: 'middle', caption: '', iconBase: 'addlayerfrompath', behavior: DEFAULT_BEHAVIOR.editBox },
      { type: 'checkBox', size: 'middle', caption: '', iconBase: 'addsimplelayer', behavior: DEFAULT_BEHAVIOR.checkBox },
      { type: 'checkBox', size: 'small', caption: '', iconBase: 'addxyevent', behavior: DEFAULT_BEHAVIOR.checkBox },
    ],
  },
];

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outPath =
  outIndex >= 0 && args[outIndex + 1]
    ? path.resolve(args[outIndex + 1])
    : path.resolve(import.meta.dirname, '..', '00测试包', 'all-controls-layout.json');

const now = new Date();
const controls: Record<string, unknown>[] = [];
const groups: Record<string, unknown>[] = [];
const subgroups: Record<string, unknown>[] = [];
const tabId = 'tab_all_controls_demo';
let seq = 0;

GROUPS.forEach((groupSpec, groupIndex) => {
  const groupNum = groupIndex + 1;
  const groupId = `group_demo_${String(groupNum).padStart(2, '0')}`;
  const subgroupId = `subgroup_demo_${String(groupNum).padStart(2, '0')}`;

  // 从 8 列开始试,放不下逐列加宽到 18 列为止(3 行固定)
  let columns = 8;
  let placed: PlacedRect[] = [];
  let layouts: PlacedRect[] = [];
  for (; columns <= MAX_COLS; columns += 1) {
    placed = [];
    layouts = [];
    const ok = groupSpec.specs.every((spec) => {
      const footprint = getFootprint(spec.type, spec.size);
      const slot = findOpenSlot(footprint.w, footprint.h, placed, columns);
      if (!slot) return false;
      const rect = { x: slot.x, y: slot.y, w: footprint.w, h: footprint.h };
      placed.push(rect);
      layouts.push(rect);
      return true;
    });
    if (ok) break;
  }
  if (layouts.length !== groupSpec.specs.length) {
    throw new Error(`分组「${groupSpec.caption}」在 ${MAX_COLS} 列内放不下`);
  }

  const controlIds: string[] = [];
  groupSpec.specs.forEach((spec, specIndex) => {
    seq += 1;
    const caption = spec.caption || `${TYPE_LABEL[spec.type]}·${SIZE_LABEL[spec.size]}`;
    const control = {
      id: `${spec.type}_demo_${String(seq).padStart(3, '0')}`,
      subgroupId,
      type: spec.type,
      caption,
      tooltip: `演示控件:${caption}(类型 ${spec.type},尺寸 ${spec.size})`,
      condition: '',
      size: spec.size,
      supportedSizes: SUPPORTED_SIZES[spec.type],
      icon: { small: `images_${spec.iconBase}16.png`, large: `images_${spec.iconBase}32.png` },
      behavior: { ...spec.behavior },
      eventBindings: [],
      aiNotes: '全控件演示:用于在 ArcGIS Pro 中人工验收每种类型/尺寸的渲染。',
      layout: layouts[specIndex],
    };
    controls.push(control);
    controlIds.push(control.id);
  });

  groups.push({
    id: groupId,
    tabId,
    caption: groupSpec.caption,
    keytip: `G${groupNum}`,
    launcherButton: false,
    sizePriorities: [30, 80, 120],
    subgroupIds: [subgroupId],
  });
  subgroups.push({
    id: subgroupId,
    groupId,
    caption: '分组网格',
    sizeMode: 'AlwaysLarge',
    verticalAlignment: 'Top',
    layout: { row: 0, columns, rows: ROWS },
    controlIds,
  });
  console.log(`分组「${groupSpec.caption}」:${groupSpec.specs.length} 个控件,网格 ${columns} 列 × 3 行`);
});

const document = {
  metadata: {
    id: 'doc_all_controls_demo',
    name: '全控件演示',
    app: 'gispro-ribbon-designer',
    schemaVersion: '1.0',
    lastUpdated: now.toISOString(),
  },
  tabs: [{ id: tabId, caption: '全控件演示', keytip: 'Z', groupIds: groups.map((group) => (group as { id: string }).id) }],
  groups,
  subgroups,
  controls,
};

// 自检:控件数、图标对、无重叠
const iconPairs = new Set(controls.map((control) => (control as { icon: { small: string } }).icon.small));
if (controls.length !== 21) throw new Error(`预期 21 个控件,实际 ${controls.length}`);
if (iconPairs.size !== 21) throw new Error(`预期 21 个互不重复图标,实际 ${iconPairs.size}`);
subgroups.forEach((subgroup) => {
  const rects = (subgroup as unknown as { controlIds: string[] }).controlIds.map((id) =>
    (controls.find((control) => (control as { id: string }).id === id) as unknown as { layout: PlacedRect }).layout,
  );
  rects.forEach((a, i) =>
    rects.slice(i + 1).forEach((b) => {
      if (rectsCollide(a, b)) throw new Error('存在重叠布局,生成中止');
    }),
  );
});

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf8');
console.log(`已生成 ${outPath}(21 个控件,21 对图标,单页签 keytip=Z)`);
