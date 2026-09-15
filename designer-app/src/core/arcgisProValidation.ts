import type {
  ControlChild,
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
} from './types';

export interface ArcGISProValidationOptions {
  assemblyName?: string;
  rootNamespace?: string;
  addInId?: string;
  version?: string;
  desktopVersion?: string;
  author?: string;
  company?: string;
  description?: string;
  subject?: string;
  moduleId?: string;
  moduleClassName?: string;
  moduleCaption?: string;
}

export interface ArcGISProValidationArtifacts {
  configDaml: string;
  generatedControls: string;
  layoutSnapshot: string;
  packageFileName: string;
  projectName: string;
  iconFiles: string[];
  options: Required<ArcGISProValidationOptions>;
}

interface GeneratedLeafControl {
  id: string;
  type: 'button' | 'tool' | 'comboBox' | 'editBox' | 'checkBox' | 'gallery';
  caption: string;
  tooltip: string;
  keytip: string;
  className: string;
  suggestedClassName: string;
  target: string;
  aiNotes: string;
  size: RibbonControlSize;
  comboItems?: string[];
  editHint?: string;
  galleryItems?: string[];
  smallImage?: string;
  largeImage?: string;
}

// 容器子项引用:tag 决定 DAML 容器体内 refID 行的标签
interface GeneratedChildRef {
  id: string;
  tag: 'button' | 'tool' | 'menu' | 'splitButton' | 'toolPalette';
}

interface GeneratedMenu {
  id: string;
  caption: string;
  tooltip: string;
  keytip: string;
  smallImage?: string;
  largeImage?: string;
  size: RibbonControlSize;
  childRefs: GeneratedChildRef[];
}

interface GeneratedSplitButton {
  id: string;
  size: RibbonControlSize;
  primaryId: string;
  childRefs: GeneratedChildRef[];
}

interface GeneratedToolPalette {
  id: string;
  caption: string;
  tooltip: string;
  size: RibbonControlSize;
  menuStyle: boolean;
  childRefs: GeneratedChildRef[];
}

interface GeneratedGroupItem {
  kind: 'button' | 'tool' | 'menu' | 'splitButton' | 'comboBox' | 'editBox' | 'checkBox' | 'gallery' | 'toolPalette';
  refId: string;
  size?: RibbonControlSize;
  variant?: RibbonControl['variant'];
}

interface GeneratedGroup {
  id: string;
  caption: string;
  keytip: string;
  subgroupIds: string[];
}

const DEFAULT_OPTIONS: Required<ArcGISProValidationOptions> = {
  assemblyName: 'GisProRibbonLayoutValidator.AddIn',
  rootNamespace: 'GisProRibbonLayoutValidator.AddIn',
  addInId: '',
  version: '1.0.0',
  desktopVersion: '3.5.0',
  author: 'Codex',
  company: 'OpenAI',
  description: 'Generated from the Ribbon designer to validate ArcGIS Pro 3.5 ribbon layout.',
  subject: 'Ribbon layout validation',
  moduleId: 'GisProRibbonLayoutValidator_AddIn_Module',
  moduleClassName: 'AddInModule',
  moduleCaption: 'Ribbon Layout Validator',
};

const buildVersionFromDocument = (document: RibbonDocument) => {
  const lastUpdated = Date.parse(document.metadata.lastUpdated || '');
  const sourceTime = Number.isNaN(lastUpdated) ? Date.now() : lastUpdated;
  const daysSinceEpoch = Math.floor(sourceTime / 86_400_000);
  const secondsOfDay = Math.floor((sourceTime % 86_400_000) / 1000);
  return `1.${daysSinceEpoch % 65_535}.${Math.floor(secondsOfDay / 2)}`;
};

const fallbackCaptionByType: Record<ControlType, string> = {
  button: '按钮',
  tool: '工具',
  splitButton: '分裂按钮',
  toolPalette: '工具板',
  menu: '菜单',
  gallery: '画廊',
  checkBox: '复选框',
  comboBox: '下拉框',
  editBox: '输入框',
};

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sanitizeToken = (value: string, fallback = 'item') => {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `${fallback}_${cleaned}`;
};

const toPascalCase = (value: string, fallback = 'Item') => {
  const token = sanitizeToken(value, fallback);
  return token
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
};

const hash32 = (input: string, seed: number) => {
  let hash = seed >>> 0;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const toHex = (value: number) => value.toString(16).padStart(8, '0');

const stableGuid = (value: string) => {
  const part1 = toHex(hash32(value, 0x811c9dc5));
  const part2 = toHex(hash32(`${value}:b`, 0x9e3779b9));
  const part3 = toHex(hash32(`${value}:c`, 0x85ebca6b));
  const part4 = toHex(hash32(`${value}:d`, 0xc2b2ae35));
  const raw = `${part1}${part2}${part3}${part4}`.slice(0, 32);
  const chars = raw.split('');
  chars[12] = '4';
  chars[16] = ['8', '9', 'a', 'b'][Number.parseInt(chars[16] ?? '0', 16) % 4];
  const normalized = chars.join('');
  return `{${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}}`;
};

const buildTooltipText = (control: RibbonControl) => {
  const parts = [
    control.tooltip.trim(),
    control.aiNotes.trim(),
    control.behavior.className ? `Suggested handler: ${control.behavior.className}` : '',
    control.behavior.target ? `Target: ${control.behavior.target}` : '',
  ].filter(Boolean);
  return parts.join('\n');
};

const buildComboItems = (control: RibbonControl) => {
  const base = control.caption || fallbackCaptionByType.comboBox;
  const values = Object.values(control.behavior.arguments);
  const items = values.length
    ? values
    : [`${base} A`, `${base} B`, `${base} C`];
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, 6);
};

const buildGalleryItems = (control: RibbonControl) => {
  const base = control.caption || fallbackCaptionByType.gallery;
  return [`${base} 方案 A`, `${base} 方案 B`, `${base} 方案 C`, `${base} 方案 D`];
};

const resolveOptions = (
  document: RibbonDocument,
  overrides?: ArcGISProValidationOptions,
): Required<ArcGISProValidationOptions> => {
  const merged = { ...DEFAULT_OPTIONS, ...overrides };
  const version = overrides?.version || buildVersionFromDocument(document);
  return {
    ...merged,
    version,
    addInId:
      merged.addInId ||
      stableGuid(
        `${merged.assemblyName}:${document.metadata.id}:${document.metadata.name}:${document.metadata.lastUpdated}`,
      ),
    moduleCaption: overrides?.moduleCaption || document.metadata.name || DEFAULT_OPTIONS.moduleCaption,
  };
};

const createRefId = (projectToken: string, suffix: string) => `${projectToken}_${sanitizeToken(suffix)}`;

const createLeafControl = (
  projectToken: string,
  control: RibbonControl,
  type: GeneratedLeafControl['type'],
  order: number,
  labelSuffix?: string,
): GeneratedLeafControl => {
  const suffix = labelSuffix ? `${control.id}_${labelSuffix}` : control.id;
  const token = sanitizeToken(suffix, `${type}_${order + 1}`);
  const suggestedClassName = control.behavior.className || toPascalCase(`${control.type}_${control.id}`, 'GeneratedControl');
  const baseClassName = `${toPascalCase(suggestedClassName, 'GeneratedControl')}Placeholder${token}`;
  return {
    id: createRefId(projectToken, suffix),
    type,
    caption: control.caption || fallbackCaptionByType[control.type],
    tooltip: buildTooltipText(control),
    keytip: `C${order + 1}`,
    className: `Generated.${baseClassName}`,
    suggestedClassName,
    target: control.behavior.target,
    aiNotes: control.aiNotes,
    size: control.size,
    comboItems: type === 'comboBox' ? buildComboItems(control) : undefined,
    editHint: type === 'editBox' ? control.caption || control.tooltip || '输入内容' : undefined,
    galleryItems: type === 'gallery' ? buildGalleryItems(control) : undefined,
    smallImage: control.icon.small || undefined,
    largeImage: control.icon.large || undefined,
  };
};

const sortControlsForGroup = (controls: RibbonControl[]) =>
  [...controls].sort((left, right) => {
    const ly = left.layout?.y ?? Number.MAX_SAFE_INTEGER;
    const ry = right.layout?.y ?? Number.MAX_SAFE_INTEGER;
    if (ly !== ry) return ly - ry;
    const lx = left.layout?.x ?? Number.MAX_SAFE_INTEGER;
    const rx = right.layout?.x ?? Number.MAX_SAFE_INTEGER;
    if (lx !== rx) return lx - rx;
    return left.id.localeCompare(right.id);
  });

const buildArtifactsModel = (document: RibbonDocument, options: Required<ArcGISProValidationOptions>) => {
  const projectToken = sanitizeToken(options.assemblyName.replace(/\./g, '_'), 'RibbonLayoutValidator');
  const generatedGroups: GeneratedGroup[] = [];
  const leafControls: GeneratedLeafControl[] = [];
  const menus: GeneratedMenu[] = [];
  const splitButtons: GeneratedSplitButton[] = [];
  const toolPalettes: GeneratedToolPalette[] = [];
  const leafByControlId = new Map<string, GeneratedGroupItem>();
  let order = 0;

  const registerLeaf = (control: RibbonControl, type: GeneratedLeafControl['type'], labelSuffix?: string) => {
    const leaf = createLeafControl(projectToken, control, type, order++, labelSuffix);
    leafControls.push(leaf);
    return leaf;
  };

  // 子项转控件形状(仅 leaf 注册所需字段;aiNotes 无子项级语义置空)
  const childAsControl = (base: RibbonControl, child: ControlChild): RibbonControl => ({
    ...base,
    id: child.id,
    type: child.type,
    caption: child.caption,
    tooltip: child.tooltip || child.caption,
    icon: child.icon,
    behavior: child.behavior,
    children: undefined,
  });

  // 递归注册子项树:叶子注册为 leaf,容器子项再生为容器声明(任意嵌套深度)
  const registerChildTree = (
    base: RibbonControl,
    child: ControlChild,
    path: string,
  ): GeneratedChildRef => {
    const childControl = childAsControl(base, child);
    if (
      child.type === 'menu' ||
      child.type === 'splitButton' ||
      child.type === 'toolPalette'
    ) {
      const grandChildRefs = child.children?.length
        ? child.children.map((grandChild, index) =>
            registerChildTree(childControl, grandChild, `${path}_${index + 1}`),
          )
        : [];
      if (child.type === 'menu') {
        const menuId = createRefId(projectToken, `${path}_menu`);
        menus.push({
          id: menuId,
          caption: child.caption || fallbackCaptionByType.menu,
          tooltip: buildTooltipText(childControl),
          keytip: `M${order}`,
          size: childControl.size,
          smallImage: child.icon.small?.endsWith('.png') ? child.icon.small : undefined,
          largeImage: child.icon.large?.endsWith('.png') ? child.icon.large : undefined,
          childRefs: grandChildRefs,
        });
        return { id: menuId, tag: 'menu' };
      }
      if (child.type === 'splitButton') {
        const splitId = createRefId(projectToken, `${path}_split`);
        const primaryRef = grandChildRefs.find((ref) => ref.tag === 'button');
        const primaryId =
          primaryRef?.id ??
          registerLeaf(
            {
              ...childControl,
              id: `${path}_primary`,
              type: 'button',
              caption: child.caption || fallbackCaptionByType.splitButton,
            },
            'button',
          ).id;
        splitButtons.push({
          id: splitId,
          size: childControl.size,
          primaryId,
          childRefs: grandChildRefs.filter((ref) => ref.id !== primaryId),
        });
        return { id: splitId, tag: 'splitButton' };
      }
      const paletteId = createRefId(projectToken, `${path}_palette`);
      toolPalettes.push({
        id: paletteId,
        caption: child.caption || fallbackCaptionByType.toolPalette,
        tooltip: buildTooltipText(childControl),
        size: childControl.size,
        menuStyle: false,
        childRefs: grandChildRefs,
      });
      return { id: paletteId, tag: 'toolPalette' };
    }
    const leaf = registerLeaf(childControl, child.type === 'tool' ? 'tool' : 'button');
    return { id: leaf.id, tag: child.type === 'tool' ? 'tool' : 'button' };
  };

  document.controls.forEach((control) => {
    switch (control.type) {
      case 'button': {
        const leaf = registerLeaf(control, 'button');
        leafByControlId.set(control.id, { kind: 'button', refId: leaf.id, size: control.size });
        break;
      }
      case 'tool': {
        const leaf = registerLeaf(control, 'tool');
        leafByControlId.set(control.id, { kind: 'tool', refId: leaf.id, size: control.size });
        break;
      }
      case 'comboBox': {
        const leaf = registerLeaf(control, 'comboBox');
        leafByControlId.set(control.id, { kind: 'comboBox', refId: leaf.id, size: control.size });
        break;
      }
      case 'editBox': {
        const leaf = registerLeaf(control, 'editBox');
        leafByControlId.set(control.id, { kind: 'editBox', refId: leaf.id, size: control.size });
        break;
      }
      case 'checkBox': {
        const leaf = registerLeaf(control, 'checkBox');
        leafByControlId.set(control.id, { kind: 'checkBox', refId: leaf.id, size: control.size });
        break;
      }
      case 'gallery': {
        const leaf = registerLeaf(control, 'gallery');
        leafByControlId.set(control.id, { kind: 'gallery', refId: leaf.id, size: control.size });
        break;
      }
      case 'menu': {
        const menuId = createRefId(projectToken, `${control.id}_menu`);
        const childRefs = control.children?.length
          ? control.children.map((child, index) =>
              registerChildTree(control, child, `${control.id}_c${index + 1}`),
            )
          : ['第一项', '第二项', '第三项'].map((caption, index) => {
              const child = registerLeaf(
                {
                  ...control,
                  id: `${control.id}_menu_item_${index + 1}`,
                  type: 'button',
                  caption: `${control.caption || fallbackCaptionByType.menu}${caption}`,
                  tooltip: `${control.tooltip || '菜单项'} ${index + 1}`,
                  aiNotes: control.aiNotes,
                  behavior: control.behavior,
                },
                'button',
              );
              return { id: child.id, tag: 'button' as const };
            });
        menus.push({
          id: menuId,
          caption: control.caption || fallbackCaptionByType.menu,
          tooltip: buildTooltipText(control),
          keytip: `M${order}`,
          size: control.size,
          smallImage: control.icon?.small?.endsWith('.png') ? control.icon.small : undefined,
          largeImage: control.icon?.large?.endsWith('.png') ? control.icon.large : undefined,
          childRefs,
        });
        leafByControlId.set(control.id, { kind: 'menu', refId: menuId, size: control.size });
        break;
      }
      case 'splitButton': {
        const splitId = createRefId(projectToken, `${control.id}_split`);
        let primaryId: string;
        let childRefs: GeneratedChildRef[];
        if (control.children?.length) {
          childRefs = control.children.map((child, index) =>
            registerChildTree(control, child, `${control.id}_c${index + 1}`),
          );
          const primaryRef = childRefs.find((ref) => ref.tag === 'button');
          if (primaryRef) {
            primaryId = primaryRef.id;
            childRefs = childRefs.filter((ref) => ref.id !== primaryId);
          } else {
            primaryId = registerLeaf(
              {
                ...control,
                id: `${control.id}_primary`,
                type: 'button',
                caption: control.caption || fallbackCaptionByType.splitButton,
              },
              'button',
            ).id;
          }
        } else {
          primaryId = registerLeaf(
            {
              ...control,
              id: `${control.id}_primary`,
              type: 'button',
              caption: control.caption || fallbackCaptionByType.splitButton,
            },
            'button',
          ).id;
          childRefs = ['主选项', '备选项'].map((caption, index) => {
            const child = registerLeaf(
              {
                ...control,
                id: `${control.id}_split_item_${index + 1}`,
                type: 'button',
                caption: `${control.caption || fallbackCaptionByType.splitButton}${caption}`,
                tooltip: `${control.tooltip || '分裂按钮项'} ${index + 1}`,
              },
              'button',
            );
            return { id: child.id, tag: 'button' as const };
          });
        }
        splitButtons.push({
          id: splitId,
          size: control.size,
          primaryId,
          childRefs,
        });
        leafByControlId.set(control.id, { kind: 'splitButton', refId: splitId, size: control.size });
        break;
      }
      case 'toolPalette': {
        const paletteId = createRefId(projectToken, `${control.id}_palette`);
        const childRefs = control.children?.length
          ? control.children.map((child, index) =>
              registerChildTree(control, child, `${control.id}_c${index + 1}`),
            )
          : ['浏览', '拾取', '绘制'].map((caption, index) => {
              const child = registerLeaf(
                {
                  ...control,
                  id: `${control.id}_palette_tool_${index + 1}`,
                  type: 'tool',
                  caption: `${control.caption || fallbackCaptionByType.toolPalette}${caption}`,
                  tooltip: `${control.tooltip || '工具板子工具'} ${index + 1}`,
                },
                'tool',
              );
              return { id: child.id, tag: 'tool' as const };
            });
        toolPalettes.push({
          id: paletteId,
          caption: control.caption || fallbackCaptionByType.toolPalette,
          tooltip: buildTooltipText(control),
          size: control.size,
          menuStyle: control.variant === 'menuStyle',
          childRefs,
        });
        leafByControlId.set(control.id, {
          kind: 'toolPalette',
          refId: paletteId,
          size: control.size,
          variant: control.variant,
        });
        break;
      }
      default:
        break;
    }
  });

  document.groups.forEach((group, groupIndex) => {
    generatedGroups.push({
      id: createRefId(projectToken, group.id),
      caption: group.caption,
      keytip: group.keytip || `G${groupIndex + 1}`,
      subgroupIds: group.subgroupIds.map((subgroupId) => createRefId(projectToken, subgroupId)),
    });
  });

  return {
    projectToken,
    generatedGroups,
    leafByControlId,
    leafControls,
    menus,
    splitButtons,
    toolPalettes,
  };
};

const indent = (level: number, value: string) =>
  value
    .split('\n')
    .map((line) => `${'  '.repeat(level)}${line}`)
    .join('\n');

const renderTooltip = (caption: string, tooltip: string) => {
  const normalized = tooltip.trim();
  if (!normalized) return '';
  return `<tooltip heading="${xmlEscape(caption)}">${xmlEscape(normalized)}</tooltip>`;
};

const renderLeafControl = (control: GeneratedLeafControl) => {
  const tooltip = renderTooltip(control.caption, control.tooltip);
  const className = xmlEscape(control.className);
  const caption = xmlEscape(control.caption);
  const keytip = xmlEscape(control.keytip);
  const imageAttrs = [
    control.smallImage ? ` smallImage="Images\\${xmlEscape(control.smallImage)}"` : '',
    control.largeImage ? ` largeImage="Images\\${xmlEscape(control.largeImage)}"` : '',
  ].join('');
  switch (control.type) {
    case 'button':
    case 'tool':
      return [
        `<${control.type} id="${control.id}" caption="${caption}" className="${className}" loadOnClick="true" keytip="${keytip}"${imageAttrs}>`,
        tooltip ? indent(1, tooltip) : '',
        `</${control.type}>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'comboBox':
      return [
        `<comboBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}" isEditable="false" isReadOnly="true" sizeString="${xmlEscape(control.caption)}"${imageAttrs}>`,
        tooltip ? indent(1, tooltip) : '',
        `</comboBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'editBox':
      return [
        `<editBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}" sizeString="${xmlEscape(control.editHint || control.caption)}" editHint="${xmlEscape(control.editHint || control.caption)}"${imageAttrs}>`,
        tooltip ? indent(1, tooltip) : '',
        `</editBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'checkBox':
      return [
        `<checkBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}"${imageAttrs}>`,
        tooltip ? indent(1, tooltip) : '',
        `</checkBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'gallery':
      return [
        `<gallery id="${control.id}" caption="${caption}" className="${className}" itemsInRow="3" showItemCaption="true" itemWidth="96"${imageAttrs}>`,
        tooltip ? indent(1, tooltip) : '',
        `</gallery>`,
      ]
        .filter(Boolean)
        .join('\n');
    default:
      return '';
  }
};

const renderGroupItem = (item: GeneratedGroupItem) => {
  const sizeAttr = item.size ? ` size="${item.size}"` : '';
  switch (item.kind) {
    case 'button':
      return `<button refID="${item.refId}"${sizeAttr} />`;
    case 'tool':
      return `<tool refID="${item.refId}"${sizeAttr} />`;
    case 'menu':
      return `<menu refID="${item.refId}"${sizeAttr} />`;
    case 'splitButton':
      return `<splitButton refID="${item.refId}"${sizeAttr} />`;
    case 'comboBox':
      return `<comboBox refID="${item.refId}"${sizeAttr} />`;
    case 'editBox':
      return `<editBox refID="${item.refId}"${sizeAttr} />`;
    case 'checkBox':
      return `<checkBox refID="${item.refId}"${sizeAttr} />`;
    case 'gallery':
      return `<gallery refID="${item.refId}"${sizeAttr} />`;
    case 'toolPalette':
      return item.variant === 'menuStyle'
        ? `<buttonPalette refID="${item.refId}"${sizeAttr} />`
        : `<toolPalette refID="${item.refId}"${sizeAttr} />`;
    default:
      return '';
  }
};

const renderConfigDaml = (
  document: RibbonDocument,
  options: Required<ArcGISProValidationOptions>,
  model: ReturnType<typeof buildArtifactsModel>,
) => {
  const assemblyDll = `${options.assemblyName}.dll`;
  const tabs = document.tabs
    .map((tab, index) => {
      const groupRefs = document.groups
        .filter((group) => group.tabId === tab.id)
        .map((group) => model.generatedGroups.find((item) => item.id === createRefId(model.projectToken, group.id)))
        .filter(Boolean) as GeneratedGroup[];
      return [
        `<tab id="${createRefId(model.projectToken, tab.id)}" caption="${xmlEscape(tab.caption)}" keytip="${xmlEscape(tab.keytip || `T${index + 1}`)}">`,
        ...groupRefs.map((group) => indent(1, `<group refID="${group.id}" />`)),
        `</tab>`,
      ].join('\n');
    })
    .join('\n');

  const groups = model.generatedGroups
    .map((group) => {
      const relatedControls = sortControlsForGroup(
        document.controls.filter((control) => group.subgroupIds.includes(createRefId(model.projectToken, control.subgroupId))),
      );
      const directItems = relatedControls
        .map((control) => model.leafByControlId.get(control.id))
        .filter(Boolean) as GeneratedGroupItem[];

      return [
        `<group id="${group.id}" caption="${xmlEscape(group.caption)}" keytip="${xmlEscape(group.keytip)}">`,
        ...directItems.map((item) => indent(1, renderGroupItem(item))),
        `</group>`,
      ].join('\n');
    })
    .join('\n');

  const controls = model.leafControls
    .filter((control) => control.type !== 'gallery')
    .map((control) => renderLeafControl(control))
    .join('\n');

  const galleries = model.leafControls
    .filter((control) => control.type === 'gallery')
    .map((control) => renderLeafControl(control))
    .join('\n');

  const menus = model.menus
    .map((menu) =>
      [
        `<menu id="${menu.id}" caption="${xmlEscape(menu.caption)}" keytip="${xmlEscape(menu.keytip)}"${menu.smallImage ? ` smallImage="Images\\${xmlEscape(menu.smallImage)}"` : ''}${menu.largeImage ? ` largeImage="Images\\${xmlEscape(menu.largeImage)}"` : ''}>`,
        menu.tooltip ? indent(1, renderTooltip(menu.caption, menu.tooltip)) : '',
        ...menu.childRefs.map((ref) => indent(1, `<${ref.tag} refID="${ref.id}" />`)),
        `</menu>`,
      ].join('\n'),
    )
    .join('\n');

  const splitButtons = model.splitButtons
    .map((splitButton) =>
      [
        `<splitButton id="${splitButton.id}">`,
        indent(1, `<button refID="${splitButton.primaryId}" />`),
        ...splitButton.childRefs.map((ref) => indent(1, `<${ref.tag} refID="${ref.id}" />`)),
        `</splitButton>`,
      ].join('\n'),
    )
    .join('\n');

  const palettes = model.toolPalettes
    .map((palette) =>
      [
        palette.menuStyle
          ? `<buttonPalette id="${palette.id}" caption="${xmlEscape(palette.caption)}" dropDown="false" menuStyle="true">`
          : `<toolPalette id="${palette.id}" caption="${xmlEscape(palette.caption)}" showItemCaption="true" itemWidth="96" itemHeight="64" itemsInRow="2">`,
        palette.tooltip ? indent(1, renderTooltip(palette.caption, palette.tooltip)) : '',
        ...palette.childRefs.map((ref) => indent(1, `<${ref.tag} refID="${ref.id}" />`)),
        palette.menuStyle ? `</buttonPalette>` : `</toolPalette>`,
      ].join('\n'),
    )
    .join('\n');

  return [
    `<?xml version="1.0" encoding="utf-8" ?>`,
    `<ArcGIS defaultAssembly="${xmlEscape(assemblyDll)}" defaultNamespace="${xmlEscape(options.rootNamespace)}" xmlns="http://schemas.esri.com/DADF/Registry" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    indent(1, [
      `<AddInInfo id="${options.addInId}" version="${xmlEscape(options.version)}" desktopVersion="${xmlEscape(options.desktopVersion)}">`,
      indent(1, `<Name>${xmlEscape(document.metadata.name || options.moduleCaption)}</Name>`),
      indent(1, `<Description>${xmlEscape(options.description)}</Description>`),
      indent(1, `<Author>${xmlEscape(options.author)}</Author>`),
      indent(1, `<Company>${xmlEscape(options.company)}</Company>`),
      indent(1, `<Date>${xmlEscape(new Date(document.metadata.lastUpdated).toISOString().slice(0, 10))}</Date>`),
      indent(1, `<Subject>${xmlEscape(options.subject)}</Subject>`),
      `</AddInInfo>`,
    ].join('\n')),
    indent(1, [
      `<modules>`,
      indent(1, [
        `<insertModule id="${xmlEscape(options.moduleId)}" className="${xmlEscape(options.moduleClassName)}" autoLoad="false" caption="${xmlEscape(options.moduleCaption)}">`,
        tabs ? indent(1, `<tabs>\n${indent(1, tabs)}\n</tabs>`) : '',
        groups ? indent(1, `<groups>\n${indent(1, groups)}\n</groups>`) : '',
        controls ? indent(1, `<controls>\n${indent(1, controls)}\n</controls>`) : '',
        galleries ? indent(1, `<galleries>\n${indent(1, galleries)}\n</galleries>`) : '',
        splitButtons ? indent(1, `<splitButtons>\n${indent(1, splitButtons)}\n</splitButtons>`) : '',
        palettes ? indent(1, `<palettes>\n${indent(1, palettes)}\n</palettes>`) : '',
        menus ? indent(1, `<menus>\n${indent(1, menus)}\n</menus>`) : '',
        `</insertModule>`,
      ]
        .filter(Boolean)
        .join('\n')),
      `</modules>`,
    ].join('\n')),
    `</ArcGIS>`,
  ].join('\n');
};

const escapeCSharp = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const renderStringArray = (values: string[]) =>
  values.length ? `new[] { ${values.map((value) => `"${escapeCSharp(value)}"`).join(', ')} }` : 'Array.Empty<string>()';

const renderGeneratedControlClass = (control: GeneratedLeafControl) => {
  const fullClassName = control.className.split('.').at(-1) ?? toPascalCase(control.id);
  switch (control.type) {
    case 'button':
      return [
        `internal sealed class ${fullClassName} : LayoutButtonBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}", "${escapeCSharp(control.target)}")`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    case 'tool':
      return [
        `internal sealed class ${fullClassName} : LayoutToolBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}", "${escapeCSharp(control.target)}")`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    case 'comboBox':
      return [
        `internal sealed class ${fullClassName} : LayoutComboBoxBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}", ${renderStringArray(control.comboItems ?? [])})`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    case 'editBox':
      return [
        `internal sealed class ${fullClassName} : LayoutEditBoxBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}", "${escapeCSharp(control.editHint || control.caption)}")`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    case 'checkBox':
      return [
        `internal sealed class ${fullClassName} : LayoutCheckBoxBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}")`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    case 'gallery':
      return [
        `internal sealed class ${fullClassName} : LayoutGalleryBase`,
        `{`,
        `    public ${fullClassName}() : base("${escapeCSharp(control.caption)}", "${escapeCSharp(control.suggestedClassName)}", ${renderStringArray(control.galleryItems ?? [])})`,
        `    {`,
        `    }`,
        `}`,
      ].join('\n');
    default:
      return '';
  }
};

const renderGeneratedControls = (
  options: Required<ArcGISProValidationOptions>,
  controls: GeneratedLeafControl[],
) => [
  `using System;`,
  ``,
  `namespace ${options.rootNamespace}.Generated;`,
  ``,
  ...controls.map((control) => renderGeneratedControlClass(control)),
].join('\n\n');

export const buildArcGISProValidationArtifacts = (
  document: RibbonDocument,
  overrides?: ArcGISProValidationOptions,
): ArcGISProValidationArtifacts => {
  const options = resolveOptions(document, overrides);
  const model = buildArtifactsModel(document, options);
  const packageVersion = options.version.replace(/[^0-9A-Za-z.-]/g, '_');
  const iconFiles = Array.from(
    new Set(
      document.controls.flatMap((control) =>
        [control.icon.small, control.icon.large].filter(
          (name): name is string => Boolean(name) && name.endsWith('.png'),
        ),
      ),
    ),
  ).sort();
  return {
    configDaml: renderConfigDaml(document, options, model),
    generatedControls: renderGeneratedControls(options, model.leafControls),
    layoutSnapshot: JSON.stringify(document, null, 2),
    packageFileName: `${options.assemblyName}-${packageVersion}.esriAddInX`,
    projectName: options.assemblyName,
    iconFiles,
    options,
  };
};

export const buildConfigDaml = (
  document: RibbonDocument,
  overrides?: ArcGISProValidationOptions,
) => buildArcGISProValidationArtifacts(document, overrides).configDaml;
