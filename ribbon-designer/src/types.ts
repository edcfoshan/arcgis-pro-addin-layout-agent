export type ControlType =
  | 'button'
  | 'tool'
  | 'splitButton'
  | 'toolPalette'
  | 'menu'
  | 'gallery'
  | 'checkBox'
  | 'comboBox'
  | 'editBox';

export type RibbonControlSize = 'small' | 'middle' | 'large';

export type RibbonPreviewMode = 'Large' | 'Medium' | 'Small' | 'Collapsed';

export type RibbonVerticalAlignment = 'Top' | 'Center';

export type RibbonSubgroupSizeMode =
  | 'AlwaysLarge'
  | 'AlwaysMedium'
  | 'AlwaysSmall'
  | 'Default'
  | 'LargeThenMediumWhenMedium'
  | 'LargeThenMediumWhenSmall'
  | 'LargeThenSmallWhenMedium'
  | 'LargeThenSmallWhenSmall'
  | 'MediumThenSmallWhenMedium'
  | 'MediumThenSmallWhenSmall';

export interface EventBinding {
  id: string;
  event: string;
  action: string;
  target: string;
  payload: string;
}

export interface ControlBehavior {
  commandType: string;
  className: string;
  target: string;
  arguments: Record<string, string>;
}

export interface RibbonControl {
  id: string;
  subgroupId: string;
  type: ControlType;
  caption: string;
  tooltip: string;
  condition: string;
  size: RibbonControlSize;
  supportedSizes: RibbonControlSize[];
  icon: {
    small: string;
    large: string;
  };
  behavior: ControlBehavior;
  eventBindings: EventBinding[];
  aiNotes: string;
  layout?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface RibbonSubgroup {
  id: string;
  groupId: string;
  caption: string;
  sizeMode: RibbonSubgroupSizeMode;
  verticalAlignment: RibbonVerticalAlignment;
  controlIds: string[];
  layout?: {
    row: number;
    columns: number;
    rows: number;
  };
}

export interface RibbonGroup {
  id: string;
  tabId: string;
  caption: string;
  keytip: string;
  launcherButton: boolean;
  sizePriorities: [number, number, number];
  subgroupIds: string[];
}

export interface RibbonTab {
  id: string;
  caption: string;
  keytip: string;
  groupIds: string[];
}

export interface RibbonDocumentMetadata {
  id: string;
  name: string;
  app: 'gispro-ribbon-designer';
  schemaVersion: '1.0';
  lastUpdated: string;
}

export interface RibbonDocument {
  metadata: RibbonDocumentMetadata;
  tabs: RibbonTab[];
  groups: RibbonGroup[];
  subgroups: RibbonSubgroup[];
  controls: RibbonControl[];
}

export type Selection =
  | { kind: 'tab'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'subgroup'; id: string }
  | { kind: 'control'; id: string };

export interface LibraryControlDefinition {
  type: ControlType;
  label: string;
  shortDescription: string;
  supportedSizes: RibbonControlSize[];
  defaultCaption: string;
  defaultTooltip: string;
  defaultBehavior: ControlBehavior;
  defaultAiNotes: string;
  icon: {
    small: string;
    large: string;
  };
}
