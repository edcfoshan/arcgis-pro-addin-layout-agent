import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FolderInput,
  ListTree,
  Pencil,
  Plus,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react';
import './App.css';
import {
  CONTROL_LIBRARY,
  LOCAL_STORAGE_KEY,
  PREVIEW_MODES,
  SIZE_LABELS,
  SUBGROUP_SIZE_MODES,
} from './library';
import {
  cloneDocumentWithTimestamp,
  createAddInTemplate,
  createControlFromType,
  createEmptyDocument,
  createId,
  createMapTemplate,
  getCollapseRank,
  getControl,
  getGroup,
  getSubgroup,
  getSubgroupControls,
  parseImportedDocument,
  resolveRenderedSize,
} from './ribbon';
import type {
  ControlBehavior,
  EventBinding,
  LibraryControlDefinition,
  RibbonControl,
  RibbonControlSize,
  RibbonDocument,
  RibbonGroup,
  RibbonPreviewMode,
  RibbonSubgroup,
  RibbonSubgroupSizeMode,
  Selection,
} from './types';

type ToastTone = 'info' | 'error';
type InspectorMode = 'properties' | 'json';

interface ToastState {
  id: string;
  tone: ToastTone;
  message: string;
}

const TEMPLATE_FACTORIES = {
  blank: createEmptyDocument,
  map: createMapTemplate,
  addin: createAddInTemplate,
} as const;

const INITIAL_DOCUMENT = createAddInTemplate();

const APP_TABS = ['工程', '地图', '插入', '分析', '视图', '编辑', '影像', '共享'];

const PREVIEW_LABELS: Record<RibbonPreviewMode, string> = {
  Large: '宽屏',
  Medium: '标准',
  Small: '紧凑',
  Collapsed: '折叠',
};

const TEMPLATE_LABELS: Record<keyof typeof TEMPLATE_FACTORIES, string> = {
  blank: '空白功能区',
  map: '地图风格',
  addin: '工具箱风格',
};

const SUBGROUP_GRID_COLUMNS = 6;
const SUBGROUP_GRID_ROWS = 3;

const getGridFootprintDimensions = (
  type: RibbonControl['type'],
  size: RibbonControlSize,
): { cols: number; rows: number } => {
  if (size === 'small') return { cols: 1, rows: 1 };
  if (type === 'comboBox' || type === 'editBox') {
    return size === 'large' ? { cols: 4, rows: 1 } : { cols: 3, rows: 1 };
  }
  if (type === 'gallery' || type === 'toolPalette') {
    return size === 'large' ? { cols: 3, rows: 3 } : { cols: 3, rows: 1 };
  }
  if (type === 'menu' || type === 'splitButton') {
    return size === 'large' ? { cols: 2, rows: 2 } : { cols: 2, rows: 1 };
  }
  return size === 'large' ? { cols: 2, rows: 3 } : { cols: 2, rows: 1 };
};

const getGridFootprint = (
  type: RibbonControl['type'],
  size: RibbonControlSize,
) => {
  const { cols, rows } = getGridFootprintDimensions(type, size);
  return `${cols}x${rows}`;
};

const getControlFootprint = (
  control: RibbonControl,
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) =>
  getGridFootprintDimensions(
    control.type,
    resolveRenderedSize(subgroup.sizeMode, previewMode, control.supportedSizes, control.size),
  );

const packGridFootprints = (footprints: { cols: number; rows: number }[]) => {
  const occupied = Array.from({ length: SUBGROUP_GRID_ROWS }, () =>
    Array.from({ length: SUBGROUP_GRID_COLUMNS }, () => false),
  );
  let usedColumns = 0;

  for (const footprint of footprints) {
    if (footprint.cols > SUBGROUP_GRID_COLUMNS || footprint.rows > SUBGROUP_GRID_ROWS) {
      return { fits: false, usedColumns: SUBGROUP_GRID_COLUMNS + 1 };
    }

    let placed = false;
    for (let col = 0; col <= SUBGROUP_GRID_COLUMNS - footprint.cols && !placed; col += 1) {
      for (let row = 0; row <= SUBGROUP_GRID_ROWS - footprint.rows && !placed; row += 1) {
        const canPlace = Array.from({ length: footprint.rows }).every((_, rowOffset) =>
          Array.from({ length: footprint.cols }).every(
            (__, colOffset) => !occupied[row + rowOffset][col + colOffset],
          ),
        );

        if (canPlace) {
          for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
            for (let colOffset = 0; colOffset < footprint.cols; colOffset += 1) {
              occupied[row + rowOffset][col + colOffset] = true;
            }
          }
          usedColumns = Math.max(usedColumns, col + footprint.cols);
          placed = true;
        }
      }
    }

    if (!placed) {
      return { fits: false, usedColumns: SUBGROUP_GRID_COLUMNS + 1 };
    }
  }

  return { fits: true, usedColumns };
};

const getSubgroupUsage = (
  controls: RibbonControl[],
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) => packGridFootprints(controls.map((control) => getControlFootprint(control, subgroup, previewMode)));

const canFitControls = (
  controls: RibbonControl[],
  subgroup: RibbonSubgroup,
  previewMode: RibbonPreviewMode,
) => getSubgroupUsage(controls, subgroup, previewMode).fits;

const LIBRARY_SECTIONS = [
  {
    title: 'Ribbon 命令类',
    items: CONTROL_LIBRARY.filter((item) =>
      ['button', 'tool', 'splitButton', 'toolPalette', 'menu', 'gallery'].includes(item.type),
    ),
  },
  {
    title: '输入与选择控件',
    items: CONTROL_LIBRARY.filter((item) =>
      ['comboBox', 'editBox', 'checkBox'].includes(item.type),
    ),
  },
];

const prettyJson = (doc: RibbonDocument) => JSON.stringify(doc, null, 2);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const copyToClipboard = async (text: string) => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }
  await navigator.clipboard.writeText(text);
};

function App() {
  const [ribbonDoc, setRibbonDoc] = useState<RibbonDocument>(() => {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    return cached ? parseImportedDocument(cached) ?? INITIAL_DOCUMENT : INITIAL_DOCUMENT;
  });
  const [previewMode, setPreviewMode] = useState<RibbonPreviewMode>('Large');
  const [activeTabId, setActiveTabId] = useState<string>(INITIAL_DOCUMENT.tabs[0]?.id ?? '');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [argumentError, setArgumentError] = useState('');
  const [templateChoice, setTemplateChoice] = useState<keyof typeof TEMPLATE_FACTORIES>('addin');
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('properties');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, prettyJson(ribbonDoc));
  }, [ribbonDoc]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const safeActiveTabId = ribbonDoc.tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : ribbonDoc.tabs[0]?.id ?? '';

  const activeTab =
    ribbonDoc.tabs.find((tab) => tab.id === safeActiveTabId) ?? ribbonDoc.tabs[0] ?? null;

  const activeGroups = useMemo(
    () =>
      activeTab
        ? activeTab.groupIds
            .map((groupId) => ribbonDoc.groups.find((group) => group.id === groupId))
            .filter(Boolean) as RibbonGroup[]
        : [],
    [activeTab, ribbonDoc.groups],
  );

  const selectedEntity = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'tab') {
      return ribbonDoc.tabs.find((item) => item.id === selection.id) ?? null;
    }
    if (selection.kind === 'group') {
      return ribbonDoc.groups.find((item) => item.id === selection.id) ?? null;
    }
    if (selection.kind === 'subgroup') {
      return ribbonDoc.subgroups.find((item) => item.id === selection.id) ?? null;
    }
    return ribbonDoc.controls.find((item) => item.id === selection.id) ?? null;
  }, [ribbonDoc, selection]);

  const jsonPreview = useMemo(() => prettyJson(ribbonDoc), [ribbonDoc]);

  const showToast = (message: string, tone: ToastTone = 'info') => {
    setToast({ id: createId('toast'), tone, message });
  };

  const commitDocument = (recipe: (draft: RibbonDocument) => RibbonDocument) => {
    setRibbonDoc((current) => cloneDocumentWithTimestamp(recipe(current)));
  };

  const loadTemplate = (templateKey: keyof typeof TEMPLATE_FACTORIES) => {
    const nextDoc = TEMPLATE_FACTORIES[templateKey]();
    setTemplateChoice(templateKey);
    setRibbonDoc(nextDoc);
    setActiveTabId(nextDoc.tabs[0]?.id ?? '');
    setSelection(nextDoc.tabs[0] ? { kind: 'tab', id: nextDoc.tabs[0].id } : null);
    setPreviewMode('Large');
    setInspectorMode('properties');
    setImportDialogOpen(false);
    showToast('已加载模板');
  };

  const addTab = () => {
    const newTab = {
      id: createId('tab'),
      caption: `新页签 ${ribbonDoc.tabs.length + 1}`,
      keytip: `T${ribbonDoc.tabs.length + 1}`,
      groupIds: [],
    };
    commitDocument((current) => ({
      ...current,
      tabs: [...current.tabs, newTab],
    }));
    setActiveTabId(newTab.id);
    setSelection({ kind: 'tab', id: newTab.id });
    showToast('已新增页签');
  };

  const addGroup = (tabId: string) => {
    const groupId = createId('group');
    const subgroupId = createId('subgroup');
    const group: RibbonGroup = {
      id: groupId,
      tabId,
      caption: `新分组 ${ribbonDoc.groups.length + 1}`,
      keytip: `G${ribbonDoc.groups.length + 1}`,
      launcherButton: false,
      sizePriorities: [20, 60, 100],
      subgroupIds: [subgroupId],
    };
    const subgroup: RibbonSubgroup = {
      id: subgroupId,
      groupId,
      caption: '主子组',
      sizeMode: 'Default',
      verticalAlignment: 'Top',
      controlIds: [],
    };
    commitDocument((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, groupIds: [...tab.groupIds, groupId] } : tab,
      ),
      groups: [...current.groups, group],
      subgroups: [...current.subgroups, subgroup],
    }));
    setSelection({ kind: 'group', id: groupId });
    showToast('已新增分组');
  };

  const addSubgroup = (groupId: string) => {
    const subgroupId = createId('subgroup');
    commitDocument((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, subgroupIds: [...group.subgroupIds, subgroupId] }
          : group,
      ),
      subgroups: [
        ...current.subgroups,
        {
          id: subgroupId,
          groupId,
          caption: `子组 ${current.subgroups.filter((item) => item.groupId === groupId).length + 1}`,
          sizeMode: 'Default',
          verticalAlignment: 'Top',
          controlIds: [],
        },
      ],
    }));
    setSelection({ kind: 'subgroup', id: subgroupId });
    showToast('已新增子组');
  };

  const updateControl = (controlId: string, patch: Partial<RibbonControl>) =>
    commitDocument((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId ? { ...control, ...patch } : control,
      ),
    }));

  const updateBehavior = (controlId: string, patch: Partial<ControlBehavior>) =>
    commitDocument((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? { ...control, behavior: { ...control.behavior, ...patch } }
          : control,
      ),
    }));

  const updateSubgroup = (subgroupId: string, patch: Partial<RibbonSubgroup>) =>
    commitDocument((current) => ({
      ...current,
      subgroups: current.subgroups.map((subgroup) =>
        subgroup.id === subgroupId ? { ...subgroup, ...patch } : subgroup,
      ),
    }));

  const updateGroup = (groupId: string, patch: Partial<RibbonGroup>) =>
    commitDocument((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    }));

  const updateTab = (tabId: string, patch: Partial<RibbonDocument['tabs'][number]>) =>
    commitDocument((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
    }));

  const addEventBinding = (controlId: string) => {
    commitDocument((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? {
              ...control,
              eventBindings: [
                ...control.eventBindings,
                {
                  id: createId('event'),
                  event: 'onClick',
                  action: 'invoke',
                  target: '',
                  payload: '',
                },
              ],
            }
          : control,
      ),
    }));
  };

  const updateEventBinding = (
    controlId: string,
    bindingId: string,
    patch: Partial<EventBinding>,
  ) => {
    commitDocument((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? {
              ...control,
              eventBindings: control.eventBindings.map((binding) =>
                binding.id === bindingId ? { ...binding, ...patch } : binding,
              ),
            }
          : control,
      ),
    }));
  };

  const removeEventBinding = (controlId: string, bindingId: string) => {
    commitDocument((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? {
              ...control,
              eventBindings: control.eventBindings.filter((binding) => binding.id !== bindingId),
            }
          : control,
      ),
    }));
  };

  const duplicateControl = (controlId: string) => {
    const source = getControl(ribbonDoc, controlId);
    if (!source) return;
    const subgroup = getSubgroup(ribbonDoc, source.subgroupId);
    if (!subgroup) return;
    const subgroupControls = getSubgroupControls(ribbonDoc, subgroup);
    if (!canFitControls([...subgroupControls, source], subgroup, previewMode)) {
      showToast(`当前子组已超出 ${SUBGROUP_GRID_COLUMNS}列 x ${SUBGROUP_GRID_ROWS}行，不能继续复制`, 'error');
      return;
    }
    const duplicateId = createId(source.type);
    commitDocument((current) => ({
      ...current,
      controls: [
        ...current.controls,
        {
          ...source,
          id: duplicateId,
          caption: `${source.caption} 副本`,
          eventBindings: source.eventBindings.map((binding) => ({
            ...binding,
            id: createId('event'),
          })),
        },
      ],
      subgroups: current.subgroups.map((item) =>
        item.id === source.subgroupId
          ? { ...item, controlIds: [...item.controlIds, duplicateId] }
          : item,
      ),
    }));
    setSelection({ kind: 'control', id: duplicateId });
    showToast('已复制控件');
  };

  const deleteControl = (controlId: string) => {
    commitDocument((current) => {
      const control = getControl(current, controlId);
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
    setSelection(null);
    showToast('控件已删除');
  };

  const deleteSubgroup = (subgroupId: string) => {
    commitDocument((current) => {
      const subgroup = getSubgroup(current, subgroupId);
      if (!subgroup) return current;
      return {
        ...current,
        controls: current.controls.filter((control) => control.subgroupId !== subgroupId),
        subgroups: current.subgroups.filter((item) => item.id !== subgroupId),
        groups: current.groups.map((group) =>
          group.id === subgroup.groupId
            ? { ...group, subgroupIds: group.subgroupIds.filter((id) => id !== subgroupId) }
            : group,
        ),
      };
    });
    setSelection(null);
    showToast('子组已删除');
  };

  const deleteGroup = (groupId: string) => {
    commitDocument((current) => {
      const group = getGroup(current, groupId);
      if (!group) return current;
      const subgroupIds = new Set(group.subgroupIds);
      return {
        ...current,
        groups: current.groups.filter((item) => item.id !== groupId),
        subgroups: current.subgroups.filter((item) => !subgroupIds.has(item.id)),
        controls: current.controls.filter((item) => !subgroupIds.has(item.subgroupId)),
        tabs: current.tabs.map((tab) =>
          tab.id === group.tabId ? { ...tab, groupIds: tab.groupIds.filter((id) => id !== groupId) } : tab,
        ),
      };
    });
    setSelection(null);
    showToast('分组已删除');
  };

  const deleteTab = (tabId: string) => {
    if (ribbonDoc.tabs.length <= 1) {
      showToast('至少保留一个页签', 'error');
      return;
    }
    commitDocument((current) => {
      const tab = current.tabs.find((item) => item.id === tabId);
      if (!tab) return current;
      const groupIds = new Set(tab.groupIds);
      const subgroupIds = new Set(
        current.subgroups.filter((item) => groupIds.has(item.groupId)).map((item) => item.id),
      );
      return {
        ...current,
        tabs: current.tabs.filter((item) => item.id !== tabId),
        groups: current.groups.filter((item) => !groupIds.has(item.id)),
        subgroups: current.subgroups.filter((item) => !subgroupIds.has(item.id)),
        controls: current.controls.filter((item) => !subgroupIds.has(item.subgroupId)),
      };
    });
    if (safeActiveTabId === tabId) {
      setActiveTabId(ribbonDoc.tabs.find((item) => item.id !== tabId)?.id ?? '');
    }
    setSelection(null);
    showToast('页签已删除');
  };

  const handleArgumentsChange = (controlId: string, raw: string) => {
    try {
      const parsed = raw.trim() ? (JSON.parse(raw) as Record<string, string>) : {};
      updateBehavior(controlId, { arguments: parsed });
      setArgumentError('');
    } catch {
      setArgumentError('arguments 必须是合法的 JSON 对象');
    }
  };

  const resetWorkspace = () => {
    const fresh = createAddInTemplate();
    setRibbonDoc(fresh);
    setActiveTabId(fresh.tabs[0]?.id ?? '');
    setSelection(null);
    setPreviewMode('Large');
    setInspectorMode('properties');
    showToast('已重置为默认模板');
  };

  const exportJson = () => {
    const blob = new Blob([jsonPreview], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = `${ribbonDoc.metadata.name.replace(/\s+/g, '-').toLowerCase() || 'ribbon'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('JSON 已下载');
  };

  const importJson = (raw: string) => {
    const parsed = parseImportedDocument(raw);
    if (!parsed) {
      showToast('导入失败，JSON 结构不符合当前原型要求', 'error');
      return;
    }
    setRibbonDoc(parsed);
    setActiveTabId(parsed.tabs[0]?.id ?? '');
    setSelection(null);
    setInspectorMode('properties');
    setImportDialogOpen(false);
    setImportValue('');
    showToast('JSON 已导入');
  };

  const readImportFile = async (file: File) => {
    const raw = await file.text();
    setImportValue(raw);
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.origin === 'library') {
      const definition = data.definition as LibraryControlDefinition;
      const preferredSize = data.preferredSize as RibbonControlSize;
      setDragLabel(
        `拖入 ${definition.label} · ${SIZE_LABELS[preferredSize]} ${getGridFootprint(definition.type, preferredSize)}`,
      );
      return;
    }
    if (data?.origin === 'canvas') {
      const control = getControl(ribbonDoc, data.controlId as string);
      setDragLabel(control ? `移动 ${control.caption}` : '移动控件');
      return;
    }
    setDragLabel(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;

    const getTarget = () => {
      if (overData.type === 'subgroup') {
        return {
          subgroupId: overData.subgroupId as string,
          index:
            ribbonDoc.subgroups.find((item) => item.id === overData.subgroupId)?.controlIds.length ?? 0,
        };
      }
      if (overData.type === 'canvas-control') {
        const subgroup = getSubgroup(ribbonDoc, overData.subgroupId as string);
        return {
          subgroupId: overData.subgroupId as string,
          index: subgroup?.controlIds.findIndex((id) => id === overData.controlId) ?? 0,
        };
      }
      return null;
    };

    const target = getTarget();
    if (!target) return;

    if (activeData.origin === 'library') {
      const subgroup = getSubgroup(ribbonDoc, target.subgroupId);
      if (!subgroup) return;

      const definition = activeData.definition as LibraryControlDefinition;
      const preferredSize = dataAsSize(activeData.preferredSize);
      const nextControl = createControlFromType(definition.type, target.subgroupId, {
        size: preferredSize,
      });
      const targetControls = getSubgroupControls(ribbonDoc, subgroup);
      const nextControls = [
        ...targetControls.slice(0, target.index),
        nextControl,
        ...targetControls.slice(target.index),
      ];
      if (!canFitControls(nextControls, subgroup, previewMode)) {
        showToast(
          `放不下：当前子组最多 ${SUBGROUP_GRID_COLUMNS}列 x ${SUBGROUP_GRID_ROWS}行，请换子组或改小尺寸`,
          'error',
        );
        return;
      }

      commitDocument((current) => ({
        ...current,
        controls: [...current.controls, nextControl],
        subgroups: current.subgroups.map((item) =>
          item.id === target.subgroupId
            ? {
                ...item,
                controlIds: [
                  ...item.controlIds.slice(0, target.index),
                  nextControl.id,
                  ...item.controlIds.slice(target.index),
                ],
              }
            : item,
        ),
      }));
      setSelection({ kind: 'control', id: nextControl.id });
      showToast(`已加入 ${definition.label}`);
      return;
    }

    if (activeData.origin === 'canvas') {
      const sourceControlId = activeData.controlId as string;
      const sourceSubgroupId = activeData.subgroupId as string;

      if (sourceSubgroupId === target.subgroupId) {
        const subgroup = getSubgroup(ribbonDoc, sourceSubgroupId);
        if (!subgroup) return;
        const oldIndex = subgroup.controlIds.findIndex((id) => id === sourceControlId);
        const newIndex = subgroup.controlIds.findIndex((id) => id === over.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
        commitDocument((current) => ({
          ...current,
          subgroups: current.subgroups.map((item) =>
            item.id === sourceSubgroupId
              ? { ...item, controlIds: arrayMove(item.controlIds, oldIndex, newIndex) }
              : item,
          ),
        }));
        return;
      }

      const targetSubgroup = getSubgroup(ribbonDoc, target.subgroupId);
      if (!targetSubgroup) return;
      const sourceControl = getControl(ribbonDoc, sourceControlId);
      if (!sourceControl) return;
      const targetControls = getSubgroupControls(ribbonDoc, targetSubgroup).filter(
        (control) => control.id !== sourceControlId,
      );
      const movedControl = { ...sourceControl, subgroupId: target.subgroupId };
      const nextControls = [
        ...targetControls.slice(0, target.index),
        movedControl,
        ...targetControls.slice(target.index),
      ];
      if (!canFitControls(nextControls, targetSubgroup, previewMode)) {
        showToast(
          `目标子组放不下：最多 ${SUBGROUP_GRID_COLUMNS}列 x ${SUBGROUP_GRID_ROWS}行`,
          'error',
        );
        return;
      }

      commitDocument((current) => ({
        ...current,
        controls: current.controls.map((control) =>
          control.id === sourceControlId ? { ...control, subgroupId: target.subgroupId } : control,
        ),
        subgroups: current.subgroups.map((subgroup) => {
          if (subgroup.id === sourceSubgroupId) {
            return { ...subgroup, controlIds: subgroup.controlIds.filter((id) => id !== sourceControlId) };
          }
          if (subgroup.id === target.subgroupId) {
            return {
              ...subgroup,
              controlIds: [
                ...subgroup.controlIds.slice(0, target.index),
                sourceControlId,
                ...subgroup.controlIds.slice(target.index),
              ],
            };
          }
          return subgroup;
        }),
      }));
      setSelection({ kind: 'control', id: sourceControlId });
    }
  };

  const selectedTab =
    selection?.kind === 'tab' && selectedEntity && 'groupIds' in selectedEntity ? selectedEntity : null;
  const selectedGroup =
    selection?.kind === 'group' && selectedEntity && 'subgroupIds' in selectedEntity ? selectedEntity : null;
  const selectedSubgroup =
    selection?.kind === 'subgroup' && selectedEntity && 'sizeMode' in selectedEntity ? selectedEntity : null;
  const selectedControl =
    selection?.kind === 'control' && selectedEntity && 'behavior' in selectedEntity ? selectedEntity : null;

  return (
    <div className="designer-shell">
      <header className="designer-header">
        <div className="pro-window-strip">
          <div className="quick-access">
            <span className="quick-dot" />
            <span className="quick-line" />
            <span className="quick-line short" />
          </div>
          <div className="title-block">
            <p className="small-note">ArcGIS Pro Ribbon 设计器</p>
            <h1>{ribbonDoc.metadata.name}</h1>
          </div>
          <div className="window-controls">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="header-actions">
          <div className="inline-select">
            <span>模板</span>
            <select value={templateChoice} onChange={(event) => loadTemplate(event.target.value as keyof typeof TEMPLATE_FACTORIES)}>
              <option value="blank">{TEMPLATE_LABELS.blank}</option>
              <option value="map">{TEMPLATE_LABELS.map}</option>
              <option value="addin">{TEMPLATE_LABELS.addin}</option>
            </select>
          </div>
          <button className="toolbar-button" onClick={resetWorkspace}>
            重置
          </button>
          <button className="toolbar-button" onClick={() => setImportDialogOpen(true)}>
            <FolderInput size={15} />
            导入 JSON
          </button>
          <button
            className="toolbar-button"
            onClick={() =>
              void copyToClipboard(jsonPreview)
                .then(() => showToast('JSON 已复制到剪贴板'))
                .catch(() => showToast('当前环境不支持剪贴板', 'error'))
            }
          >
            <Copy size={15} />
            复制 JSON
          </button>
          <button className="toolbar-button primary" onClick={exportJson}>
            <Download size={15} />
            导出 JSON
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <section className="ribbon-stage">
          <div className="pro-tab-row">
            {APP_TABS.map((label) => (
              <button key={label} className="pro-tab base-tab" type="button">
                {label}
              </button>
            ))}
              {ribbonDoc.tabs.map((tab) => (
              <button
                key={tab.id}
                className={`pro-tab custom-tab ${tab.id === safeActiveTabId ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setActiveTabId(tab.id);
                  setSelection({ kind: 'tab', id: tab.id });
                }}
              >
                {tab.caption}
              </button>
            ))}
            <button className="tab-add-button" type="button" onClick={addTab}>
              <Plus size={14} />
            </button>
          </div>

          <div className="stage-toolbar">
            <div className="stage-toolbar-left">
              <button className="toolbar-button slim" onClick={() => activeTab && addGroup(activeTab.id)} disabled={!activeTab}>
                <Plus size={14} />
                新增分组
              </button>
              <span className="stage-meta">
                架构: Tab / Group / Subgroup / Control · 更新时间: {formatDate(ribbonDoc.metadata.lastUpdated)}
              </span>
            </div>
            <div className="preview-switch">
              {PREVIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  className={previewMode === mode ? 'is-active' : ''}
                  onClick={() => setPreviewMode(mode)}
                >
                  {PREVIEW_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="canvas-workbench">
            <div className="canvas-area">
              <div className="canvas-area-title">
                <span>功能区画布</span>
                  <small>最小按钮 = 1x1；每个子组最多 6列 x 3行</small>
              </div>
              <div className="ribbon-canvas-shell">
                <div className={`ribbon-canvas preview-${previewMode.toLowerCase()}`}>
                  {activeGroups.length === 0 ? (
                    <div className="canvas-empty">当前页签还没有分组，请先新增分组，然后从右侧组件库拖控件进来。</div>
                  ) : (
                    activeGroups.map((group) => {
                      const subgroups = group.subgroupIds
                        .map((subgroupId) => ribbonDoc.subgroups.find((item) => item.id === subgroupId))
                        .filter(Boolean) as RibbonSubgroup[];
                      return (
                        <RibbonGroupView
                          key={group.id}
                          ribbonDoc={ribbonDoc}
                          group={group}
                          subgroups={subgroups}
                          previewMode={previewMode}
                          selection={selection}
                          onSelect={setSelection}
                          onAddSubgroup={addSubgroup}
                          onDeleteGroup={deleteGroup}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <aside className="palette-rail">
              <div className="palette-header">
                <div>
                  <p className="small-note">组件库</p>
                  <h2>按分组拖入画布</h2>
                </div>
                <span className="palette-tip">拖到左侧网格槽位，自动吸附到对应比例。</span>
              </div>
              <div className="palette-sections">
                {LIBRARY_SECTIONS.map((section) => (
                  <div key={section.title} className="palette-section">
                    <div className="palette-section-title">{section.title}</div>
                    <div className="palette-rows">
                      {section.items.map((item) => (
                        <PaletteRow key={item.type} item={item} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="inspector-layout">
          <aside className="structure-panel">
            <div className="panel-header">
              <div className="panel-title">
                <ListTree size={14} />
                当前结构
              </div>
              <span className="panel-chip">{ribbonDoc.controls.length} 个控件</span>
            </div>
            <div className="structure-grid">
              <div className="metric-box">
                <span>页签</span>
                <strong>{ribbonDoc.tabs.length}</strong>
              </div>
              <div className="metric-box">
                <span>分组</span>
                <strong>{ribbonDoc.groups.length}</strong>
              </div>
              <div className="metric-box">
                <span>子组</span>
                <strong>{ribbonDoc.subgroups.length}</strong>
              </div>
              <div className="metric-box">
                <span>控件</span>
                <strong>{ribbonDoc.controls.length}</strong>
              </div>
            </div>
            <div className="outline-list">
              {ribbonDoc.tabs.map((tab) => (
                <div key={tab.id} className="outline-item">
                  <strong>{tab.caption}</strong>
                  <span>{tab.groupIds.length} 个分组</span>
                </div>
              ))}
            </div>
          </aside>

          <section className="inspector-panel">
            <div className="panel-header">
              <div className="panel-title">
                <Settings2 size={14} />
                属性与输出
              </div>
              <div className="inspector-tabs">
                <button className={inspectorMode === 'properties' ? 'is-active' : ''} onClick={() => setInspectorMode('properties')}>
                  属性
                </button>
                <button className={inspectorMode === 'json' ? 'is-active' : ''} onClick={() => setInspectorMode('json')}>
                  <FileJson size={14} />
                  JSON
                </button>
              </div>
            </div>

            <div className="inspector-body">
              {inspectorMode === 'properties' ? (
                <>
                  {!selection || !selectedEntity ? (
                    <div className="placeholder-panel">选择上方功能区中的页签、分组、子组或控件后，这里会显示对应属性。</div>
                  ) : null}

                  {selectedTab ? (
                    <section className="form-section">
                      <h3>页签属性</h3>
                      <label>
                        名称
                        <input value={selectedTab.caption} onChange={(event) => updateTab(selectedTab.id, { caption: event.target.value })} />
                      </label>
                      <label>
                        KeyTip
                        <input value={selectedTab.keytip} onChange={(event) => updateTab(selectedTab.id, { keytip: event.target.value })} />
                      </label>
                      <div className="form-actions">
                        <button className="toolbar-button slim" onClick={() => addGroup(selectedTab.id)}>
                          <Plus size={14} />
                          新增分组
                        </button>
                        <button className="toolbar-button slim danger" onClick={() => deleteTab(selectedTab.id)}>
                          <Trash2 size={14} />
                          删除页签
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {selectedGroup ? (
                    <section className="form-section">
                      <h3>分组属性</h3>
                      <label>
                        分组名称
                        <input value={selectedGroup.caption} onChange={(event) => updateGroup(selectedGroup.id, { caption: event.target.value })} />
                      </label>
                      <div className="form-grid">
                        <label>
                          KeyTip
                          <input value={selectedGroup.keytip} onChange={(event) => updateGroup(selectedGroup.id, { keytip: event.target.value })} />
                        </label>
                        <label>
                          sizePriorities
                          <input
                            value={selectedGroup.sizePriorities.join(', ')}
                            onChange={(event) => {
                              const numbers = event.target.value
                                .split(',')
                                .map((value) => Number(value.trim()))
                                .filter((value) => !Number.isNaN(value));
                              if (numbers.length === 3) {
                                updateGroup(selectedGroup.id, {
                                  sizePriorities: [numbers[0], numbers[1], numbers[2]],
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={selectedGroup.launcherButton}
                          onChange={(event) => updateGroup(selectedGroup.id, { launcherButton: event.target.checked })}
                        />
                        显示右下角启动器占位
                      </label>
                      <div className="form-actions">
                        <button className="toolbar-button slim" onClick={() => addSubgroup(selectedGroup.id)}>
                          <Plus size={14} />
                          新增子组
                        </button>
                        <button className="toolbar-button slim danger" onClick={() => deleteGroup(selectedGroup.id)}>
                          <Trash2 size={14} />
                          删除分组
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {selectedSubgroup ? (
                    <section className="form-section">
                      <h3>子组属性</h3>
                      <label>
                        子组名称
                        <input value={selectedSubgroup.caption} onChange={(event) => updateSubgroup(selectedSubgroup.id, { caption: event.target.value })} />
                      </label>
                      <div className="form-grid">
                        <label>
                          缩放策略
                          <select
                            value={selectedSubgroup.sizeMode}
                            onChange={(event) =>
                              updateSubgroup(selectedSubgroup.id, {
                                sizeMode: event.target.value as RibbonSubgroupSizeMode,
                              })
                            }
                          >
                            {SUBGROUP_SIZE_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          垂直对齐
                          <select
                            value={selectedSubgroup.verticalAlignment}
                            onChange={(event) =>
                              updateSubgroup(selectedSubgroup.id, {
                                verticalAlignment: event.target.value as RibbonSubgroup['verticalAlignment'],
                              })
                            }
                          >
                            <option value="Top">Top</option>
                            <option value="Center">Center</option>
                          </select>
                        </label>
                      </div>
                      <button className="toolbar-button slim danger" onClick={() => deleteSubgroup(selectedSubgroup.id)}>
                        <Trash2 size={14} />
                        删除子组
                      </button>
                    </section>
                  ) : null}

                  {selectedControl ? (
                    <section className="form-section">
                      <h3>控件属性</h3>
                      <label>
                        标题
                        <input value={selectedControl.caption} onChange={(event) => updateControl(selectedControl.id, { caption: event.target.value })} />
                      </label>
                      <div className="form-grid">
                        <label>
                          提示
                          <input value={selectedControl.tooltip} onChange={(event) => updateControl(selectedControl.id, { tooltip: event.target.value })} />
                        </label>
                        <label>
                          条件
                          <input value={selectedControl.condition} onChange={(event) => updateControl(selectedControl.id, { condition: event.target.value })} />
                        </label>
                      </div>
                      <label>
                        首选尺寸
                        <select
                          value={selectedControl.size}
                          onChange={(event) =>
                            updateControl(selectedControl.id, {
                              size: event.target.value as RibbonControl['size'],
                            })
                          }
                        >
                          {selectedControl.supportedSizes.map((size) => (
                            <option key={size} value={size}>
                              {SIZE_LABELS[size]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="form-grid">
                        <label>
                          commandType
                          <input value={selectedControl.behavior.commandType} onChange={(event) => updateBehavior(selectedControl.id, { commandType: event.target.value })} />
                        </label>
                        <label>
                          className
                          <input value={selectedControl.behavior.className} onChange={(event) => updateBehavior(selectedControl.id, { className: event.target.value })} />
                        </label>
                      </div>
                      <label>
                        target
                        <input value={selectedControl.behavior.target} onChange={(event) => updateBehavior(selectedControl.id, { target: event.target.value })} />
                      </label>
                      <label>
                        arguments（JSON）
                        <textarea
                          key={`args-${selectedControl.id}`}
                          rows={4}
                          defaultValue={JSON.stringify(selectedControl.behavior.arguments, null, 2)}
                          onBlur={(event) => handleArgumentsChange(selectedControl.id, event.target.value)}
                        />
                      </label>
                      {argumentError ? <p className="error-text">{argumentError}</p> : null}
                      <label>
                        AI 备注
                        <textarea value={selectedControl.aiNotes} rows={3} onChange={(event) => updateControl(selectedControl.id, { aiNotes: event.target.value })} />
                      </label>

                      <div className="event-panel">
                        <div className="event-panel-header">
                          <h4>事件绑定</h4>
                          <button className="toolbar-button slim" onClick={() => addEventBinding(selectedControl.id)}>
                            <Plus size={14} />
                            新增事件
                          </button>
                        </div>
                        {selectedControl.eventBindings.length === 0 ? (
                          <p className="muted-text">当前还没有事件绑定。</p>
                        ) : (
                          selectedControl.eventBindings.map((binding) => (
                            <div key={binding.id} className="event-item">
                              <div className="form-grid">
                                <label>
                                  event
                                  <input
                                    value={binding.event}
                                    onChange={(event) => updateEventBinding(selectedControl.id, binding.id, { event: event.target.value })}
                                  />
                                </label>
                                <label>
                                  action
                                  <input
                                    value={binding.action}
                                    onChange={(event) => updateEventBinding(selectedControl.id, binding.id, { action: event.target.value })}
                                  />
                                </label>
                              </div>
                              <label>
                                target
                                <input value={binding.target} onChange={(event) => updateEventBinding(selectedControl.id, binding.id, { target: event.target.value })} />
                              </label>
                              <label>
                                payload
                                <input value={binding.payload} onChange={(event) => updateEventBinding(selectedControl.id, binding.id, { payload: event.target.value })} />
                              </label>
                              <button className="toolbar-button slim danger" onClick={() => removeEventBinding(selectedControl.id, binding.id)}>
                                <Trash2 size={14} />
                                删除事件
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="form-actions">
                        <button className="toolbar-button slim" onClick={() => duplicateControl(selectedControl.id)}>
                          <Copy size={14} />
                          复制控件
                        </button>
                        <button className="toolbar-button slim danger" onClick={() => deleteControl(selectedControl.id)}>
                          <Trash2 size={14} />
                          删除控件
                        </button>
                      </div>
                    </section>
                  ) : null}
                </>
              ) : (
                <section className="json-section">
                  <textarea className="json-preview" value={jsonPreview} readOnly rows={24} />
                </section>
              )}
            </div>
          </section>
        </section>

        <DragOverlay>{dragLabel ? <div className="drag-overlay">{dragLabel}</div> : null}</DragOverlay>
      </DndContext>

      {importDialogOpen ? (
        <div className="modal-backdrop" onClick={() => setImportDialogOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>导入 Ribbon JSON</h3>
              <button className="toolbar-button slim" onClick={() => setImportDialogOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-tools">
              <button className="toolbar-button slim" onClick={() => fileInputRef.current?.click()}>
                <FolderInput size={14} />
                从文件读取
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void readImportFile(file);
                  }
                }}
              />
            </div>
            <textarea
              rows={16}
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
              placeholder="把导出的 JSON 粘贴到这里，或者使用上面的按钮导入。"
            />
            <div className="modal-footer">
              <button className="toolbar-button slim" onClick={() => setImportValue(jsonPreview)}>
                载入当前 JSON
              </button>
              <button className="toolbar-button primary" onClick={() => importJson(importValue)}>
                应用导入
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.tone}`}>{toast.message}</div> : null}
    </div>
  );
}

function PaletteRow({ item }: { item: LibraryControlDefinition }) {
  return (
    <div className="palette-row">
      <div className="palette-row-header">
        <strong>{item.label}</strong>
        <span>{item.shortDescription}</span>
      </div>
      <div className="palette-size-strip">
        {item.supportedSizes.map((size) => (
          <PaletteVariant key={`${item.type}-${size}`} item={item} preferredSize={size} />
        ))}
      </div>
    </div>
  );
}

function PaletteVariant({
  item,
  preferredSize,
}: {
  item: LibraryControlDefinition;
  preferredSize: RibbonControlSize;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-${item.type}-${preferredSize}`,
    data: {
      origin: 'library',
      definition: item,
      preferredSize,
    },
  });

  return (
    <div className="palette-variant-wrap">
      <span className="size-tag">
        {SIZE_LABELS[preferredSize]} {getGridFootprint(item.type, preferredSize)}
      </span>
      <button
        ref={setNodeRef}
        data-testid={`palette-${item.type}-${preferredSize}`}
        className={`palette-command size-${preferredSize} type-${item.type} ${isDragging ? 'is-dragging' : ''}`}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...listeners}
        {...attributes}
      >
        <ControlMock
          type={item.type}
          caption={item.label}
          displaySize={preferredSize}
          mode="palette"
        />
      </button>
    </div>
  );
}

function RibbonGroupView({
  ribbonDoc,
  group,
  subgroups,
  previewMode,
  selection,
  onSelect,
  onAddSubgroup,
  onDeleteGroup,
}: {
  ribbonDoc: RibbonDocument;
  group: RibbonGroup;
  subgroups: RibbonSubgroup[];
  previewMode: RibbonPreviewMode;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onAddSubgroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  return (
    <section
      className={`ribbon-group ${selection?.kind === 'group' && selection.id === group.id ? 'is-selected' : ''}`}
      onClick={() => onSelect({ kind: 'group', id: group.id })}
    >
      <div className="group-tools">
        <button
          className="group-tool-button"
          title="新增子组"
          onClick={(event) => {
            event.stopPropagation();
            onAddSubgroup(group.id);
          }}
        >
          <Plus size={12} />
        </button>
        <button
          className="group-tool-button danger"
          title="删除分组"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteGroup(group.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {previewMode === 'Collapsed' ? (
        <div className="collapsed-group">
          <div className="collapsed-icon">组</div>
          <div className="collapsed-meta">
            <strong>{group.caption}</strong>
            <span>优先级 {getCollapseRank(group.sizePriorities)}</span>
          </div>
        </div>
      ) : (
        <div className="group-content">
          {subgroups.map((subgroup) => (
            <RibbonSubgroupView
              key={subgroup.id}
              ribbonDoc={ribbonDoc}
              subgroup={subgroup}
              previewMode={previewMode}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      <div className="group-caption-row">
        <span>{group.caption}</span>
        {group.launcherButton ? <span className="launcher-marker">↗</span> : null}
      </div>
    </section>
  );
}

function RibbonSubgroupView({
  ribbonDoc,
  subgroup,
  previewMode,
  selection,
  onSelect,
}: {
  ribbonDoc: RibbonDocument;
  subgroup: RibbonSubgroup;
  previewMode: RibbonPreviewMode;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: subgroup.id,
    data: { type: 'subgroup', subgroupId: subgroup.id },
  });
  const controls = getSubgroupControls(ribbonDoc, subgroup);
  const usage = getSubgroupUsage(controls, subgroup, previewMode);

  return (
    <div
      ref={setNodeRef}
      data-testid={`drop-${subgroup.id}`}
      className={`ribbon-subgroup ${subgroup.verticalAlignment === 'Center' ? 'align-center' : 'align-top'} ${isOver ? 'is-over' : ''} ${selection?.kind === 'subgroup' && selection.id === subgroup.id ? 'is-selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect({ kind: 'subgroup', id: subgroup.id });
      }}
    >
      <div className="subgroup-limit-row">
        <span>{subgroup.caption}</span>
        <strong>
          {usage.usedColumns}/{SUBGROUP_GRID_COLUMNS}列 · {SUBGROUP_GRID_ROWS}行高
        </strong>
      </div>
      <div className="subgroup-ruler" aria-hidden="true">
        {Array.from({ length: SUBGROUP_GRID_COLUMNS }).map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      <SortableContext items={subgroup.controlIds} strategy={verticalListSortingStrategy}>
        <div className="subgroup-command-list">
          {controls.length === 0 ? (
            <div className="empty-subgroup">拖到这里</div>
          ) : (
            controls.map((control) => (
              <RibbonCommandView
                key={control.id}
                control={control}
                subgroup={subgroup}
                previewMode={previewMode}
                selection={selection}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function RibbonCommandView({
  control,
  subgroup,
  previewMode,
  selection,
  onSelect,
}: {
  control: RibbonControl;
  subgroup: RibbonSubgroup;
  previewMode: RibbonPreviewMode;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: control.id,
    data: {
      type: 'canvas-control',
      origin: 'canvas',
      controlId: control.id,
      subgroupId: subgroup.id,
    },
  });

  const renderedSize = resolveRenderedSize(
    subgroup.sizeMode,
    previewMode,
    control.supportedSizes,
    control.size,
  );

  return (
    <button
      ref={setNodeRef}
      data-testid={`control-${control.id}`}
      className={`ribbon-command size-${renderedSize} type-${control.type} ${selection?.kind === 'control' && selection.id === control.id ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect({ kind: 'control', id: control.id });
      }}
      {...listeners}
      {...attributes}
    >
      <ControlMock
        type={control.type}
        caption={control.caption}
        displaySize={renderedSize}
        mode="canvas"
      />
    </button>
  );
}

function ControlMock({
  type,
  caption,
  displaySize,
  mode,
}: {
  type: RibbonControl['type'];
  caption: string;
  displaySize: RibbonControlSize;
  mode: 'palette' | 'canvas';
}) {
  const className = `control-mock ${mode} size-${displaySize} type-${type}`;
  const title = displaySize === 'small' && caption.length > 4 ? `${caption.slice(0, 4)}…` : caption;

  if (type === 'comboBox') {
    return (
      <div className={className}>
        <div className="combo-shell">
          <span>{title}</span>
          <ChevronDown size={12} />
        </div>
      </div>
    );
  }

  if (type === 'editBox') {
    return (
      <div className={className}>
        <div className="edit-shell">
          <span>{displaySize === 'large' ? caption : '输入值'}</span>
        </div>
      </div>
    );
  }

  if (type === 'checkBox') {
    return (
      <div className={className}>
        <div className="checkbox-shell">
          <span className="checkbox-box">
            <Check size={10} />
          </span>
          <span className="checkbox-label">{title}</span>
        </div>
      </div>
    );
  }

  if (type === 'gallery') {
    return (
      <div className={className}>
        <div className="gallery-grid">
          {Array.from({ length: displaySize === 'large' ? 8 : 4 }).map((_, index) => (
            <span key={index} className={`gallery-cell tone-${index % 4}`} />
          ))}
        </div>
        {displaySize !== 'small' ? <div className="mock-label">{title}</div> : null}
      </div>
    );
  }

  if (type === 'toolPalette') {
    return (
      <div className={className}>
        <div className="palette-grid">
          <span className="palette-dot" />
          <span className="palette-line" />
          <span className="palette-shape pentagon" />
          <span className="palette-shape circle" />
        </div>
        {displaySize !== 'small' ? <div className="mock-label">{title}</div> : null}
      </div>
    );
  }

  if (type === 'menu') {
    return (
      <div className={className}>
        <div className="menu-shell">
          <div className="menu-button-line">
            <span>{title}</span>
            <ChevronDown size={12} />
          </div>
          {displaySize !== 'small' ? (
            <div className="menu-list">
              <span>命令一</span>
              <span>命令二</span>
              <span>更多…</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (type === 'splitButton') {
    return (
      <div className={className}>
        <div className="split-shell">
          <div className="split-main">
            <span className="stack-icon">
              <span />
              <span />
              <span />
            </span>
          </div>
          <div className="split-arrow">
            <ChevronDown size={12} />
          </div>
        </div>
        {displaySize !== 'small' ? <div className="mock-label">{title}</div> : null}
      </div>
    );
  }

  if (type === 'tool') {
    return (
      <div className={className}>
        <div className="tool-shell">
          <span className="tool-selected">
            <Square size={14} />
          </span>
          {displaySize !== 'small' ? (
            <>
              <span className="tool-dashed" />
              <span className="tool-pencil">
                <Pencil size={12} />
              </span>
            </>
          ) : null}
        </div>
        {displaySize !== 'small' ? <div className="mock-label">{title}</div> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="button-shell">
        <span className="button-icon" />
      </div>
      {displaySize !== 'small' ? <div className="mock-label">{title}</div> : null}
    </div>
  );
}

function dataAsSize(value: unknown): RibbonControlSize {
  if (value === 'small' || value === 'middle' || value === 'large') {
    return value;
  }
  return 'large';
}

export default App;
