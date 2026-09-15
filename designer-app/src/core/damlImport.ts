// 第三方 DAML → RibbonDocument 逆向解析(尽力还原子集):
// 结构(页签/分组/控件类型/尺寸/标题/keytip/图标引用)尽力还原;布局坐标自动装箱
// (DAML 本身无坐标,Pro 是运行时算的);引用外部声明的 refID 显示为占位控件。
// 不支持的条件/状态/updateModule 等静默忽略并计入 stats。
// 注意:import 显式带 .ts 扩展名(node --experimental-strip-types 可直接跑本文件测试)。
import type {
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonGroup,
  RibbonSubgroup,
  RibbonTab,
} from './types';
import {
  DEFAULT_GROUP_COLS,
  FIXED_GROUP_ROWS,
  MAX_GROUP_COLS,
  getFootprint,
  packRects,
  type GridRect,
} from './ribbonLayout.ts';

// 与控件库一致的尺寸支持表(静态数据,就地内联保持 node 可测)
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

// DAML 标签 → 本设计器控件类型;buttonPalette/dynamicMenu/palette 是真实第三方包(如 CC工具箱)的变体
const DAML_TAG_TO_TYPE: Record<string, ControlType> = {
  button: 'button',
  tool: 'tool',
  splitButton: 'splitButton',
  toolPalette: 'toolPalette',
  buttonPalette: 'toolPalette',
  palette: 'toolPalette',
  menu: 'menu',
  dynamicMenu: 'menu',
  gallery: 'gallery',
  comboBox: 'comboBox',
  editBox: 'editBox',
  checkBox: 'checkBox',
};

export interface DamlImportOptions {
  packageName?: string;
  /** Rust 落盘名映射(DAML 基名 → icon-cache-import 里的文件名) */
  iconMap?: Record<string, string>;
}

export interface DamlImportStats {
  tabs: number;
  groups: number;
  controls: number;
  placeholders: number;
  placeholderGroups: number;
  skippedGroups: number;
  unplacedControls: number;
  ignoredModules: number;
}

export interface DamlImportResult {
  document: RibbonDocument;
  stats: DamlImportStats;
}

// ===== 轻量容错 XML 解析(无 DOM 依赖,兼容注释/无声明头/单双引号/CDATA) =====

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const decodeEntities = (raw: string) =>
  raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '__root__', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let index = 0;
  const length = text.length;

  while (index < length) {
    const next = text.indexOf('<', index);
    if (next < 0) break;
    const current = stack[stack.length - 1];
    current.text += text.slice(index, next);
    index = next;

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index);
      index = end < 0 ? length : end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', index)) {
      const end = text.indexOf(']]>', index);
      current.text += text.slice(index + 9, end < 0 ? length : end);
      index = end < 0 ? length : end + 3;
      continue;
    }
    if (text.startsWith('<?', index) || text.startsWith('<!', index)) {
      const end = text.indexOf('>', index);
      index = end < 0 ? length : end + 1;
      continue;
    }

    const close = text.indexOf('>', index);
    if (close < 0) break;
    const inner = text.slice(index + 1, close);
    index = close + 1;

    if (inner.startsWith('/')) {
      // 闭合标签:向上弹栈到同名即可,不严格校验(容错第三方 DAML)
      const name = inner.slice(1).trim();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const match = body.match(/^([^\s/>]+)([\s\S]*)$/);
    if (!match) continue;
    const element: XmlElement = { name: match[1], attrs: {}, children: [], text: '' };
    const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrPattern.exec(match[2]))) {
      element.attrs[attrMatch[1]] = decodeEntities(attrMatch[2] ?? attrMatch[3] ?? '');
    }
    stack[stack.length - 1].children.push(element);
    if (!selfClosing) stack.push(element);
  }
  return root;
}

// ===== 工具 =====

export const findAll = (element: XmlElement, name: string): XmlElement[] => {
  const out: XmlElement[] = [];
  const walk = (node: XmlElement) => {
    for (const child of node.children) {
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(element);
  return out;
};

const findAllFirst = (element: XmlElement, name: string): XmlElement | undefined =>
  findAll(element, name)[0];

const lastSegment = (id: string) => {
  const parts = id.split(/[\\/:.]+/).map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? id;
};

const sanitizeId = (raw: string) => raw.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80) || 'imported';

const normalizeSize = (raw: string | undefined): RibbonControlSize => {
  const value = (raw ?? '').toLowerCase();
  if (value === 'small') return 'small';
  if (value === 'middle' || value === 'medium') return 'middle';
  return 'large'; // DAML 缺省视为 large(Pro 默认)
};

// DAML 的 Images\x.png / Data/Images/x.png 都取基名
const iconBaseName = (raw: string | undefined): string => {
  if (!raw) return '';
  return raw.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
};

// ===== 主解析 =====

interface DamlDeclaration {
  type: ControlType;
  caption: string;
  className: string;
  condition: string;
  iconSmall: string;
  iconLarge: string;
  tooltip: string;
}

export function parseDamlToDocument(
  damlText: string,
  options: DamlImportOptions = {},
): DamlImportResult {
  const stats: DamlImportStats = {
    tabs: 0,
    groups: 0,
    controls: 0,
    placeholders: 0,
    placeholderGroups: 0,
    skippedGroups: 0,
    unplacedControls: 0,
    ignoredModules: 0,
  };

  const root = parseXml(damlText);
  const modules = findAll(root, 'insertModule');
  stats.ignoredModules = findAll(root, 'updateModule').length;
  if (!modules.length) {
    throw new Error('未找到可导入的 DAML 结构(缺少 insertModule)');
  }

  // 1) 声明注册表:controls/galleries/menus/palettes/splitButtons 五个声明区
  const declarations = new Map<string, DamlDeclaration>();
  for (const module of modules) {
    for (const section of ['controls', 'galleries', 'menus', 'palettes', 'splitButtons']) {
      for (const container of findAll(module, section)) {
        for (const node of container.children) {
          const type = DAML_TAG_TO_TYPE[node.name];
          const id = node.attrs.id;
          if (!type || !id) continue;
          declarations.set(id, {
            type,
            caption: node.attrs.caption ?? '',
            className: node.attrs.className ?? '',
            condition: node.attrs.condition ?? '',
            iconSmall: iconBaseName(node.attrs.smallImage),
            iconLarge: iconBaseName(node.attrs.largeImage),
            tooltip: (findAllFirst(node, 'tooltip')?.text ?? '').trim(),
          });
        }
      }
    }
  }
  // splitButton 自身无 caption/图标、toolPalette 的图标在子工具上:都取第一个子项声明补齐
  const patchContainerFromFirstChild = (node: XmlElement, declaration: DamlDeclaration) => {
    const firstRef = node.children.find((child) => child.attrs.refID)?.attrs.refID;
    const source = firstRef ? declarations.get(firstRef) : undefined;
    if (!source) return;
    if (!declaration.caption) declaration.caption = source.caption;
    if (!declaration.className) declaration.className = source.className;
    if (!declaration.iconSmall) declaration.iconSmall = source.iconSmall;
    if (!declaration.iconLarge) declaration.iconLarge = source.iconLarge;
    // splitButton 无自身 tooltip;primary 子项的 tooltip 是原文(仅编号子项带 " N" 后缀),menu/palette 有自身 tooltip 不受影响
    if (!declaration.tooltip) declaration.tooltip = source.tooltip;
  };
  for (const module of modules) {
    for (const section of findAll(module, 'splitButtons')) {
      for (const node of section.children) {
        if (node.name !== 'splitButton') continue;
        const declaration = declarations.get(node.attrs.id ?? '');
        if (declaration) patchContainerFromFirstChild(node, declaration);
      }
    }
    for (const section of findAll(module, 'palettes')) {
      for (const node of section.children) {
        if (node.name !== 'toolPalette' && node.name !== 'buttonPalette') continue;
        const declaration = declarations.get(node.attrs.id ?? '');
        if (declaration) patchContainerFromFirstChild(node, declaration);
      }
    }
  }

  // 2) 分组声明(仅用于物化被页签引用的分组)
  const groupDeclarations = new Map<string, XmlElement>();
  for (const module of modules) {
    for (const section of findAll(module, 'groups')) {
      for (const node of section.children) {
        if (node.name === 'group' && node.attrs.id) groupDeclarations.set(node.attrs.id, node);
      }
    }
  }
  const referencedGroups = new Set<string>();
  for (const module of modules) {
    for (const tab of findAll(module, 'tab')) {
      for (const ref of tab.children) {
        if (ref.name === 'group' && ref.attrs.refID) referencedGroups.add(ref.attrs.refID);
      }
    }
  }
  for (const id of groupDeclarations.keys()) {
    if (!referencedGroups.has(id)) stats.skippedGroups += 1;
  }

  // 3) 物化:tabs → groups → controls
  const tabs: RibbonTab[] = [];
  const groups: RibbonGroup[] = [];
  const subgroups: RibbonSubgroup[] = [];
  const controls: RibbonControl[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (base: string) => {
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}__${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  };
  const mapIcon = (name: string) =>
    options.iconMap && name && options.iconMap[name] ? options.iconMap[name] : name;

  for (const module of modules) {
    for (const tabsSection of findAll(module, 'tabs')) {
      for (const tabNode of tabsSection.children) {
        if (tabNode.name !== 'tab') continue;
        const tabId = uniqueId(sanitizeId(tabNode.attrs.id ?? `tab_${tabs.length + 1}`));
        // insertIn 修改 Pro 原生页签时自身往往无 caption,用 refID 尾段建"影子页签"
        const tabCaption =
          tabNode.attrs.caption || lastSegment(tabNode.attrs.insertIn ?? tabNode.attrs.id ?? '');
        const tab: RibbonTab = {
          id: tabId,
          caption: tabCaption,
          keytip: tabNode.attrs.keytip ?? '',
          groupIds: [],
        };

        for (const groupRef of tabNode.children) {
          if (groupRef.name !== 'group' || !groupRef.attrs.refID) continue;
          const refId = groupRef.attrs.refID;
          const groupId = uniqueId(sanitizeId(refId));
          const declaration = groupDeclarations.get(refId);
          if (!declaration) {
            // 外部组引用(如 Pro 原生分组):占位空组
            groups.push({
              id: groupId,
              tabId,
              caption: lastSegment(refId),
              keytip: '',
              launcherButton: false,
              sizePriorities: [30, 80, 120],
              subgroupIds: [],
            });
            stats.placeholderGroups += 1;
            tab.groupIds.push(groupId);
            continue;
          }

          const subgroupId = `sg_${groupId}`;
          const groupControls: RibbonControl[] = declaration.children
            .filter((child) => child.attrs.refID && DAML_TAG_TO_TYPE[child.name])
            .map((child) => {
              const refControl = child.attrs.refID as string;
              const decl = declarations.get(refControl);
              const isPlaceholder = !decl;
              const type: ControlType = decl?.type ?? 'button';
              const rawSize = normalizeSize(child.attrs.size);
              const supported = SUPPORTED_SIZES[type];
              // tooltip 文本还原:首行 tooltip,其余滤掉生成器的 handler/target 前缀后作 aiNotes
              const tooltipLines = (decl?.tooltip ?? '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
              const note = isPlaceholder ? `外部引用占位:${refControl}` : '';
              const iconSmallRaw = decl?.iconSmall || decl?.iconLarge || '';
              const iconLargeRaw = decl?.iconLarge || decl?.iconSmall || '';
              const control: RibbonControl = {
                id: uniqueId(sanitizeId(refControl)),
                subgroupId,
                type,
                caption: decl?.caption || lastSegment(refControl),
                tooltip: tooltipLines[0] ?? note,
                condition: decl?.condition ?? '',
                size: rawSize,
                supportedSizes: supported.includes(rawSize) ? supported : [...supported, rawSize],
                icon: { small: mapIcon(iconSmallRaw), large: mapIcon(iconLargeRaw) },
                behavior: {
                  commandType: type,
                  className: decl?.className ?? '',
                  target: '',
                  arguments: {},
                },
                eventBindings: [],
                aiNotes:
                  tooltipLines
                    .slice(1)
                    .filter(
                      (line) =>
                        !line.startsWith('Suggested handler:') && !line.startsWith('Target:'),
                    )
                    .join('\n') || note,
              };
              if (isPlaceholder) stats.placeholders += 1;
              return control;
            });

          // 自动装箱:从 8 列起步逐列加宽到 18,取全部放得下的最小列数(与生成器同算法)
          let placed: GridRect[] = [];
          let columns = DEFAULT_GROUP_COLS;
          for (; columns <= MAX_GROUP_COLS; columns += 1) {
            placed = packRects(
              groupControls.map((control) => ({
                id: control.id,
                footprint: getFootprint(control.type, control.size),
              })),
              { cols: columns, rows: FIXED_GROUP_ROWS },
            );
            if (placed.length === groupControls.length) break;
          }
          const layoutById = new Map(placed.map((rect) => [rect.i, rect]));
          for (const control of groupControls) {
            const rect = layoutById.get(control.id);
            if (rect) control.layout = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
          }
          stats.unplacedControls += groupControls.length - placed.length;

          groups.push({
            id: groupId,
            tabId,
            caption: declaration.attrs.caption || lastSegment(refId),
            keytip: declaration.attrs.keytip ?? '',
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
            controlIds: groupControls.map((control) => control.id),
            layout: { row: 0, columns: Math.min(columns, MAX_GROUP_COLS), rows: FIXED_GROUP_ROWS },
          });
          controls.push(...groupControls);
          tab.groupIds.push(groupId);
        }
        tabs.push(tab);
      }
    }
  }

  // 4) 组装文档(tabs 为空时保持应用不变量:至少一个页签)
  if (!tabs.length) {
    tabs.push({ id: uniqueId('tab_imported'), caption: '页签 1', keytip: '', groupIds: [] });
  }
  const addInName =
    findAllFirst(root, 'Name')?.text.trim() || options.packageName || '导入的 Add-In';
  const document: RibbonDocument = {
    metadata: {
      id: `doc_${Math.random().toString(36).slice(2, 10)}`,
      name: addInName,
      app: 'gispro-ribbon-designer',
      schemaVersion: '1.0',
      lastUpdated: new Date().toISOString(),
    },
    tabs,
    groups,
    subgroups,
    controls,
  };
  stats.tabs = tabs.length;
  stats.groups = groups.length;
  stats.controls = controls.length;
  return { document, stats };
}
