import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  Database,
  Diamond,
  FileText,
  FolderPlus,
  Layers,
  MoreHorizontal,
  MousePointer2,
  PanelTop,
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
  separator,
  iconOnly,
  children,
}: {
  type: RibbonControl['type'];
  caption: string;
  size: RibbonControlSize;
  iconFile?: string;
  mode?: 'canvas' | 'library';
  variant?: RibbonControl['variant'];
  separator?: boolean;
  /** 设计器侧「图标」形态:small 下渲染 1×1 纯图标,无文字无箭头 */
  iconOnly?: boolean;
  children?: ControlChild[];
}) {
  // Pro 实机(2026-09-16 容器页截图):splitButton 的面板文案取第一个 button 子项
  // (分裂按钮本体在 DAML 里没有 caption,Pro 无法显示自身文案,如「保存」显示为「另存为」)
  const faceCaption =
    type === 'splitButton' && children?.length
      ? (children.find((child) => child.type === 'button') ?? children[0]).caption
      : caption;
  const label = size === 'small' && faceCaption.length > 3 ? faceCaption.slice(0, 3) : faceCaption;
  const compact = Boolean(iconOnly) && size === 'small';
  const className = `next-control-mock mode-${mode} next-${type} size-${size}${separator ? ' has-separator' : ''}${compact ? ' icon-only' : ''}`;

  if (type === 'comboBox') {
    return (
      <div className={className}>
        <div className="pro-input-line">
          <span>{compact ? null : label}</span>
          <ChevronDown size={12} />
        </div>
      </div>
    );
  }

  if (type === 'editBox') {
    return (
      <div className={className}>
        <div className="pro-input-line">
          <span>{compact ? null : label}</span>
        </div>
      </div>
    );
  }

  if (type === 'checkBox') {
    // Pro 实机(2026-09-17):小尺寸也显示文字(捕捉/网格显示),不再是纯勾选框
    return (
      <div className={className}>
        <span className="pro-check-box">
          <Check size={10} />
        </span>
        {compact ? null : <span className="pro-label">{label}</span>}
      </div>
    );
  }

  if (type === 'gallery') {
    // 摊开式(inline="true"):内容横铺 + more 按钮,不收进下拉;下拉式仍是窄条+箭头
    if (variant === 'inline') {
      return (
        <div className={className}>
          <div className="pro-gallery-strip">
            {Array.from({ length: size === 'large' ? 8 : 5 }).map((_, index) => (
              <span key={index} className={`tone-${index % 4}`} />
            ))}
            <span className="gallery-more">
              <MoreHorizontal size={10} />
            </span>
          </div>
          {size === 'large' ? <span className="pro-label">{label}</span> : null}
        </div>
      );
    }
    return (
      // Pro 收起态画廊实测为「当前图块 + 文字 + 下拉箭头」的窄条（2026-09-16 实机截图），
      // 图块阵列只在下拉展开后才出现——mock 若画展开态会与 Pro 观感脱节。
      <div className={className}>
        <div className="pro-gallery-closed">
          <span className="tone-0" />
          {size !== 'small' ? <span className="pro-label">{label}</span> : null}
          <span className="gallery-arrow">
            <ChevronDown size={10} />
          </span>
        </div>
      </div>
    );
  }

  // menuStyle 按钮板:Pro 实测为大按钮形态(大图标+文字+右下箭头),与 menu 控件观感一致
  if (type === 'toolPalette' && variant === 'menuStyle') {
    return (
      <div className={className}>
        <ProIcon type="menu" size={size} iconFile={iconFile} />
        {size !== 'small' ? <span className="pro-label">{label}</span> : null}
        <span className="pro-drop-arrow">
          <ChevronDown size={11} />
        </span>
      </div>
    );
  }

  if (type === 'toolPalette') {
    // Pro 收起态(2026-09-17 实机):大尺寸=大图标+文字+箭头,中尺寸=文字+箭头窄条(无图标);
    // 子工具图标排在展开的下拉里,不属于画布收起形态
    return (
      <div className={className}>
        {size === 'large' ? <ProIcon type="toolPalette" size="large" iconFile={iconFile} /> : null}
        {size === 'small' ? (
          <ProIcon type="toolPalette" size="small" iconFile={iconFile} />
        ) : (
          <span className="pro-label">{label}</span>
        )}
        {size !== 'small' ? (
          <span className="pro-drop-arrow">
            <ChevronDown size={11} />
          </span>
        ) : null}
      </div>
    );
  }

  const hasDrop = type === 'menu' || type === 'splitButton';
  // Pro 实机(2026-09-17):菜单/分裂按钮中、小尺寸是「文字+箭头」无图标(另存为∨/更多∨),
  // 大尺寸才有大图标;按钮/工具各尺寸都是图标+文字;「图标」形态(紧凑)只渲染纯图标
  const showIcon = size === 'large' || !hasDrop || compact;

  return (
    <div className={className}>
      {showIcon ? <ProIcon type={type} size={size} iconFile={iconFile} /> : null}
      {compact ? null : <span className="pro-label">{label}</span>}
      {hasDrop && !compact ? (
        <span className="pro-drop-arrow">
          <ChevronDown size={11} />
        </span>
      ) : null}
    </div>
  );
}
