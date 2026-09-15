import { useEffect, useState } from 'react';
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
import type { ControlChild, RibbonControl, RibbonControlSize } from '../core/types';
import { getIconUrl } from './iconsClient';

const iconSize = (size: RibbonControlSize) => (size === 'large' ? 32 : 16);

function ProImage({ file, pixels }: { file: string; pixels: number }) {
  const [url, setUrl] = useState<string | null>(() => null);
  useEffect(() => {
    let cancelled = false;
    getIconUrl(file).then(
      (next) => !cancelled && setUrl(next),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [file]);
  // 无 Tauri 环境/加载失败时返回占位灰块,保持格子占位不塔形
  if (!url) {
    return (
      <span
        className="pro-icon pro-icon-placeholder"
        style={{ width: pixels, height: pixels }}
        aria-hidden
      />
    );
  }
  return (
    <span className="pro-icon">
      <img src={url} width={pixels} height={pixels} alt="" draggable={false} />
    </span>
  );
}

function ProIcon({
  type,
  size,
  iconFile,
}: {
  type: RibbonControl['type'];
  size: RibbonControlSize;
  iconFile?: string;
}) {
  const pixels = iconSize(size);
  if (iconFile) return <ProImage file={iconFile} pixels={pixels} />;
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
  iconFile,
  mode = 'canvas',
  variant,
  children,
}: {
  type: RibbonControl['type'];
  caption: string;
  size: RibbonControlSize;
  iconFile?: string;
  mode?: 'canvas' | 'library';
  variant?: RibbonControl['variant'];
  children?: ControlChild[];
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

  // menuStyle 按钮板:竖排前 3 个真实子项图标 + 右下更多箭头(Pro 窄竖条形态,无文字)
  if (type === 'toolPalette' && variant === 'menuStyle') {
    const shown = (children ?? []).slice(0, 3);
    return (
      <div className={className}>
        <div className="pro-tool-palette-menu">
          {shown.length
            ? shown.map((child) => (
                <ProImage
                  key={child.id}
                  file={child.icon.small || child.icon.large}
                  pixels={16}
                />
              ))
            : [0, 1, 2].map((index) => <ProIcon key={index} type="tool" size="small" />)}
          <span className="pro-drop-arrow">
            <ChevronDown size={11} />
          </span>
        </div>
      </div>
    );
  }

  if (type === 'toolPalette') {
    const shown = (children ?? []).slice(0, 3);
    return (
      <div className={className}>
        <div className="pro-tool-palette">
          {shown.length
            ? shown.map((child) => (
                <ProImage
                  key={child.id}
                  file={child.icon.small || child.icon.large}
                  pixels={16}
                />
              ))
            : (
                <>
                  <ProIcon type="tool" size="small" iconFile={size === 'large' ? iconFile : undefined} />
                  <Pencil size={14} />
                  <Circle size={14} />
                  <Diamond size={14} />
                </>
              )}
        </div>
        {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      </div>
    );
  }

  const hasDrop = type === 'menu' || type === 'splitButton';

  return (
    <div className={className}>
      <ProIcon type={type} size={size} iconFile={iconFile} />
      {size !== 'small' ? <span className="pro-label">{label}</span> : null}
      {hasDrop ? (
        <span className="pro-drop-arrow">
          <ChevronDown size={11} />
        </span>
      ) : null}
    </div>
  );
}
