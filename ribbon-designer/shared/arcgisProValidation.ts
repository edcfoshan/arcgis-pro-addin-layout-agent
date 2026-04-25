import type {
  ControlType,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
} from '../src/types';

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
}

interface GeneratedMenu {
  id: string;
  caption: string;
  tooltip: string;
  keytip: string;
  size: RibbonControlSize;
  childIds: string[];
}

interface GeneratedSplitButton {
  id: string;
  size: RibbonControlSize;
  primaryId: string;
  childIds: string[];
}

interface GeneratedToolPalette {
  id: string;
  caption: string;
  size: RibbonControlSize;
  childIds: string[];
}

interface GeneratedSubgroup {
  id: string;
  items: GeneratedGroupItem[];
}

interface GeneratedGroupItem {
  kind: 'button' | 'tool' | 'menu' | 'splitButton' | 'comboBox' | 'editBox' | 'checkBox' | 'gallery' | 'toolPalette';
  refId: string;
  size?: RibbonControlSize;
}

interface GeneratedGroup {
  id: string;
  caption: string;
  keytip: string;
  subgroupIds: string[];
}

interface LayoutStack {
  order: number;
  controls: RibbonControl[];
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
  return {
    ...merged,
    addInId: merged.addInId || stableGuid(`${merged.assemblyName}:${document.metadata.id}:${document.metadata.name}`),
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
  const baseClassName = `${toPascalCase(suggestedClassName, 'GeneratedControl')}Placeholder${token.slice(-6)}`;
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
  };
};

const sortControlsForLayout = (controls: RibbonControl[]) =>
  [...controls].sort((left, right) => {
    const lx = left.layout?.x ?? Number.MAX_SAFE_INTEGER;
    const rx = right.layout?.x ?? Number.MAX_SAFE_INTEGER;
    if (lx !== rx) return lx - rx;
    const ly = left.layout?.y ?? Number.MAX_SAFE_INTEGER;
    const ry = right.layout?.y ?? Number.MAX_SAFE_INTEGER;
    if (ly !== ry) return ly - ry;
    return left.id.localeCompare(right.id);
  });

const buildStacks = (controls: RibbonControl[]): LayoutStack[] => {
  if (!controls.length) return [];
  const sorted = sortControlsForLayout(controls);
  const byX = new Map<number, RibbonControl[]>();
  sorted.forEach((control, index) => {
    const key = control.layout?.x ?? index;
    const current = byX.get(key) ?? [];
    current.push(control);
    byX.set(key, current);
  });
  return Array.from(byX.entries())
    .sort(([left], [right]) => left - right)
    .flatMap(([order, stackControls]) => {
      const topToBottom = [...stackControls].sort((left, right) => {
        const ly = left.layout?.y ?? 0;
        const ry = right.layout?.y ?? 0;
        if (ly !== ry) return ly - ry;
        return left.id.localeCompare(right.id);
      });
      const chunks: LayoutStack[] = [];
      for (let index = 0; index < topToBottom.length; index += 3) {
        chunks.push({
          order: order + index / 10,
          controls: topToBottom.slice(index, index + 3),
        });
      }
      return chunks;
    });
};

const toGroupItems = (leafByControlId: Map<string, GeneratedGroupItem>, stack: LayoutStack) =>
  stack.controls
    .map((control) => leafByControlId.get(control.id))
    .filter(Boolean) as GeneratedGroupItem[];

const buildArtifactsModel = (document: RibbonDocument, options: Required<ArcGISProValidationOptions>) => {
  const projectToken = sanitizeToken(options.assemblyName.replace(/\./g, '_'), 'RibbonLayoutValidator');
  const generatedGroups: GeneratedGroup[] = [];
  const generatedSubgroups: GeneratedSubgroup[] = [];
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
        const childIds = ['第一项', '第二项', '第三项'].map((caption, index) => {
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
          return child.id;
        });
        menus.push({
          id: menuId,
          caption: control.caption || fallbackCaptionByType.menu,
          tooltip: buildTooltipText(control),
          keytip: `M${order}`,
          size: control.size,
          childIds,
        });
        leafByControlId.set(control.id, { kind: 'menu', refId: menuId, size: control.size });
        break;
      }
      case 'splitButton': {
        const splitId = createRefId(projectToken, `${control.id}_split`);
        const primary = registerLeaf(
          {
            ...control,
            id: `${control.id}_primary`,
            type: 'button',
            caption: control.caption || fallbackCaptionByType.splitButton,
          },
          'button',
        );
        const childIds = ['主选项', '备选项'].map((caption, index) => {
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
          return child.id;
        });
        splitButtons.push({
          id: splitId,
          size: control.size,
          primaryId: primary.id,
          childIds,
        });
        leafByControlId.set(control.id, { kind: 'splitButton', refId: splitId, size: control.size });
        break;
      }
      case 'toolPalette': {
        const paletteId = createRefId(projectToken, `${control.id}_palette`);
        const childIds = ['浏览', '拾取', '绘制'].map((caption, index) => {
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
          return child.id;
        });
        toolPalettes.push({
          id: paletteId,
          caption: control.caption || fallbackCaptionByType.toolPalette,
          size: control.size,
          childIds,
        });
        leafByControlId.set(control.id, { kind: 'toolPalette', refId: paletteId, size: control.size });
        break;
      }
      default:
        break;
    }
  });

  document.groups.forEach((group, groupIndex) => {
    const relatedControls = document.controls.filter((control) =>
      document.subgroups.some(
        (subgroup) => subgroup.groupId === group.id && subgroup.id === control.subgroupId,
      ),
    );
    const stacks = buildStacks(relatedControls);
    const subgroupIds = stacks.map((_stack, stackIndex) =>
      createRefId(projectToken, `${group.id}_subgroup_${stackIndex + 1}`),
    );

    generatedGroups.push({
      id: createRefId(projectToken, group.id),
      caption: group.caption,
      keytip: group.keytip || `G${groupIndex + 1}`,
      subgroupIds,
    });

    stacks.forEach((stack, stackIndex) => {
      generatedSubgroups.push({
        id: subgroupIds[stackIndex],
        items: toGroupItems(leafByControlId, stack),
      });
    });
  });

  return {
    projectToken,
    generatedGroups,
    generatedSubgroups,
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
  switch (control.type) {
    case 'button':
    case 'tool':
      return [
        `<${control.type} id="${control.id}" caption="${caption}" className="${className}" loadOnClick="true" keytip="${keytip}">`,
        tooltip ? indent(1, tooltip) : '',
        `</${control.type}>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'comboBox':
      return [
        `<comboBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}" isEditable="false" isReadOnly="true" sizeString="${xmlEscape(control.caption)}">`,
        tooltip ? indent(1, tooltip) : '',
        `</comboBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'editBox':
      return [
        `<editBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}" sizeString="${xmlEscape(control.editHint || control.caption)}" editHint="${xmlEscape(control.editHint || control.caption)}">`,
        tooltip ? indent(1, tooltip) : '',
        `</editBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'checkBox':
      return [
        `<checkBox id="${control.id}" caption="${caption}" className="${className}" keytip="${keytip}">`,
        tooltip ? indent(1, tooltip) : '',
        `</checkBox>`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'gallery':
      return [
        `<gallery id="${control.id}" caption="${caption}" className="${className}" itemsInRow="3" showItemCaption="true" itemWidth="96">`,
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
      return `<toolPalette refID="${item.refId}"${sizeAttr} />`;
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
    .map((group) =>
      [
        `<group id="${group.id}" caption="${xmlEscape(group.caption)}" keytip="${xmlEscape(group.keytip)}">`,
        ...group.subgroupIds.map((subgroupId) => indent(1, `<subgroup refID="${subgroupId}" />`)),
        `</group>`,
      ].join('\n'),
    )
    .join('\n');

  const subgroups = model.generatedSubgroups
    .map((subgroup) =>
      [
        `<subgroup id="${subgroup.id}" size="AlwaysLarge" verticalAlignment="Top">`,
        ...subgroup.items.map((item) => indent(1, renderGroupItem(item))),
        `</subgroup>`,
      ].join('\n'),
    )
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
        `<menu id="${menu.id}" caption="${xmlEscape(menu.caption)}" keytip="${xmlEscape(menu.keytip)}">`,
        ...menu.childIds.map((childId) => indent(1, `<button refID="${childId}" />`)),
        `</menu>`,
      ].join('\n'),
    )
    .join('\n');

  const splitButtons = model.splitButtons
    .map((splitButton) =>
      [
        `<splitButton id="${splitButton.id}">`,
        indent(1, `<button refID="${splitButton.primaryId}" />`),
        ...splitButton.childIds.map((childId) => indent(1, `<button refID="${childId}" />`)),
        `</splitButton>`,
      ].join('\n'),
    )
    .join('\n');

  const palettes = model.toolPalettes
    .map((palette) =>
      [
        `<toolPalette id="${palette.id}" caption="${xmlEscape(palette.caption)}" showItemCaption="true" itemWidth="96" itemHeight="64" itemsInRow="2">`,
        ...palette.childIds.map((childId) => indent(1, `<tool refID="${childId}" />`)),
        `</toolPalette>`,
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
        subgroups ? indent(1, `<subgroups>\n${indent(1, subgroups)}\n</subgroups>`) : '',
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
  return {
    configDaml: renderConfigDaml(document, options, model),
    generatedControls: renderGeneratedControls(options, model.leafControls),
    layoutSnapshot: JSON.stringify(document, null, 2),
    packageFileName: `${options.assemblyName}.esriAddinX`,
    projectName: options.assemblyName,
    options,
  };
};

export const buildConfigDaml = (
  document: RibbonDocument,
  overrides?: ArcGISProValidationOptions,
) => buildArcGISProValidationArtifacts(document, overrides).configDaml;
