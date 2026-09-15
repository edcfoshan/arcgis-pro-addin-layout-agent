import type {
  ControlBehavior,
  ControlChild,
  ControlType,
  RibbonControl,
  RibbonDocument,
} from './types';

// 精选示例布局:2 页签 · 3 分组,覆盖全部 9 类控件与容器子项;图标为 Tabler 常用名。
// 每次 import 生成新的 id/时间戳,导入后可直接编辑不与旧文档冲突。

function behavior(className: string, target = 'currentView'): ControlBehavior {
  return { commandType: 'button', className, target, arguments: {} };
}

function child(
  type: ControlType,
  caption: string,
  smallIcon: string,
  className: string,
): ControlChild {
  return {
    id: `demo-child-${caption}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    caption,
    tooltip: caption,
    icon: { small: smallIcon, large: smallIcon.replace(/16\.png$/, '32.png') },
    behavior: behavior(className),
  };
}

function control(
  id: string,
  subgroupId: string,
  type: ControlType,
  caption: string,
  smallIcon: string,
  layout: { x: number; y: number; w: number; h: number },
  extra: Partial<RibbonControl> = {},
): RibbonControl {
  return {
    id,
    subgroupId,
    type,
    caption,
    tooltip: `${caption}(示例)`,
    condition: '',
    size: extra.size ?? 'middle',
    supportedSizes: extra.supportedSizes ?? ['small', 'middle', 'large'],
    icon: {
      small: smallIcon,
      large: smallIcon.replace(/16\.png$/, '32.png'),
    },
    behavior: behavior(`Demo${id.replace(/(^|-)(\w)/g, (_m, s, c: string) => (s ? c.toUpperCase() : c))}`),
    eventBindings: [],
    aiNotes: '示例布局控件,可自由修改或删除。',
    layout,
    ...extra,
  };
}

export function createDemoDocument(): RibbonDocument {
  const tab1 = 'demo-tab-data';
  const tab2 = 'demo-tab-edit';
  const g1 = 'demo-group-load';
  const g2 = 'demo-group-layer';
  const g3 = 'demo-group-edit';
  const s1 = 'demo-sub-load';
  const s2 = 'demo-sub-layer';
  const s3 = 'demo-sub-edit';

  const controls: RibbonControl[] = [
    // ---- 分组 1:数据加载(12 列) ----
    control('demo-tool-add-data', s1, 'tool', '添加数据', 'images_database16.png', { x: 0, y: 0, w: 2, h: 3 }, { size: 'large' }),
    control('demo-btn-import', s1, 'button', '导入 GDB', 'images_file-import16.png', { x: 2, y: 0, w: 2, h: 1 }),
    control('demo-btn-export', s1, 'button', '导出数据', 'images_file-export16.png', { x: 2, y: 1, w: 2, h: 1 }),
    control('demo-btn-refresh', s1, 'button', '刷新', 'images_refresh16.png', { x: 2, y: 2, w: 2, h: 1 }),
    control('demo-combo-source', s1, 'comboBox', '数据源', 'images_database16.png', { x: 4, y: 0, w: 4, h: 1 }, { size: 'large', supportedSizes: ['middle', 'large'] }),
    control('demo-edit-path', s1, 'editBox', 'D:\\Data\\Project.gdb', 'images_search16.png', { x: 4, y: 1, w: 4, h: 1 }, { size: 'large', supportedSizes: ['middle', 'large'] }),
    control('demo-check-readonly', s1, 'checkBox', '只读模式', 'images_eye16.png', { x: 4, y: 2, w: 2, h: 1 }, { supportedSizes: ['small', 'middle'] }),
    control('demo-menu-more', s1, 'menu', '更多', 'images_dots16.png', { x: 8, y: 0, w: 2, h: 1 }, {
      children: [
        child('button', '打开数据目录', 'images_folder16.png', 'DemoOpenDataDir'),
        child('button', '数据源设置', 'images_settings16.png', 'DemoSourceSettings'),
      ],
    }),
    control('demo-split-save', s1, 'splitButton', '保存', 'images_save16.png', { x: 10, y: 0, w: 2, h: 3 }, {
      size: 'large',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '另存为', 'images_file-export16.png', 'DemoSaveAs'),
        child('button', '导出布局 JSON', 'images_code16.png', 'DemoExportJson'),
      ],
    }),
    // ---- 分组 2:图层(10 列) ----
    control('demo-tool-select', s2, 'tool', '选择', 'images_crosshair16.png', { x: 0, y: 0, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-zoomin', s2, 'tool', '放大', 'images_zoom-in16.png', { x: 1, y: 0, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-zoomout', s2, 'tool', '缩小', 'images_zoom-out16.png', { x: 2, y: 0, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-locate', s2, 'tool', '转到坐标', 'images_map-pin16.png', { x: 3, y: 0, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-pan', s2, 'tool', '漫游', 'images_arrows-move16.png', { x: 4, y: 0, w: 1, h: 1 }, { size: 'small' }),
    control('demo-split-addlayer', s2, 'splitButton', '添加图层', 'images_folder-plus16.png', { x: 0, y: 1, w: 2, h: 1 }, {
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '添加矢量图层', 'images_stack16.png', 'DemoAddVector'),
        child('button', '添加栅格图层', 'images_map16.png', 'DemoAddRaster'),
        child('button', '添加在线服务', 'images_world16.png', 'DemoAddService'),
      ],
    }),
    control('demo-menu-sort', s2, 'menu', '排序', 'images_sort-ascending16.png', { x: 2, y: 1, w: 2, h: 1 }, {
      children: [
        child('button', '按名称排序', 'images_list16.png', 'DemoSortByName'),
        child('button', '按类型排序', 'images_filter16.png', 'DemoSortByType'),
      ],
    }),
    control('demo-gallery-style', s2, 'gallery', '符号样式', 'images_palette16.png', { x: 4, y: 1, w: 3, h: 1 }, { supportedSizes: ['middle', 'large'] }),
    control('demo-palette-draw', s2, 'toolPalette', '绘制', 'images_pencil16.png', { x: 0, y: 2, w: 3, h: 1 }, {
      supportedSizes: ['middle', 'large'],
      children: [
        child('tool', '绘制点', 'images_circle-dot16.png', 'DemoDrawPoint'),
        child('tool', '绘制线', 'images_line16.png', 'DemoDrawLine'),
        child('tool', '绘制面', 'images_polygon16.png', 'DemoDrawPolygon'),
      ],
    }),
    control('demo-tool-measure', s2, 'tool', '测量', 'images_ruler16.png', { x: 3, y: 2, w: 2, h: 1 }),
    control('demo-tool-bookmark', s2, 'tool', '书签', 'images_bookmark16.png', { x: 5, y: 2, w: 2, h: 1 }),
    control('demo-btn-delete', s2, 'button', '删除图层', 'images_trash16.png', { x: 7, y: 2, w: 2, h: 1 }),
    // ---- 分组 3:编辑(10 列) ----
    control('demo-tool-startedit', s3, 'tool', '开始编辑', 'images_edit16.png', { x: 0, y: 0, w: 2, h: 3 }, { size: 'large' }),
    control('demo-tool-saveedit', s3, 'tool', '保存编辑', 'images_save16.png', { x: 2, y: 0, w: 2, h: 1 }),
    control('demo-tool-undo', s3, 'tool', '撤销', 'images_arrow-back-up16.png', { x: 2, y: 1, w: 2, h: 1 }),
    control('demo-tool-redo', s3, 'tool', '重做', 'images_arrow-forward-up16.png', { x: 2, y: 2, w: 2, h: 1 }),
    control('demo-split-delete', s3, 'splitButton', '删除要素', 'images_trash16.png', { x: 4, y: 0, w: 2, h: 1 }, {
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '删除所选', 'images_x16.png', 'DemoDeleteSelected'),
        child('button', '清除选择', 'images_circle-x16.png', 'DemoClearSelection'),
      ],
    }),
    control('demo-tool-copy', s3, 'tool', '复制', 'images_copy16.png', { x: 4, y: 1, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-cut', s3, 'tool', '剪切', 'images_scissors16.png', { x: 5, y: 1, w: 1, h: 1 }, { size: 'small' }),
    control('demo-tool-paste', s3, 'tool', '粘贴', 'images_clipboard16.png', { x: 6, y: 1, w: 1, h: 1 }, { size: 'small' }),
    control('demo-check-snap', s3, 'checkBox', '捕捉', 'images_focus-216.png', { x: 4, y: 2, w: 2, h: 1 }, { supportedSizes: ['small', 'middle'] }),
    control('demo-edit-filter', s3, 'editBox', '按属性过滤...', 'images_filter16.png', { x: 6, y: 2, w: 4, h: 1 }, { size: 'large', supportedSizes: ['middle', 'large'] }),
  ];

  return {
    metadata: {
      id: `demo-${Date.now().toString(36)}`,
      name: '示例布局',
      app: 'gispro-ribbon-designer',
      schemaVersion: '1.0',
      lastUpdated: new Date().toISOString(),
    },
    tabs: [
      { id: tab1, caption: '数据管理', keytip: 'T1', groupIds: [g1, g2] },
      { id: tab2, caption: '编辑工具', keytip: 'T2', groupIds: [g3] },
    ],
    groups: [
      { id: g1, tabId: tab1, caption: '数据加载', keytip: 'G1', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [s1] },
      { id: g2, tabId: tab1, caption: '图层', keytip: 'G2', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [s2] },
      { id: g3, tabId: tab2, caption: '编辑', keytip: 'G3', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [s3] },
    ],
    subgroups: [
      { id: s1, groupId: g1, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: 12, rows: 3 }, controlIds: controls.filter((c) => c.subgroupId === s1).map((c) => c.id) },
      { id: s2, groupId: g2, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: 10, rows: 3 }, controlIds: controls.filter((c) => c.subgroupId === s2).map((c) => c.id) },
      { id: s3, groupId: g3, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: 10, rows: 3 }, controlIds: controls.filter((c) => c.subgroupId === s3).map((c) => c.id) },
    ],
    controls,
  };
}
