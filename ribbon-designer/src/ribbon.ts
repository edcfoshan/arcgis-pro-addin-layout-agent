import { CONTROL_LIBRARY } from './library';
import type {
  LibraryControlDefinition,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonDocumentMetadata,
  RibbonPreviewMode,
  RibbonSubgroup,
  RibbonSubgroupSizeMode,
} from './types';

const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

const createMetadata = (name: string): RibbonDocumentMetadata => ({
  id: createId('doc'),
  name,
  app: 'gispro-ribbon-designer',
  schemaVersion: '1.0',
  lastUpdated: nowIso(),
});

export const cloneDocumentWithTimestamp = (document: RibbonDocument): RibbonDocument => ({
  ...document,
  metadata: {
    ...document.metadata,
    lastUpdated: nowIso(),
  },
});

const controlFromLibrary = (
  definition: LibraryControlDefinition,
  subgroupId: string,
  overrides?: Partial<RibbonControl>,
): RibbonControl => ({
  id: createId(definition.type),
  subgroupId,
  type: definition.type,
  caption: definition.label,
  tooltip: definition.defaultTooltip,
  condition: '',
  size: definition.supportedSizes.at(-1) ?? 'large',
  supportedSizes: definition.supportedSizes,
  icon: definition.icon,
  behavior: { ...definition.defaultBehavior },
  eventBindings: [],
  aiNotes: definition.defaultAiNotes,
  ...overrides,
});

export const createControlFromType = (
  type: RibbonControl['type'],
  subgroupId: string,
  overrides?: Partial<RibbonControl>,
) => {
  const definition = CONTROL_LIBRARY.find((item) => item.type === type);
  if (!definition) throw new Error(`Unknown control type: ${type}`);
  return controlFromLibrary(definition, subgroupId, overrides);
};

const createGroupGrid = (
  groupId: string,
  caption = '分组网格',
  columns = 8,
  rows = 3,
): RibbonSubgroup => ({
  id: createId('subgroup'),
  groupId,
  caption,
  sizeMode: 'Default',
  verticalAlignment: 'Top',
  layout: { row: 0, columns, rows },
  controlIds: [],
});

export const createEmptyDocument = (): RibbonDocument => {
  const tabId = createId('tab');
  return {
    metadata: createMetadata('空白 Ribbon'),
    tabs: [{ id: tabId, caption: '自定义工具箱', keytip: 'A', groupIds: [] }],
    groups: [],
    subgroups: [],
    controls: [],
  };
};

export const createAddInTemplate = (): RibbonDocument => {
  const tabId = createId('tab');
  const commonGroupId = createId('group');
  const paramGroupId = createId('group');
  const commonGrid = createGroupGrid(commonGroupId, '常用操作布局', 10, 3);
  const paramGrid = createGroupGrid(paramGroupId, '参数设置布局', 9, 3);

  const controls = [
    controlFromLibrary(CONTROL_LIBRARY[0], commonGrid.id, {
      caption: '导出',
      tooltip: '导出结果',
      size: 'large',
      layout: { x: 0, y: 0, w: 2, h: 3 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[1], commonGrid.id, {
      caption: '选择',
      tooltip: '进入选择工具',
      size: 'large',
      layout: { x: 2, y: 0, w: 2, h: 3 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[5], commonGrid.id, {
      caption: '填充样式',
      tooltip: '选择样式模板',
      size: 'large',
      layout: { x: 4, y: 0, w: 3, h: 3 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[4], commonGrid.id, {
      caption: '更多',
      tooltip: '展开更多命令',
      size: 'middle',
      layout: { x: 7, y: 0, w: 2, h: 1 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[8], commonGrid.id, {
      caption: '显示注记',
      tooltip: '切换注记显示',
      size: 'small',
      layout: { x: 7, y: 1, w: 1, h: 1 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[6], paramGrid.id, {
      caption: '行政区划',
      tooltip: '选择行政区划',
      size: 'middle',
      layout: { x: 0, y: 0, w: 3, h: 1 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[7], paramGrid.id, {
      caption: 'C:\\Data\\Project.gdb',
      tooltip: '录入输出路径',
      size: 'middle',
      layout: { x: 0, y: 1, w: 3, h: 1 },
    }),
    controlFromLibrary(CONTROL_LIBRARY[2], paramGrid.id, {
      caption: '添加图层',
      tooltip: '添加数据源',
      size: 'large',
      layout: { x: 3, y: 0, w: 2, h: 2 },
    }),
  ];

  commonGrid.controlIds = controls
    .filter((control) => control.subgroupId === commonGrid.id)
    .map((control) => control.id);
  paramGrid.controlIds = controls
    .filter((control) => control.subgroupId === paramGrid.id)
    .map((control) => control.id);

  return {
    metadata: createMetadata('国土 giser 工具箱 v1.0.0'),
    tabs: [
      {
        id: tabId,
        caption: '国土 giser 工具箱 v1.0.0',
        keytip: 'A',
        groupIds: [commonGroupId, paramGroupId],
      },
    ],
    groups: [
      {
        id: commonGroupId,
        tabId,
        caption: '常用操作',
        keytip: 'CY',
        launcherButton: true,
        sizePriorities: [20, 60, 100],
        subgroupIds: [commonGrid.id],
      },
      {
        id: paramGroupId,
        tabId,
        caption: '参数设置',
        keytip: 'CS',
        launcherButton: false,
        sizePriorities: [30, 80, 120],
        subgroupIds: [paramGrid.id],
      },
    ],
    subgroups: [commonGrid, paramGrid],
    controls,
  };
};

export const createMapTemplate = (): RibbonDocument => {
  const tabId = createId('tab');
  const navGroupId = createId('group');
  const layerGroupId = createId('group');
  const navGrid = createGroupGrid(navGroupId, '导航布局', 8, 3);
  const layerGrid = createGroupGrid(layerGroupId, '图层布局', 10, 3);

  const controls = [
    createControlFromType('tool', navGrid.id, {
      caption: '浏览',
      tooltip: '浏览地图',
      size: 'large',
      layout: { x: 0, y: 0, w: 2, h: 3 },
    }),
    createControlFromType('button', navGrid.id, {
      caption: '上一视图',
      tooltip: '回到上一视图',
      size: 'small',
      layout: { x: 2, y: 0, w: 1, h: 1 },
    }),
    createControlFromType('button', navGrid.id, {
      caption: '下一视图',
      tooltip: '回到下一视图',
      size: 'small',
      layout: { x: 3, y: 0, w: 1, h: 1 },
    }),
    createControlFromType('gallery', navGrid.id, {
      caption: '书签',
      tooltip: '浏览书签',
      size: 'large',
      layout: { x: 4, y: 0, w: 3, h: 3 },
    }),
    createControlFromType('splitButton', layerGrid.id, {
      caption: '添加数据',
      tooltip: '添加数据源',
      size: 'large',
      layout: { x: 0, y: 0, w: 2, h: 2 },
    }),
    createControlFromType('gallery', layerGrid.id, {
      caption: '底图',
      tooltip: '选择底图模板',
      size: 'large',
      layout: { x: 2, y: 0, w: 3, h: 3 },
    }),
    createControlFromType('comboBox', layerGrid.id, {
      caption: '坐标系',
      tooltip: '选择坐标系',
      size: 'middle',
      layout: { x: 5, y: 0, w: 3, h: 1 },
    }),
  ];

  navGrid.controlIds = controls.filter((control) => control.subgroupId === navGrid.id).map((control) => control.id);
  layerGrid.controlIds = controls.filter((control) => control.subgroupId === layerGrid.id).map((control) => control.id);

  return {
    metadata: createMetadata('地图风格 Ribbon'),
    tabs: [{ id: tabId, caption: '地图', keytip: 'M', groupIds: [navGroupId, layerGroupId] }],
    groups: [
      {
        id: navGroupId,
        tabId,
        caption: '导航',
        keytip: 'DH',
        launcherButton: true,
        sizePriorities: [20, 70, 110],
        subgroupIds: [navGrid.id],
      },
      {
        id: layerGroupId,
        tabId,
        caption: '图层',
        keytip: 'TC',
        launcherButton: false,
        sizePriorities: [30, 80, 120],
        subgroupIds: [layerGrid.id],
      },
    ],
    subgroups: [navGrid, layerGrid],
    controls,
  };
};

export const resolveRenderedSize = (
  subgroupMode: RibbonSubgroupSizeMode,
  previewMode: RibbonPreviewMode,
  supportedSizes: RibbonControlSize[],
  preferredSize: RibbonControlSize,
): RibbonControlSize => {
  const desiredSize = (() => {
    switch (subgroupMode) {
      case 'AlwaysLarge':
        return 'large';
      case 'AlwaysMedium':
        return 'middle';
      case 'AlwaysSmall':
        return 'small';
      case 'Default':
        return previewMode === 'Large' ? 'large' : previewMode === 'Medium' ? 'middle' : 'small';
      case 'LargeThenMediumWhenMedium':
        return previewMode === 'Large' ? 'large' : 'middle';
      case 'LargeThenMediumWhenSmall':
        return previewMode === 'Small' ? 'middle' : 'large';
      case 'LargeThenSmallWhenMedium':
        return previewMode === 'Large' ? 'large' : 'small';
      case 'LargeThenSmallWhenSmall':
        return previewMode === 'Small' ? 'small' : 'large';
      case 'MediumThenSmallWhenMedium':
        return previewMode === 'Large' ? 'middle' : 'small';
      case 'MediumThenSmallWhenSmall':
        return previewMode === 'Small' ? 'small' : 'middle';
      default:
        return preferredSize;
    }
  })();

  if (supportedSizes.includes(desiredSize)) return desiredSize;
  if (supportedSizes.includes(preferredSize)) return preferredSize;
  if (desiredSize === 'large') return supportedSizes.includes('middle') ? 'middle' : 'small';
  if (desiredSize === 'middle') return supportedSizes.includes('large') ? 'large' : 'small';
  return supportedSizes.includes('middle') ? 'middle' : 'large';
};

export const getCollapseRank = (sizePriorities: [number, number, number]) => sizePriorities[0];

export const parseImportedDocument = (raw: string): RibbonDocument | null => {
  try {
    const data = JSON.parse(raw) as RibbonDocument;
    if (
      data?.metadata?.app !== 'gispro-ribbon-designer' ||
      data?.metadata?.schemaVersion !== '1.0' ||
      !Array.isArray(data.tabs) ||
      !Array.isArray(data.groups) ||
      !Array.isArray(data.subgroups) ||
      !Array.isArray(data.controls)
    ) {
      return null;
    }
    return cloneDocumentWithTimestamp(data);
  } catch {
    return null;
  }
};

export const getSubgroup = (document: RibbonDocument, subgroupId: string) =>
  document.subgroups.find((item) => item.id === subgroupId);

export const getGroup = (document: RibbonDocument, groupId: string) =>
  document.groups.find((item) => item.id === groupId);

export const getControl = (document: RibbonDocument, controlId: string) =>
  document.controls.find((item) => item.id === controlId);

export const getSubgroupControls = (document: RibbonDocument, subgroup: RibbonSubgroup) =>
  subgroup.controlIds
    .map((controlId) => document.controls.find((control) => control.id === controlId))
    .filter(Boolean) as RibbonControl[];
