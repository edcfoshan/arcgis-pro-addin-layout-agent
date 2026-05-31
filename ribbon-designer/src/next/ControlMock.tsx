import {
  Check,
  ChevronDown,
  Circle,
  Database,
  Diamond,
  FileText,
  FolderPlus,
  Layers,
  MousePointer2,
  PanelTop,
  Pencil,
  SquareDashedMousePointer,
  Table2,
} from 'lucide-react';
import type { RibbonControl, RibbonControlSize } from '../types';

const iconSize = (size: RibbonControlSize) => (size === 'large' ? 32 : 16);

function ProIcon({ type, size }: { type: RibbonControl['type']; size: RibbonControlSize }) {
  const pixels = iconSize(size);
  const className = `pro-icon type-${type} size-${size}`;

  if (type === 'button') {
    return (
      <span className={className}>
        <FolderPlus size={pixels} strokeWidth={1.7} />
      </span>
    );
  }
  if (type === 'tool') {
    return (
      <span className={className}>
        <MousePointer2 size={pixels} strokeWidth={1.7} />
      </span>
    );
  }
  if (type === 'splitButton') {
    return (
      <span className={className}>
        <Layers size={pixels} strokeWidth={1.7} />
      </span>
    );
  }
  if (type === 'toolPalette') {
    return (
      <span className={className}>
        <SquareDashedMousePointer size={pixels} strokeWidth={1.6} />
      </span>
    );
  }
  if (type === 'menu') {
    return (
      <span className={className}>
        <PanelTop size={pixels} strokeWidth={1.7} />
      </span>
    );
  }
  if (type === 'gallery') {
    return (
      <span className={className}>
        <Table2 size={pixels} strokeWidth={1.6} />
      </span>
    );
  }
  if (type === 'comboBox') {
    return (
      <span className={className}>
        <Database size={pixels} strokeWidth={1.6} />
      </span>
    );
  }
  if (type === 'editBox') {
    return (
      <span className={className}>
        <FileText size={pixels} strokeWidth={1.6} />
      </span>
    );
  }
  if (type === 'checkBox') {
    return (
      <span className={className}>
        <Check size={pixels} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className={className}>
      <Diamond size={pixels} strokeWidth={1.7} />
    </span>
  );
}

export function ControlMock({
  type,
  caption,
  size,
  mode = 'canvas',
}: {
  type: RibbonControl['type'];
  caption: string;
  size: RibbonControlSize;
  mode?: 'canvas' | 'library';
}) {
  const label = size === 'small' && caption.length > 3 ? caption.slice(0, 3) : caption;
  const className = `next-control-mock mode-${mode} next-${type} size-${size}`;

  if (type === 'comboBox') {
    return (
      <div className={className}>
        <div className="pro-input-line">
          <span>{label}</span>
          <ChevronDown size={12} />
        </div>
      </div>
    );
  }

  if (type === 'editBox') {
    return (
      <div className={className}>
        <div className="pro-input-line">
          <span>{label}</span>
        </div>
      </div>
    );
  }

  if (type === 'checkBox') {
    return (
      <div className={className}>
        <span className="pro-check-box">
          <Check size={10} />
        </span>
        {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      </div>
    );
  }

  if (type === 'gallery') {
    return (
      <div className={className}>
        <div className="pro-gallery-strip">
          {Array.from({ length: size === 'large' ? 6 : 3 }).map((_, index) => (
            <span key={index} className={`tone-${index % 4}`} />
          ))}
          <span className="gallery-arrow">
            <ChevronDown size={10} />
          </span>
        </div>
        {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      </div>
    );
  }

  if (type === 'toolPalette') {
    return (
      <div className={className}>
        <div className="pro-tool-palette">
          <MousePointer2 size={14} />
          <Pencil size={14} />
          <Circle size={14} />
          <Diamond size={14} />
        </div>
        {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      </div>
    );
  }

  const hasDrop = type === 'menu' || type === 'splitButton';

  return (
    <div className={className}>
      <ProIcon type={type} size={size} />
      {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      {hasDrop ? (
        <span className="pro-drop-arrow">
          <ChevronDown size={11} />
        </span>
      ) : null}
    </div>
  );
}
