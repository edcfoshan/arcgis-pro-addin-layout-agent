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

interface LibraryControlDefinition {
  type: ControlType;
  label: string;
  shortDescription: string;
  supportedSizes: RibbonControlSize[];
  defaultCaption: string;
  defaultTooltip: string;
  defaultBehavior: {
    commandType: string;
    className: string;
    target: string;
    arguments: Record<string, string>;
  };
  defaultAiNotes: string;
  icon: { small: string; large: string };
}

interface RibbonControl {
  id: string;
  subgroupId: string;
  type: ControlType;
  caption: string;
  tooltip: string;
  condition: string;
  size: RibbonControlSize;
  supportedSizes: RibbonControlSize[];
  icon: { small: string; large: string };
  behavior: LibraryControlDefinition['defaultBehavior'];
  eventBindings: unknown[];
  aiNotes: string;
  layout: PlacedRect;
}

interface RibbonGroup {
  id: string;
  tabId: string;
  caption: string;
  keytip: string;
  launcherButton: boolean;
  sizePriorities: [number, number, number];
  subgroupIds: string[];
}

interface RibbonSubgroup {
  id: string;
  groupId: string;
  caption: string;
  sizeMode: 'AlwaysLarge';
  verticalAlignment: 'Top';
  layout: { row: number; columns: number; rows: number };
  controlIds: string[];
}

interface RibbonDocument {
  metadata: {
    id: string;
    name: string;
    app: 'gispro-ribbon-designer';
    schemaVersion: '1.0';
    lastUpdated: string;
  };
  tabs: Array<{ id: string; caption: string; keytip: string; groupIds: string[] }>;
  groups: RibbonGroup[];
  subgroups: RibbonSubgroup[];
  controls: RibbonControl[];
}

const DEFAULT_GROUP_COLS = 8;
const DEFAULT_GROUP_ROWS = 3;

const CONTROL_LIBRARY: LibraryControlDefinition[] = [
  {
    type: 'button',
    label: '按钮',
    shortDescription: '执行一次性命令，例如打开窗口、导出、计算。',
    supportedSizes: ['small', 'middle', 'large'],
    defaultCaption: '导出',
    defaultTooltip: '执行按钮命令',
    defaultBehavior: { commandType: 'button', className: 'ExportCommand', target: 'currentView', arguments: {} },
    defaultAiNotes: '单次触发的 Ribbon 按钮。',
    icon: { small: 'button16', large: 'button32' },
  },
  {
    type: 'tool',
    label: '交互工具',
    shortDescription: '进入地图交互状态，例如点击、框选、绘制。',
    supportedSizes: ['small', 'middle', 'large'],
    defaultCaption: '选择',
    defaultTooltip: '激活地图交互工具',
    defaultBehavior: { commandType: 'tool', className: 'SelectTool', target: 'map', arguments: {} },
    defaultAiNotes: '进入地图交互模式的工具。',
    icon: { small: 'tool16', large: 'tool32' },
  },
  {
    type: 'splitButton',
    label: '分裂按钮',
    shortDescription: '主命令加下拉候选命令。',
    supportedSizes: ['middle', 'large'],
    defaultCaption: '添加图层',
    defaultTooltip: '主命令与候选命令组合',
    defaultBehavior: { commandType: 'splitButton', className: 'AddLayerSplitButton', target: 'menu', arguments: {} },
    defaultAiNotes: '带主命令与下拉候选命令的组合按钮。',
    icon: { small: 'split16', large: 'split32' },
  },
  {
    type: 'toolPalette',
    label: '工具板',
    shortDescription: '一组同类工具的快速切换入口。',
    supportedSizes: ['middle', 'large'],
    defaultCaption: '绘制',
    defaultTooltip: '从一组工具中切换',
    defaultBehavior: { commandType: 'toolPalette', className: 'DrawPalette', target: 'map', arguments: {} },
    defaultAiNotes: '多个同类工具的集合入口。',
    icon: { small: 'palette16', large: 'palette32' },
  },
  {
    type: 'menu',
    label: '菜单',
    shortDescription: '展开多个命令项。',
    supportedSizes: ['small', 'middle', 'large'],
    defaultCaption: '选项',
    defaultTooltip: '展开菜单命令',
    defaultBehavior: { commandType: 'menu', className: 'OptionsMenu', target: 'menu', arguments: {} },
    defaultAiNotes: '包含多条命令项的菜单。',
    icon: { small: 'menu16', large: 'menu32' },
  },
  {
    type: 'gallery',
    label: '画廊',
    shortDescription: '以图块方式展示样式、模板、符号等。',
    supportedSizes: ['middle', 'large'],
    defaultCaption: '填充样式',
    defaultTooltip: '从图块中选择样式',
    defaultBehavior: { commandType: 'gallery', className: 'FillStyleGallery', target: 'selection', arguments: {} },
    defaultAiNotes: '用于样式、模板或符号的可视化选择。',
    icon: { small: 'gallery16', large: 'gallery32' },
  },
  {
    type: 'comboBox',
    label: '下拉框',
    shortDescription: '从列表中选择一个值，也可以动态加载。',
    supportedSizes: ['middle', 'large'],
    defaultCaption: '行政区划',
    defaultTooltip: '从列表中选择值',
    defaultBehavior: { commandType: 'comboBox', className: 'AdminSelector', target: 'selection', arguments: {} },
    defaultAiNotes: '通过列表选择参数值的控件。',
    icon: { small: 'combo16', large: 'combo32' },
  },
  {
    type: 'editBox',
    label: '输入框',
    shortDescription: '输入文本、数字、路径、参数。',
    supportedSizes: ['middle', 'large'],
    defaultCaption: 'C:\\Data\\Project.gdb',
    defaultTooltip: '录入参数值',
    defaultBehavior: { commandType: 'editBox', className: 'PathEditor', target: 'form', arguments: {} },
    defaultAiNotes: '用于录入文本、数字或路径参数。',
    icon: { small: 'edit16', large: 'edit32' },
  },
  {
    type: 'checkBox',
    label: '复选框',
    shortDescription: '开关型选项，勾选或取消勾选。',
    supportedSizes: ['small', 'middle'],
    defaultCaption: '显示注记',
    defaultTooltip: '切换开关状态',
    defaultBehavior: { commandType: 'checkBox', className: 'ToggleLabel', target: 'settings', arguments: {} },
    defaultAiNotes: '用于布尔开关选项。',
    icon: { small: 'check16', large: 'check32' },
  },
];

const getFootprint = (type: ControlType, size: RibbonControlSize) => {
  if (size === 'small') return { w: 1, h: 1 };
  if (type === 'comboBox' || type === 'editBox') return size === 'large' ? { w: 4, h: 1 } : { w: 3, h: 1 };
  if (type === 'gallery' || type === 'toolPalette') return size === 'large' ? { w: 3, h: 3 } : { w: 3, h: 1 };
  if (type === 'menu' || type === 'splitButton') return size === 'large' ? { w: 2, h: 2 } : { w: 2, h: 1 };
  return size === 'large' ? { w: 2, h: 3 } : { w: 2, h: 1 };
};

interface RandomOption {
  definition: LibraryControlDefinition;
  size: RibbonControlSize;
  footprint: { w: number; h: number };
}

interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const args = process.argv.slice(2);

const getArgValue = (name: string) => {
  const index = args.findIndex((arg) => arg === name);
  return index >= 0 ? args[index + 1] : undefined;
};

const outputDir = getArgValue('--out');
const caseCount = Number.parseInt(getArgValue('--cases') ?? '10', 10);
const seed = Number.parseInt(getArgValue('--seed') ?? `${Date.now() % 1_000_000}`, 10);

if (!outputDir) {
  console.error('Usage: node --experimental-strip-types tools/generate-random-ribbon-layouts.mts --out <dir> [--cases 10] [--seed 1234]');
  process.exit(1);
}

const profiles = ['mixed', 'commands', 'inputs', 'dense'] as const;
type Profile = (typeof profiles)[number];

const random = (() => {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 0x1_0000_0000;
  };
})();

const randomInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const makeIdFactory = (caseIndex: number) => {
  let counter = 0;
  return (prefix: string) => `${prefix}_${caseIndex.toString().padStart(2, '0')}_${(++counter).toString().padStart(4, '0')}`;
};

const overlaps = (left: PlacedRect, right: PlacedRect) =>
  left.x < right.x + right.w &&
  left.x + left.w > right.x &&
  left.y < right.y + right.h &&
  left.y + left.h > right.y;

const findOpenSlot = (footprint: { w: number; h: number }, placed: PlacedRect[], columns: number, rows: number) => {
  for (let y = 0; y <= rows - footprint.h; y += 1) {
    for (let x = 0; x <= columns - footprint.w; x += 1) {
      const candidate = { x, y, w: footprint.w, h: footprint.h };
      if (!placed.some((rect) => overlaps(candidate, rect))) return candidate;
    }
  }
  return null;
};

const isWideEnough = (placed: PlacedRect[], columns: number) =>
  placed.some((rect) => rect.x + rect.w >= columns);

const buildOptions = (profile: Profile): RandomOption[] => {
  const allowedTypes =
    profile === 'commands'
      ? new Set(['button', 'tool', 'splitButton', 'toolPalette', 'menu', 'gallery'])
      : profile === 'inputs'
        ? new Set(['comboBox', 'editBox', 'checkBox', 'button', 'menu'])
        : null;

  return CONTROL_LIBRARY
    .filter((definition) => !allowedTypes || allowedTypes.has(definition.type))
    .flatMap((definition) =>
      definition.supportedSizes.map((size) => ({
        definition,
        size,
        footprint: getFootprint(definition.type, size),
      })),
    )
    .filter((option) => profile !== 'dense' || option.footprint.h <= 1 || random() > 0.55);
};

const createControl = (
  id: string,
  subgroupId: string,
  definition: LibraryControlDefinition,
  size: RibbonControlSize,
  layout: PlacedRect,
): RibbonControl => ({
  id,
  subgroupId,
  type: definition.type,
  caption: definition.label,
  tooltip: definition.defaultTooltip,
  condition: '',
  size,
  supportedSizes: definition.supportedSizes,
  icon: definition.icon,
  behavior: { ...definition.defaultBehavior },
  eventBindings: [],
  aiNotes: definition.defaultAiNotes,
  layout,
});

const fillGroup = (
  caseIndex: number,
  makeId: (prefix: string) => string,
  subgroupId: string,
  profile: Profile,
  columns: number,
  rows: number,
) => {
  const options = buildOptions(profile);
  const placed: PlacedRect[] = [];
  const controls: RibbonControl[] = [];
  const usedTypes = new Set<string>();

  while (true) {
    const shuffled = shuffle(options);
    const freshTypes = shuffled.filter((option) => !usedTypes.has(option.definition.type));
    const pool = freshTypes.length ? freshTypes : shuffled;
    const fitting = pool
      .map((option) => ({ ...option, slot: findOpenSlot(option.footprint, placed, columns, rows) }))
      .filter((option) => option.slot);

    if (!fitting.length) break;

    const selected = pick(fitting);
    const slot = selected.slot;
    if (!slot) break;

    const control = createControl(
      makeId(selected.definition.type),
      subgroupId,
      selected.definition,
      selected.size,
      slot,
    );
    placed.push(slot);
    controls.push(control);
    usedTypes.add(selected.definition.type);

    if (isWideEnough(placed, columns) && random() > 0.35) {
      const remaining = options.some((option) => findOpenSlot(option.footprint, placed, columns, rows));
      if (!remaining) break;
    }
  }

  if (!isWideEnough(placed, columns)) {
    const smallButton = CONTROL_LIBRARY.find((item) => item.type === 'button');
    if (smallButton) {
      for (let x = 0; x < columns; x += 1) {
        const slot = findOpenSlot({ w: 1, h: 1 }, placed, columns, rows);
        if (!slot) break;
        const control = createControl(makeId('button'), subgroupId, smallButton, 'small', slot);
        placed.push(slot);
        controls.push(control);
        if (slot.x + slot.w >= columns) break;
      }
    }
  }

  return controls;
};

const createCase = (caseIndex: number): RibbonDocument => {
  const makeId = makeIdFactory(caseIndex);
  const profile = profiles[(caseIndex - 1) % profiles.length];
  const tabId = makeId('tab');
  const groupCount = randomInt(1, 3);
  const groups: RibbonGroup[] = [];
  const subgroups: RibbonSubgroup[] = [];
  const controls: RibbonControl[] = [];

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const groupId = makeId('group');
    const subgroupId = makeId('subgroup');
    const columns = DEFAULT_GROUP_COLS + (groupIndex > 0 && random() > 0.55 ? randomInt(1, 4) : 0);
    const groupControls = fillGroup(caseIndex, makeId, subgroupId, profile, columns, DEFAULT_GROUP_ROWS);

    groups.push({
      id: groupId,
      tabId,
      caption: `随机分组 ${caseIndex}-${groupIndex + 1}`,
      keytip: `R${groupIndex + 1}`,
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
      layout: { row: 0, columns, rows: DEFAULT_GROUP_ROWS },
      controlIds: groupControls.map((control) => control.id),
    });

    controls.push(...groupControls);
  }

  const now = new Date(Date.now() + caseIndex * 1000).toISOString();
  return {
    metadata: {
      id: makeId('doc'),
      name: `随机 Ribbon 验证 ${caseIndex.toString().padStart(2, '0')}`,
      app: 'gispro-ribbon-designer',
      schemaVersion: '1.0',
      lastUpdated: now,
    },
    tabs: [
      {
        id: tabId,
        caption: `随机验证 ${caseIndex.toString().padStart(2, '0')}`,
        keytip: 'A',
        groupIds: groups.map((group) => group.id),
      },
    ],
    groups,
    subgroups,
    controls,
  };
};

const absoluteOutput = path.resolve(process.cwd(), outputDir);
const casesDir = path.join(absoluteOutput, 'cases');
mkdirSync(casesDir, { recursive: true });

const manifest = {
  seed,
  caseCount,
  generatedAt: new Date().toISOString(),
  cases: Array.from({ length: caseCount }, (_unused, index) => {
    const caseIndex = index + 1;
    const document = createCase(caseIndex);
    const fileName = `case-${caseIndex.toString().padStart(2, '0')}.json`;
    const relativePath = `cases/${fileName}`;
    writeFileSync(path.join(casesDir, fileName), JSON.stringify(document, null, 2), 'utf8');
    return {
      id: `case-${caseIndex.toString().padStart(2, '0')}`,
      name: document.metadata.name,
      profile: profiles[index % profiles.length],
      relativePath,
      groupCount: document.groups.length,
      controlCount: document.controls.length,
      columns: document.subgroups.map((subgroup) => subgroup.layout?.columns ?? DEFAULT_GROUP_COLS),
    };
  }),
};

writeFileSync(path.join(absoluteOutput, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Generated ${caseCount} random layout cases in ${absoluteOutput}`);
