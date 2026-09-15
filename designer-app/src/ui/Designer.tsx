import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  MousePointerClick,
  Package,
  Plus,
  Redo2,
  Save,
  Settings,
  TextCursorInput,
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
import { IconPicker, type IconSelection } from './IconPicker';
import { getIconUrl, invalidateIconList } from './iconsClient';
import { Welcome } from './Welcome';
import { AboutDialog } from './AboutDialog';
import { Modal } from './Modal';
import { createDemoDocument } from '../core/demoLayout';
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
const PROJECTS_STORAGE_KEY = 'gispro-ribbon-designer-projects';
const LAST_EXPORT_DIR_STORAGE_KEY = 'gispro-ribbon-designer-last-export-dir';
const LAST_DOC_DIR_STORAGE_KEY = 'gispro-ribbon-designer-last-doc-dir';
const RECENT_FILES_STORAGE_KEY = 'gispro-ribbon-designer-recent-files';
const THEME_STORAGE_KEY = 'gispro-ribbon-designer-theme';
const AUTO_UPDATE_STORAGE_KEY = 'gispro-ribbon-designer-auto-update';
const WELCOME_SEEN_STORAGE_KEY = 'gispro-ribbon-designer-welcome-seen';
const LIB_CATEGORY_STORAGE_KEY = 'gispro-ribbon-designer-lib-category';

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

// 控件库双层分类:上层 segment 按交互特性分组,下层为具体控件卡
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

const LIBRARY_CATEGORIES: {
  id: 'all' | 'command' | 'container' | 'input';
  label: string;
  Icon: typeof LayoutGrid;
}[] = [
  { id: 'all', label: '全部', Icon: LayoutGrid },
  { id: 'command', label: '命令', Icon: MousePointerClick },
  { id: 'container', label: '容器', Icon: Box },
  { id: 'input', label: '输入', Icon: TextCursorInput },
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

export default function Designer() {
  const [initialSession] = useState(loadInitialSession);
  const [projects, setProjects] = useState<ProjectEntry[]>(initialSession.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialSession.activeProjectId);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [ghostPos, setGhostPos] = useState<GhostPos>({ x: 0, y: 0 });
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
  const [libCategory, setLibCategory] = useState<'all' | 'command' | 'container' | 'input'>(() => {
    const saved = localStorage.getItem(LIB_CATEGORY_STORAGE_KEY);
    return saved === 'command' || saved === 'container' || saved === 'input' ? saved : 'all';
  });
  const [updateBanner, setUpdateBanner] = useState<{ version: string } | null>(null);
  const gridRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
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
    localStorage.setItem(LIB_CATEGORY_STORAGE_KEY, libCategory);
  }, [libCategory]);

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

  const visibleLibraryItems =
    libCategory === 'all'
      ? CONTROL_LIBRARY
      : CONTROL_LIBRARY.filter((item) => LIBRARY_CATEGORY[item.type] === libCategory);

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
        const footprint = getFootprint(control.type, size, control.variant);
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
    // 尺寸或变体(如画廊 下拉↔摊开)变化都会改变占格,走同一条重排路径;
    // variant 清除时值为 undefined,须用键存在性区分「没改」与「改成无」
    if (patch.size || 'variant' in patch) {
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
        const nextSize = (patch.size ?? control.size) as RibbonControlSize;
        const nextVariant = 'variant' in patch ? patch.variant : control.variant;
        const footprint = getFootprint(control.type, nextSize, nextVariant);
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

  const exportDaml = () =>
    exportTextFile('daml', 'DAML 布局文件', 'Config.daml', buildConfigDaml(document), 'Config.daml');

  const exportJson = () =>
    exportTextFile(
      'json',
      '布局 JSON',
      'layout.json',
      JSON.stringify(document, null, 2),
      '布局 JSON',
    );

  const exportPackage = async () => {
    // 免编译导出:DAML 指向预编译占位 DLL,用户机器无需 .NET SDK
    const artifacts: ArcGISProValidationArtifacts =
      buildArcGISProValidationArtifacts(document, { placeholderBehaviors: true });
    const path = await saveExportPath(
      'esriAddInX',
      'ArcGIS Pro Add-in 安装包',
      artifacts.packageFileName,
    );
    if (!path) return;
    const { dir, name } = splitPath(path);
    setBusy('正在打包 add-in 安装包');
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
      showToast(`安装包已生成 ${written}（控件行为为占位实现）`);
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
          : getFootprint(current.type, current.size, current.variant);
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
        if (dropdown) setDropdown(null);
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
    <div className="next-shell">
      <a className="skip-link" href="#main-canvas">
        跳到画布
      </a>
      <header
        className="next-titlebar"
        data-tauri-drag-region
        onDoubleClick={() => void appWindow?.toggleMaximize()}
      >
        <h1 className="visually-hidden">极思G GISpro 插件设计器</h1>
        <div className="window-handle" data-tauri-drag-region>
          <img className="window-app-icon" src="/app-icon.png" alt="" draggable={false} />
        </div>
        <button
          className="titlebar-icon-btn"
          title="文件"
          aria-label="文件"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setDropdown({ kind: 'file', x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <FileText size={14} />
        </button>
        <div className="window-title" data-tauri-drag-region>
          {activeProjectTitle}
          {fileDirty ? <span className="dirty-dot" title="有未保存到文件的修改" /> : null}
        </div>
        <button
          className="titlebar-icon-btn"
          title="设置"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setDropdown({ kind: 'settings', x: rect.right - 220, y: rect.bottom + 4 });
          }}
        >
          <Settings size={14} />
        </button>
        <button
          className="titlebar-icon-btn"
          title="关于与检查更新"
          onClick={(event) => {
            event.stopPropagation();
            setShowAbout(true);
          }}
        >
          <Info size={14} />
        </button>
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
        <aside className="next-tab-sidebar" aria-label="项目与页签列表">
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
                  <span
                    className="next-project-name"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setRenamingProjectId(project.id);
                    }}
                  >
                    {projectTitle(project)}
                  </span>
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
                        <span className="next-tab-name">{tab.caption}</span>
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
                  点击与侧栏 .next-tab-item 走同一个入口 activateProject，双向联动。 */}
              <div className="next-canvas-tabs" role="tablist" aria-label="Ribbon 页签">
                {document.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={`next-canvas-tab${tab.id === activeTabId ? ' active' : ''}`}
                    aria-selected={tab.id === activeTabId}
                    onClick={() => activateProject(activeProject.id, tab.id)}
                    title={tab.caption}
                  >
                    <span className="next-canvas-tab-caption">{tab.caption}</span>
                    <span className="next-canvas-tab-keytip">{tab.keytip}</span>
                  </button>
                ))}
              </div>
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
                          variant: control.variant,
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

            <aside className="next-side" aria-label="属性面板">
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
                <div className="next-empty-inspector">
                  <span>点击画布上的控件编辑属性</span>
                </div>
              )}
            </aside>
          </main>

          <section className="next-bottom-palette" aria-label="控件库">
            <div className="next-palette-tabs" role="group" aria-label="控件分类">
              {LIBRARY_CATEGORIES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={libCategory === id ? 'active' : ''}
                  aria-pressed={libCategory === id}
                  title={
                    id === 'all'
                      ? '全部控件'
                      : id === 'command'
                        ? '命令类:点击执行动作'
                        : id === 'container'
                          ? '容器类:承载多个命令或选项'
                          : '输入类:录入参数值'
                  }
                  onClick={() => setLibCategory(id)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="next-palette-cards">
              {visibleLibraryItems.map((item) => {
                const size =
                  libSize[item.type] ??
                  (item.supportedSizes.includes('large')
                    ? 'large'
                    : item.supportedSizes[item.supportedSizes.length - 1]);
                return (
                  <div
                    className="library-compact-card"
                    key={item.type}
                    title={`${item.label} — ${item.shortDescription}`}
                  >
                    <div className="library-compact-head">
                      <LibraryIconThumb type={item.type} />
                      <span>{item.label}</span>
                    </div>
                    <p className="library-compact-desc">{item.shortDescription}</p>
                    <div className="library-compact-sizes">
                      {item.supportedSizes.map((candidate) => (
                        <button
                          key={candidate}
                          className={candidate === size ? 'active' : ''}
                          title={`${item.label} · ${SIZE_LABELS[candidate]} · ${footprintLabel(item.type, candidate)}`}
                          aria-label={`${item.label} ${SIZE_LABELS[candidate]} 尺寸，占 ${footprintLabel(item.type, candidate)} 格`}
                          onClick={() => setLibSize((current) => ({ ...current, [item.type]: candidate }))}
                          onPointerDown={(event) =>
                            startDrag(event, {
                              kind: 'new',
                              definition: item,
                              size: candidate,
                            })
                          }
                        >
                          {SIZE_LABELS[candidate]}
                          <small>
                            {/* 占格用等比方块图示表达：1×1 是方格、2×1 是横条、2×3 是竖矩形 */}
                            <span
                              className="footprint-chip"
                              data-footprint={footprintLabel(item.type, candidate)}
                              style={
                                {
                                  '--fw': getFootprint(item.type, candidate).w,
                                  '--fh': getFootprint(item.type, candidate).h,
                                } as CSSProperties
                              }
                              aria-hidden
                            />
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
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
        <div className="context-menu" style={{ left: dropdown.x, top: dropdown.y }}>
          {dropdown.kind === 'file' ? (
            <>
              <div className="context-menu-title">文件</div>
              <button onClick={() => void requestNewDocument()}>
                新建项目<span className="menu-hint">Ctrl+N</span>
              </button>
              <button onClick={() => void openDocDialog()}>
                打开…<span className="menu-hint">Ctrl+O</span>
              </button>
              <button
                onClick={() =>
                  void saveDoc().then(() => undefined)
                }
              >
                {currentFile ? `保存 ${splitPath(currentFile).name}` : '保存'}
                <span className="menu-hint">Ctrl+S</span>
              </button>
              <button onClick={() => void saveDocAs()}>另存为…</button>
              <div className="context-menu-sep" />
              <div className="context-menu-title">最近文件</div>
              {recentFiles.length ? (
                recentFiles.map((file) => (
                  <button
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
              <button onClick={() => openDemoLayout()}>打开示例布局</button>
              <button onClick={() => setShowAbout(true)}>关于…</button>
            </>
          ) : dropdown.kind === 'settings' ? (
            <>
              <div className="context-menu-title">设置</div>
              <div className="settings-row">
                <span>界面主题</span>
                <div className="settings-seg">
                  <button
                    className={theme === 'light' ? 'active' : ''}
                    onClick={() => setTheme('light')}
                  >
                    浅色
                  </button>
                  <button
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
                {dropdown.kind === 'import' ? '导入' : '导出'}
              </div>
              {dropdown.kind === 'import' ? (
                <>
                  <button
                    onClick={() => {
                      setDropdown(null);
                      void pickImportFile('esriAddInX');
                    }}
                  >
                    导入 add-in 安装包(.esriAddInX)…
                  </button>
                  <button
                    onClick={() => {
                      setDropdown(null);
                      void pickImportFile('daml');
                    }}
                  >
                    导入 DAML(.daml)…
                  </button>
                  <button
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
        </div>
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
      style={{ '--group-cols': spec.cols } as CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenuGroup(event.clientX, event.clientY, group.id);
      }}
    >
      <div className="next-group-tools">
        <input
          className="next-group-name"
          aria-label="分组名称"
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
              variant={control.variant}
              separator={control.separator}
              children={control.children}
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
            value={control.size}
            onChange={(event) =>
              onUpdate(control.id, { size: event.target.value as RibbonControlSize })
            }
          >
            {control.supportedSizes.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABELS[size]} {footprintLabel(control.type, size, control.variant)}
              </option>
            ))}
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
          <div className="context-menu-title">{control.caption || TYPE_LABELS[control.type] || control.type}</div>
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
