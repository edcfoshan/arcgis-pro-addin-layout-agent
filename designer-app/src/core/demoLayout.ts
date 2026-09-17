import type {
  ControlBehavior,
  ControlChild,
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
} from './types';
import { flowLayout } from './ribbonLayout.ts';

// 精选示例布局:3 页签(命令/容器/输入) · 9 个分组,每组只放一种控件类型。
// 覆盖全部 9 类控件、每类的每种支持尺寸,同类给出多个测绘国土业务场景实例。
// 图标为 Tabler 常用名;每次调用生成新的 id/时间戳,导入后可直接编辑不与旧文档冲突。
// 画布显示坐标统一由 core/ribbonLayout.ts 的 flowLayout 按 Pro 实机规则派生,
// 这里不再维护第二份占格/排布表(历史上两份表格漂移过,已合并为单一实现)。

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

interface FlowItem {
  id: string;
  type: ControlType;
  caption: string;
  icon: string;
  size?: RibbonControlSize;
  supportedSizes?: RibbonControl['supportedSizes'];
  /** 「图标」形态:small 下 1×1 纯图标(设计器侧形态,导出仍为 small) */
  iconOnly?: boolean;
  children?: ControlChild[];
}

function flowControls(
  subgroupId: string,
  items: FlowItem[],
): { controls: RibbonControl[]; columns: number } {
  // 排布规则与占格全部走 ribbonLayout.flowLayout(Pro 实机规则:同尺寸连续为段、
  // 尺寸变化换列、段内堆满 3 行再换列;宽度估算含输入类标签+框)
  const rects = flowLayout(
    items.map((item) => ({
      id: item.id,
      type: item.type,
      size: item.size ?? 'middle',
      caption: item.caption,
      iconOnly: item.iconOnly,
    })),
  );
  const controls = items.map((item, index) => {
    const rect = rects[index];
    return control(
      item.id,
      subgroupId,
      item.type,
      item.caption,
      item.icon,
      { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      {
        size: item.size ?? 'middle',
        ...(item.iconOnly ? { iconOnly: true } : {}),
        ...(item.supportedSizes ? { supportedSizes: item.supportedSizes } : {}),
        ...(item.children ? { children: item.children } : {}),
      },
    );
  });
  return { controls, columns: rects.reduce((max, rect) => Math.max(max, rect.x + rect.w), 0) };
}

export function createDemoDocument(): RibbonDocument {
  const tab1 = 'demo-tab-command';
  const tab2 = 'demo-tab-container';
  const tab3 = 'demo-tab-input';
  const gBtn = 'demo-group-btn';
  const gTool = 'demo-group-tool';
  const gSplit = 'demo-group-split';
  const gPalette = 'demo-group-palette';
  const gMenu = 'demo-group-menu';
  const gGallery = 'demo-group-gallery';
  const gCombo = 'demo-group-combo';
  const gEdit = 'demo-group-edit';
  const gCheck = 'demo-group-check';
  const sBtn = 'demo-sub-btn';
  const sTool = 'demo-sub-tool';
  const sSplit = 'demo-sub-split';
  const sPalette = 'demo-sub-palette';
  const sMenu = 'demo-sub-menu';
  const sGallery = 'demo-sub-gallery';
  const sCombo = 'demo-sub-combo';
  const sEdit = 'demo-sub-edit';
  const sCheck = 'demo-sub-check';

  const btn = flowControls(sBtn, [
    { id: 'demo-btn-newlib', type: 'button', caption: '新建要素库', icon: 'images_folder-plus16.png', size: 'large' },
    { id: 'demo-btn-import', type: 'button', caption: '导入 GDB', icon: 'images_file-import16.png' },
    { id: 'demo-btn-export', type: 'button', caption: '导出数据', icon: 'images_file-export16.png' },
    { id: 'demo-btn-rectify', type: 'button', caption: '批量配准', icon: 'images_current-location16.png' },
    { id: 'demo-btn-refresh', type: 'button', caption: '刷新', icon: 'images_refresh16.png', size: 'small' },
    { id: 'demo-btn-clearsel', type: 'button', caption: '清除', icon: 'images_circle-x16.png', size: 'small' },
    { id: 'demo-btn-fullmap', type: 'button', caption: '全图', icon: 'images_arrows-diff16.png', size: 'small' },
    { id: 'demo-btn-topic', type: 'button', caption: '生成专题图', icon: 'images_map-style16.png', size: 'large' },
    { id: 'demo-btn-spaquery', type: 'button', caption: '空间查询', icon: 'images_search16.png' },
    { id: 'demo-btn-report', type: 'button', caption: '质检报告', icon: 'images_file-description16.png' },
    { id: 'demo-btn-print', type: 'button', caption: '打印出图', icon: 'images_printer16.png' },
    // 「图标」形态演示:小尺寸 1×1 纯图标(设计器侧形态,导出为 small,Pro 端是否省略文字由其自适应)
    { id: 'demo-btn-fullscreen', type: 'button', caption: '全屏', icon: 'images_arrows-diff16.png', size: 'small', iconOnly: true },
    { id: 'demo-btn-helpic', type: 'button', caption: '帮助', icon: 'images_help16.png', size: 'small', iconOnly: true },
  ]);

  const tool = flowControls(sTool, [
    { id: 'demo-tool-adddata', type: 'tool', caption: '添加数据', icon: 'images_database16.png', size: 'large' },
    { id: 'demo-tool-select', type: 'tool', caption: '选择', icon: 'images_crosshair16.png', size: 'small' },
    { id: 'demo-tool-zoomin', type: 'tool', caption: '放大', icon: 'images_zoom-in16.png', size: 'small' },
    { id: 'demo-tool-zoomout', type: 'tool', caption: '缩小', icon: 'images_zoom-out16.png', size: 'small' },
    { id: 'demo-tool-pan', type: 'tool', caption: '漫游', icon: 'images_arrows-move16.png', size: 'small' },
    { id: 'demo-tool-dist', type: 'tool', caption: '测距', icon: 'images_ruler16.png', size: 'small' },
    { id: 'demo-tool-bookmark', type: 'tool', caption: '书签', icon: 'images_bookmark16.png', size: 'small' },
    { id: 'demo-tool-coord', type: 'tool', caption: '坐标定位', icon: 'images_map-pin16.png' },
    { id: 'demo-tool-profile', type: 'tool', caption: '剖面分析', icon: 'images_chart-area-lineable16.png' },
    { id: 'demo-tool-swipe', type: 'tool', caption: '卷帘对比', icon: 'images_columns16.png' },
    { id: 'demo-tool-visual', type: 'tool', caption: '影像匀色', icon: 'images_brightness-contrast16.png' },
    { id: 'demo-tool-node', type: 'tool', caption: '节点编辑', icon: 'images_vector-bezier16.png' },
    { id: 'demo-tool-trace', type: 'tool', caption: '界线追踪', icon: 'images_route16.png' },
    { id: 'demo-tool-snap', type: 'tool', caption: '要素快照', icon: 'images_camera16.png' },
  ]);

  const split = flowControls(sSplit, [
    {
      id: 'demo-split-addlayer', type: 'splitButton', caption: '添加图层', icon: 'images_folder-plus16.png', size: 'large',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '添加矢量图层', 'images_stack16.png', 'DemoAddVector'),
        child('button', '添加栅格图层', 'images_map16.png', 'DemoAddRaster'),
        child('button', '添加在线服务', 'images_world16.png', 'DemoAddService'),
      ],
    },
    {
      id: 'demo-split-merge', type: 'splitButton', caption: '要素合并', icon: 'images_layers-union16.png', size: 'large',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '合并所选', 'images_stack16.png', 'DemoMergeSelected'),
        child('button', '联合', 'images_copy16.png', 'DemoUnion'),
      ],
    },
    {
      id: 'demo-split-save', type: 'splitButton', caption: '保存', icon: 'images_save16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '另存为', 'images_file-export16.png', 'DemoSaveAs'),
        child('button', '导出布局 JSON', 'images_code16.png', 'DemoExportJson'),
      ],
    },
    {
      id: 'demo-split-delete', type: 'splitButton', caption: '删除要素', icon: 'images_trash16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '删除所选', 'images_x16.png', 'DemoDeleteSelected'),
        child('button', '清除选择', 'images_circle-x16.png', 'DemoClearSelection'),
      ],
    },
    {
      id: 'demo-split-export', type: 'splitButton', caption: '数据导出', icon: 'images_file-download16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', '导出 Shp', 'images_map16.png', 'DemoExportShp'),
        child('button', '导出 CAD', 'images_file-pencil16.png', 'DemoExportCad'),
        child('button', '导出 Excel', 'images_table16.png', 'DemoExportExcel'),
      ],
    },
    {
      id: 'demo-split-proj', type: 'splitButton', caption: '坐标转换', icon: 'images_refresh16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('button', 'CGCS2000', 'images_world16.png', 'DemoProj2000'),
        child('button', '地方坐标系', 'images_map-pin16.png', 'DemoProjLocal'),
      ],
    },
  ]);

  const palette = flowControls(sPalette, [
    {
      id: 'demo-palette-capture', type: 'toolPalette', caption: '空间采集', icon: 'images_pencil-plus16.png', size: 'large',
      supportedSizes: ['middle', 'large'],
      children: [
        child('tool', '采集点', 'images_circle-dot16.png', 'DemoCapPoint'),
        child('tool', '采集线', 'images_line16.png', 'DemoCapLine'),
        child('tool', '采集面', 'images_polygon16.png', 'DemoCapPoly'),
        child('tool', '镜像', 'images_flip-horizontal16.png', 'DemoCapMirror'),
        child('tool', '旋转', 'images_rotate16.png', 'DemoCapRotate'),
      ],
    },
    {
      id: 'demo-palette-draw', type: 'toolPalette', caption: '绘制', icon: 'images_pencil16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('tool', '绘制点', 'images_circle-dot16.png', 'DemoDrawPoint'),
        child('tool', '绘制线', 'images_line16.png', 'DemoDrawLine'),
        child('tool', '绘制面', 'images_polygon16.png', 'DemoDrawPolygon'),
      ],
    },
    {
      id: 'demo-palette-selset', type: 'toolPalette', caption: '选择集', icon: 'images_cursor-pointer16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('tool', '点选', 'images_crosshair16.png', 'DemoSelPoint'),
        child('tool', '框选', 'images_frame16.png', 'DemoSelRect'),
        child('tool', '多边形选', 'images_polygon16.png', 'DemoSelPoly'),
      ],
    },
    {
      id: 'demo-palette-label', type: 'toolPalette', caption: '标注', icon: 'images_typography16.png',
      supportedSizes: ['middle', 'large'],
      children: [
        child('tool', '注记', 'images_typography16.png', 'DemoLabelNote'),
        child('tool', '引线标注', 'images_arrow-up-right16.png', 'DemoLabelLead'),
        child('tool', '属性标注', 'images_list-details16.png', 'DemoLabelAttr'),
      ],
    },
  ]);

  const menu = flowControls(sMenu, [
    {
      id: 'demo-menu-layermgr', type: 'menu', caption: '图层管理', icon: 'images_layers-linked16.png', size: 'large',
      children: [
        child('button', '新建图层', 'images_folder-plus16.png', 'DemoLayerNew'),
        child('button', '图层属性', 'images_settings16.png', 'DemoLayerProp'),
        child('button', '移除图层', 'images_trash16.png', 'DemoLayerRemove'),
      ],
    },
    {
      id: 'demo-menu-sort', type: 'menu', caption: '排序', icon: 'images_sort-ascending16.png',
      children: [
        child('button', '按名称排序', 'images_list16.png', 'DemoSortByName'),
        child('button', '按类型排序', 'images_filter16.png', 'DemoSortByType'),
      ],
    },
    {
      id: 'demo-menu-print', type: 'menu', caption: '打印', icon: 'images_printer16.png',
      children: [
        child('button', '打印设置', 'images_settings16.png', 'DemoPrintSet'),
        child('button', '打印预览', 'images_eye16.png', 'DemoPrintPreview'),
      ],
    },
    {
      id: 'demo-menu-view', type: 'menu', caption: '视图', icon: 'images_eye16.png',
      children: [
        child('button', '放大镜', 'images_zoom-in16.png', 'DemoViewLens'),
        child('button', '鹰眼图', 'images_map16.png', 'DemoViewOverview'),
        child('button', '全屏', 'images_arrows-diff16.png', 'DemoViewFullscreen'),
      ],
    },
    {
      id: 'demo-menu-help', type: 'menu', caption: '帮助', icon: 'images_help16.png',
      children: [
        child('button', '使用手册', 'images_book16.png', 'DemoHelpManual'),
        child('button', '关于', 'images_info-circle16.png', 'DemoHelpAbout'),
      ],
    },
    { id: 'demo-menu-more', type: 'menu', caption: '更多', icon: 'images_dots16.png', size: 'small' },
    { id: 'demo-menu-share', type: 'menu', caption: '分享', icon: 'images_share16.png', size: 'small' },
    { id: 'demo-menu-setting', type: 'menu', caption: '设置', icon: 'images_settings16.png', size: 'small', iconOnly: true },
  ]);

  const gallery = flowControls(sGallery, [
    { id: 'demo-gallery-template', type: 'gallery', caption: '地图模板', icon: 'images_layout-grid16.png', size: 'large', supportedSizes: ['middle', 'large'] },
    { id: 'demo-gallery-color', type: 'gallery', caption: '色带库', icon: 'images_gradient-horizontal16.png', size: 'large', supportedSizes: ['middle', 'large'] },
    { id: 'demo-gallery-symbol', type: 'gallery', caption: '符号样式', icon: 'images_palette16.png', supportedSizes: ['middle', 'large'] },
    { id: 'demo-gallery-line', type: 'gallery', caption: '线型样式', icon: 'images_line16.png', supportedSizes: ['middle', 'large'] },
    { id: 'demo-gallery-fill', type: 'gallery', caption: '填充样式', icon: 'images_brightness-up16.png', supportedSizes: ['middle', 'large'] },
  ]);

  const combo = flowControls(sCombo, [
    { id: 'demo-combo-source', type: 'comboBox', caption: '数据源', icon: 'images_database16.png', size: 'large' },
    { id: 'demo-combo-crs', type: 'comboBox', caption: '坐标系', icon: 'images_world16.png', size: 'large' },
    { id: 'demo-combo-buffer', type: 'comboBox', caption: '缓冲半径', icon: 'images_crop16.png', size: 'large' },
    { id: 'demo-combo-scale', type: 'comboBox', caption: '比例尺', icon: 'images_ratio16.png' },
    { id: 'demo-combo-filter', type: 'comboBox', caption: '图层过滤', icon: 'images_filter16.png' },
    { id: 'demo-combo-region', type: 'comboBox', caption: '行政区划', icon: 'images_map-pin16.png', size: 'small' },
    { id: 'demo-combo-dcode', type: 'comboBox', caption: '地类编码', icon: 'images_list16.png', size: 'small' },
  ]);

  const edit = flowControls(sEdit, [
    { id: 'demo-edit-path', type: 'editBox', caption: 'D:\\Data\\Project.gdb', icon: 'images_search16.png', size: 'large', supportedSizes: ['middle', 'large'] },
    { id: 'demo-edit-coord', type: 'editBox', caption: '113.2546,23.1291', icon: 'images_map-pin16.png', size: 'large', supportedSizes: ['middle', 'large'] },
    { id: 'demo-edit-note', type: 'editBox', caption: '质检备注...', icon: 'images_pencil16.png', size: 'large', supportedSizes: ['middle', 'large'] },
    { id: 'demo-edit-filter', type: 'editBox', caption: '按属性过滤...', icon: 'images_filter16.png', supportedSizes: ['middle', 'large'] },
    { id: 'demo-edit-sheet', type: 'editBox', caption: '图幅号 F49G', icon: 'images_layout-grid16.png', supportedSizes: ['middle', 'large'] },
    { id: 'demo-edit-prjno', type: 'editBox', caption: '项目编号', icon: 'images_file-description16.png', supportedSizes: ['middle', 'large'] },
  ]);

  const check = flowControls(sCheck, [
    { id: 'demo-check-snap', type: 'checkBox', caption: '捕捉', icon: 'images_focus-216.png', size: 'small', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-label', type: 'checkBox', caption: '显示注记', icon: 'images_typography16.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-readonly', type: 'checkBox', caption: '只读模式', icon: 'images_eye16.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-grid', type: 'checkBox', caption: '网格显示', icon: 'images_layout-grid16.png', size: 'small', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-overlap', type: 'checkBox', caption: '压盖检查', icon: 'images_stack-216.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-boundary', type: 'checkBox', caption: '地类界线', icon: 'images_vector16.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-coord', type: 'checkBox', caption: '显示坐标', icon: 'images_map-pin16.png', size: 'small', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-topo', type: 'checkBox', caption: '拓扑着色', icon: 'images_hexagon16.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-overview', type: 'checkBox', caption: '鹰眼图', icon: 'images_map16.png', supportedSizes: ['small', 'middle'] },
    { id: 'demo-check-magnet', type: 'checkBox', caption: '磁吸', icon: 'images_crosshair16.png', size: 'small', iconOnly: true },
  ]);

  const controls = [
    ...btn.controls, ...tool.controls, ...split.controls, ...palette.controls,
    ...menu.controls, ...gallery.controls, ...combo.controls, ...edit.controls, ...check.controls,
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
      { id: tab1, caption: '命令', keytip: 'T1', groupIds: [gBtn, gTool] },
      { id: tab2, caption: '容器', keytip: 'T2', groupIds: [gSplit, gPalette, gMenu, gGallery] },
      { id: tab3, caption: '输入', keytip: 'T3', groupIds: [gCombo, gEdit, gCheck] },
    ],
    groups: [
      { id: gBtn, tabId: tab1, caption: '按钮', keytip: 'G1', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sBtn] },
      { id: gTool, tabId: tab1, caption: '交互工具', keytip: 'G2', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sTool] },
      { id: gSplit, tabId: tab2, caption: '分裂按钮', keytip: 'G3', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sSplit] },
      { id: gPalette, tabId: tab2, caption: '工具板', keytip: 'G4', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sPalette] },
      { id: gMenu, tabId: tab2, caption: '菜单', keytip: 'G5', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sMenu] },
      { id: gGallery, tabId: tab2, caption: '画廊', keytip: 'G6', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sGallery] },
      { id: gCombo, tabId: tab3, caption: '下拉框', keytip: 'G7', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sCombo] },
      { id: gEdit, tabId: tab3, caption: '输入框', keytip: 'G8', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sEdit] },
      { id: gCheck, tabId: tab3, caption: '复选框', keytip: 'G9', launcherButton: false, sizePriorities: [30, 80, 120], subgroupIds: [sCheck] },
    ],
    subgroups: [
      { id: sBtn, groupId: gBtn, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: btn.columns, rows: 3 }, controlIds: btn.controls.map((c) => c.id) },
      { id: sTool, groupId: gTool, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: tool.columns, rows: 3 }, controlIds: tool.controls.map((c) => c.id) },
      { id: sSplit, groupId: gSplit, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: split.columns, rows: 3 }, controlIds: split.controls.map((c) => c.id) },
      { id: sPalette, groupId: gPalette, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: palette.columns, rows: 3 }, controlIds: palette.controls.map((c) => c.id) },
      { id: sMenu, groupId: gMenu, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: menu.columns, rows: 3 }, controlIds: menu.controls.map((c) => c.id) },
      { id: sGallery, groupId: gGallery, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: gallery.columns, rows: 3 }, controlIds: gallery.controls.map((c) => c.id) },
      { id: sCombo, groupId: gCombo, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: combo.columns, rows: 3 }, controlIds: combo.controls.map((c) => c.id) },
      { id: sEdit, groupId: gEdit, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: edit.columns, rows: 3 }, controlIds: edit.controls.map((c) => c.id) },
      { id: sCheck, groupId: gCheck, caption: '分组网格', sizeMode: 'AlwaysLarge', verticalAlignment: 'Top', layout: { row: 0, columns: check.columns, rows: 3 }, controlIds: check.controls.map((c) => c.id) },
    ],
    controls,
  };
}
