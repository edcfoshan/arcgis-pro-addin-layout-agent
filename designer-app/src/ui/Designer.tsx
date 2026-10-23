import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Info,
  GripVertical,
  Minus,
  Package,
  Plus,
  Redo2,
  Save,
  Settings,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { CONTROL_LIBRARY, SIZE_LABELS, TYPE_LABELS } from '../core/library';
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
  ControlChild,
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
import { open as openFileDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { parseDamlToDocument } from '../core/damlImport';
import { ControlMock } from './ControlMock';
import { DocumentOutline } from './DocumentOutline';
import { IconPicker, type IconSelection } from './IconPicker';
import { getIconUrl, invalidateIconList } from './iconsClient';
import { MenuSurface } from './Menu';
import { Welcome } from './Welcome';
import { AboutDialog } from './AboutDialog';
import { Modal } from './Modal';
import { createDemoDocument } from '../core/demoLayout';
import {
  DEFAULT_GROUP_COLS,
  FIXED_GROUP_ROWS,
  MAX_GROUP_COLS,
  RIBBON_CELL,
  flowLayout,
  footprintLabel,
  getFootprint,
  normalizeDocumentLayouts,
  type GridRect,
} from '../core/ribbonLayout';
import './designer.css';

const STORAGE_KEY = 'gispro-ribbon-designer-doc';
const PROJECTS_STORAGE_KEY = 'gispro-ribbon-designer-projects';
const LAST_EXPORT_DIR_STORAGE_KEY = 'gispro-ribbon-designer-last-export-dir';
const LAST_DOC_DIR_STORAGE_KEY = 'gispro-ribbon-designer-last-doc-dir';
const RECENT_FILES_STORAGE_KEY = 'gispro-ribbon-designer-recent-files';
const THEME_STORAGE_KEY = 'gispro-ribbon-designer-theme';
const AUTO_UPDATE_STORAGE_KEY = 'gispro-ribbon-designer-auto-update';
const WELCOME_SEEN_STORAGE_KEY = 'gispro-ribbon-designer-welcome-seen';
const PALETTE_HEIGHT_STORAGE_KEY = 'gispro-ribbon-designer-palette-height';
const PROJ_WIDTH_STORAGE_KEY = 'gispro-ribbon-designer-proj-width';
const STRUCT_WIDTH_STORAGE_KEY = 'gispro-ribbon-designer-struct-width';

// 控件库（D 形态：左类型列表 + 右全尺寸大详情）高度的区间。默认 296 恰好装下
// 「详情头 + 舞台 126px + 徽章行 + DAML 行」的完整详情；下限 160 是最小窗口
// （1100×700，画布地板之后）实际还够得到的值，再小详情就只能滚着看了；
// 上限 460 是「一屏能看到的最大量」。
const PALETTE_HEIGHT_MIN = 160;
const PALETTE_HEIGHT_MAX = 460;
const PALETTE_HEIGHT_DEFAULT = 296;

// 左右停靠栏（项目栏 / 文档结构栏）的宽度区间，三栏停靠布局下纵贯到底。
// 默认宽与 designer.css 里的回退宽度一一对应。
const PROJ_WIDTH_MIN = 120;
const PROJ_WIDTH_MAX = 320;
const PROJ_WIDTH_DEFAULT = 172;
const STRUCT_WIDTH_MIN = 240;
const STRUCT_WIDTH_MAX = 460;
const STRUCT_WIDTH_DEFAULT = 320;

// 从 localStorage 读一份宽度/高度偏好；越界或读不到都算「没存过」。
const storedSize = (key: string, min: number, max: number) => {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) && raw >= min && raw <= max ? raw : null;
};

// 每项目一份的草稿槽 key(项目 id 分槽,旧版单份草稿用 STORAGE_KEY 迁移)
const draftKey = (projectId: string) => `${STORAGE_KEY}-${projectId}`;

const HISTORY_LIMIT = 50;

// 控件库紧凑卡的类型代表图标(Tabler 稳定名,缺失时显示占位色块)
const LIBRARY_ICON: Record<string, string> = {
  button: 'images_arrow-right16.png',
  tool: 'images_crosshair16.png',
  splitButton: 'images_stack16.png',
  toolPalette: 'images_pencil16.png',
  menu: 'images_dots16.png',
  gallery: 'images_palette16.png',
  comboBox: 'images_list16.png',
  editBox: 'images_edit16.png',
  checkBox: 'images_circle-check16.png',
};

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
      /** 「图标」形态:small 下 1×1 纯图标 */
      iconOnly?: boolean;
    }
  | {
      kind: 'move';
      controlId: string;
      caption: string;
      type: RibbonControl['type'];
      size: RibbonControlSize;
      iconFile?: string;
      variant?: RibbonControl['variant'];
    }
  | null;

type ActiveDragState = Exclude<DragState, null>;

const DRAG_START_DISTANCE = 5;
const EDGE_SCROLL_DISTANCE = 48;

interface HoverTarget {
  subgroupId: string;
  /** 插入到目标分组 controlIds 的位置（流式布局下拖拽=定插入点，不再是格子落点） */
  index: number;
  /** 插入指示线的列位置（格） */
  lineX: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  controlId?: string;
  groupId?: string;
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

interface RecentFile {
  path: string;
  name: string;
}

// 控件类型按交互特性分组（控件库左栏列表的分组标题）
const LIBRARY_CATEGORY: Record<string, 'command' | 'container' | 'input'> = {
  button: 'command',
  tool: 'command',
  splitButton: 'container',
  toolPalette: 'container',
  menu: 'container',
  gallery: 'container',
  comboBox: 'input',
  editBox: 'input',
  checkBox: 'input',
};

const LIBRARY_CATEGORIES: { id: 'command' | 'container' | 'input'; label: string }[] = [
  { id: 'command', label: '命令' },
  { id: 'container', label: '容器' },
  { id: 'input', label: '输入' },
];

// 项目 = 一个 .json 文档 = 一个 addin 包(IDE 多开文件式);侧栏两级:项目 → 页签
interface ProjectEntry {
  id: string;
  name: string;
  document: RibbonDocument;
  filePath: string | null;
  dirty: boolean;
  activeTabId: string;
  collapsed: boolean;
}

interface StoredProjectMeta {
  id: string;
  name: string;
  filePath: string | null;
  dirty: boolean;
  activeTabId: string;
  collapsed: boolean;
}

interface StoredSession {
  activeProjectId: string;
  projects: StoredProjectMeta[];
}

const makeProjectEntry = (
  document: RibbonDocument,
  opts: { id?: string; name?: string; filePath?: string | null; dirty?: boolean } = {},
): ProjectEntry => ({
  id: opts.id ?? createId('proj'),
  name: opts.name ?? document.metadata.name ?? '未命名',
  document,
  filePath: opts.filePath ?? null,
  dirty: opts.dirty ?? true,
  activeTabId: document.tabs[0]?.id ?? '',
  collapsed: false,
});

// 启动恢复:优先读多项目会话;没有则迁移旧版单份草稿;再没有开一个空白项目。
// 落盘项目也从草稿槽恢复(与旧版「草稿兜底优先于文件」行为一致)
const loadInitialSession = (): { projects: ProjectEntry[]; activeProjectId: string } => {
  try {
    const sessionRaw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw) as StoredSession;
      if (Array.isArray(session.projects) && session.projects.length) {
        const projects = session.projects.flatMap((meta) => {
          const draft = localStorage.getItem(draftKey(meta.id));
          if (!draft) return [];
          const parsed = parseImportedDocument(draft);
          if (!parsed) return [];
          const document = normalizeDocumentLayouts(parsed, 'Large');
          const activeTabId = document.tabs.some((tab) => tab.id === meta.activeTabId)
            ? meta.activeTabId
            : document.tabs[0]?.id ?? '';
          return [
            {
              id: meta.id,
              // 老会话没有 name 字段,回退到当时的显示名(metadata.name),避免升级后全变「未命名」
              name: meta.name ?? document.metadata.name,
              document,
              filePath: meta.filePath ?? null,
              dirty: meta.dirty ?? true,
              activeTabId,
              collapsed: Boolean(meta.collapsed),
            },
          ];
        });
        if (projects.length) {
          const activeProjectId = projects.some((p) => p.id === session.activeProjectId)
            ? session.activeProjectId
            : projects[0].id;
          return { projects, activeProjectId };
        }
      }
    }
  } catch {
    // 会话数据损坏时回退到旧版迁移路径
  }
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (legacy) {
    const parsed = parseImportedDocument(legacy);
    if (parsed) {
      const entry = makeProjectEntry(normalizeDocumentLayouts(parsed, 'Large'), { dirty: true });
      return { projects: [entry], activeProjectId: entry.id };
    }
  }
  const entry = makeProjectEntry(createEmptyDocument(), { dirty: false });
  return { projects: [entry], activeProjectId: entry.id };
};

const computeLayoutVersion = (document: RibbonDocument) => {
  const lastUpdated = Date.parse(document.metadata.lastUpdated || '');
  const sourceTime = Number.isNaN(lastUpdated) ? Date.now() : lastUpdated;
  const minor = Math.floor(sourceTime / 86_400_000) % 65_535;
  const patch = Math.floor((sourceTime % 86_400_000) / 1000 / 2);
  return `1.${minor}.${patch}`;
};

// 控件 → 它所属页签的 id。结构树是全量铺开的（document.tabs 全渲染），画布却只渲染激活
// 页签，所以从树里点一个控件时得先知道它在哪个页签：不属于激活页签就得先切过去，否则
// 右栏换成了属性表单、画布上却什么都没有。控件自带的 subgroupId 直连到分组、再到页签，
// 不用遍历：control.subgroupId → subgroup.groupId → group.tabId。
const ownerTabOfControl = (document: RibbonDocument, controlId: string): string | null => {
  const subgroupId = document.controls.find((control) => control.id === controlId)?.subgroupId;
  const groupId = document.subgroups.find((subgroup) => subgroup.id === subgroupId)?.groupId;
  return document.groups.find((group) => group.id === groupId)?.tabId ?? null;
};

// 画布页签条的 ARIA tabs 关联：页签用 aria-controls 指向 tabpanel，tabpanel 用
// aria-labelledby 指回激活页签。页签的 DOM id 由业务 id 派生（页签 id 是生成/导入来的，
// 不用它直接当 DOM id，免得外部数据里出现不适合做 id 的字符）。
const CANVAS_TABPANEL_ID = 'ribbon-canvas-tabpanel';
const canvasTabDomId = (tabId: string) => `ribbon-canvas-tab-${tabId}`;

export default function Designer() {
  const [initialSession] = useState(loadInitialSession);
  const [projects, setProjects] = useState<ProjectEntry[]>(initialSession.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialSession.activeProjectId);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  // 结构树点击引发的「滚动定位到画布」请求。带 nonce 而不是只存 controlId：用户把画布
  // 滚走后再点一次树里同一条，定位要再生效，而只存 id 时状态没变化、effect 不会重跑。
  const [revealRequest, setRevealRequest] = useState<{ controlId: string; nonce: number } | null>(
    null,
  );
  const revealNonceRef = useRef(0);
  const [drag, setDrag] = useState<DragState>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [toast, setToast] = useState('');
  const [dropdown, setDropdown] = useState<{
    kind: 'import' | 'export' | 'file' | 'settings';
    x: number;
    y: number;
  } | null>(null);
  const [iconPickerFor, setIconPickerFor] = useState<{
    controlId: string;
    childId?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // 分组拖拽排序(同页签内):按住分组编辑条上的手柄左右拖,松手落到指示线位置;
  // groupDrop.index 是在「其余分组」序列里的插入位,x 是指示线的像素偏移
  const [groupDragId, setGroupDragId] = useState<string | null>(null);
  const [groupDrop, setGroupDrop] = useState<{ index: number; x: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [lastExportDir, setLastExportDir] = useState(
    () => localStorage.getItem(LAST_EXPORT_DIR_STORAGE_KEY) || '',
  );
  const [pendingCloseProjectId, setPendingCloseProjectId] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'clear' | null>(null);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem(WELCOME_SEEN_STORAGE_KEY),
  );
  const [showAbout, setShowAbout] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'),
  );
  const [autoUpdate, setAutoUpdate] = useState(
    () => localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== 'off',
  );
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_FILES_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const [libSize, setLibSize] = useState<Record<string, RibbonControlSize>>({});
  // 「图标」形态(小尺寸 1×1 纯图标)的选中记忆,与 libSize 成对使用
  const [libIconOnly, setLibIconOnly] = useState<Record<string, boolean>>({});
  // 控件库 D 形态左栏当前选中的类型，右栏展示它的全尺寸详情。不跨会话记忆：
  // 库是常驻面板，每次进来都停在信息量最大的「画廊」上。
  const [libSelectedType, setLibSelectedType] = useState<string>('gallery');
  // 控件库高度：用户拖分隔条调出来，存 localStorage 跨会话记忆。
  // 越界或读不到就当作「没存过」，回 D 形态详情的完整高度 296。
  const [paletteHeight, setPaletteHeight] = useState<number>(() => {
    const stored = storedSize(PALETTE_HEIGHT_STORAGE_KEY, PALETTE_HEIGHT_MIN, PALETTE_HEIGHT_MAX);
    return stored ?? PALETTE_HEIGHT_DEFAULT;
  });
  // 左右停靠栏宽度：同样拖分隔条调节、跨会话记忆；null 表示没存过，交给 CSS 默认宽。
  const [projWidth, setProjWidth] = useState<number | null>(() =>
    storedSize(PROJ_WIDTH_STORAGE_KEY, PROJ_WIDTH_MIN, PROJ_WIDTH_MAX),
  );
  const [structWidth, setStructWidth] = useState<number | null>(() =>
    storedSize(STRUCT_WIDTH_STORAGE_KEY, STRUCT_WIDTH_MIN, STRUCT_WIDTH_MAX),
  );

  const clampPaletteHeight = (value: number) =>
    Math.min(PALETTE_HEIGHT_MAX, Math.max(PALETTE_HEIGHT_MIN, value));

  useEffect(() => {
    localStorage.setItem(PALETTE_HEIGHT_STORAGE_KEY, String(Math.round(paletteHeight)));
  }, [paletteHeight]);

  useEffect(() => {
    if (projWidth !== null) localStorage.setItem(PROJ_WIDTH_STORAGE_KEY, String(Math.round(projWidth)));
  }, [projWidth]);

  useEffect(() => {
    if (structWidth !== null) localStorage.setItem(STRUCT_WIDTH_STORAGE_KEY, String(Math.round(structWidth)));
  }, [structWidth]);

  // 生效高度 = 经过窗口钳制后真正渲染出来的高度。钳制由 CSS 的 flex 完成
  // （.next-canvas-row 的地板是 --canvas-min-height，控件库 flex-shrink 吸回不足的部分），
  // 所以状态里的「偏好」可能大于本屏放得下的量。
  const paletteRef = useRef<HTMLElement | null>(null);
  const effectivePaletteHeight = () =>
    paletteRef.current?.getBoundingClientRect().height ?? paletteHeight;

  // 高度手势的唯一入口。锚点随方向变，两个 base 由调用方在合适时机取：
  // 键盘在按键那一刻取，拖拽在 pointerdown 那一刻取（拖拽过程中状态一直在变，现取会漂）。
  //
  // 变大方向锚「偏好与生效高度中的较大者」：被窗口钳住时偏好 > 生效高度，于是 Up / 上拖
  // 加不动 → 退化成 no-op，偏好原样保留（460 不会被降级成 224，换回大窗口还拿得回来）。
  // 变小方向锚生效高度：分隔条 1:1 跟手（锚偏好会先空拖「偏好 − 可用空间」一整段），
  // 而且「变小」本来就是用户这一刻明确要的。
  const applyPaletteResize = (delta: number, growBase: number, shrinkBase: number) =>
    setPaletteHeight(clampPaletteHeight((delta > 0 ? growBase : shrinkBase) + delta));

  const nudgePaletteHeight = (delta: number) => {
    const effective = effectivePaletteHeight();
    applyPaletteResize(delta, Math.max(paletteHeight, effective), effective);
  };

  // 拖分隔条改高度。指针捕获挂在分隔条上，pointermove/pointerup 仍会冒泡到 window，
  // 所以监听放 window；pointercancel 也要收，否则触摸被系统接管时监听器会留在 window 上。
  const startPaletteResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startEffective = effectivePaletteHeight();
    const startGrowBase = Math.max(paletteHeight, startEffective);
    target.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      // 往上拖（delta > 0）→ 控件库变高
      applyPaletteResize(startY - moveEvent.clientY, startGrowBase, startEffective);
    };
    const onEnd = () => {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // 左右停靠栏宽度手势。宽度方向没有「窗口钳制偏好」的反馈环（画布地板只约束纵向），
  // 锚起点渲染宽 1:1 跟手即可；键盘步进 ±16，与高度分隔条一致。
  // 基准宽取停靠栏 DOM 的当前 offsetWidth：偏好为 null（没存过）时 CSS 默认宽就是真相。
  const projSidebarRef = useRef<HTMLElement | null>(null);
  const structSidebarRef = useRef<HTMLElement | null>(null);

  const nudgeSidebarWidth = (which: 'proj' | 'struct', delta: number) => {
    const panel = which === 'proj' ? projSidebarRef.current : structSidebarRef.current;
    if (!panel) return;
    const min = which === 'proj' ? PROJ_WIDTH_MIN : STRUCT_WIDTH_MIN;
    const max = which === 'proj' ? PROJ_WIDTH_MAX : STRUCT_WIDTH_MAX;
    const next = Math.min(max, Math.max(min, panel.offsetWidth + delta));
    (which === 'proj' ? setProjWidth : setStructWidth)(next);
  };

  const startSidebarResize =
    (which: 'proj' | 'struct') => (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      const panel = which === 'proj' ? projSidebarRef.current : structSidebarRef.current;
      if (!panel) return;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startWidth = panel.offsetWidth;
      const min = which === 'proj' ? PROJ_WIDTH_MIN : STRUCT_WIDTH_MIN;
      const max = which === 'proj' ? PROJ_WIDTH_MAX : STRUCT_WIDTH_MAX;
      const setWidth = which === 'proj' ? setProjWidth : setStructWidth;
      target.setPointerCapture(pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        // 左栏往右拖、右栏往左拖都是加宽
        const delta = which === 'proj' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        setWidth(Math.min(max, Math.max(min, startWidth + delta)));
      };
      const onEnd = () => {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    };
  const [updateBanner, setUpdateBanner] = useState<{ version: string } | null>(null);
  const gridRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostPositionRef = useRef({ x: 0, y: 0 });
  const hoverRef = useRef<HoverTarget | null>(null);
  const groupDragIdRef = useRef<string | null>(null);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // ===== 多项目派生:document/页签/文件路径/脏标记都来自激活项目 =====
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const document = activeProject.document;
  const activeTabId = activeProject.activeTabId;
  const currentFile = activeProject.filePath;
  const fileDirty = activeProject.dirty;
  const documentRef = useRef(document);
  documentRef.current = document;

  const updateProject = (id: string, patch: Partial<ProjectEntry>) =>
    setProjects((current) =>
      current.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );

  // 文档编辑统一走这里:commit/restore 的落盘目标永远是「当前激活项目」
  const updateActiveDocument = (next: RibbonDocument, extra: Partial<ProjectEntry> = {}) => {
    documentRef.current = next;
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectIdRef.current
          ? {
              ...project,
              document: next,
              dirty: true,
              activeTabId: next.tabs.some((tab) => tab.id === project.activeTabId)
                ? project.activeTabId
                : next.tabs[0]?.id ?? '',
              ...extra,
            }
          : project,
      ),
    );
  };

  const activateProject = (projectId: string, tabId?: string) => {
    setActiveProjectId(projectId);
    setSelectedControlId(null);
    if (tabId !== undefined) updateProject(projectId, { activeTabId: tabId });
  };

  // 页签条的方向键。ARIA tabs pattern 的自动激活形态：移动即激活（Pro 的 ribbon tab row
  // 也是这个手感），Home/End 到首尾。焦点必须跟着走——roving tabindex 下只有激活页签在
  // Tab 序里，不挪焦点的话下一个方向键还从旧页签起算。焦点是同步挪的：页签按钮始终在
  // DOM 里（只是 tabIndex 不同），不必等重渲染。
  const handleCanvasTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const tabs = document.tabs;
    if (!tabs.length) return;
    const last = tabs.length - 1;
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const target = tabs[nextIndex];
    activateProject(activeProject.id, target.id);
    const siblings = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    siblings?.[nextIndex]?.focus();
  };

  // 结构树点控件 → 选中它，并滚动定位到画布上对应的位置（spec §4 P4；验收 A8 的「点击定位」）。
  // 顺序不能反：activateProject 会清空 selectedControlId（换了页签就是换了选中对象），
  // 先选中会被那次清空吞掉。
  const revealControl = (controlId: string) => {
    const ownerTabId = ownerTabOfControl(document, controlId);
    if (ownerTabId && ownerTabId !== activeTabId) activateProject(activeProject.id, ownerTabId);
    setSelectedControlId(controlId);
    revealNonceRef.current += 1;
    setRevealRequest({ controlId, nonce: revealNonceRef.current });
  };

  // 滚动发生在渲染之后：跨页签时目标控件要等这一次渲染才出现在画布上。滚动容器有两个
  // （.next-canvas 纵向、.next-ribbon-area 横向），交给 scrollIntoView 自己找最近的可滚祖先。
  // 元素从 gridRefs 里按分组取，不全局查 DOM —— 画布上只有激活页签的网格在册。
  useEffect(() => {
    if (!revealRequest) return;
    const subgroupId = documentRef.current.controls.find(
      (control) => control.id === revealRequest.controlId,
    )?.subgroupId;
    const grid = subgroupId ? gridRefs.current.get(subgroupId) : undefined;
    grid
      ?.querySelector<HTMLElement>(`[data-testid="control-${revealRequest.controlId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [revealRequest]);

  // 新增项目条目并激活;doc 缺省 = 空白布局
  const addProject = (
    doc?: RibbonDocument,
    opts: { filePath?: string | null } = {},
  ): ProjectEntry => {
    const base = doc ? normalizeDocumentLayouts(doc, 'Large') : createEmptyDocument();
    if (!doc) {
      const n = projectsRef.current.filter((project) => !project.filePath).length + 1;
      base.metadata = { ...base.metadata, name: `未命名 ${n}` };
    }
    const entry = makeProjectEntry(base, {
      filePath: opts.filePath ?? null,
      // 从 .json 打开:文档自带的 metadata.name 优先(它可能已被用户改过),
      // 仅在文档名为空时回退到文件名去 .json 扩展名。
      // 顺序反了就会让「改名→另存为→重开」被文件名顶掉(验收 A3)。
      name: opts.filePath
        ? base.metadata.name || splitPath(opts.filePath).name.replace(/\.json$/i, '')
        : undefined,
      dirty: doc ? !opts.filePath : false,
    });
    setProjects((current) => [...current, entry]);
    setActiveProjectId(entry.id);
    setSelectedControlId(null);
    return entry;
  };

  // 关闭项目:脏项目先经确认弹窗;关掉最后一个时自动补一个空白项目
  const removeProject = (id: string) => {
    const idx = projectsRef.current.findIndex((project) => project.id === id);
    localStorage.removeItem(draftKey(id));
    historyRef.current.delete(id);
    let next = projectsRef.current.filter((project) => project.id !== id);
    if (!next.length) {
      const fresh = createEmptyDocument();
      fresh.metadata = { ...fresh.metadata, name: '未命名 1' };
      next = [makeProjectEntry(fresh, { dirty: false })];
    }
    setProjects(next);
    if (activeProjectIdRef.current === id) {
      const fallback = next[Math.min(Math.max(idx, 0), next.length - 1)];
      setActiveProjectId(fallback.id);
    }
    setSelectedControlId(null);
  };

  const closeProject = (id: string) => {
    const target = projectsRef.current.find((project) => project.id === id);
    if (!target) return;
    if (target.dirty) {
      setPendingCloseProjectId(id);
      return;
    }
    removeProject(id);
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  // ===== 撤销/重做:每项目独立双栈 + tick 触发重渲染(避免在 setState updater 里做副作用) =====
  const historyRef = useRef(
    new Map<string, { past: RibbonDocument[]; future: RibbonDocument[] }>(),
  );
  const [, setHistoryTick] = useState(0);
  const syncHistory = () => setHistoryTick((t) => t + 1);

  const historyOf = (projectId: string) => {
    let entry = historyRef.current.get(projectId);
    if (!entry) {
      entry = { past: [], future: [] };
      historyRef.current.set(projectId, entry);
    }
    return entry;
  };

  const pushHistory = (prev: RibbonDocument) => {
    const history = historyOf(activeProjectIdRef.current);
    history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), prev];
    history.future = [];
  };

  // 不变量:任何时刻 document.metadata.name === 激活项目的 name。
  // 项目名(entry.name)是权威,侧栏与窗口标题显示它;document.metadata.name 是它的镜像,
  // 会随保存写进 .json,也会随导出写进 Config.daml 的 <Name> 与 moduleCaption。
  // 项目名属项目元数据(与 filePath、collapsed 同类),不是画布内容,所以整份换文档时
  // 不能把它一起换掉——否则「界面上叫 A、导出的插件叫 B」(改名后 Ctrl+Z、改名后清空都复现过)。
  // 因此撤销/重做、清空画布,以及将来任何整份替换文档的路径,都必须经由本函数,
  // 不要直接调 updateActiveDocument 塞入外来文档。
  const withActiveProjectName = (next: RibbonDocument): RibbonDocument => {
    const entry = projectsRef.current.find(
      (project) => project.id === activeProjectIdRef.current,
    );
    return entry && entry.name
      ? { ...next, metadata: { ...next.metadata, name: entry.name } }
      : next;
  };

  const restoreDocument = (next: RibbonDocument) => {
    updateActiveDocument(withActiveProjectName(next));
  };

  const undo = () => {
    const history = historyOf(activeProjectIdRef.current);
    if (!history.past.length) return;
    const prev = history.past[history.past.length - 1];
    history.future = [documentRef.current, ...history.future].slice(0, HISTORY_LIMIT);
    history.past = history.past.slice(0, -1);
    restoreDocument(prev);
    syncHistory();
  };

  const redo = () => {
    const history = historyOf(activeProjectIdRef.current);
    if (!history.future.length) return;
    const next = history.future[0];
    history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), documentRef.current];
    history.future = history.future.slice(1);
    restoreDocument(next);
    syncHistory();
  };

  const commit = useCallback((recipe: (current: RibbonDocument) => RibbonDocument) => {
    const current = documentRef.current;
    const next = normalizeDocumentLayouts(cloneDocumentWithTimestamp(recipe(current)), 'Large');
    pushHistory(current);
    updateActiveDocument(next);
    syncHistory();
  }, []);

  // 草稿:每项目一个槽 + 会话元数据(顺序/激活项/折叠/脏态),关窗随时可恢复
  useEffect(() => {
    for (const project of projects) {
      try {
        localStorage.setItem(draftKey(project.id), JSON.stringify(project.document));
      } catch {
        // 草稿兜底尽力而为,写不进(如存储满)不阻塞编辑
      }
    }
    const session: StoredSession = {
      activeProjectId,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        filePath: project.filePath,
        dirty: project.dirty,
        activeTabId: project.activeTabId,
        collapsed: project.collapsed,
      })),
    };
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // 同上
    }
  }, [projects, activeProjectId]);

  useEffect(() => {
    localStorage.setItem(LAST_EXPORT_DIR_STORAGE_KEY, lastExportDir);
  }, [lastExportDir]);

  useEffect(() => {
    globalThis.document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, autoUpdate ? 'on' : 'off');
  }, [autoUpdate]);

  useEffect(() => {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recentFiles));
  }, [recentFiles]);

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

  // 项目名是独立的用户可编辑字段，恒显示它——不再回退到文件名。
  // 原因：metadata.name 同时是导出包里 <AddInInfo>/<Name> 的插件名，
  // 若被文件名顶掉，用户改的名一保存就失效（见 spec §2.1 / D3）。
  const projectTitle = (project: ProjectEntry) => project.name || '未命名';
  const activeProjectTitle = projectTitle(activeProject);

  // undo/redo 按钮状态 = 激活项目的独立历史栈(historyTick 触发重渲染时重读)
  const activeHistory = historyRef.current.get(activeProjectId);
  const canUndo = Boolean(activeHistory?.past.length);
  const canRedo = Boolean(activeHistory?.future.length);

  // 改名：同步 entry.name 与 document.metadata.name。
  // 空名回退「未命名」，不允许产生空标题。
  // 项目名属项目元数据，不进文档 undo 栈（undo 管的是画布内容）。
  const commitProjectName = (projectId: string, raw: string) => {
    setRenamingProjectId(null);
    const entry = projectsRef.current.find((project) => project.id === projectId);
    if (!entry) return;
    const next = raw.trim() || '未命名';
    if (entry.name === next) return;
    updateProject(projectId, {
      name: next,
      dirty: true,
      document: {
        ...entry.document,
        metadata: { ...entry.document.metadata, name: next },
      },
    });
  };

  // 新增页签(可作用于非激活项目:该项目的独立历史栈照常入栈)
  const addTabTo = (projectId: string) => {
    const entry = projectsRef.current.find((project) => project.id === projectId);
    if (!entry) return;
    const tabId = createId('tab');
    const next = normalizeDocumentLayouts(
      cloneDocumentWithTimestamp({
        ...entry.document,
        tabs: [
          ...entry.document.tabs,
          {
            id: tabId,
            caption: `新页签 ${entry.document.tabs.length + 1}`,
            keytip: `T${entry.document.tabs.length + 1}`,
            groupIds: [],
          },
        ],
      }),
      'Large',
    );
    const history = historyOf(projectId);
    history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), entry.document];
    history.future = [];
    updateProject(projectId, { document: next, dirty: true, activeTabId: tabId });
    setSelectedControlId(null);
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
      const fallback = document.tabs.find((tab) => tab.id !== tabId)?.id ?? '';
      updateProject(activeProject.id, { activeTabId: fallback });
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

  // 分组列数 +/-:列数是画布拖放区的手动最小宽,存在 subgroup.layout.columns
  // (新建分组默认 8)。显示宽 = max(内容列数, 手动列数):内容超了会自动加宽,
  // 手动只能收回到内容列数为止(内容必须完整可见),下限 1 列、上限 MAX_GROUP_COLS。
  // Pro 端没有宽度概念(按内容自动收紧),这个宽度只决定设计器里的拖放区,不影响导出。
  const adjustGroupColumns = (groupId: string, delta: 1 | -1) => {
    const subgroup = document.subgroups.find((item) => item.groupId === groupId);
    if (!subgroup) return;
    const contentColumns = flowLayout(
      getSubgroupControls(document, subgroup.id).map((control) => ({
        id: control.id,
        type: control.type,
        size: control.size,
        caption: control.caption,
        variant: control.variant,
        iconOnly: control.iconOnly,
      })),
    ).reduce((max, rect) => Math.max(max, rect.x + rect.w), 0);
    const manual = Math.min(
      MAX_GROUP_COLS,
      Math.max(1, subgroup.layout?.columns ?? DEFAULT_GROUP_COLS),
    );
    let next: number;
    if (delta === 1) {
      next = Math.min(MAX_GROUP_COLS, Math.max(contentColumns, manual) + 1);
    } else {
      if (manual <= contentColumns) return;
      next = Math.max(Math.max(1, contentColumns), manual - 1);
    }
    if (next === manual) return;
    commit((current) => ({
      ...current,
      subgroups: current.subgroups.map((item) =>
        item.id === subgroup.id
          ? { ...item, layout: { row: 0, columns: next, rows: FIXED_GROUP_ROWS } }
          : item,
      ),
    }));
  };

  // ===== 分组拖拽排序(同页签内) =====
  // 分组顺序 = 导出后 Pro 页签上从左到右的顺序。手柄按住左右拖,松手落到指示线;
  // 手柄上按左右方向键可逐格移动(键盘可达,不依赖指针)。
  const ribbonAreaRef = useRef<HTMLDivElement | null>(null);

  const positionGhost = useCallback((clientX: number, clientY: number) => {
    ghostPositionRef.current = { x: clientX, y: clientY };
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform = `translate3d(${clientX + 12}px, ${clientY + 10}px, 0)`;
    }
  }, []);

  // 拖拽接近画布左右边缘时持续横向滚动。rAF 让指针停在边缘也能继续走，
  // 而不是依赖系统在指针静止时不再发 pointermove。
  const startAreaAutoscroll = useCallback((getClientX: () => number, onFrame?: () => void) => {
    let frame = 0;
    const step = () => {
      const area = ribbonAreaRef.current;
      if (area) {
        const rect = area.getBoundingClientRect();
        const x = getClientX();
        const delta =
          x < rect.left + EDGE_SCROLL_DISTANCE
            ? -Math.min(28, (rect.left + EDGE_SCROLL_DISTANCE - x) / 2)
            : x > rect.right - EDGE_SCROLL_DISTANCE
              ? Math.min(28, (x - rect.right + EDGE_SCROLL_DISTANCE) / 2)
              : 0;
        if (delta !== 0) area.scrollLeft += delta;
      }
      onFrame?.();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const commitGroupOrder = (groupId: string, targetIndex: number) => {
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        if (!tab.groupIds.includes(groupId)) return tab;
        const ids = tab.groupIds.filter((id) => id !== groupId);
        ids.splice(Math.max(0, Math.min(ids.length, targetIndex)), 0, groupId);
        return { ...tab, groupIds: ids };
      }),
    }));
  };

  const moveGroupBy = (groupId: string, delta: -1 | 1) => {
    commit((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        const index = tab.groupIds.indexOf(groupId);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= tab.groupIds.length) return tab;
        const ids = [...tab.groupIds];
        [ids[index], ids[next]] = [ids[next], ids[index]];
        return { ...tab, groupIds: ids };
      }),
    }));
  };

  const startGroupDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setGroupDragId(groupId);
    groupDragIdRef.current = groupId;
    // 落点记在局部变量里:commit 绝不能放进 setState updater(StrictMode 会双跑双推历史)
    let lastIndex: number | null = null;
    let frame = 0;
    let nextX = event.clientX;
    let nextY = event.clientY;
    const stopAutoscroll = startAreaAutoscroll(() => nextX, () => updateDrop(nextX, nextY));

    const updateDrop = (moveX: number, moveY: number) => {
      const area = ribbonAreaRef.current;
      if (!area) return;
      const areaRect = area.getBoundingClientRect();
      const inside =
        moveX >= areaRect.left &&
        moveX <= areaRect.right &&
        moveY >= areaRect.top &&
        moveY <= areaRect.bottom;
      if (!inside) {
        lastIndex = null;
        setGroupDrop(null);
        return;
      }
      const others = Array.from(area.querySelectorAll<HTMLElement>('.next-group')).filter(
        (el) => el.dataset.groupId !== groupId,
      );
      let index = 0;
      let x = areaRect.width;
      for (const el of others) {
        const rect = el.getBoundingClientRect();
        if (moveX > rect.left + rect.width / 2) {
          index += 1;
          x = rect.right - areaRect.left;
        } else {
          x = rect.left - areaRect.left;
          break;
        }
      }
      lastIndex = index;
      setGroupDrop({ index, x });
    };

    const onMove = (moveEvent: PointerEvent) => {
      nextX = moveEvent.clientX;
      nextY = moveEvent.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateDrop(nextX, nextY);
      });
    };

    const cleanup = (shouldCommit: boolean, pointerId?: number) => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      stopAutoscroll();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('keydown', onKeyDown);
      if (pointerId !== undefined && handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      setGroupDrop(null);
      setGroupDragId(null);
      groupDragIdRef.current = null;
      if (shouldCommit && lastIndex !== null) commitGroupOrder(groupId, lastIndex);
    };
    const onEnd = (upEvent: PointerEvent) => cleanup(true, upEvent.pointerId);
    const onCancel = (cancelEvent: PointerEvent) => cleanup(false, cancelEvent.pointerId);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        cleanup(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
  };

  const updateControl = (controlId: string, patch: Partial<RibbonControl>) => {
    // 尺寸或变体(如画廊 下拉↔摊开)变化都会改变占格:流式布局下直接更新名义占格,
    // 画布显示位置由 flowLayout 派生;variant 清除时值为 undefined,须用键存在性区分「没改」与「改成无」
    if (patch.size || 'variant' in patch) {
      commit((current) => ({
        ...current,
        controls: current.controls.map((control) => {
          if (control.id !== controlId) return control;
          const nextSize = (patch.size ?? control.size) as RibbonControlSize;
          const nextVariant = 'variant' in patch ? patch.variant : control.variant;
          const fp = getFootprint(control.type, nextSize, nextVariant);
          return {
            ...control,
            ...patch,
            layout: {
              x: control.layout?.x ?? 0,
              y: control.layout?.y ?? 0,
              w: fp.w,
              h: fp.h,
            },
          };
        }),
      }));
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

  // 流式布局下落点=插入位置：新控件插到 controlIds 的目标索引处；
  // layout 只写名义占格（画布显示位置由 flowLayout 派生，不读存储坐标）。
  const addControlAtIndex = (
    subgroup: RibbonSubgroup,
    definition: LibraryControlDefinition,
    size: RibbonControlSize,
    index: number,
    iconOnly?: boolean,
  ) => {
    const fp = getFootprint(definition.type, size, undefined, iconOnly);
    const nextControl = createControlFromType(definition.type, subgroup.id, {
      size,
      iconOnly: iconOnly || undefined,
      layout: { x: 0, y: 0, w: fp.w, h: fp.h },
    });
    commit((current) => ({
      ...current,
      controls: [...current.controls, nextControl],
      subgroups: current.subgroups.map((item) => {
        if (item.id !== subgroup.id) return item;
        const ids = [...item.controlIds];
        ids.splice(Math.min(index, ids.length), 0, nextControl.id);
        return { ...item, controlIds: ids };
      }),
    }));
    setSelectedControlId(nextControl.id);
  };

  const moveControlTo = (controlId: string, subgroupId: string, index: number) => {
    commit((current) => {
      const control = current.controls.find((item) => item.id === controlId);
      if (!control) return current;
      const sameSubgroup = control.subgroupId === subgroupId;
      const sourceSubgroup = current.subgroups.find((item) => item.id === control.subgroupId);
      const sourceIndex = sourceSubgroup?.controlIds.indexOf(controlId) ?? -1;
      // computeHover 给的是原 controlIds 的插入位；同组右移移除原控件后要左移一位。
      const nextIndex = sameSubgroup && sourceIndex >= 0 && sourceIndex < index ? index - 1 : index;
      return {
        ...current,
        controls: sameSubgroup
          ? current.controls
          : current.controls.map((item) =>
              item.id === controlId ? { ...item, subgroupId } : item,
            ),
        subgroups: current.subgroups.map((subgroup) => {
          if (sameSubgroup && subgroup.id === subgroupId) {
            const ids = subgroup.controlIds.filter((id) => id !== controlId);
            ids.splice(Math.min(Math.max(0, nextIndex), ids.length), 0, controlId);
            return { ...subgroup, controlIds: ids };
          }
          if (subgroup.id === control.subgroupId) {
            return {
              ...subgroup,
              controlIds: subgroup.controlIds.filter((id) => id !== controlId),
            };
          }
          if (subgroup.id === subgroupId) {
            const ids = [...subgroup.controlIds];
            ids.splice(Math.min(index, ids.length), 0, controlId);
            return { ...subgroup, controlIds: ids };
          }
          return subgroup;
        }),
      };
    });
  };

  // 拖拽的单指针替代路径：选中尺寸徽章后，把当前类型插入选中控件之后；
  // 没有选中控件时插入第一个分组末尾。空画布给出明确下一步。
  const insertSelectedLibraryControl = () => {
    const definition = CONTROL_LIBRARY.find((item) => item.type === libSelectedType);
    if (!definition) return;
    const size =
      libSize[definition.type] ??
      (definition.supportedSizes.includes('large')
        ? 'large'
        : definition.supportedSizes[definition.supportedSizes.length - 1]);
    const selected = selectedControlId
      ? document.controls.find((control) => control.id === selectedControlId)
      : null;
    const targetGroup =
      activeGroups.find((group) => group.subgroupIds.includes(selected?.subgroupId ?? '')) ??
      activeGroups[0];
    const subgroup = targetGroup
      ? document.subgroups.find((item) => item.id === targetGroup.subgroupIds[0])
      : null;
    if (!subgroup) {
      showToast('请先新增分组，再插入控件');
      return;
    }
    const controls = getSubgroupControls(document, subgroup.id);
    const index =
      selected && selected.subgroupId === subgroup.id
        ? controls.findIndex((control) => control.id === selected.id) + 1
        : controls.length;
    addControlAtIndex(
      subgroup,
      definition,
      size,
      index,
      libIconOnly[definition.type] ? true : undefined,
    );
    showToast(`已插入${definition.label}`);
  };

  // ===== 导入/打开/示例布局的统一落点:一律开新项目并激活,不动当前编辑中的项目 =====
  const addProjectFromDocument = (next: RibbonDocument, message: string, filePath?: string) => {
    addProject(next, { filePath: filePath ?? null });
    if (filePath) rememberRecentFile(filePath);
    showToast(message);
  };

  // ===== 文件菜单:新建/打开/保存/另存为/最近文件(均作用于项目条目) =====
  const rememberRecentFile = (path: string) => {
    const name = path.split(/[\\/]/).pop() ?? path;
    setRecentFiles((current) =>
      [{ path, name }, ...current.filter((item) => item.path !== path)].slice(0, 8),
    );
  };

  const documentHasContent = () =>
    documentRef.current.controls.length > 0 || documentRef.current.tabs.length > 1;

  const loadDocumentFromPath = async (path: string) => {
    if (!path) return;
    // 该文件已在侧栏打开:直接聚焦既有条目,不开重复份
    const existing = projectsRef.current.find((project) => project.filePath === path);
    if (existing) {
      activateProject(existing.id);
      showToast(`已在侧栏打开 ${splitPath(path).name}`);
      return;
    }
    const text = await invoke<string>('read_text_file', { path }).catch((error) => {
      showToast(`读取失败:${String(error)}`);
      return '';
    });
    if (!text) return;
    const parsed = parseImportedDocument(text);
    if (!parsed) {
      showToast('打开失败:JSON 结构不符合当前 schema');
      return;
    }
    addProjectFromDocument(parsed, `已打开 ${parsed.tabs.length} 个页签的布局`, path);
  };

  const openDocDialog = async () => {
    if (!appWindow) {
      showToast('请在桌面应用中使用文件选择');
      return;
    }
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: '布局 JSON', extensions: ['json'] }],
    }).catch(() => null);
    if (typeof picked === 'string' && picked) {
      await loadDocumentFromPath(picked);
    }
  };

  // 返回是否成功;projectId 缺省 = 当前激活项目(关闭项目前的「保存并关闭」要显式传 id,
  // 防止异步过程中用户切走项目导致存错对象)
  const saveDocAs = async (projectId?: string): Promise<boolean> => {
    if (!appWindow) {
      showToast('请在桌面应用中保存文件');
      return false;
    }
    const id = projectId ?? activeProjectIdRef.current;
    const entry = projectsRef.current.find((project) => project.id === id);
    if (!entry) return false;
    const fallbackDir =
      localStorage.getItem(LAST_DOC_DIR_STORAGE_KEY) ||
      (await invoke<string>('get_default_target_dir').catch(() => ''));
    const picked = await saveDialog({
      filters: [{ name: '布局 JSON', extensions: ['json'] }],
      defaultPath: fallbackDir
        ? `${fallbackDir}\\${entry.document.metadata.name || '布局'}.json`
        : `${entry.document.metadata.name || '布局'}.json`,
    }).catch(() => null);
    if (typeof picked !== 'string' || !picked) return false;
    const { dir, name } = splitPath(picked);
    const saved = await invoke<string>('write_text_file', {
      dir,
      filename: name,
      content: JSON.stringify(entry.document, null, 2),
    }).catch((error) => {
      showToast(`保存失败:${String(error)}`);
      return '';
    });
    if (!saved) return false;
    localStorage.setItem(LAST_DOC_DIR_STORAGE_KEY, dir);
    // 保存只更新文件绑定与脏标记，**不动 document**：
    // 项目名（metadata.name）是用户资产，也是导出包的插件名，
    // 不能被文件系统命名绑架（拆雷甲）。
    updateProject(id, {
      filePath: saved,
      dirty: false,
    });
    rememberRecentFile(saved);
    showToast(`已保存到 ${name}`);
    return true;
  };

  const saveDoc = async (projectId?: string): Promise<boolean> => {
    const id = projectId ?? activeProjectIdRef.current;
    const entry = projectsRef.current.find((project) => project.id === id);
    if (!entry) return false;
    if (!entry.filePath) {
      return saveDocAs(id);
    }
    const { dir, name } = splitPath(entry.filePath);
    const saved = await invoke<string>('write_text_file', {
      dir,
      filename: name,
      content: JSON.stringify(entry.document, null, 2),
    }).catch((error) => {
      showToast(`保存失败:${String(error)}`);
      return '';
    });
    if (!saved) return false;
    updateProject(id, { dirty: false });
    rememberRecentFile(saved);
    showToast(`已保存到 ${name}`);
    return true;
  };

  const openDemoLayout = () => {
    addProjectFromDocument(createDemoDocument(), '已载入示例布局,可自由修改');
  };

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, '1');
    setShowWelcome(false);
  };

  // 多开模型下新建 = 追加空白项目,对当前编辑无破坏性,不再需要确认
  const requestNewDocument = () => {
    addProject();
  };

  // 清空当前项目画布:保留文件绑定、项目名与未命名编号,内容重置(可撤销)
  const resetDocument = () => {
    pushHistory(documentRef.current);
    updateActiveDocument(withActiveProjectName(createEmptyDocument()));
    setSelectedControlId(null);
    setConfirmAction(null);
    showToast('已重置为空白 Ribbon(可撤销)');
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
        addProjectFromDocument(parsed, `已导入 JSON:${parsed.tabs.length} 个页签`, path);
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
      addProjectFromDocument(
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

  const importFilters: Record<
    'esriAddInX' | 'daml' | 'json',
    { name: string; extensions: string[] }
  > = {
    esriAddInX: { name: 'ArcGIS Pro Add-in 安装包', extensions: ['esriAddInX'] },
    daml: { name: 'DAML 布局文件', extensions: ['daml'] },
    json: { name: '布局 JSON', extensions: ['json'] },
  };

  const pickImportFile = async (format: keyof typeof importFilters) => {
    if (!appWindow) {
      showToast('请在桌面应用中使用文件选择');
      return;
    }
    const picked = await openFileDialog({
      multiple: false,
      filters: [importFilters[format]],
    }).catch(() => null);
    if (typeof picked === 'string' && picked) void importFromPath(picked);
  };

  const splitPath = (path: string) => {
    const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
    return idx === -1
      ? { dir: '', name: path }
      : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
  };

  // save 对话框选导出位置;defaultPath 优先上次导出目录,无记忆时回退 Rust 下发的默认目录
  const saveExportPath = async (format: string, filterName: string, defaultName: string) => {
    if (!appWindow) {
      showToast('请在桌面应用中使用导出');
      return null;
    }
    let defaultDir = lastExportDir;
    if (!defaultDir) {
      defaultDir = await invoke<string>('get_default_target_dir').catch(() => '');
    }
    const defaultPath = defaultDir
      ? `${defaultDir.replace(/[\\/]+$/, '')}\\${defaultName}`
      : defaultName;
    const picked = await saveDialog({
      filters: [{ name: filterName, extensions: [format] }],
      defaultPath,
    }).catch(() => null);
    return typeof picked === 'string' && picked ? picked : null;
  };

  const exportTextFile = async (
    format: string,
    filterName: string,
    defaultName: string,
    content: string,
    label: string,
  ) => {
    const path = await saveExportPath(format, filterName, defaultName);
    if (!path) return;
    const { dir, name } = splitPath(path);
    setBusy(`正在导出 ${label}`);
    try {
      const written = await invoke<string>('write_text_file', { dir, filename: name, content });
      setLastExportDir(dir);
      showToast(`${label} 已写入 ${written}`);
    } catch (error) {
      showToast(`${label} 导出失败：${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  // 导出文件名用的安全主名:Windows 文件名非法字符换成下划线,空名兜底
  const fileStem = (name: string) => name.trim().replace(/[\\/:*?"<>|]+/g, '_') || '未命名布局';
  const projectName = document.metadata.name || '未命名布局';

  const exportDaml = () =>
    exportTextFile(
      'daml',
      'DAML 布局文件',
      `${fileStem(projectName)}.daml`,
      buildConfigDaml(document),
      'Config.daml',
    );

  const exportJson = () =>
    exportTextFile(
      'json',
      '布局 JSON',
      `${fileStem(projectName)}.json`,
      JSON.stringify(document, null, 2),
      '布局 JSON',
    );

  const exportPackage = async () => {
    // 免编译导出:DAML 指向预编译占位 DLL,用户机器无需 .NET SDK
    const artifacts: ArcGISProValidationArtifacts =
      buildArcGISProValidationArtifacts(document, { placeholderBehaviors: true });
    // 默认文件名带项目名,多项目时从文件就能看出导的是哪份设计稿
    const path = await saveExportPath(
      'esriAddInX',
      'ArcGIS Pro Add-in 安装包',
      `${fileStem(projectName)}-${artifacts.options.version}.esriAddInX`,
    );
    if (!path) return;
    const { dir, name } = splitPath(path);
    setBusy(`正在导出「${projectName}」安装包`);
    try {
      const written = await invoke<string>('export_addin', {
        payload: {
          layout_snapshot: artifacts.layoutSnapshot,
          package_file_name: name,
          target_dir: dir,
          version: computeLayoutVersion(document),
          icon_files: artifacts.iconFiles,
          daml: artifacts.configDaml,
        },
      });
      setLastExportDir(dir);
      showToast(`「${projectName}」安装包已生成 ${written}（控件行为为占位实现）`);
    } catch (error) {
      showToast(`打包失败：${String(error)}`);
    } finally {
      setBusy('');
    }
  };

  // 子项树内不可变更新/删除;mapChildTree 遍历任意嵌套深度
  const mapChildTree = (
    children: ControlChild[],
    fn: (child: ControlChild) => ControlChild,
  ): ControlChild[] =>
    children.map((child) => {
      const next = fn(child);
      return next.children?.length ? { ...next, children: mapChildTree(next.children, fn) } : next;
    });

  const findChild = (children: ControlChild[] | undefined, childId: string): ControlChild | undefined =>
    children?.find((child) => child.id === childId) ??
    children?.reduce<ControlChild | undefined>(
      (found, child) => found ?? findChild(child.children, childId),
      undefined,
    );

  const applyIconSelection = (selection: IconSelection) => {
    if (!iconPickerFor) return;
    const icon = { small: selection.small, large: selection.large };
    if (iconPickerFor.childId) {
      const target = iconPickerFor.controlId;
      const childId = iconPickerFor.childId;
      updateControl(target, {
        children: mapChildTree(
          document.controls.find((control) => control.id === target)?.children ?? [],
          (child) => (child.id === childId ? { ...child, icon } : child),
        ),
      });
    } else {
      updateControl(iconPickerFor.controlId, { icon });
    }
    showToast(`已绑定图标 ${selection.small.replace(/^(dark|imp_)?(images_)?/, '')}`);
    setIconPickerFor(null);
  };

  const updateChild = (controlId: string, childId: string, patch: Partial<ControlChild>) => {
    updateControl(controlId, {
      children: mapChildTree(
        document.controls.find((control) => control.id === controlId)?.children ?? [],
        (child) => (child.id === childId ? { ...child, ...patch } : child),
      ),
    });
  };

  const addChild = (controlId: string) => {
    const control = document.controls.find((item) => item.id === controlId);
    if (!control) return;
    const child: ControlChild = {
      id: createId('child'),
      type: 'button',
      caption: `新子项 ${(control.children?.length ?? 0) + 1}`,
      tooltip: '',
      icon: { small: '', large: '' },
      behavior: { commandType: 'button', className: '', target: '', arguments: {} },
      children: [],
    };
    updateControl(controlId, { children: [...(control.children ?? []), child] });
  };

  const removeChild = (controlId: string, childId: string) => {
    const strip = (children: ControlChild[]): ControlChild[] =>
      children
        .filter((child) => child.id !== childId)
        .map((child) => (child.children?.length ? { ...child, children: strip(child.children) } : child));
    updateControl(controlId, {
      children: strip(document.controls.find((control) => control.id === controlId)?.children ?? []),
    });
  };

  const startDrag = useCallback(
    (event: React.PointerEvent, state: ActiveDragState) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      let started = false;
      let nextX = startX;
      let nextY = startY;

      // pointerdown 不直接进入拖拽：5px 内仍是 click。一旦真的拖动，
      // 用捕获阶段 click 拦掉松手时的“选中/切换尺寸”副作用。
      const onClickCapture = (clickEvent: MouseEvent) => {
        if (!started) return;
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      };
      window.addEventListener('click', onClickCapture, true);

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('click', onClickCapture, true);
      };
      const begin = () => {
        started = true;
        dragRef.current = state;
        positionGhost(nextX, nextY);
        setDrag(state);
      };
      const onMove = (moveEvent: PointerEvent) => {
        nextX = moveEvent.clientX;
        nextY = moveEvent.clientY;
        if (!started) {
          const distance = Math.hypot(nextX - startX, nextY - startY);
          if (distance < DRAG_START_DISTANCE) return;
          begin();
        }
        positionGhost(nextX, nextY);
      };
      const onUp = () => cleanup();
      const onCancel = () => {
        if (started) {
          dragRef.current = null;
          hoverRef.current = null;
          setDrag(null);
          setHover(null);
        }
        cleanup();
      };
      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== 'Escape') return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        onCancel();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKeyDown);
    },
    [positionGhost],
  );

  useEffect(() => {
    if (!drag) return;
    const computeHover = (clientX: number, clientY: number): HoverTarget | null => {
      const current = dragRef.current;
      if (!current) return null;
      const doc = documentRef.current;
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
        // 流式命中：按 Pro 同规则派生每个控件的显示矩形，鼠标落在哪个控件上，
        // 拖拽即插入到它之前/之后（左右半区分），空白处追加到末尾。
        const controls = getSubgroupControls(doc, subgroup.id);
        const layout = flowLayout(
          controls.map((c) => ({
            id: c.id,
            type: c.type,
            size: c.size,
            caption: c.caption,
            variant: c.variant,
            iconOnly: c.iconOnly,
          })),
        );
        const hit = layout.find(
          (r) =>
            clientX >= rect.left + r.x * RIBBON_CELL &&
            clientX < rect.left + (r.x + r.w) * RIBBON_CELL &&
            clientY >= rect.top + r.y * RIBBON_CELL &&
            clientY < rect.top + (r.y + r.h) * RIBBON_CELL,
        );
        let index: number;
        let lineX: number;
        if (hit) {
          const idx = controls.findIndex((c) => c.id === hit.i);
          const mid = rect.left + (hit.x + hit.w / 2) * RIBBON_CELL;
          if (current.kind === 'move' && controls[idx]?.id === current.controlId) {
            // 悬停在自身上：插入线停在原位
            index = idx;
            lineX = hit.x;
          } else {
            const before = clientX < mid;
            index = before ? idx : idx + 1;
            lineX = before ? hit.x : hit.x + hit.w;
          }
        } else {
          index = controls.length;
          lineX = layout.reduce((max, r) => Math.max(max, r.x + r.w), 0);
        }
        return { subgroupId, index, lineX };
      }
      return null;
    };

    const updateHover = (clientX: number, clientY: number) => {
      const next = computeHover(clientX, clientY);
      hoverRef.current = next;
      setHover((previous) =>
        previous?.subgroupId === next?.subgroupId &&
        previous?.index === next?.index &&
        previous?.lineX === next?.lineX
          ? previous
          : next,
      );
    };
    const stopAutoscroll = startAreaAutoscroll(() => nextX, () => updateHover(nextX, nextY));
    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      nextX = event.clientX;
      nextY = event.clientY;
      positionGhost(nextX, nextY);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateHover(nextX, nextY);
      });
    };

    const onUp = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        updateHover(nextX, nextY);
      }
      const current = dragRef.current;
      const target = hoverRef.current;
      if (current && target) {
        const doc = documentRef.current;
        const subgroup = doc.subgroups.find((item) => item.id === target.subgroupId);
        if (subgroup) {
          if (current.kind === 'new') {
            addControlAtIndex(subgroup, current.definition, current.size, target.index, current.iconOnly);
          } else {
            moveControlTo(current.controlId, target.subgroupId, target.index);
          }
        }
      }
      dragRef.current = null;
      hoverRef.current = null;
      setDrag(null);
      setHover(null);
      stopAutoscroll();
    };

    const onCancel = () => {
      if (frame) cancelAnimationFrame(frame);
      dragRef.current = null;
      hoverRef.current = null;
      setDrag(null);
      setHover(null);
      stopAutoscroll();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    positionGhost(ghostPositionRef.current.x, ghostPositionRef.current.y);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stopAutoscroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, positionGhost, startAreaAutoscroll]);

  useEffect(() => {
    if (!contextMenu && !dropdown) return;
    const close = () => {
      setContextMenu(null);
      setDropdown(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu, dropdown]);

  // ===== 全局快捷键(输入控件聚焦时不拦截) =====
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      } else if (ctrl && key === 's') {
        event.preventDefault();
        void saveDoc();
      } else if (ctrl && key === 'o') {
        event.preventDefault();
        void openDocDialog();
      } else if (ctrl && key === 'n') {
        event.preventDefault();
        requestNewDocument();
      } else if (event.key === 'Delete') {
        if (selectedControlId) deleteControl(selectedControlId);
      } else if (event.key === 'Escape') {
        if (dragRef.current) {
          dragRef.current = null;
          hoverRef.current = null;
          setDrag(null);
          setHover(null);
        } else if (groupDragIdRef.current) {
          setGroupDrop(null);
          setGroupDragId(null);
          groupDragIdRef.current = null;
        } else if (dropdown) setDropdown(null);
        else if (contextMenu) setContextMenu(null);
        else if (iconPickerFor) setIconPickerFor(null);
        else if (confirmAction) setConfirmAction(null);
        else if (pendingCloseProjectId) setPendingCloseProjectId(null);
        else if (showAbout) setShowAbout(false);
        else if (showWelcome) setShowWelcome(false);
        else if (selectedControlId) setSelectedControlId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 启动静默检查更新(可在设置关闭;仅提示不自动安装)
  useEffect(() => {
    if (!appWindow || !autoUpdate) return;
    let cancelled = false;
    void import('@tauri-apps/plugin-updater')
      .then(({ check }) => check())
      .then((update) => {
        if (!cancelled && update) setUpdateBanner({ version: update.version });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`next-shell${drag ? ' dragging' : ''}${drag && !hover ? ' drag-outside' : ''}`}>
      <a className="skip-link" href="#main-canvas">
        跳到画布
      </a>
      <header
        className="next-titlebar"
        data-tauri-drag-region
        onDoubleClick={() => void appWindow?.toggleMaximize()}
      >
        <h1 className="visually-hidden">极思G Ribbon 设计器 · Demo</h1>
        <div className="titlebar-side titlebar-side-left" data-tauri-drag-region>
          <div className="window-handle" data-tauri-drag-region>
            <img className="window-app-icon" src="/app-icon.png" alt="" draggable={false} />
          </div>
          <div className="titlebar-actions">
            <button
              className="titlebar-icon-btn"
              title="文件"
              aria-label="文件"
              aria-haspopup="menu"
              aria-expanded={dropdown?.kind === 'file'}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setDropdown({ kind: 'file', x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <FileText size={18} />
            </button>
            <button
              className="titlebar-icon-btn"
              title="设置"
              aria-label="设置"
              aria-haspopup="menu"
              aria-expanded={dropdown?.kind === 'settings'}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setDropdown({ kind: 'settings', x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <Settings size={18} />
            </button>
            <button
              className="titlebar-icon-btn"
              title="关于与检查更新"
              onClick={(event) => {
                event.stopPropagation();
                setShowAbout(true);
              }}
            >
              <Info size={18} />
            </button>
          </div>
        </div>
        <div className="window-title" data-tauri-drag-region>
          {activeProjectTitle}
          {fileDirty ? <span className="dirty-dot" title="有未保存到文件的修改" /> : null}
        </div>
        <div className="titlebar-side titlebar-side-right">
          <div className="window-buttons" onDoubleClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label="最小化"
              title="最小化"
              onClick={() => void appWindow?.minimize()}
            />
            <button
              type="button"
              aria-label="最大化/还原"
              title="最大化/还原"
              onClick={() => void appWindow?.toggleMaximize()}
            />
            <button
              type="button"
              aria-label="关闭"
              title="关闭"
              onClick={() => void appWindow?.close()}
            />
          </div>
        </div>
      </header>

      {updateBanner ? (
        <div className="update-banner">
          <span>发现新版本 v{updateBanner.version}</span>
          <button
            className="primary"
            onClick={() => {
              setUpdateBanner(null);
              setShowAbout(true);
            }}
          >
            立即查看
          </button>
          <button className="ghost" onClick={() => setUpdateBanner(null)}>
            稍后再说
          </button>
        </div>
      ) : null}

      <div className="next-workbench">
        <aside
          className="next-tab-sidebar"
          ref={projSidebarRef}
          aria-label="项目与页签列表"
          style={{ width: projWidth ?? undefined }}
        >
          <div className="next-tab-sidebar-head">
            <strong>项目</strong>
            <button onClick={() => addProject()} title="新增项目">
              <Plus size={13} />
            </button>
          </div>
          {projects.map((project) => (
            <div className="next-project-block" key={project.id}>
              <div
                className={`next-project-item${project.id === activeProject.id ? ' active' : ''}`}
                aria-current={project.id === activeProject.id ? 'true' : undefined}
                onClick={() => activateProject(project.id)}
                title={projectTitle(project)}
              >
                <button
                  className="next-project-chevron"
                  aria-label={project.collapsed ? `展开 ${projectTitle(project)} 的页签` : `折叠 ${projectTitle(project)} 的页签`}
                  aria-expanded={!project.collapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateProject(project.id, { collapsed: !project.collapsed });
                  }}
                >
                  {project.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                {renamingProjectId === project.id ? (
                  <input
                    className="next-project-name-input"
                    aria-label="项目名称"
                    autoFocus
                    defaultValue={projectTitle(project)}
                    onBlur={(event) => commitProjectName(project.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitProjectName(project.id, event.currentTarget.value);
                      }
                      if (event.key === 'Escape') setRenamingProjectId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="next-project-name"
                    title={`${projectTitle(project)}（点击切换项目，F2 或双击改名）`}
                    aria-label={`${projectTitle(project)}，切换项目；按 F2 重命名`}
                    onClick={(event) => {
                      event.stopPropagation();
                      activateProject(project.id);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setRenamingProjectId(project.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'F2') {
                        event.preventDefault();
                        event.stopPropagation();
                        setRenamingProjectId(project.id);
                      }
                    }}
                  >
                    {projectTitle(project)}
                  </button>
                )}
                {project.dirty ? <span className="dirty-dot" title="有未保存到文件的修改" /> : null}
                <button
                  className="next-tab-delete"
                  title="关闭项目"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeProject(project.id);
                  }}
                >
                  <X size={11} />
                </button>
              </div>
              {!project.collapsed ? (
                <>
                  {project.document.tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`next-tab-item${
                        project.id === activeProject.id && tab.id === activeTab?.id ? ' active' : ''
                      }`}
                      aria-current={
                        project.id === activeProject.id && tab.id === activeTab?.id
                          ? 'true'
                          : undefined
                      }
                      onClick={() => activateProject(project.id, tab.id)}
                    >
                      {project.id === activeProject.id && tab.id === activeTab?.id ? (
                        <input
                          className="next-tab-name"
                          aria-label="页签名称"
                          value={tab.caption}
                          onChange={(event) => updateTab(tab.id, { caption: event.target.value })}
                          spellCheck={false}
                        />
                      ) : (
                        <button
                          type="button"
                          className="next-tab-name"
                          aria-label={`${tab.caption}，切换到该页签`}
                          onClick={(event) => {
                            event.stopPropagation();
                            activateProject(project.id, tab.id);
                          }}
                        >
                          {tab.caption}
                        </button>
                      )}
                      {project.document.tabs.length > 1 ? (
                        <button
                          className="next-tab-delete"
                          title="删除页签"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (project.id === activeProject.id) {
                              deleteTab(tab.id);
                            } else {
                              showToast('请先切换到该项目再删除页签');
                            }
                          }}
                        >
                          <X size={11} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button className="next-tab-add" onClick={() => addTabTo(project.id)}>
                    <Plus size={11} />
                    新增页签
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </aside>

        <section className="next-vsplit-dock" aria-label="项目栏宽度调节">
          <div
            className="next-vsplit"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整项目栏宽度"
            aria-valuemin={PROJ_WIDTH_MIN}
            aria-valuemax={PROJ_WIDTH_MAX}
            aria-valuenow={projWidth ?? PROJ_WIDTH_DEFAULT}
            tabIndex={0}
            onPointerDown={startSidebarResize('proj')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                nudgeSidebarWidth('proj', -16);
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                nudgeSidebarWidth('proj', 16);
              }
            }}
          />
        </section>

        <div className="next-center">
          <section className="next-toolbar" aria-label="工具栏">
            <div className="next-toolbar-left">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="撤销 (Ctrl+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="重做 (Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
              <button onClick={addGroup}>
                <Plus size={14} />
                新增分组
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (documentHasContent()) setConfirmAction('clear');
                  else resetDocument();
                }}
              >
                <Trash2 size={14} />
                清空
              </button>
            </div>
            <div className="next-toolbar-right">
              <span className="draft-status" role="status">
                {busy || '本地草稿自动保存'}
              </span>
              <button
                title="新建布局 (Ctrl+N)"
                onClick={() => requestNewDocument()}
              >
                <FilePlus size={14} />
                新建
              </button>
              <button
                title={currentFile ? `保存 ${splitPath(currentFile).name} (Ctrl+S)` : '另存为… (Ctrl+S)'}
                onClick={() => void saveDoc()}
              >
                <Save size={14} />
                {currentFile && !fileDirty ? '已保存' : '保存'}
              </button>
              <button
                aria-haspopup="menu"
                aria-expanded={dropdown?.kind === 'import'}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDropdown({ kind: 'import', x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <FolderOpen size={14} />
                导入
                <ChevronDown size={12} />
              </button>
              <button
                className="primary"
                aria-haspopup="menu"
                aria-expanded={dropdown?.kind === 'export'}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDropdown({ kind: 'export', x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <Package size={14} />
                导出
                <ChevronDown size={12} />
              </button>
            </div>
          </section>

          <main className="next-canvas-row" id="main-canvas" tabIndex={-1}>
            <section className="next-canvas">
              {/* Pro 的 ribbon 顶部有一条页签条，这是它最显眼的特征。
                  点击与侧栏 .next-tab-item 走同一个入口 activateProject，双向联动。
                  这里是完整的 ARIA tabs pattern（tablist + tab + tabpanel + roving tabindex
                  + 方向键）：只挂 role="tablist"/"tab" 而不给键盘行为，是在用语义承诺一个
                  没实现的交互，属 4.1.2 的语义夸大。 */}
              {/* 板块角标签放 tablist 外面：tablist 的子元素必须是 tab，
                  legend 混进去既坏语义又坏 roving tabindex 的方向键循环。 */}
              <div className="next-canvas-tabsbar">
                <span className="next-panel-legend" aria-hidden>
                  画布
                </span>
                <div className="next-canvas-tabs" role="tablist" aria-label="Ribbon 页签">
                {document.tabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={canvasTabDomId(tab.id)}
                    // roving tabindex：整条页签条只占一个 tab stop，方向键在其中移动
                    className={`next-canvas-tab${tab.id === activeTabId ? ' active' : ''}`}
                    aria-selected={tab.id === activeTabId}
                    aria-controls={CANVAS_TABPANEL_ID}
                    tabIndex={tab.id === activeTabId ? 0 : -1}
                    onClick={() => activateProject(activeProject.id, tab.id)}
                    onKeyDown={(event) => handleCanvasTabKeyDown(event, index)}
                    title={tab.caption}
                  >
                    <span className="next-canvas-tab-caption">{tab.caption}</span>
                    <span className="next-canvas-tab-keytip">{tab.keytip}</span>
                  </button>
                ))}
                </div>
              </div>
              <div
                className="next-ribbon-area"
                id={CANVAS_TABPANEL_ID}
                ref={ribbonAreaRef}
                role="tabpanel"
                aria-labelledby={canvasTabDomId(activeTabId)}
              >
                {groupDrop ? (
                  <div
                    className="next-group-drop-line"
                    style={{ left: groupDrop.x }}
                    aria-hidden
                  />
                ) : null}
                {activeGroups.length ? (
                  activeGroups.map((group, index) => (
                    <RibbonGroupView
                      key={group.id}
                      document={document}
                      group={group}
                      drag={drag}
                      hover={hover}
                      dragging={groupDragId === group.id}
                      canDelete={index > 0}
                      selectedControlId={selectedControlId}
                      registerGrid={(subgroupId, element) => {
                        if (element) gridRefs.current.set(subgroupId, element);
                        else gridRefs.current.delete(subgroupId);
                      }}
                      onUpdateGroup={updateGroup}
                      onDuplicateGroup={duplicateGroup}
                      onAdjustGroupColumns={adjustGroupColumns}
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
                          variant: control.variant,
                        })
                      }
                      onStartGroupDrag={startGroupDrag}
                      onMoveGroup={moveGroupBy}
                    />
                  ))
                ) : (
                  <div className="next-empty-canvas">
                    当前页签是空白。先新增分组，再从底部拖入控件。
                  </div>
                )}
              </div>
            </section>
          </main>

          {/* 画布与控件库之间的可拖拽分隔条。画布不再无条件吃掉剩余空间，
              用户可以把空间分给控件库——P5 的卡片 mock 需要更多高度。
              分隔条自己是 role=separator，成不了 landmark，而 axe 的 region 规则要求
              节点落在 landmark 内（同层的 <main> 与控件库 <section> 各自已是 landmark），
              故外面套一层具名 section 兜住它。
              可聚焦的 separator 属 window splitter，按 ARIA APG 须带三值。
              aria-valuenow 报「用户偏好」而不是实际渲染高度：偏好是这份高度的单一真相，
              渲染高度只是它被窗口钳制后的投影（窗口不够高时 CSS 的 flex 会把画布地板
              之外放不下的部分吃回去，但不改写偏好本身，见 applyPaletteResize 的注释），
              而三值的值域本就是偏好的取值域，报偏好才与 min/max 自洽。 */}
          <section className="next-splitter-dock" aria-label="控件库高度调节">
            <div
              className="next-splitter"
              role="separator"
              aria-orientation="horizontal"
              aria-label="调整控件库高度"
              aria-valuemin={PALETTE_HEIGHT_MIN}
              aria-valuemax={PALETTE_HEIGHT_MAX}
              aria-valuenow={Math.round(paletteHeight ?? PALETTE_HEIGHT_MIN)}
              tabIndex={0}
              onPointerDown={startPaletteResize}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  nudgePaletteHeight(16);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  nudgePaletteHeight(-16);
                }
              }}
            />
          </section>

          {/* D 形态控件库：左栏按交互特性分组的类型列表，右栏选中类型的全尺寸大详情。
              点徽章选中「点入/拖出」的默认尺寸；按住徽章直接拖出该尺寸控件。
              占格信息同时在图示（chip）、数字与 button 可访问名三处。 */}
          <section
            className="next-bottom-palette"
            ref={paletteRef}
            aria-label="控件库"
            style={{ height: paletteHeight, maxHeight: 'none' }}
          >
            {/* palette 本体是滚动容器，legend 必须走普通文档流（floating 变体在滚动容器里会被裁剪） */}
            <span className="next-panel-legend" aria-hidden>
              控件库
            </span>
            <div className="palette-split">
              <nav className="palette-list" aria-label="控件类型列表">
                {LIBRARY_CATEGORIES.map(({ id, label }) => {
                  const items = CONTROL_LIBRARY.filter(
                    (entry) => LIBRARY_CATEGORY[entry.type] === id,
                  );
                  return (
                    <div key={id}>
                      <div className="palette-cat-head">
                        {label} · {items.length}
                      </div>
                      {items.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          className={`palette-list-item${libSelectedType === item.type ? ' active' : ''}`}
                          aria-pressed={libSelectedType === item.type}
                          onClick={() => setLibSelectedType(item.type)}
                        >
                          <LibraryIconThumb type={item.type} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </nav>
              {(() => {
                const item =
                  CONTROL_LIBRARY.find((entry) => entry.type === libSelectedType) ??
                  CONTROL_LIBRARY[0];
                const activeSize =
                  libSize[item.type] ??
                  (item.supportedSizes.includes('large')
                    ? 'large'
                    : item.supportedSizes[item.supportedSizes.length - 1]);
                return (
                  <div className="palette-detail" key={item.type}>
                    <div className="palette-detail-head">
                      <span className="palette-detail-thumb">
                        <LibraryIconThumb type={item.type} />
                      </span>
                      <div>
                        <div className="palette-detail-name">{item.label}</div>
                        <div className="palette-detail-desc">{item.shortDescription}</div>
                      </div>
                    </div>
                    <div className="palette-detail-sizes">
                      {item.supportedSizes.map((candidate) => {
                        const footprint = getFootprint(item.type, candidate);
                        return (
                          <div key={candidate} className="palette-size-cell" data-size={candidate}>
                            <div className="library-mock-stage palette-detail-stage" aria-hidden>
                              <ControlMock
                                type={item.type}
                                caption={item.label}
                                size={candidate}
                                mode="library"
                              />
                              <span className="palette-stage-px">
                                {footprint.w * RIBBON_CELL}×{footprint.h * RIBBON_CELL}px
                              </span>
                            </div>
                            <button
                              type="button"
                              className={
                                candidate === activeSize && !libIconOnly[item.type] ? 'active' : ''
                              }
                              title={`${item.label} · ${SIZE_LABELS[candidate]} · ${footprintLabel(item.type, candidate)}`}
                              aria-label={`${item.label} ${SIZE_LABELS[candidate]} 尺寸，占 ${footprintLabel(item.type, candidate)} 格`}
                              aria-pressed={candidate === activeSize && !libIconOnly[item.type]}
                              onClick={() => {
                                setLibSize((current) => ({ ...current, [item.type]: candidate }));
                                setLibIconOnly((current) => ({ ...current, [item.type]: false }));
                              }}
                              onPointerDown={(event) =>
                                startDrag(event, {
                                  kind: 'new',
                                  definition: item,
                                  size: candidate,
                                })
                              }
                            >
                              <span>{SIZE_LABELS[candidate]}</span>
                              <span className="footprint-num">
                                {footprintLabel(item.type, candidate)}
                              </span>
                              <small>
                                <span
                                  className="footprint-chip"
                                  data-footprint={footprintLabel(item.type, candidate)}
                                  style={
                                    {
                                      '--fw': footprint.w,
                                      '--fh': footprint.h,
                                    } as CSSProperties
                                  }
                                  aria-hidden
                                />
                              </small>
                            </button>
                          </div>
                        );
                      })}
                      {/* 「图标」形态:small + iconOnly,1×1 纯图标;Pro 端是否去文字由其自适应 */}
                      {(() => {
                        const iconFootprint = getFootprint(item.type, 'small', undefined, true);
                        return (
                          <div className="palette-size-cell" data-size="icon">
                            <div className="library-mock-stage palette-detail-stage" aria-hidden>
                              <ControlMock
                                type={item.type}
                                caption={item.label}
                                size="small"
                                mode="library"
                                iconOnly
                              />
                              <span className="palette-stage-px">
                                {iconFootprint.w * RIBBON_CELL}×{iconFootprint.h * RIBBON_CELL}px
                              </span>
                            </div>
                            <button
                              type="button"
                              className={libIconOnly[item.type] ? 'active' : ''}
                              title={`${item.label} · 图标 · 1x1`}
                              aria-label={`${item.label} 图标形态，占 1x1 格（导出为 small 尺寸，Pro 端是否省略文字由其自行决定）`}
                              aria-pressed={Boolean(libIconOnly[item.type])}
                              onClick={() => {
                                setLibSize((current) => ({ ...current, [item.type]: 'small' }));
                                setLibIconOnly((current) => ({ ...current, [item.type]: true }));
                              }}
                              onPointerDown={(event) =>
                                startDrag(event, {
                                  kind: 'new',
                                  definition: item,
                                  size: 'small',
                                  iconOnly: true,
                                })
                              }
                            >
                              <span>图标</span>
                              <span className="footprint-num">
                                {footprintLabel(item.type, 'small', undefined, true)}
                              </span>
                              <small>
                                <span
                                  className="footprint-chip"
                                  data-footprint={footprintLabel(item.type, 'small', undefined, true)}
                                  style={
                                    {
                                      '--fw': iconFootprint.w,
                                      '--fh': iconFootprint.h,
                                    } as CSSProperties
                                  }
                                  aria-hidden
                                />
                              </small>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <p className="palette-detail-meta">
                      <span className="palette-daml">
                        size="<b>{activeSize}</b>"
                      </span>
                      <span>1 格 = 32px · 点徽章选中默认尺寸 · 按住拖入画布</span>
                      <button className="palette-insert" onClick={insertSelectedLibraryControl}>
                        <Plus size={13} />
                        插入到当前分组
                      </button>
                    </p>
                  </div>
                );
              })()}
            </div>
          </section>
        </div>

        <section className="next-vsplit-dock" aria-label="文档结构栏宽度调节">
          <div
            className="next-vsplit"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整文档结构栏宽度"
            aria-valuemin={STRUCT_WIDTH_MIN}
            aria-valuemax={STRUCT_WIDTH_MAX}
            aria-valuenow={structWidth ?? STRUCT_WIDTH_DEFAULT}
            tabIndex={0}
            onPointerDown={startSidebarResize('struct')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                nudgeSidebarWidth('struct', -16);
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                nudgeSidebarWidth('struct', 16);
              }
            }}
          />
        </section>

        <aside
          className="next-side"
          ref={structSidebarRef}
          aria-label="属性面板"
          style={{ width: structWidth ?? undefined }}
        >
          {selectedControl ? (
            <Inspector
              control={selectedControl}
              onUpdate={updateControl}
              onDelete={deleteControl}
              onOpenIcons={(childId) =>
                setIconPickerFor(
                  childId
                    ? { controlId: selectedControl.id, childId }
                    : { controlId: selectedControl.id },
                )
              }
              onUpdateChild={(childId, patch) => updateChild(selectedControl.id, childId, patch)}
              onAddChild={() => addChild(selectedControl.id)}
              onRemoveChild={(childId) => removeChild(selectedControl.id, childId)}
            />
          ) : (
            <DocumentOutline
              document={document}
              activeTabId={activeTabId}
              selectedControlId={selectedControlId}
              onSelectTab={(tabId) => activateProject(activeProject.id, tabId)}
              onSelectControl={revealControl}
            />
          )}
        </aside>
      </div>

      {drag ? (
        <div
          ref={ghostRef}
          className="drag-ghost"
        >
          {drag.kind === 'new' ? (
            <ControlMock
              type={drag.definition.type}
              caption={drag.definition.label}
              size={drag.size}
              mode="library"
              iconOnly={drag.iconOnly}
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
          onClose={() => setContextMenu(null)}
          onAction={(action) => {
            const menu = contextMenu;
            setContextMenu(null);
            if (!menu) return;
            if (action === 'delete-control' && menu.controlId) deleteControl(menu.controlId);
            if (action === 'icons' && menu.controlId)
              setIconPickerFor({ controlId: menu.controlId });
            if (action === 'duplicate-group' && menu.groupId) duplicateGroup(menu.groupId);
            if (action === 'delete-group' && menu.groupId) deleteGroup(menu.groupId);
          }}
        />
      ) : null}

      <IconPicker
        open={Boolean(iconPickerFor)}
        currentSmall={
          iconPickerFor
            ? (iconPickerFor.childId
                ? findChild(
                    document.controls.find((control) => control.id === iconPickerFor.controlId)?.children,
                    iconPickerFor.childId,
                  )?.icon.small
                : document.controls.find((control) => control.id === iconPickerFor.controlId)?.icon
                    .small) ?? undefined
            : undefined
        }
        onClose={() => setIconPickerFor(null)}
        onPick={applyIconSelection}
      />

      {dropdown ? (
        <MenuSurface
          label={
            dropdown.kind === 'file'
              ? '文件菜单'
              : dropdown.kind === 'settings'
                ? '设置菜单'
                : dropdown.kind === 'import'
                  ? '导入菜单'
                  : '导出菜单'
          }
          x={dropdown.x}
          y={dropdown.y}
          onClose={() => setDropdown(null)}
        >
          {dropdown.kind === 'file' ? (
            <>
              <div className="context-menu-title">文件</div>
              <button type="button" role="menuitem" onClick={() => void requestNewDocument()}>
                新建项目<span className="menu-hint">Ctrl+N</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void openDocDialog()}>
                打开…<span className="menu-hint">Ctrl+O</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void saveDoc().then(() => undefined)
                }
              >
                {currentFile ? `保存 ${splitPath(currentFile).name}` : '保存'}
                <span className="menu-hint">Ctrl+S</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void saveDocAs()}>另存为…</button>
              <div className="context-menu-sep" />
              <div className="context-menu-title">最近文件</div>
              {recentFiles.length ? (
                recentFiles.map((file) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={file.path}
                    title={file.path}
                    onClick={() => void loadDocumentFromPath(file.path)}
                  >
                    {file.name}
                  </button>
                ))
              ) : (
                <div className="menu-empty">暂无最近文件</div>
              )}
              <div className="context-menu-sep" />
              <button type="button" role="menuitem" onClick={() => openDemoLayout()}>打开示例布局</button>
              <button type="button" role="menuitem" onClick={() => setShowAbout(true)}>关于…</button>
            </>
          ) : dropdown.kind === 'settings' ? (
            <>
              <div className="context-menu-title">设置</div>
              <div className="settings-row">
                <span>界面主题</span>
                <div className="settings-seg">
                  <button
                    type="button"
                    role="menuitem"
                    className={theme === 'light' ? 'active' : ''}
                    onClick={() => setTheme('light')}
                  >
                    浅色
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={theme === 'dark' ? 'active' : ''}
                    onClick={() => setTheme('dark')}
                  >
                    暗色
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <span>启动时自动检查更新</span>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={autoUpdate}
                    onChange={(event) => setAutoUpdate(event.target.checked)}
                  />
                  <span />
                </label>
              </div>
              <div className="menu-empty">窗口大小与位置会自动记忆</div>
            </>
          ) : (
            <>
              <div className="context-menu-title">
                {dropdown.kind === 'import'
                  ? '导入'
                  : `导出当前项目：${projectName}`}
              </div>
              {dropdown.kind === 'import' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDropdown(null);
                      void pickImportFile('esriAddInX');
                    }}
                  >
                    导入 add-in 安装包(.esriAddInX)…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDropdown(null);
                      void pickImportFile('daml');
                    }}
                  >
                    导入 DAML(.daml)…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDropdown(null);
                      void pickImportFile('json');
                    }}
                  >
                    导入布局 JSON(.json)…
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDropdown(null);
                      void exportPackage();
                    }}
                  >
                    导出 add-in 安装包(.esriAddInX)
                  </button>
                  <button
                    onClick={() => {
                      setDropdown(null);
                      exportDaml();
                    }}
                  >
                    导出 Config.daml
                  </button>
                  <button
                    onClick={() => {
                      setDropdown(null);
                      exportJson();
                    }}
                  >
                    导出布局 JSON
                  </button>
                </>
              )}
            </>
          )}
        </MenuSurface>
      ) : null}

      {confirmAction === 'clear' ? (
        <Modal
          label="清空画布"
          cardClassName="confirm-card"
          onClose={() => setConfirmAction(null)}
        >
          <div className="next-modal-head">
            <strong>清空画布</strong>
          </div>
          <p className="confirm-body">
            将丢弃当前 {documentRef.current.tabs.length} 个页签、{documentRef.current.controls.length}{' '}
            个控件的布局。此操作可通过 Ctrl+Z 撤销。
          </p>
          <div className="confirm-actions">
            <button className="danger" onClick={() => resetDocument()}>
              确认清空
            </button>
            <button onClick={() => setConfirmAction(null)}>取消</button>
          </div>
        </Modal>
      ) : null}

      {pendingCloseProjectId ? (
        <Modal
          label="关闭项目"
          cardClassName="confirm-card"
          onClose={() => setPendingCloseProjectId(null)}
        >
          <div className="next-modal-head">
            <strong>关闭项目</strong>
          </div>
          <p className="confirm-body">
            {(() => {
              const target = projects.find(
                (project) => project.id === pendingCloseProjectId,
              );
              if (!target) return '';
              return `「${projectTitle(target)}」有未保存到文件的修改。保存后关闭,还是直接丢弃?`;
            })()}
          </p>
          <div className="confirm-actions">
            <button
              className="primary"
              onClick={() => {
                const id = pendingCloseProjectId;
                setPendingCloseProjectId(null);
                void saveDoc(id).then((ok) => {
                  if (ok) removeProject(id);
                });
              }}
            >
              保存并关闭
            </button>
            <button
              className="danger"
              onClick={() => {
                removeProject(pendingCloseProjectId);
                setPendingCloseProjectId(null);
              }}
            >
              丢弃并关闭
            </button>
            <button onClick={() => setPendingCloseProjectId(null)}>取消</button>
          </div>
        </Modal>
      ) : null}

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />

      {showWelcome ? (
        <Welcome
          onOpenDemo={() => {
            openDemoLayout();
            dismissWelcome();
          }}
          onStartBlank={dismissWelcome}
          onClose={dismissWelcome}
        />
      ) : null}

      {toast ? <div className="next-toast" role="status">{toast}</div> : null}
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
  dragging,
  selectedControlId,
  registerGrid,
  onUpdateGroup,
  onDuplicateGroup,
  onAdjustGroupColumns,
  onDeleteGroup,
  onContextMenuGroup,
  onSelectControl,
  onControlContextMenu,
  onDragControlStart,
  onStartGroupDrag,
  onMoveGroup,
}: {
  document: RibbonDocument;
  group: RibbonGroup;
  drag: DragState;
  hover: HoverTarget | null;
  canDelete: boolean;
  dragging: boolean;
  selectedControlId: string | null;
  registerGrid: (subgroupId: string, element: HTMLElement | null) => void;
  onUpdateGroup: (groupId: string, patch: Partial<RibbonGroup>) => void;
  onDuplicateGroup: (groupId: string) => void;
  onAdjustGroupColumns: (groupId: string, delta: 1 | -1) => void;
  onDeleteGroup: (groupId: string) => void;
  onContextMenuGroup: (x: number, y: number, groupId: string) => void;
  onSelectControl: (controlId: string) => void;
  onControlContextMenu: (x: number, y: number, controlId: string) => void;
  onDragControlStart: (event: React.PointerEvent, control: RibbonControl) => void;
  onStartGroupDrag: (event: React.PointerEvent<HTMLButtonElement>, groupId: string) => void;
  onMoveGroup: (groupId: string, delta: -1 | 1) => void;
}) {
  const subgroup = document.subgroups.find((item) => item.id === group.subgroupIds[0]);
  if (!subgroup) return null;
  // 流式渲染：按声明顺序派生每个控件的显示位置（与 Pro 同规则），组宽随内容
  const controls = getSubgroupControls(document, subgroup.id);
  const flow = flowLayout(
    controls.map((c) => ({
      id: c.id,
      type: c.type,
      size: c.size,
      caption: c.caption,
      variant: c.variant,
      iconOnly: c.iconOnly,
    })),
  );
  // 显示宽 = max(内容列数, 手动列数)。手动列数(新建默认 8)是拖放区的最小宽:
  // 空分组按 8 列给足落点;内容超出后随内容加宽;− 只能收回到内容列数
  const contentColumns = flow.reduce((max, item) => Math.max(max, item.x + item.w), 0);
  const manualColumns = Math.min(
    MAX_GROUP_COLS,
    Math.max(1, subgroup.layout?.columns ?? DEFAULT_GROUP_COLS),
  );
  const usedColumns = Math.max(contentColumns, manualColumns);

  return (
    <div
      className={`next-group${dragging ? ' group-drag-source' : ''}`}
      role="group"
      tabIndex={0}
      aria-label={`分组 ${group.caption}`}
      data-group-id={group.id}
      style={{ '--group-cols': Math.max(usedColumns, 1) } as CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenuGroup(event.clientX, event.clientY, group.id);
      }}
    >
      <div className="next-group-tools">
        <button
          className="group-drag-handle"
          title="拖拽调整分组顺序（也可按左右方向键）"
          aria-label={`调整「${group.caption}」分组顺序：按住拖拽，或按左右方向键移动`}
          onPointerDown={(event) => onStartGroupDrag(event, group.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              onMoveGroup(group.id, -1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              onMoveGroup(group.id, 1);
            }
          }}
        >
          <GripVertical size={12} />
        </button>
        <input
          className="next-group-name"
          aria-label="分组名称"
          value={group.caption}
          onChange={(event) => onUpdateGroup(group.id, { caption: event.target.value })}
          spellCheck={false}
        />
        <button onClick={() => onDuplicateGroup(group.id)} title="复制分组">
          <Copy size={12} />
        </button>
        {canDelete ? (
          <button className="danger" onClick={() => onDeleteGroup(group.id)} title="删除分组">
            <Trash2 size={12} />
          </button>
        ) : null}
        <div className="next-group-cols" role="group" aria-label="分组列数">
          <button
            onClick={() => onAdjustGroupColumns(group.id, -1)}
            disabled={manualColumns <= Math.max(contentColumns, 1)}
            title="减少列数"
            aria-label="减少列数"
          >
            <Minus size={12} />
          </button>
          <span>{usedColumns} 列</span>
          <button
            onClick={() => onAdjustGroupColumns(group.id, 1)}
            disabled={usedColumns >= MAX_GROUP_COLS}
            title="增加列数"
            aria-label="增加列数"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <RibbonGroupGrid
        document={document}
        subgroup={subgroup}
        flow={flow}
        usedColumns={usedColumns}
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
      </div>
    </div>
  );
}

function RibbonGroupGrid({
  document,
  subgroup,
  flow,
  usedColumns,
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
  flow: GridRect[];
  usedColumns: number;
  drag: DragState;
  hover: HoverTarget | null;
  selectedControlId: string | null;
  registerGrid: (subgroupId: string, element: HTMLElement | null) => void;
  onSelectControl: (controlId: string) => void;
  onControlContextMenu: (x: number, y: number, controlId: string) => void;
  onDragControlStart: (event: React.PointerEvent, control: RibbonControl) => void;
}) {
  const controls = getSubgroupControls(document, subgroup.id);
  const rectMap = new Map(flow.map((item) => [item.i, item]));
  const showPreview = Boolean(drag) && hover?.subgroupId === subgroup.id;

  return (
    <div
      className="next-subgroup"
      style={{ '--group-cols': Math.max(usedColumns, 1), '--group-rows': 3 } as CSSProperties}
    >
      <div className="next-subgroup-head">
        <span>宽屏固定高度</span>
        <strong>
          已用到 {usedColumns} 列 · 3 行
        </strong>
      </div>
      <div
        className="next-grid-board"
        ref={(element) => registerGrid(subgroup.id, element)}
        data-testid={`grid-${subgroup.id}`}
      >
        {controls.length === 0 ? (
          <div className="next-grid-empty-hint" aria-hidden>
            从控件库拖入，或点“插入到当前分组”
          </div>
        ) : null}
        {showPreview && hover ? (
          <div className="next-drop-line" style={{ left: hover.lineX * RIBBON_CELL - 1 }} />
        ) : null}
        {controls.map((control) => {
          const rect = rectMap.get(control.id);
          if (!rect) return null;
          return (
            <button
              key={control.id}
              data-testid={`control-${control.id}`}
              className={`next-ribbon-control${control.id === selectedControlId ? ' selected' : ''}${
                drag?.kind === 'move' && drag.controlId === control.id ? ' dragging' : ''
              }`}
              style={
                {
                  left: rect.x * RIBBON_CELL,
                  top: rect.y * RIBBON_CELL,
                  width: rect.w * RIBBON_CELL,
                  height: rect.h * RIBBON_CELL,
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
                variant={control.variant}
                separator={control.separator}
                iconOnly={control.iconOnly}
                children={control.children}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 控件库紧凑卡的类型代表图标(异步加载 PNG;缺失时显示占位色块)
function LibraryIconThumb({ type }: { type: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    const file = LIBRARY_ICON[type];
    if (!file) return;
    getIconUrl(file)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [type]);
  return url ? (
    <img className="library-compact-icon" src={url} alt="" draggable={false} />
  ) : (
    <span className="library-compact-icon fallback" />
  );
}

function Inspector({
  control,
  onUpdate,
  onDelete,
  onOpenIcons,
  onUpdateChild,
  onAddChild,
  onRemoveChild,
}: {
  control: RibbonControl;
  onUpdate: (controlId: string, patch: Partial<RibbonControl>) => void;
  onDelete: (controlId: string) => void;
  onOpenIcons: (childId?: string) => void;
  onUpdateChild: (childId: string, patch: Partial<ControlChild>) => void;
  onAddChild: () => void;
  onRemoveChild: (childId: string) => void;
}) {
  const isContainer =
    control.type === 'splitButton' || control.type === 'menu' || control.type === 'toolPalette';
  return (
    <section className="next-panel next-inspector">
      <div className="next-panel-title">
        <strong>属性 · {TYPE_LABELS[control.type] ?? control.type}</strong>
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
            value={control.iconOnly && control.size === 'small' ? 'icon' : control.size}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'icon') {
                onUpdate(control.id, { size: 'small', iconOnly: true });
              } else {
                onUpdate(control.id, { size: next as RibbonControlSize, iconOnly: undefined });
              }
            }}
          >
            {control.supportedSizes.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABELS[size]} {footprintLabel(control.type, size, control.variant)}
              </option>
            ))}
            {control.supportedSizes.includes('small') ? (
              <option value="icon">
                图标 {footprintLabel(control.type, 'small', control.variant, true)}
              </option>
            ) : null}
          </select>
        </label>
        {control.type === 'gallery' ? (
          <label>
            画廊形态
            <select
              value={control.variant === 'inline' ? 'inline' : ''}
              onChange={(event) =>
                onUpdate(control.id, {
                  variant: event.target.value === 'inline' ? 'inline' : undefined,
                })
              }
            >
              <option value="">下拉式(inline=false)</option>
              <option value="inline">摊开式(inline=true)</option>
            </select>
          </label>
        ) : null}
        {!isContainer ? (
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={Boolean(control.separator)}
              onChange={(event) => onUpdate(control.id, { separator: event.target.checked })}
            />
            前置分隔线
          </label>
        ) : null}
        <div className="icon-bindings">
          <span>图标</span>
          <button className="icon-slot" onClick={() => onOpenIcons()} title="打开图标选择器">
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
        {isContainer ? (
          <div className="child-list">
            <span>子项({control.children?.length ?? 0})</span>
            {(control.children ?? []).map((child) => (
              <div className="child-row" key={child.id}>
                <button
                  className="icon-slot"
                  onClick={() => onOpenIcons(child.id)}
                  title="选择子项图标"
                >
                  <ImageIcon size={13} />
                  <span className="icon-slot-name">
                    {child.icon.small
                      ? child.icon.small.replace(/^(dark|imp_)?(images_)?/, '')
                      : '选择图标'}
                  </span>
                </button>
                <input
                  className="child-caption"
                  value={child.caption}
                  placeholder="子项标题"
                  onChange={(event) => onUpdateChild(child.id, { caption: event.target.value })}
                />
                <input
                  className="child-behavior"
                  value={child.behavior.className}
                  placeholder="行为类名(可选)"
                  spellCheck={false}
                  onChange={(event) =>
                    onUpdateChild(child.id, {
                      behavior: { ...child.behavior, className: event.target.value },
                    })
                  }
                />
                <button
                  className="icon-clear"
                  title="删除子项"
                  onClick={() => onRemoveChild(child.id)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="child-add" onClick={onAddChild}>
              <Plus size={13} />
              添加子项
            </button>
          </div>
        ) : null}
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
            placeholder="条件 ID（可选）"
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
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  document: RibbonDocument;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const control = state.controlId
    ? document.controls.find((item) => item.id === state.controlId)
    : null;
  return (
    <MenuSurface
      label={control ? `${control.caption || TYPE_LABELS[control.type] || control.type}菜单` : '分组菜单'}
      x={state.x}
      y={state.y}
      onClose={onClose}
    >
      {control ? (
        <>
          <div className="context-menu-title">{control.caption || TYPE_LABELS[control.type] || control.type}</div>
          <button type="button" role="menuitem" onClick={() => onAction('icons')}>选择图标…</button>
          <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete-control')}>
            删除控件
          </button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={() => onAction('duplicate-group')}>复制分组</button>
          <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete-group')}>
            删除分组
          </button>
        </>
      )}
    </MenuSurface>
  );
}
