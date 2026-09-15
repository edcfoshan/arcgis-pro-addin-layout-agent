import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Camera,
  ChevronDown,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Package,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { CONTROL_LIBRARY, SIZE_LABELS } from '../core/library';
import {
  cloneDocumentWithTimestamp,
  createControlFromType,
  createEmptyDocument,
  createId,
  parseImportedDocument,
} from '../core/ribbon';
import {
  buildArcGISProValidationArtifacts,
  buildConfigDaml,
  type ArcGISProValidationArtifacts,
} from '../core/arcgisProValidation';
import type {
  LibraryControlDefinition,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonGroup,
  RibbonSubgroup,
} from '../core/types';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { parseDamlToDocument } from '../core/damlImport';
import { ControlMock } from './ControlMock';
import { IconPicker, type IconSelection } from './IconPicker';
import { invalidateIconList } from './iconsClient';
import {
  DEFAULT_GROUP_COLS,
  FIXED_GROUP_ROWS,
  MAX_GROUP_COLS,
  MIN_GROUP_COLS,
  RIBBON_CELL,
  canPlaceRect,
  findFirstOpenSlot,
  footprintLabel,
  getFootprint,
  getGridSpec,
  getSubgroupLayout,
  normalizeDocumentLayouts,
} from '../core/ribbonLayout';
import './designer.css';

const STORAGE_KEY = 'gispro-ribbon-designer-doc';
const TARGET_DIR_STORAGE_KEY = 'gispro-ribbon-designer-target-dir';

// 无边框窗口的自定义标题栏句柄;浏览器直渲(Playwright 自检)时无 Tauri internals,置 null 防崩
const appWindow =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? getCurrentWindow()
    : null;

type DragState =
  | {
      kind: 'new';
      definition: LibraryControlDefinition;
      size: RibbonControlSize;
    }
  | {
      kind: 'move';
      controlId: string;
      caption: string;
      type: RibbonControl['type'];
      size: RibbonControlSize;
      iconFile?: string;
    }
  | null;

interface HoverTarget {
  subgroupId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  valid: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  controlId?: string;
  groupId?: string;
}

interface GhostPos {
  x: number;
  y: number;
}

interface ValidationReportJson {
  capturedAt?: string;
  proPid?: number;
  screenshot?: string;
}

interface ImportedIcon {
  damlName: string;
  file: string;
}

interface ImportedPackage {
  kind: string;
  packageName: string;
  damlText: string;
  jsonText: string;
  icons: ImportedIcon[];
}

interface ValidationOutcome {
  screenshotDataUrl: string;
  reportJson: ValidationReportJson;
  caseDir: string;
  packagePath: string;
}

const librarySections = [
  {
    title: '命令控件',
    items: CONTROL_LIBRARY.filter((item) =>
      ['button', 'tool', 'splitButton', 'toolPalette', 'menu', 'gallery'].includes(item.type),
    ),
  },
  {
    title: '输入与选择',
    items: CONTROL_LIBRARY.filter((item) => ['comboBox', 'editBox', 'checkBox'].includes(item.type)),
  },
];

const loadInitialDocument = (): RibbonDocument => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = parseImportedDocument(saved);
    if (parsed) return normalizeDocumentLayouts(parsed, 'Large');
  }
  return createEmptyDocument();
};

const computeLayoutVersion = (document: RibbonDocument) => {
  const lastUpdated = Date.parse(document.metadata.lastUpdated || '');
  const sourceTime = Number.isNaN(lastUpdated) ? Date.now() : lastUpdated;
  const minor = Math.floor(sourceTime / 86_400_000) % 65_535;
  const patch = Math.floor((sourceTime % 86_400_000) / 1000 / 2);
  return `1.${minor}.${patch}`;
};

export default function Designer() {
  const [document, setDocument] = useState<RibbonDocument>(loadInitialDocument);
  const [activeTabId, setActiveTabId] = useState(document.tabs[0]?.id ?? '');
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [ghostPos, setGhostPos] = useState<GhostPos>({ x: 0, y: 0 });
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [toast, setToast] = useState('');
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | null>(null);
  const [targetDirOpen, setTargetDirOpen] = useState(false);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [targetDir, setTargetDir] = useState(
    () => localStorage.getItem(TARGET_DIR_STORAGE_KEY) || '',
  );
  const [targetDirDraft, setTargetDirDraft] = useState(targetDir);
  const [busy, setBusy] = useState('');
  const [validation, setValidation] = useState<ValidationOutcome | null>(null);
  const gridRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const commit = useCallback((recipe: (current: RibbonDocument) => RibbonDocument) => {
    setDocument((current) =>
      normalizeDocumentLayouts(cloneDocumentWithTimestamp(recipe(current)), 'Large'),
    );
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    localStorage.setItem(TARGET_DIR_STORAGE_KEY, targetDir);
  }, [targetDir]);

  // 首启无存量目录、或存量是旧机器路径时,向 Rust 要 REPO_ROOT 派生的默认导出目录
  useEffect(() => {
    const stored = localStorage.getItem(TARGET_DIR_STORAGE_KEY);
    if (stored && !stored.startsWith('C:\\Users\\13975')) return;
    invoke<string>('get_default_target_dir')
      .then((dir) => {
        setTargetDir(dir);
        setTargetDirDraft(dir);
      })
      .catch(() => undefined);
  }, []);

  const activeTab = document.tabs.find((tab) => tab.id === activeTabId) ?? document.tabs[0];
  const activeGroups = useMemo(
    () =>
      activeTab
        ? (activeTab.groupIds
            .map((groupId) => document.groups.find((group) => group.id === groupId))
            .filter(Boolean) as RibbonGroup[])
        : [],
    [activeTab, document.groups],
  );
  const selectedControl =
    document.controls.find((control) => control.id === selectedControlId) ?? null;

  const applyTargetDir = () => {
    const next = targetDirDraft.trim();
    if (!next) {
      showToast('请输入有效的本地目录');
      return;
    }
    setTargetDir(next);
    setTargetDirDraft(next);
    setTargetDirOpen(false);
    showToast(`导出目录已设为 ${next}`);
  };

  const addTab = () => {
    const tabId = createId('tab');
    commit((current) => ({
      ...current,
      tabs: [
        ...current.tabs,
        {
          id: tabId,
          caption: `新页签 ${current.tabs.length + 1}`,
          keytip: `T${current.tabs.length + 1}`,
          groupIds: [],
        },
      ],
    }));
    setActiveTabId(tabId);
  };

  const updateTab = (tabId: string, patch: Partial<{ caption: string; keytip: string }>) => {
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
    }));
  };

  const deleteTab = (tabId: string) => {
    if (document.tabs.length <= 1) {
      showToast('至少保留一个页签');
      return;
    }
    commit((current) => {
      const tab = current.tabs.find((item) => item.id === tabId);
      if (!tab) return current;
      const groupIds = new Set(tab.groupIds);
      const subgroupIds = new Set(
        current.groups
          .filter((group) => groupIds.has(group.id))
          .flatMap((group) => group.subgroupIds),
      );
      const controlIds = new Set(
        current.subgroups
          .filter((subgroup) => subgroupIds.has(subgroup.id))
          .flatMap((subgroup) => subgroup.controlIds),
      );
      return {
        ...current,
        tabs: current.tabs.filter((item) => item.id !== tabId),
        groups: current.groups.filter((group) => !groupIds.has(group.id)),
        subgroups: current.subgroups.filter((subgroup) => !subgroupIds.has(subgroup.id)),
        controls: current.controls.filter((control) => !controlIds.has(control.id)),
      };
    });
    if (activeTabId === tabId) {
      setActiveTabId(document.tabs.find((tab) => tab.id !== tabId)?.id ?? '');
    }
  };

  const addGroup = () => {
    if (!activeTab) return;
    const groupId = createId('group');
    const subgroupId = createId('subgroup');
    const group: RibbonGroup = {
      id: groupId,
      tabId: activeTab.id,
      caption: `新分组 ${document.groups.length + 1}`,
      keytip: `G${document.groups.length + 1}`,
      launcherButton: false,
      sizePriorities: [30, 80, 120],
      subgroupIds: [subgroupId],
    };
    const subgroup: RibbonSubgroup = {
      id: subgroupId,
      groupId,
      caption: '分组网格',
      sizeMode: 'AlwaysLarge',
      verticalAlignment: 'Top',
      layout: { row: 0, columns: DEFAULT_GROUP_COLS, rows: FIXED_GROUP_ROWS },
      controlIds: [],
    };
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === activeTab.id ? { ...tab, groupIds: [...tab.groupIds, groupId] } : tab,
      ),
      groups: [...current.groups, group],
      subgroups: [...current.subgroups, subgroup],
    }));
  };

  const updateGroup = (groupId: string, patch: Partial<RibbonGroup>) => {
    commit((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    }));
  };

  const updateGroupColumns = (groupId: string, columns: number) => {
    commit((current) => ({
      ...current,
      subgroups: current.subgroups.map((subgroup) =>
        subgroup.groupId === groupId
          ? { ...subgroup, layout: { row: 0, columns, rows: FIXED_GROUP_ROWS } }
          : subgroup,
      ),
    }));
  };

  const duplicateGroup = (groupId: string) => {
    const sourceGroup = document.groups.find((group) => group.id === groupId);
    const sourceSubgroup = document.subgroups.find(
      (subgroup) => subgroup.groupId === groupId,
    );
    if (!sourceGroup || !sourceSubgroup || !activeTab) return;
    const newGroupId = createId('group');
    const newSubgroupId = createId('subgroup');
    const controls = getSubgroupControls(document, sourceSubgroup.id);
    const clonedControls = controls.map((control) => ({
      ...control,
      id: createId(control.type),
      subgroupId: newSubgroupId,
    }));
    const newGroup: RibbonGroup = {
      ...sourceGroup,
      id: newGroupId,
      caption: `${sourceGroup.caption} 副本`,
      subgroupIds: [newSubgroupId],
    };
    const newSubgroup: RibbonSubgroup = {
      ...sourceSubgroup,
      id: newSubgroupId,
      groupId: newGroupId,
      controlIds: clonedControls.map((control) => control.id),
    };
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === activeTab.id ? { ...tab, groupIds: [...tab.groupIds, newGroupId] } : tab,
      ),
      groups: [...current.groups, newGroup],
      subgroups: [...current.subgroups, newSubgroup],
      controls: [...current.controls, ...clonedControls],
    }));
    showToast(`已复制分组 ${sourceGroup.caption}`);
  };

  const deleteGroup = (groupId: string) => {
    const targetGroup = document.groups.find((group) => group.id === groupId);
    if (!targetGroup) return;
    const subgroupIds = new Set(targetGroup.subgroupIds);
    const controlIds = new Set(
      document.subgroups
        .filter((subgroup) => subgroupIds.has(subgroup.id))
        .flatMap((subgroup) => subgroup.controlIds),
    );
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === targetGroup.tabId
          ? { ...tab, groupIds: tab.groupIds.filter((id) => id !== groupId) }
          : tab,
      ),
      groups: current.groups.filter((group) => group.id !== groupId),
      subgroups: current.subgroups.filter((subgroup) => !subgroupIds.has(subgroup.id)),
      controls: current.controls.filter((control) => !controlIds.has(control.id)),
    }));
    if (selectedControlId && controlIds.has(selectedControlId)) setSelectedControlId(null);
    showToast(`已删除分组 ${targetGroup.caption}`);
  };

  const resizeGroupControls = (groupId: string, size: RibbonControlSize) => {
    const subgroup = document.subgroups.find((item) => item.groupId === groupId);
    if (!subgroup) return;
    let rejected = 0;
    commit((current) => {
      const spec = getGridSpec(subgroup);
      const controls = getSubgroupControls(current, subgroup.id);
      const placed: { i: string; x: number; y: number; w: number; h: number }[] = [];
      const overflow = new Set<string>();
      for (const control of controls) {
        if (!control.supportedSizes.includes(size)) {
          rejected += 1;
          continue;
        }
        const footprint = getFootprint(control.type, size);
        const slot = findFirstOpenSlot(footprint, placed, spec);
        if (slot) {
          placed.push({ i: control.id, x: slot.x, y: slot.y, w: slot.w, h: slot.h });
        } else {
          overflow.add(control.id);
          rejected += 1;
        }
      }
      const byId = new Map(placed.map((item) => [item.i, item]));
      return {
        ...current,
        controls: current.controls.map((control) => {
          const item = byId.get(control.id);
          return item
            ? { ...control, size, layout: { x: item.x, y: item.y, w: item.w, h: item.h } }
            : control;
        }),
      };
    });
    showToast(
      rejected
        ? `批量${SIZE_LABELS[size]}尺寸：${rejected} 个控件放不下或尺寸不支持`
        : `已将分组控件批量改为${SIZE_LABELS[size]}尺寸`,
    );
  };

  const updateControl = (controlId: string, patch: Partial<RibbonControl>) => {
    if (patch.size) {
      let rejected = false;
      commit((current) => {
        const control = current.controls.find((item) => item.id === controlId);
        const subgroup = control
          ? current.subgroups.find((item) => item.id === control.subgroupId)
          : null;
        if (!control || !subgroup) return current;
        const spec = getGridSpec(subgroup);
        const layout = getSubgroupLayout(current, subgroup, 'Large').filter(
          (item) => item.i !== control.id,
        );
        const footprint = getFootprint(control.type, patch.size as RibbonControlSize);
        const currentLayout = control.layout ?? { x: 0, y: 0 };
        const candidate = {
          i: control.id,
          x: currentLayout.x,
          y: currentLayout.y,
          w: footprint.w,
          h: footprint.h,
        };
        const slot = canPlaceRect(candidate, layout, spec)
          ? candidate
          : findFirstOpenSlot(footprint, layout, spec);
        if (!slot) {
          rejected = true;
          return current;
        }
        return {
          ...current,
          controls: current.controls.map((item) =>
            item.id === controlId
              ? { ...item, ...patch, layout: { x: slot.x, y: slot.y, w: slot.w, h: slot.h } }
              : item,
          ),
        };
      });
      if (rejected) showToast('当前分组没有足够空位，尺寸未修改');
      return;
    }
    commit((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId ? { ...control, ...patch } : control,
      ),
    }));
  };

  const deleteControl = (controlId: string) => {
    commit((current) => {
      const control = current.controls.find((item) => item.id === controlId);
      if (!control) return current;
      return {
        ...current,
        controls: current.controls.filter((item) => item.id !== controlId),
        subgroups: current.subgroups.map((subgroup) =>
          subgroup.id === control.subgroupId
            ? { ...subgroup, controlIds: subgroup.controlIds.filter((id) => id !== controlId) }
            : subgroup,
        ),
      };
    });
    if (selectedControlId === controlId) setSelectedControlId(null);
  };

  const addControlAt = (
    subgroup: RibbonSubgroup,
    definition: LibraryControlDefinition,
    size: RibbonControlSize,
    layout: { x: number; y: number; w: number; h: number },
  ) => {
    const nextControl = createControlFromType(definition.type, subgroup.id, { size, layout });
    commit((current) => ({
      ...current,
      controls: [...current.controls, nextControl],
      subgroups: current.subgroups.map((item) =>
        item.id === subgroup.id
          ? { ...item, controlIds: [...item.controlIds, nextControl.id] }
          : item,
      ),
    }));
    setSelectedControlId(nextControl.id);
  };

  const moveControl = (
    controlId: string,
    subgroupId: string,
    layout: { x: number; y: number; w: number; h: number },
  ) => {
    commit((current) => {
      const control = current.controls.find((item) => item.id === controlId);
      if (!control) return current;
      const sameSubgroup = control.subgroupId === subgroupId;
      return {
        ...current,
        controls: current.controls.map((item) =>
          item.id === controlId ? { ...item, subgroupId, layout } : item,
        ),
        subgroups: current.subgroups.map((subgroup) => {
          if (sameSubgroup && subgroup.id === subgroupId) return subgroup;
          if (subgroup.id === control.subgroupId) {
            return {
              ...subgroup,
              controlIds: subgroup.controlIds.filter((id) => id !== controlId),
            };
          }
          if (subgroup.id === subgroupId) {
            return { ...subgroup, controlIds: [...subgroup.controlIds, controlId] };
          }
          return subgroup;
        }),
      };
    });
  };

  // ===== 文件导入(菜单「打开文件…」与窗口拖放的统一入口) =====
  const applyImportedDocument = (next: RibbonDocument, message: string) => {
    setDocument(normalizeDocumentLayouts(next, 'Large'));
    setActiveTabId(next.tabs[0]?.id ?? '');
    setSelectedControlId(null);
    showToast(message);
  };

  const importFromPath = async (path: string) => {
    if (!path) return;
    if (busy) {
      showToast('已有任务进行中,请稍候');
      return;
    }
    const ext = path.toLowerCase().split('.').pop();
    if (!ext || !['esriaddinx', 'daml', 'json'].includes(ext)) {
      showToast('不支持的文件类型(支持 .esriAddInX / .daml / .json)');
      return;
    }
    setBusy(`正在导入 ${path.split(/[\\/]/).pop() ?? path}`);
    try {
      const pkg = await invoke<ImportedPackage>('open_import_file', { path });
      if (pkg.kind === 'json') {
        const parsed = parseImportedDocument(pkg.jsonText);
        if (!parsed) {
          showToast('导入失败:JSON 结构不符合当前 schema');
          return;
        }
        applyImportedDocument(parsed, `已导入 JSON:${parsed.tabs.length} 个页签`);
        return;
      }
      const iconMap = Object.fromEntries(pkg.icons.map((icon) => [icon.damlName, icon.file]));
      const { document: imported, stats } = parseDamlToDocument(pkg.damlText, {
        packageName: pkg.packageName,
        iconMap,
      });
      if (!stats.controls && !stats.groups) {
        showToast('导入失败:未在 DAML 中发现分组/控件');
        return;
      }
      applyImportedDocument(
        imported,
        `导入成功:${stats.tabs} 页签 · ${stats.groups} 分组 · ${stats.controls} 控件` +
          (stats.placeholders ? `,${stats.placeholders} 个外部引用显示为占位` : '') +
          (stats.unplacedControls ? `,${stats.unplacedControls} 个控件无空位` : ''),
      );
      invalidateIconList();
    } catch (error) {
      showToast(`导入失败:${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  const importFromPathRef = useRef(importFromPath);
  importFromPathRef.current = importFromPath;

  // 窗口拖放导入(.esriAddInX / .daml / .json);浏览器直渲无 Tauri 环境时跳过
  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          void importFromPathRef.current(event.payload.paths[0] ?? '');
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const pickImportFile = async () => {
    if (!appWindow) {
      showToast('请在桌面应用中使用文件选择');
      return;
    }
    const picked = await openFileDialog({
      multiple: false,
      filters: [
        { name: 'Add-in 包 / DAML / 布局 JSON', extensions: ['esriAddInX', 'daml', 'json'] },
      ],
    }).catch(() => null);
    if (typeof picked === 'string' && picked) void importFromPath(picked);
  };

  const exportArtifactsFile = async (filename: string, content: string, label: string) => {
    const dir = targetDir.trim();
    if (!dir) {
      setTargetDirOpen(true);
      showToast('请先设置导出目录');
      return;
    }
    setBusy(`正在导出 ${label}`);
    try {
      const path = await invoke<string>('write_text_file', { dir, filename, content });
      showToast(`${label} 已写入 ${path}`);
    } catch (error) {
      showToast(`${label} 导出失败：${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  const exportDaml = () =>
    exportArtifactsFile('Config.daml', buildConfigDaml(document), 'Config.daml');

  const exportPackage = async () => {
    const dir = targetDir.trim();
    if (!dir) {
      setTargetDirOpen(true);
      showToast('请先设置导出目录');
      return;
    }
    setBusy('正在打包 add-in（编译 C# + 生成安装包）');
    try {
      const artifacts: ArcGISProValidationArtifacts =
        buildArcGISProValidationArtifacts(document);
      const path = await invoke<string>('export_addin', {
        payload: {
          layout_snapshot: artifacts.layoutSnapshot,
          package_file_name: artifacts.packageFileName,
          target_dir: dir,
          version: computeLayoutVersion(document),
          icon_files: artifacts.iconFiles,
        },
      });
      showToast(`安装包已生成 ${path}`);
    } catch (error) {
      showToast(`打包失败：${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  // 一键验算:打包 → 安装 → 启动/复用 Pro → 截图 → 弹出与画布的并排对比
  const runValidation = async () => {
    if (busy) {
      showToast('已有任务进行中,请稍候');
      return;
    }
    const dir = targetDir.trim();
    if (!dir) {
      showToast('请先设置导出目录');
      return;
    }
    setBusy('正在验算:打包 → 安装 → 启动 Pro → 截图(约 1-2 分钟,请勿遮挡屏幕)');
    try {
      const artifacts: ArcGISProValidationArtifacts =
        buildArcGISProValidationArtifacts(document);
      const outcome = await invoke<ValidationOutcome>('validate_layout', {
        payload: {
          export: {
            layout_snapshot: artifacts.layoutSnapshot,
            package_file_name: artifacts.packageFileName,
            target_dir: dir,
            version: computeLayoutVersion(document),
            icon_files: artifacts.iconFiles,
          },
          config_daml: artifacts.configDaml,
        },
      });
      setValidation(outcome);
    } catch (error) {
      showToast(`验算失败：${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  const applyIconSelection = (selection: IconSelection) => {
    if (iconPickerFor) {
      updateControl(iconPickerFor, {
        icon: { small: selection.small, large: selection.large },
      });
      showToast(`已绑定图标 ${selection.small.replace(/^(dark)?images_/, '')}`);
    }
    setIconPickerFor(null);
  };

  const startDrag = useCallback((event: React.PointerEvent, state: Exclude<DragState, null>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = state;
    setDrag(state);
    setGhostPos({ x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const computeHover = (clientX: number, clientY: number): HoverTarget | null => {
      const current = dragRef.current;
      if (!current) return null;
      const doc = documentRef.current;
      const footprint =
        current.kind === 'new'
          ? getFootprint(current.definition.type, current.size)
          : getFootprint(current.type, current.size);
      for (const [subgroupId, element] of gridRefs.current) {
        const rect = element.getBoundingClientRect();
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          continue;
        }
        const subgroup = doc.subgroups.find((item) => item.id === subgroupId);
        if (!subgroup) return null;
        const spec = getGridSpec(subgroup);
        const x = Math.max(
          0,
          Math.min(spec.cols - footprint.w, Math.floor((clientX - rect.left) / RIBBON_CELL)),
        );
        const y = Math.max(
          0,
          Math.min(spec.rows - footprint.h, Math.floor((clientY - rect.top) / RIBBON_CELL)),
        );
        const existing = getSubgroupLayout(doc, subgroup, 'Large').filter(
          (item) => !(current.kind === 'move' && item.i === current.controlId),
        );
        const candidate = { i: '__drag__', x, y, w: footprint.w, h: footprint.h };
        return {
          subgroupId,
          x,
          y,
          w: footprint.w,
          h: footprint.h,
          valid: canPlaceRect(candidate, existing, spec),
        };
      }
      return null;
    };

    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      setGhostPos({ x: event.clientX, y: event.clientY });
      const next = computeHover(event.clientX, event.clientY);
      hoverRef.current = next;
      setHover(next);
    };

    const onUp = () => {
      const current = dragRef.current;
      const target = hoverRef.current;
      if (current && target) {
        const doc = documentRef.current;
        if (target.valid) {
          if (current.kind === 'new') {
            const subgroup = doc.subgroups.find((item) => item.id === target.subgroupId);
            if (subgroup) {
              addControlAt(subgroup, current.definition, current.size, {
                x: target.x,
                y: target.y,
                w: target.w,
                h: target.h,
              });
            }
          } else {
            moveControl(current.controlId, target.subgroupId, {
              x: target.x,
              y: target.y,
              w: target.w,
              h: target.h,
            });
          }
        } else {
          showToast('放不下：目标格位被占用或超出网格');
        }
      }
      dragRef.current = null;
      hoverRef.current = null;
      setDrag(null);
      setHover(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, showToast]);

  useEffect(() => {
    if (!contextMenu && !fileMenu) return;
    const close = () => {
      setContextMenu(null);
      setFileMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu, fileMenu]);

  return (
    <div className="next-shell">
      <header
        className="next-titlebar"
        data-tauri-drag-region
        onDoubleClick={() => void appWindow?.toggleMaximize()}
      >
        <div className="window-handle" data-tauri-drag-region>
          ArcGIS Pro
        </div>
        <div className="window-title" data-tauri-drag-region>
          Add-In Ribbon 布局设计器
        </div>
        <div className="window-buttons" onDoubleClick={(event) => event.stopPropagation()}>
          <span title="最小化" onClick={() => void appWindow?.minimize()} />
          <span title="最大化/还原" onClick={() => void appWindow?.toggleMaximize()} />
          <span title="关闭" onClick={() => void appWindow?.close()} />
        </div>
      </header>

      <div className="next-workbench">
        <aside className="next-tab-sidebar">
          <div className="next-tab-sidebar-head">
            <strong>页签</strong>
            <button onClick={addTab} title="新增页签">
              <Plus size={13} />
            </button>
          </div>
          {document.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`next-tab-item${tab.id === activeTab?.id ? ' active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.id === activeTab?.id ? (
                <input
                  className="next-tab-name"
                  value={tab.caption}
                  onChange={(event) => updateTab(tab.id, { caption: event.target.value })}
                  spellCheck={false}
                />
              ) : (
                <span className="next-tab-name">{tab.caption}</span>
              )}
              {document.tabs.length > 1 ? (
                <button
                  className="next-tab-delete"
                  title="删除页签"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteTab(tab.id);
                  }}
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
          ))}
        </aside>

        <div className="next-center">
          <section className="next-toolbar">
            <div className="next-toolbar-left">
              <button onClick={addGroup}>
                <Plus size={14} />
                新增分组
              </button>
              <button
                onClick={() => {
                  const next = createEmptyDocument();
                  setDocument(next);
                  setActiveTabId(next.tabs[0]?.id ?? '');
                  setSelectedControlId(null);
                  showToast('已重置为空白 Ribbon');
                }}
              >
                清空
              </button>
            </div>
            <div className="next-toolbar-right">
              <span className="draft-status">{busy || '本地草稿自动保存'}</span>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setFileMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <FolderOpen size={14} />
                文件
                <ChevronDown size={12} />
              </button>
              <button className="primary" onClick={() => void exportPackage()}>
                <Package size={14} />
                打包 add-in
              </button>
              <button onClick={() => void runValidation()}>
                <Camera size={14} />
                验算
              </button>
            </div>
          </section>

          <main className="next-canvas-row">
            <section className="next-canvas">
              <div className="next-ribbon-area">
                {activeGroups.length ? (
                  activeGroups.map((group, index) => (
                    <RibbonGroupView
                      key={group.id}
                      document={document}
                      group={group}
                      drag={drag}
                      hover={hover}
                      canDelete={index > 0}
                      selectedControlId={selectedControlId}
                      registerGrid={(subgroupId, element) => {
                        if (element) gridRefs.current.set(subgroupId, element);
                        else gridRefs.current.delete(subgroupId);
                      }}
                      onUpdateGroup={updateGroup}
                      onUpdateColumns={updateGroupColumns}
                      onDuplicateGroup={duplicateGroup}
                      onResizeGroup={resizeGroupControls}
                      onDeleteGroup={deleteGroup}
                      onContextMenuGroup={(x, y, groupId) =>
                        setContextMenu({ x, y, groupId })
                      }
                      onSelectControl={(controlId) => setSelectedControlId(controlId)}
                      onControlContextMenu={(x, y, controlId) =>
                        setContextMenu({ x, y, controlId })
                      }
                      onDragControlStart={(event, control) =>
                        startDrag(event, {
                          kind: 'move',
                          controlId: control.id,
                          caption: control.caption,
                          type: control.type,
                          size: control.size,
                          iconFile: control.icon.small || undefined,
                        })
                      }
                    />
                  ))
                ) : (
                  <div className="next-empty-canvas">
                    当前页签是空白。先新增分组，再从底部拖入控件。
                  </div>
                )}
              </div>
            </section>

            <aside className="next-side">
              {selectedControl ? (
                <Inspector
                  control={selectedControl}
                  onUpdate={updateControl}
                  onDelete={deleteControl}
                  onOpenIcons={() => setIconPickerFor(selectedControl.id)}
                />
              ) : (
                <div className="next-empty-inspector">
                  <span>点击画布上的控件编辑属性</span>
                </div>
              )}
            </aside>
          </main>

          <div className="next-bottom-palette">
            <div className="next-palette-strip">
              {librarySections.flatMap((section) =>
                section.items.map((item) => (
                  <div className="next-palette-card" key={item.type}>
                    <div className="next-palette-card-head">
                      <ControlMock type={item.type} caption="" size="small" mode="library" />
                      <span>{item.label}</span>
                    </div>
                    <div className="next-palette-card-sizes">
                      {item.supportedSizes.map((size) => (
                        <PalettePreview
                          key={item.type + '-' + size}
                          item={item}
                          size={size}
                          onDragStart={(event) =>
                            startDrag(event, { kind: 'new', definition: item, size })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
      </div>

      {drag ? (
        <div
          className="drag-ghost"
          style={{ left: ghostPos.x + 12, top: ghostPos.y + 10 } as CSSProperties}
        >
          {drag.kind === 'new' ? (
            <ControlMock
              type={drag.definition.type}
              caption={drag.definition.label}
              size={drag.size}
              mode="library"
            />
          ) : (
            <ControlMock
              type={drag.type}
              caption={drag.caption}
              size={drag.size}
              iconFile={drag.iconFile}
            />
          )}
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          document={document}
          onAction={(action) => {
            const menu = contextMenu;
            setContextMenu(null);
            if (!menu) return;
            if (action === 'delete-control' && menu.controlId) deleteControl(menu.controlId);
            if (action === 'icons' && menu.controlId) setIconPickerFor(menu.controlId);
            if (action === 'duplicate-group' && menu.groupId) duplicateGroup(menu.groupId);
            if (action === 'delete-group' && menu.groupId) deleteGroup(menu.groupId);
          }}
        />
      ) : null}

      <IconPicker
        open={Boolean(iconPickerFor)}
        currentSmall={
          iconPickerFor
            ? document.controls.find((control) => control.id === iconPickerFor)?.icon.small ??
              undefined
            : undefined
        }
        onClose={() => setIconPickerFor(null)}
        onPick={applyIconSelection}
      />

      {fileMenu ? (
        <div className="context-menu" style={{ left: fileMenu.x, top: fileMenu.y }}>
          <div className="context-menu-title">文件</div>
          <button
            onClick={() => {
              setFileMenu(null);
              void pickImportFile();
            }}
          >
            打开文件…(.esriAddInX / .daml / .json,也可直接拖入窗口)
          </button>
          <button
            onClick={() => {
              setFileMenu(null);
              void exportDaml();
            }}
          >
            导出 Config.daml
          </button>
          <button
            onClick={() => {
              setFileMenu(null);
              setTargetDirOpen(true);
            }}
          >
            导出目录…
          </button>
        </div>
      ) : null}

      {targetDirOpen ? (
        <div className="next-modal" onClick={() => setTargetDirOpen(false)}>
          <div className="next-modal-card small" onClick={(event) => event.stopPropagation()}>
            <div className="next-modal-head">
              <strong>导出目录</strong>
              <button onClick={() => setTargetDirOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="target-dir-row">
              <input
                className="next-text-input"
                value={targetDirDraft}
                onChange={(event) => setTargetDirDraft(event.target.value)}
                spellCheck={false}
                placeholder="安装包与 Config.daml 的输出目录"
              />
              <button
                onClick={() => {
                  void openFileDialog({ directory: true }).then((dir) => {
                    if (typeof dir === 'string' && dir) setTargetDirDraft(dir);
                  });
                }}
              >
                浏览…
              </button>
            </div>
            <div className="next-modal-actions">
              <button className="primary" onClick={applyTargetDir}>
                应用
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {validation ? (
        <div className="next-modal" onClick={() => setValidation(null)}>
          <div
            className="next-modal-card compare-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="next-modal-head">
              <strong>验算结果对比</strong>
              <button onClick={() => setValidation(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="compare-body">
              <div className="compare-pane">
                <div className="compare-pane-title">
                  设计器画布(当前页签:{activeTab?.caption ?? '—'})
                </div>
                <ValidationCanvas document={document} groups={activeGroups} />
              </div>
              <div className="compare-pane">
                <div className="compare-pane-title">
                  ArcGIS Pro 截图 · 摄于{' '}
                  {validation.reportJson.capturedAt
                    ? new Date(validation.reportJson.capturedAt).toLocaleTimeString()
                    : '未知时间'}
                </div>
                <img
                  className="compare-shot"
                  src={validation.screenshotDataUrl}
                  alt="ArcGIS Pro 截图"
                />
              </div>
            </div>
            <div className="compare-meta">
              <div>安装包:{validation.packagePath}</div>
              <div>用例目录:{validation.caseDir}</div>
              <div>提示:截图为整屏捕获,可能包含桌面上的其他窗口。</div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="next-toast">{toast}</div> : null}
    </div>
  );
}

function getSubgroupControls(document: RibbonDocument, subgroupId: string): RibbonControl[] {
  const subgroup = document.subgroups.find((item) => item.id === subgroupId);
  if (!subgroup) return [];
  return subgroup.controlIds
    .map((controlId) => document.controls.find((control) => control.id === controlId))
    .filter(Boolean) as RibbonControl[];
}

function RibbonGroupView({
  document,
  group,
  drag,
  hover,
  canDelete,
  selectedControlId,
  registerGrid,
  onUpdateGroup,
  onUpdateColumns,
  onDuplicateGroup,
  onResizeGroup,
  onDeleteGroup,
  onContextMenuGroup,
  onSelectControl,
  onControlContextMenu,
  onDragControlStart,
}: {
  document: RibbonDocument;
  group: RibbonGroup;
  drag: DragState;
  hover: HoverTarget | null;
  canDelete: boolean;
  selectedControlId: string | null;
  registerGrid: (subgroupId: string, element: HTMLElement | null) => void;
  onUpdateGroup: (groupId: string, patch: Partial<RibbonGroup>) => void;
  onUpdateColumns: (groupId: string, columns: number) => void;
  onDuplicateGroup: (groupId: string) => void;
  onResizeGroup: (groupId: string, size: RibbonControlSize) => void;
  onDeleteGroup: (groupId: string) => void;
  onContextMenuGroup: (x: number, y: number, groupId: string) => void;
  onSelectControl: (controlId: string) => void;
  onControlContextMenu: (x: number, y: number, controlId: string) => void;
  onDragControlStart: (event: React.PointerEvent, control: RibbonControl) => void;
}) {
  const subgroup = document.subgroups.find((item) => item.id === group.subgroupIds[0]);
  if (!subgroup) return null;
  const spec = getGridSpec(subgroup);

  return (
    <section
      className="next-group"
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenuGroup(event.clientX, event.clientY, group.id);
      }}
    >
      <div className="next-group-tools">
        <input
          className="next-group-name"
          value={group.caption}
          onChange={(event) => onUpdateGroup(group.id, { caption: event.target.value })}
          spellCheck={false}
        />
        <button onClick={() => onUpdateColumns(group.id, Math.max(MIN_GROUP_COLS, spec.cols - 1))}>
          −列
        </button>
        <strong>{spec.cols}列</strong>
        <button onClick={() => onUpdateColumns(group.id, Math.min(MAX_GROUP_COLS, spec.cols + 1))}>
          +列
        </button>
        <button onClick={() => onDuplicateGroup(group.id)} title="复制分组">
          <Copy size={12} />
        </button>
        {canDelete ? (
          <button className="danger" onClick={() => onDeleteGroup(group.id)} title="删除分组">
            <Trash2 size={12} />
          </button>
        ) : null}
      </div>
      <RibbonGroupGrid
        document={document}
        subgroup={subgroup}
        drag={drag}
        hover={hover}
        selectedControlId={selectedControlId}
        registerGrid={registerGrid}
        onSelectControl={onSelectControl}
        onControlContextMenu={onControlContextMenu}
        onDragControlStart={onDragControlStart}
      />
      <div className="next-group-footer">
        <div className="next-group-caption">{group.caption}</div>
        <div className="next-group-batch">
          <span>批量尺寸</span>
          {(['large', 'middle', 'small'] as const).map((size) => (
            <button key={size} onClick={() => onResizeGroup(group.id, size)}>
              {SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function RibbonGroupGrid({
  document,
  subgroup,
  drag,
  hover,
  selectedControlId,
  registerGrid,
  onSelectControl,
  onControlContextMenu,
  onDragControlStart,
}: {
  document: RibbonDocument;
  subgroup: RibbonSubgroup;
  drag: DragState;
  hover: HoverTarget | null;
  selectedControlId: string | null;
  registerGrid: (subgroupId: string, element: HTMLElement | null) => void;
  onSelectControl: (controlId: string) => void;
  onControlContextMenu: (x: number, y: number, controlId: string) => void;
  onDragControlStart: (event: React.PointerEvent, control: RibbonControl) => void;
}) {
  const controls = getSubgroupControls(document, subgroup.id);
  const spec = getGridSpec(subgroup);
  const layout = getSubgroupLayout(document, subgroup, 'Large');
  const layoutIds = new Set(layout.map((item) => item.i));
  const renderedControls = controls.filter((control) => layoutIds.has(control.id));
  const hiddenCount = controls.length - renderedControls.length;
  const usedColumns = layout.reduce((max, item) => Math.max(max, item.x + item.w), 0);
  const showPreview = Boolean(drag) && hover?.subgroupId === subgroup.id;

  return (
    <div
      className="next-subgroup"
      style={{ '--group-cols': spec.cols, '--group-rows': spec.rows } as CSSProperties}
    >
      <div className="next-subgroup-head">
        <span>宽屏固定高度</span>
        <strong>
          已用到 {usedColumns}/{spec.cols} 列 · 3 行
        </strong>
      </div>
      <div
        className="next-grid-board"
        ref={(element) => registerGrid(subgroup.id, element)}
        data-testid={`grid-${subgroup.id}`}
      >
        {showPreview && hover ? (
          <div
            className={`next-drop-preview ${hover.valid ? 'valid' : 'invalid'}`}
            style={
              {
                left: hover.x * RIBBON_CELL,
                top: hover.y * RIBBON_CELL,
                width: hover.w * RIBBON_CELL,
                height: hover.h * RIBBON_CELL,
              } as CSSProperties
            }
          />
        ) : null}
        {renderedControls.map((control) => (
          <button
            key={control.id}
            data-testid={`control-${control.id}`}
            className={`next-ribbon-control${control.id === selectedControlId ? ' selected' : ''}${
              drag?.kind === 'move' && drag.controlId === control.id ? ' dragging' : ''
            }`}
            style={
              {
                left: (control.layout?.x ?? 0) * RIBBON_CELL,
                top: (control.layout?.y ?? 0) * RIBBON_CELL,
                width: (control.layout?.w ?? 1) * RIBBON_CELL,
                height: (control.layout?.h ?? 1) * RIBBON_CELL,
              } as CSSProperties
            }
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              onDragControlStart(event, control);
            }}
            onClick={() => onSelectControl(control.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onControlContextMenu(event.clientX, event.clientY, control.id);
            }}
          >
            <ControlMock
              type={control.type}
              caption={control.caption}
              size={control.size}
              iconFile={control.icon.small || undefined}
            />
          </button>
        ))}
        {hiddenCount > 0 ? (
          <div className="hidden-controls-warning">
            有 {hiddenCount} 个控件因无空位未显示
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 只读画布:验算对比视图左栏,复刻 RibbonGroupGrid 的渲染循环,不带编辑 chrome 与拖拽
function ValidationCanvas({
  document,
  groups,
}: {
  document: RibbonDocument;
  groups: RibbonGroup[];
}) {
  if (!groups.length) {
    return <div className="next-empty-canvas">当前页签是空白。</div>;
  }
  return (
    <div className="next-ribbon-area compare-canvas">
      {groups.map((group) => {
        const subgroup = document.subgroups.find((item) => item.id === group.subgroupIds[0]);
        if (!subgroup) return null;
        const spec = getGridSpec(subgroup);
        const controls = getSubgroupControls(document, subgroup.id);
        const layout = getSubgroupLayout(document, subgroup, 'Large');
        const layoutIds = new Set(layout.map((item) => item.i));
        const rendered = controls.filter((control) => layoutIds.has(control.id));
        const hiddenCount = controls.length - rendered.length;
        return (
          <section className="next-group" key={group.id}>
            <div className="next-group-footer">
              <div className="next-group-caption">{group.caption}</div>
            </div>
            <div
              className="next-subgroup"
              style={{ '--group-cols': spec.cols, '--group-rows': spec.rows } as CSSProperties}
            >
              <div className="next-grid-board">
                {rendered.map((control) => (
                  <div
                    key={control.id}
                    className="next-ribbon-control"
                    style={
                      {
                        left: (control.layout?.x ?? 0) * RIBBON_CELL,
                        top: (control.layout?.y ?? 0) * RIBBON_CELL,
                        width: (control.layout?.w ?? 1) * RIBBON_CELL,
                        height: (control.layout?.h ?? 1) * RIBBON_CELL,
                      } as CSSProperties
                    }
                  >
                    <ControlMock
                      type={control.type}
                      caption={control.caption}
                      size={control.size}
                      iconFile={control.icon.small || undefined}
                    />
                  </div>
                ))}
                {hiddenCount > 0 ? (
                  <div className="hidden-controls-warning">
                    有 {hiddenCount} 个控件因无空位未显示
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PalettePreview({
  item,
  size,
  onDragStart,
}: {
  item: LibraryControlDefinition;
  size: RibbonControlSize;
  onDragStart: (event: React.PointerEvent) => void;
}) {
  const footprint = getFootprint(item.type, size);
  return (
    <div className="library-preview-item">
      <button
        data-testid={`palette-${item.type}-${size}`}
        className={`library-ribbon-preview size-${size} type-${item.type}`}
        style={
          {
            '--preview-cols': footprint.w,
            '--preview-rows': footprint.h,
          } as CSSProperties
        }
        title={`${item.label} / ${SIZE_LABELS[size]} / ${footprintLabel(item.type, size)}`}
        onPointerDown={onDragStart}
      >
        <ControlMock type={item.type} caption={item.label} size={size} mode="library" />
      </button>
      <span className="library-size-caption">
        {SIZE_LABELS[size]} · {footprintLabel(item.type, size)}
      </span>
    </div>
  );
}

function Inspector({
  control,
  onUpdate,
  onDelete,
  onOpenIcons,
}: {
  control: RibbonControl;
  onUpdate: (controlId: string, patch: Partial<RibbonControl>) => void;
  onDelete: (controlId: string) => void;
  onOpenIcons: () => void;
}) {
  return (
    <section className="next-panel next-inspector">
      <div className="next-panel-title">
        <strong>属性 · {control.type}</strong>
      </div>
      <div className="next-form">
        <label>
          标题
          <input
            value={control.caption}
            onChange={(event) => onUpdate(control.id, { caption: event.target.value })}
          />
        </label>
        <label>
          首选尺寸
          <select
            value={control.size}
            onChange={(event) =>
              onUpdate(control.id, { size: event.target.value as RibbonControlSize })
            }
          >
            {control.supportedSizes.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABELS[size]} {footprintLabel(control.type, size)}
              </option>
            ))}
          </select>
        </label>
        <div className="icon-bindings">
          <span>图标</span>
          <button className="icon-slot" onClick={onOpenIcons} title="打开图标选择器">
            <ImageIcon size={13} />
            <span className="icon-slot-name">
              {control.icon.small
                ? control.icon.small.replace(/^(dark)?images_/, '')
                : '选择 Pro 图标'}
            </span>
          </button>
          {control.icon.small ? (
            <button
              className="icon-clear"
              title="清除图标"
              onClick={() => onUpdate(control.id, { icon: { small: '', large: '' } })}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
        <label>
          提示
          <input
            value={control.tooltip}
            onChange={(event) => onUpdate(control.id, { tooltip: event.target.value })}
          />
        </label>
        <label>
          条件
          <input
            value={control.condition}
            onChange={(event) => onUpdate(control.id, { condition: event.target.value })}
            placeholder="condition ID"
          />
        </label>
        <label>
          AI 备注
          <textarea
            rows={3}
            value={control.aiNotes}
            onChange={(event) => onUpdate(control.id, { aiNotes: event.target.value })}
          />
        </label>
        <button className="danger" onClick={() => onDelete(control.id)}>
          <Trash2 size={14} />
          删除控件
        </button>
      </div>
    </section>
  );
}

function ContextMenu({
  state,
  document,
  onAction,
}: {
  state: ContextMenuState;
  document: RibbonDocument;
  onAction: (action: string) => void;
}) {
  const control = state.controlId
    ? document.controls.find((item) => item.id === state.controlId)
    : null;
  return (
    <div className="context-menu" style={{ left: state.x, top: state.y }}>
      {control ? (
        <>
          <div className="context-menu-title">{control.caption || control.type}</div>
          <button onClick={() => onAction('icons')}>选择图标…</button>
          <button className="danger" onClick={() => onAction('delete-control')}>
            删除控件
          </button>
        </>
      ) : (
        <>
          <button onClick={() => onAction('duplicate-group')}>复制分组</button>
          <button className="danger" onClick={() => onAction('delete-group')}>
            删除分组
          </button>
        </>
      )}
    </div>
  );
}
