import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { listIcons, pairSizes, searchIcons, type IconHit } from './iconsClient';

export interface IconSelection {
  small: string;
  large: string;
}

export function IconPicker({
  open,
  currentSmall,
  onClose,
  onPick,
}: {
  open: boolean;
  currentSmall?: string;
  onClose: () => void;
  onPick: (selection: IconSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [hits, setHits] = useState<IconHit[]>([]);
  const [status, setStatus] = useState('加载图标库...');
  const [allCount, setAllCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listIcons()
      .then((icons) => !cancelled && setAllCount(icons.length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus('搜索中...');
      searchIcons(query.trim(), theme, 160)
        .then((next) => {
          if (cancelled) return;
          setHits(next);
          setStatus(next.length ? `${next.length} 个结果` : '没有匹配的图标');
        })
        .catch(() => !cancelled && setStatus('图标库不可用'));
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, theme, open]);

  if (!open) return null;

  return (
    <div className="next-modal" onClick={onClose}>
      <div className="next-modal-card icon-picker" onClick={(event) => event.stopPropagation()}>
        <div className="next-modal-head">
          <strong>选择 Pro 图标</strong>
          <button onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
        <div className="icon-picker-toolbar">
          <label className="icon-search">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索图标，例如 add / layer / zoom"
              spellCheck={false}
            />
          </label>
          <div className="icon-theme-toggle">
            <button
              className={theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
            >
              亮色
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              暗色
            </button>
          </div>
        </div>
        <div className="icon-picker-status">
          {status} · 图标库共 {allCount} 张（来自本机 ArcGIS Pro）
        </div>
        <div className="icon-grid">
          {hits.map((hit) => (
            <button
              key={hit.file}
              className={`icon-cell${currentSmall ? (currentSmall === hit.file ? ' current' : '') : ''}`}
              title={hit.file}
              onClick={() => {
                listIcons().then(
                  (icons) => onPick(pairSizes(hit.file, icons)),
                  () => onPick({ small: hit.file, large: hit.file }),
                );
              }}
            >
              <img src={hit.dataUrl} alt="" draggable={false} />
              <span>{hit.file.replace(/^(dark)?images_/, '').replace(/\d+\.png$/, '')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
