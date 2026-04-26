import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ReactGridLayout, { getCompactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Download,
  ChevronDown,
  FileJson,
  FolderInput,
  LayoutGrid,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { CONTROL_LIBRARY, SIZE_LABELS } from '../library';
import {
  cloneDocumentWithTimestamp,
  createControlFromType,
  createEmptyDocument,
  createId,
  parseImportedDocument,
} from '../ribbon';
import {
  buildArcGISProValidationArtifacts,
  buildConfigDaml,
} from '../../shared/arcgisProValidation';
import type {
  LibraryControlDefinition,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonGroup,
  RibbonSubgroup,
} from '../types';
import { ControlMock } from './ControlMock';
import {
  DEFAULT_GROUP_COLS,
  DEFAULT_GROUP_ROWS,
  FIXED_GROUP_ROWS,
  MAX_GROUP_COLS,
  MIN_GROUP_COLS,
  RIBBON_CELL,
  canPlaceRect,
  findFirstOpenSlot,
  footprintLabel,
  getFootprint,
  getGridSpec,
  getSubgroupControls,
  getSubgroupLayout,
  normalizeDocumentLayouts,
} from './ribbonLayout';
import './NextRibbonDesigner.css';

const STORAGE_KEY = 'gispro-ribbon-designer-next-doc';
const FIXED_DOWNLOAD_ENDPOINT = 'http://127.0.0.1:4174/write-file';
const DOWNLOAD_CONFIG_ENDPOINT = 'http://127.0.0.1:4174/config';
const DOWNLOAD_ADDON_PACKAGE_ENDPOINT = 'http://127.0.0.1:4174/package-addon';
const DOWNLOAD_HEALTH_ENDPOINT = 'http://127.0.0.1:4174/health';
const DOWNLOAD_DIRECTORY_STORAGE_KEY = 'gispro-ribbon-designer-download-dir';
const DEFAULT_DOWNLOAD_DIRECTORY = 'C:\\Users\\13975\\Documents\\arcgis-pro-addin-layout-agent\\arcgis-pro-validation\\GisProRibbonLayoutValidator.AddIn\\bin\\Debug\\net8.0-windows7.0';
const fixedSlotCompactor = getCompactor(null, false, true);
type SidePanelMode = 'palette' | 'inspector';

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

const getLibraryHelpText = (item: LibraryControlDefinition) => {
  const sizeAdvice = item.supportedSizes.map((size) => SIZE_LABELS[size]).join(' / ');
  return [
    `适用场景：${item.shortDescription}`,
    `推荐尺寸：支持 ${sizeAdvice}，请根据功能区空间和操作频率选择。`,
    `开发建议：建议映射为 ${item.defaultBehavior.className}，目标区域是 ${item.defaultBehavior.target}。`,
  ].join('\n');
};

const createInitialDocument = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = parseImportedDocument(saved);
    if (parsed) return ensureSingleGridPerGroup(parsed);
    localStorage.removeItem(STORAGE_KEY);
  }
  return ensureSingleGridPerGroup(createEmptyDocument());
};

const persistDocument = (document: RibbonDocument) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
};

const loadStoredDownloadDirectory = () => {
  const stored = localStorage.getItem(DOWNLOAD_DIRECTORY_STORAGE_KEY);
  return stored && stored.trim() ? stored.trim() : DEFAULT_DOWNLOAD_DIRECTORY;
};

const persistDownloadDirectory = (downloadDirectory: string) => {
  localStorage.setItem(DOWNLOAD_DIRECTORY_STORAGE_KEY, downloadDirectory);
};

const downloadJson = async (document: RibbonDocument) => {
  await downloadTextFile(
    `${document.metadata.name || 'ribbon-layout'}.json`,
    JSON.stringify(document, null, 2),
    {
      description: 'JSON file',
      mimeType: 'application/json',
      extensions: ['json'],
    },
  );
};

const downloadConfigDaml = async (document: RibbonDocument) => {
  await downloadTextFile(
    'Config.daml',
    buildConfigDaml(document),
    {
      description: 'Config file',
      mimeType: 'application/xml',
      extensions: ['daml'],
    },
  );
};

const downloadAddInInstallTestPackage = async (document: RibbonDocument) => {
  const artifacts = buildArcGISProValidationArtifacts(document);
  const response = await fetch(DOWNLOAD_ADDON_PACKAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      packageFileName: artifacts.packageFileName,
      configDaml: artifacts.configDaml,
      generatedControls: artifacts.generatedControls,
      layoutSnapshot: artifacts.layoutSnapshot,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to generate add-in package');
  }
};

const downloadTextFile = (
  filename: string,
  content: string,
  accept: DownloadAccept,
) => {
  const blob = new Blob([content], { type: accept.mimeType });
  return downloadBlob(filename, blob, accept);
};

type DownloadAccept = {
  description: string;
  mimeType: string;
  extensions: string[];
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  excludeAcceptAllOption?: boolean;
}) => Promise<FileSystemFileHandle>;

const saveBlobToFixedDirectory = async (filename: string, blob: Blob) => {
  try {
    const response = await fetch(FIXED_DOWNLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-Filename': filename,
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    return response.ok;
  } catch {
    return false;
  }
};

const downloadBlob = async (filename: string, blob: Blob, accept: DownloadAccept) => {
  if (await saveBlobToFixedDirectory(filename, blob)) return;

  const picker = (globalThis as typeof globalThis & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: accept.description, accept: { [accept.mimeType]: accept.extensions } }],
        excludeAcceptAllOption: false,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const readFixedDownloadDir = async () => {
  try {
    const response = await fetch(DOWNLOAD_HEALTH_ENDPOINT);
    if (!response.ok) return loadStoredDownloadDirectory();
    const data = (await response.json()) as { downloadDir?: string };
    return data.downloadDir && data.downloadDir.trim()
      ? data.downloadDir.trim()
      : loadStoredDownloadDirectory();
  } catch {
    return loadStoredDownloadDirectory();
  }
};

const saveFixedDownloadDir = async (downloadDir: string) => {
  const response = await fetch(DOWNLOAD_CONFIG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadDir }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to update download directory');
  }
};

const ensureSingleGridPerGroup = (source: RibbonDocument): RibbonDocument => {
  let controls = source.controls;
  const subgroupsById = new Map(source.subgroups.map((subgroup) => [subgroup.id, subgroup]));
  const nextSubgroups: RibbonSubgroup[] = [];

  const groups = source.groups.map((group) => {
    const primaryId = group.subgroupIds[0] ?? createId('subgroup');
    const allControlIds = group.subgroupIds.flatMap(
      (subgroupId) => subgroupsById.get(subgroupId)?.controlIds ?? [],
    );
    controls = controls.map((control) =>
      allControlIds.includes(control.id) ? { ...control, subgroupId: primaryId } : control,
    );
    const existing = subgroupsById.get(primaryId);
    nextSubgroups.push({
      id: primaryId,
      groupId: group.id,
      caption: '分组网格',
      sizeMode: 'AlwaysLarge',
      verticalAlignment: existing?.verticalAlignment ?? 'Top',
      layout: {
        row: 0,
        columns: existing?.layout?.columns ?? DEFAULT_GROUP_COLS,
        rows: FIXED_GROUP_ROWS,
      },
      controlIds: allControlIds,
    });
    return { ...group, subgroupIds: [primaryId] };
  });

  return normalizeDocumentLayouts({ ...source, groups, subgroups: nextSubgroups, controls }, 'Large');
};

export default function NextRibbonDesigner() {
  const [document, setDocument] = useState<RibbonDocument>(() => createInitialDocument());
  const [activeTabId, setActiveTabId] = useState(document.tabs[0]?.id ?? '');
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanelMode>('palette');
  const [activeLibraryItem, setActiveLibraryItem] = useState<{
    item: LibraryControlDefinition;
    size: RibbonControlSize;
  } | null>(null);
  const [toast, setToast] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState(DEFAULT_DOWNLOAD_DIRECTORY);
  const [downloadDirectoryDraft, setDownloadDirectoryDraft] = useState(DEFAULT_DOWNLOAD_DIRECTORY);
  const [downloadDirectorySaving, setDownloadDirectorySaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(document.metadata.lastUpdated);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    persistDocument(document);
    setLastSavedAt(document.metadata.lastUpdated);
  }, [document]);

  useEffect(() => {
    if (!downloadMenuOpen) return undefined;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && downloadMenuRef.current && !downloadMenuRef.current.contains(target)) {
        setDownloadMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDownloadMenuOpen(false);
      }
    };

    globalThis.document.addEventListener('mousedown', closeMenu);
    globalThis.document.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.document.removeEventListener('mousedown', closeMenu);
      globalThis.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [downloadMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    const initDownloadDirectory = async () => {
      const nextDirectory = await readFixedDownloadDir();
      if (cancelled) return;
      setDownloadDirectory(nextDirectory);
      setDownloadDirectoryDraft(nextDirectory);
      persistDownloadDirectory(nextDirectory);
    };

    void initDownloadDirectory();

    return () => {
      cancelled = true;
    };
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
  const selectedControl = document.controls.find((control) => control.id === selectedControlId) ?? null;
  const json = useMemo(() => JSON.stringify(document, null, 2), [document]);
  const lastSavedLabel = useMemo(() => {
    const savedAt = new Date(lastSavedAt);
    return Number.isNaN(savedAt.getTime())
      ? '本地草稿已同步'
      : `本地草稿 ${new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(savedAt)} 已保存`;
  }, [lastSavedAt]);

  const commit = (recipe: (current: RibbonDocument) => RibbonDocument) => {
    setDocument((current) => ensureSingleGridPerGroup(cloneDocumentWithTimestamp(recipe(current))));
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const resetToBlank = () => {
    const next = ensureSingleGridPerGroup(createEmptyDocument());
    setDocument(next);
    setActiveTabId(next.tabs[0]?.id ?? '');
    setSelectedControlId(null);
    showToast('已重置为空白 Ribbon');
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
      layout: { row: 0, columns: DEFAULT_GROUP_COLS, rows: DEFAULT_GROUP_ROWS },
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
      groups: current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  };

  const updateGroupColumns = (groupId: string, columns: number) => {
    commit((current) => ({
      ...current,
      subgroups: current.subgroups.map((subgroup) =>
        subgroup.groupId === groupId
          ? {
              ...subgroup,
              layout: {
                row: 0,
                columns,
                rows: FIXED_GROUP_ROWS,
              },
            }
          : subgroup,
      ),
    }));
  };

  const deleteGroup = (groupId: string) => {
    const targetGroup = document.groups.find((group) => group.id === groupId);
    if (!targetGroup) return;
    const ownerTab = document.tabs.find((tab) => tab.id === targetGroup.tabId);
    if (ownerTab?.groupIds[0] === groupId) {
      showToast('首个分组默认保留，不支持删除');
      return;
    }

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

    if (selectedControlId && controlIds.has(selectedControlId)) {
      setSelectedControlId(null);
      setSidePanel('palette');
    }

    showToast(`已删除分组 ${targetGroup.caption}`);
  };

  const updateControl = (controlId: string, patch: Partial<RibbonControl>) => {
    if (patch.size) {
      let rejected = false;
      commit((current) => {
        const control = current.controls.find((item) => item.id === controlId);
        const subgroup = control ? current.subgroups.find((item) => item.id === control.subgroupId) : null;
        if (!control || !subgroup) return current;
        const spec = getGridSpec(subgroup);
        const layout = getSubgroupLayout(current, subgroup, 'Large').filter((item) => item.i !== control.id);
        const footprint = getFootprint(control.type, patch.size as RibbonControlSize);
        const currentLayout = control.layout ?? { x: 0, y: 0 };
        const candidate = {
          i: control.id,
          x: currentLayout.x,
          y: currentLayout.y,
          w: footprint.w,
          h: footprint.h,
        };
        const slot = canPlaceRect(candidate, layout, spec) ? candidate : findFirstOpenSlot(footprint, layout, spec);
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
    setSelectedControlId(null);
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
        item.id === subgroup.id ? { ...item, controlIds: [...item.controlIds, nextControl.id] } : item,
      ),
    }));
    setSelectedControlId(nextControl.id);
    showToast(`已加入 ${definition.label}`);
  };

  const updateSubgroupLayout = (_subgroupId: string, layout: Layout) => {
    const byId = new Map(layout.map((item) => [item.i, item]));
    commit((current) => ({
      ...current,
      controls: current.controls.map((control) => {
        const item = byId.get(control.id);
        return item ? { ...control, layout: { x: item.x, y: item.y, w: item.w, h: item.h } } : control;
      }),
    }));
  };

  const importJson = () => {
    const parsed = parseImportedDocument(importText);
    if (!parsed) {
      showToast('导入失败：JSON 结构不符合当前 schema');
      return;
    }
    const next = ensureSingleGridPerGroup(parsed);
    setDocument(next);
    setActiveTabId(next.tabs[0]?.id ?? '');
    setSelectedControlId(null);
    setImportOpen(false);
    showToast('已导入 JSON');
  };

  const saveCanvas = () => {
    const savedAt = new Date().toISOString();
    persistDocument(document);
    setLastSavedAt(savedAt);
    showToast('已保存当前画布，下次打开网页会自动恢复');
  };

  const applyDownloadDirectory = async () => {
    const nextDirectory = downloadDirectoryDraft.trim();
    if (!nextDirectory) {
      showToast('请输入有效的本地路径');
      return;
    }

    setDownloadDirectorySaving(true);
    try {
      await saveFixedDownloadDir(nextDirectory);
      setDownloadDirectory(nextDirectory);
      persistDownloadDirectory(nextDirectory);
      showToast(`下载路径已更新到 ${nextDirectory}`);
    } catch {
      showToast('下载路径保存失败');
    } finally {
      setDownloadDirectorySaving(false);
    }
  };

  return (
    <div className="next-shell">
      <header className="next-titlebar">
        <div className="window-handle">ArcGIS Pro</div>
        <div className="window-title">Add-In Ribbon 布局设计器</div>
        <div className="window-buttons">
          <span />
          <span />
          <span />
        </div>
      </header>

      <section className="next-pro-tabs">
        {['工程', '地图', '插入', '分析', '视图', '编辑', '影像', '共享'].map((label) => (
          <button key={label}>{label}</button>
        ))}
        {document.tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab?.id ? 'active' : ''}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.caption}
          </button>
        ))}
      </section>

      <section className="next-toolbar">
        <div className="next-toolbar-left">
          <button onClick={addGroup}>
            <Plus size={14} />
            新增分组
          </button>
          <button onClick={resetToBlank}>清空控件</button>
        </div>
        <div className="next-toolbar-right">
          <span className="mode-pill">宽屏</span>
          <span className="draft-status">{lastSavedLabel}</span>
          <button onClick={saveCanvas}>
            <Save size={14} />
            保存画布
          </button>
          <button onClick={() => setImportOpen(true)}>
            <Upload size={14} />
            导入
          </button>
          <div className="toolbar-download-split" ref={downloadMenuRef}>
            <button
              className="toolbar-download-main"
              onClick={() => {
                void downloadConfigDaml(document).then(() => {
                  showToast('Config.daml 已导出');
                });
              }}
            >
              <Download size={14} />
              下载 Config.daml
            </button>
            <button
              className={`toolbar-download-toggle${downloadMenuOpen ? ' active' : ''}`}
              aria-label="展开下载选项"
              aria-haspopup="menu"
              aria-expanded={downloadMenuOpen}
              onClick={() => setDownloadMenuOpen((current) => !current)}
            >
              <ChevronDown size={14} />
            </button>
            {downloadMenuOpen ? (
              <div className="toolbar-download-menu" role="menu" aria-label="下载选项">
                <div className="toolbar-download-config" role="none">
                  <label htmlFor="download-directory-input">指定下载地址</label>
                  <input
                    id="download-directory-input"
                    value={downloadDirectoryDraft}
                    onChange={(event) => setDownloadDirectoryDraft(event.target.value)}
                    spellCheck={false}
                  />
                  <div className="toolbar-download-config-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void applyDownloadDirectory();
                      }}
                      disabled={downloadDirectorySaving}
                    >
                      {downloadDirectorySaving ? '保存中...' : '应用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownloadDirectoryDraft(DEFAULT_DOWNLOAD_DIRECTORY)}
                    >
                      恢复默认
                    </button>
                  </div>
                  <div className="toolbar-download-config-hint">
                    当前生效地址：{downloadDirectory}
                  </div>
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    void downloadConfigDaml(document).then(() => {
                      showToast('Config.daml 已导出');
                    });
                    setDownloadMenuOpen(false);
                  }}
                >
                  下载 Config.daml 文件
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    void downloadAddInInstallTestPackage(document).then(() => {
                    showToast('addin 安装包已导出');
                    });
                    setDownloadMenuOpen(false);
                  }}
                >
                  下载 addin 安装包
                </button>
              </div>
            ) : null}
          </div>
          <button className="primary" onClick={() => {
            void downloadJson(document).then(() => {
              showToast('JSON 已导出');
            });
          }}>
            <Download size={14} />
            导出 JSON
          </button>
        </div>
      </section>
      <main className="next-workbench">
        <section className="next-canvas">
          <div className="next-canvas-title">
            <strong>Ribbon 画布</strong>
            <span>仅宽屏预览；功能区高度固定为 3 行，不允许控件重叠。</span>
          </div>
          <div className="next-ribbon-area">
            {activeGroups.length ? (
              activeGroups.map((group, index) => (
                <RibbonGroupView
                  key={group.id}
                  document={document}
                  group={group}
                  canDelete={index > 0}
                  selectedControlId={selectedControlId}
                  activeLibraryItem={activeLibraryItem}
                  onUpdateGroup={updateGroup}
                  onUpdateColumns={updateGroupColumns}
                  onDeleteGroup={deleteGroup}
                  onAddControl={addControlAt}
                  onLayoutChange={updateSubgroupLayout}
                  onSelectControl={(controlId) => {
                    setSelectedControlId(controlId);
                    setSidePanel('inspector');
                  }}
                  onToast={showToast}
                />
              ))
            ) : (
              <div className="next-empty-canvas">当前是空白 Ribbon。先新增分组，再从右侧拖入控件。</div>
            )}
          </div>
        </section>

        <aside className="next-side">
          <div className="next-side-tabs" role="tablist" aria-label="右侧工作区">
            <button
              type="button"
              role="tab"
              data-testid="next-side-tab-palette"
              aria-selected={sidePanel === 'palette'}
              className={sidePanel === 'palette' ? 'active' : ''}
              onClick={() => setSidePanel('palette')}
            >
              控件库
            </button>
            <button
              type="button"
              role="tab"
              data-testid="next-side-tab-inspector"
              aria-selected={sidePanel === 'inspector'}
              className={sidePanel === 'inspector' ? 'active' : ''}
              onClick={() => setSidePanel('inspector')}
            >
              属性
            </button>
          </div>
          <div className="next-side-body">
            {sidePanel === 'palette' ? (
              <Palette
                activeLibraryItem={activeLibraryItem}
                onPick={setActiveLibraryItem}
                onDragEnd={() => setActiveLibraryItem(null)}
              />
            ) : (
              <Inspector
                control={selectedControl}
                onUpdate={updateControl}
                onDelete={deleteControl}
              />
            )}
          </div>
        </aside>
      </main>

      {importOpen ? (
        <div className="next-modal" onClick={() => setImportOpen(false)}>
          <div className="next-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="next-modal-head">
              <strong>导入 Ribbon JSON</strong>
              <button onClick={() => setImportOpen(false)}>关闭</button>
            </div>
            <textarea
              value={importText}
              rows={18}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="粘贴导出的 JSON，或先点“载入当前 JSON”再修改。"
            />
            <div className="next-modal-actions">
              <button onClick={() => setImportText(json)}>
                <FolderInput size={14} />
                载入当前 JSON
              </button>
              <button className="primary" onClick={importJson}>
                应用导入
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="next-toast">{toast}</div> : null}
    </div>
  );
}

function RibbonGroupView({
  document,
  group,
  canDelete,
  selectedControlId,
  activeLibraryItem,
  onUpdateGroup,
  onUpdateColumns,
  onDeleteGroup,
  onAddControl,
  onLayoutChange,
  onSelectControl,
  onToast,
}: {
  document: RibbonDocument;
  group: RibbonGroup;
  canDelete: boolean;
  selectedControlId: string | null;
  activeLibraryItem: { item: LibraryControlDefinition; size: RibbonControlSize } | null;
  onUpdateGroup: (groupId: string, patch: Partial<RibbonGroup>) => void;
  onUpdateColumns: (groupId: string, columns: number) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddControl: (
    subgroup: RibbonSubgroup,
    definition: LibraryControlDefinition,
    size: RibbonControlSize,
    layout: { x: number; y: number; w: number; h: number },
  ) => void;
  onLayoutChange: (subgroupId: string, layout: Layout) => void;
  onSelectControl: (controlId: string) => void;
  onToast: (message: string) => void;
}) {
  const subgroup = document.subgroups.find((item) => item.id === group.subgroupIds[0]);
  if (!subgroup) return null;
  const spec = getGridSpec(subgroup);

  return (
    <section className="next-group" style={{ '--group-cols': spec.cols } as CSSProperties}>
      <div className="next-group-tools">
        <label>
          分组名
          <input value={group.caption} onChange={(event) => onUpdateGroup(group.id, { caption: event.target.value })} />
        </label>
        <button onClick={() => onUpdateColumns(group.id, Math.max(MIN_GROUP_COLS, spec.cols - 1))}>
          -列
        </button>
        <strong>{spec.cols}列</strong>
        <button onClick={() => onUpdateColumns(group.id, Math.min(MAX_GROUP_COLS, spec.cols + 1))}>
          +列
        </button>
      </div>
      <RibbonGroupGrid
        document={document}
        subgroup={subgroup}
        selectedControlId={selectedControlId}
        activeLibraryItem={activeLibraryItem}
        onAddControl={onAddControl}
        onLayoutChange={onLayoutChange}
        onSelectControl={onSelectControl}
        onToast={onToast}
      />
      <div className="next-group-footer">
        <div className="next-group-caption">{group.caption}</div>
        {canDelete ? (
          <button className="danger next-group-delete" onClick={() => onDeleteGroup(group.id)}>
            <Trash2 size={12} />
            删除分组
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RibbonGroupGrid({
  document,
  subgroup,
  selectedControlId,
  activeLibraryItem,
  onAddControl,
  onLayoutChange,
  onSelectControl,
  onToast,
}: {
  document: RibbonDocument;
  subgroup: RibbonSubgroup;
  selectedControlId: string | null;
  activeLibraryItem: { item: LibraryControlDefinition; size: RibbonControlSize } | null;
  onAddControl: (
    subgroup: RibbonSubgroup,
    definition: LibraryControlDefinition,
    size: RibbonControlSize,
    layout: { x: number; y: number; w: number; h: number },
  ) => void;
  onLayoutChange: (subgroupId: string, layout: Layout) => void;
  onSelectControl: (controlId: string) => void;
  onToast: (message: string) => void;
}) {
  const [preview, setPreview] = useState<LayoutItem | null>(null);
  const controls = getSubgroupControls(document, subgroup);
  const spec = getGridSpec(subgroup);
  const layout = getSubgroupLayout(document, subgroup, 'Large').map((item) => ({
    ...item,
    minW: item.w,
    maxW: item.w,
    minH: item.h,
    maxH: item.h,
    isResizable: false,
    isBounded: true,
  }));
  const layoutIds = new Set(layout.map((item) => item.i));
  const renderedControls = controls.filter((control) => layoutIds.has(control.id));
  const hiddenCount = controls.length - renderedControls.length;
  const usedColumns = layout.reduce((max, item) => Math.max(max, item.x + item.w), 0);

  const computeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!activeLibraryItem) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const footprint = getFootprint(activeLibraryItem.item.type, activeLibraryItem.size);
    const x = Math.max(0, Math.min(spec.cols - footprint.w, Math.floor((event.clientX - rect.left) / RIBBON_CELL)));
    const y = Math.max(0, Math.min(spec.rows - footprint.h, Math.floor((event.clientY - rect.top) / RIBBON_CELL)));
    const candidate = { i: '__preview__', x, y, w: footprint.w, h: footprint.h };
    return { candidate, valid: canPlaceRect(candidate, layout, spec) };
  };

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
      <div className="next-ruler">
        {Array.from({ length: spec.cols }).map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      <div
        className="next-grid-board"
        data-testid={`next-drop-${subgroup.id}`}
        onDragOver={(event) => {
          if (!activeLibraryItem) return;
          event.preventDefault();
          const result = computeDrop(event);
          setPreview(result?.candidate ?? null);
        }}
        onDragLeave={() => setPreview(null)}
        onDrop={(event) => {
          event.preventDefault();
          const result = computeDrop(event);
          if (!activeLibraryItem || !result?.valid) {
            onToast(`放不下：当前分组是 ${spec.cols}列 x 3行，不能增高，只能扩列或换位置`);
            setPreview(null);
            return;
          }
          const { x, y, w, h } = result.candidate;
          onAddControl(subgroup, activeLibraryItem.item, activeLibraryItem.size, { x, y, w, h });
          setPreview(null);
        }}
      >
        {preview ? (
          <div
            className={`next-drop-preview ${canPlaceRect(preview, layout, spec) ? 'valid' : 'invalid'}`}
            style={{
              left: preview.x * RIBBON_CELL,
              top: preview.y * RIBBON_CELL,
              width: preview.w * RIBBON_CELL,
              height: preview.h * RIBBON_CELL,
            }}
          />
        ) : null}
        <ReactGridLayout
          className="next-rgl"
          layout={layout}
          width={spec.cols * RIBBON_CELL}
          gridConfig={{
            cols: spec.cols,
            rowHeight: RIBBON_CELL,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: spec.rows,
          }}
          dragConfig={{ enabled: true, bounded: true, threshold: 4 }}
          resizeConfig={{ enabled: false }}
          compactor={fixedSlotCompactor}
          autoSize={false}
          onDragStop={(nextLayout) => {
            const clean = nextLayout.map((item) => ({
              i: item.i,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            }));
            const valid = clean.every((item) => canPlaceRect(item, clean, spec, item.i));
            if (valid) onLayoutChange(subgroup.id, clean);
            else onToast('目标格位已有控件，已回退');
          }}
        >
          {renderedControls.map((control) => (
            <button
              key={control.id}
              data-testid={`next-control-${control.id}`}
              className={`next-ribbon-control ${control.id === selectedControlId ? 'selected' : ''}`}
              onClick={() => onSelectControl(control.id)}
            >
              <ControlMock type={control.type} caption={control.caption} size={control.size} />
            </button>
          ))}
        </ReactGridLayout>
        {hiddenCount > 0 ? <div className="hidden-controls-warning">有 {hiddenCount} 个控件因无空位未显示</div> : null}
      </div>
    </div>
  );
}

function Palette({
  activeLibraryItem,
  onPick,
  onDragEnd,
}: {
  activeLibraryItem: { item: LibraryControlDefinition; size: RibbonControlSize } | null;
  onPick: (value: { item: LibraryControlDefinition; size: RibbonControlSize }) => void;
  onDragEnd: () => void;
}) {
  const [activeHelpType, setActiveHelpType] = useState<string | null>(null);

  return (
    <section className="next-panel next-palette-panel" data-testid="next-palette-panel">
      <div className="next-panel-title">
        <LayoutGrid size={15} />
        <strong>控件库</strong>
      </div>
      {librarySections.map((section) => (
        <div className="next-library-section" key={section.title}>
          <h3>{section.title}</h3>
          {section.items.map((item) => (
            <div className="next-library-row" key={item.type}>
              <div className="library-row-text">
                <div className="library-row-heading">
                  <strong>{item.label}</strong>
                  <span className="library-help">
                    <button
                      type="button"
                      className="library-help-button"
                      aria-label={`${item.label} 使用说明`}
                      onMouseEnter={() => setActiveHelpType(item.type)}
                      onMouseLeave={() => setActiveHelpType((current) => (current === item.type ? null : current))}
                      onFocus={() => setActiveHelpType(item.type)}
                      onBlur={() => setActiveHelpType((current) => (current === item.type ? null : current))}
                    >
                      ?
                    </button>
                    <span
                      className={`library-help-popover ${activeHelpType === item.type ? 'visible' : ''}`}
                    >
                      {getLibraryHelpText(item)}
                    </span>
                  </span>
                </div>
                <span>{item.shortDescription}</span>
              </div>
              <div className="next-library-sizes">
                {item.supportedSizes.map((size) => (
                  <PalettePreview
                    key={`${item.type}-${size}`}
                    item={item}
                    size={size}
                    active={activeLibraryItem?.item.type === item.type && activeLibraryItem.size === size}
                    onPick={onPick}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function PalettePreview({
  item,
  size,
  active,
  onPick,
  onDragEnd,
}: {
  item: LibraryControlDefinition;
  size: RibbonControlSize;
  active: boolean;
  onPick: (value: { item: LibraryControlDefinition; size: RibbonControlSize }) => void;
  onDragEnd: () => void;
}) {
  const footprint = getFootprint(item.type, size);

  return (
    <div className="library-preview-item">
      <button
        draggable
        data-testid={`next-palette-${item.type}-${size}`}
        className={`library-ribbon-preview ${active ? 'active' : ''} size-${size} type-${item.type}`}
        style={{
          '--preview-cols': footprint.w,
          '--preview-rows': footprint.h,
        } as CSSProperties}
        title={`${item.label} / ${SIZE_LABELS[size]} / ${footprintLabel(item.type, size)}`}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', `${item.type}:${size}`);
          onPick({ item, size });
        }}
        onClick={() => onPick({ item, size })}
        onDragEnd={onDragEnd}
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
}: {
  control: RibbonControl | null;
  onUpdate: (controlId: string, patch: Partial<RibbonControl>) => void;
  onDelete: (controlId: string) => void;
}) {
  return (
    <section className="next-panel next-inspector">
      <div className="next-panel-title">
        <FileJson size={15} />
        <strong>属性</strong>
      </div>
      {control ? (
        <div className="next-form">
          <label>
            标题
            <input value={control.caption} onChange={(event) => onUpdate(control.id, { caption: event.target.value })} />
          </label>
          <label>
            首选尺寸
            <select
              value={control.size}
              onChange={(event) => onUpdate(control.id, { size: event.target.value as RibbonControlSize })}
            >
              {control.supportedSizes.map((size) => (
                <option key={size} value={size}>
                  {SIZE_LABELS[size]} {footprintLabel(control.type, size)}
                </option>
              ))}
            </select>
          </label>
          <label>
            提示
            <input value={control.tooltip} onChange={(event) => onUpdate(control.id, { tooltip: event.target.value })} />
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
            <textarea rows={3} value={control.aiNotes} onChange={(event) => onUpdate(control.id, { aiNotes: event.target.value })} />
          </label>
          <button className="danger" onClick={() => onDelete(control.id)}>
            <Trash2 size={14} />
            删除控件
          </button>
        </div>
      ) : (
        <p className="next-muted">选中画布中的控件后编辑属性。</p>
      )}
    </section>
  );
}
