import { useEffect, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { Modal } from './Modal';
import {
  invalidateIconList,
  listIcons,
  pairSizes,
  searchIcons,
  type IconHit,
} from './iconsClient';

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
  const [hits, setHits] = useState<IconHit[]>([]);
  const [status, setStatus] = useState('加载图标库...');
  const [allCount, setAllCount] = useState(0);
  const [uploading, setUploading] = useState(false);

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
      searchIcons(query.trim(), 'light', 160)
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
  }, [query, open]);

  const uploadIcon = async () => {
    if (uploading) return;
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: 'PNG 图标', extensions: ['png'] }],
    }).catch(() => null);
    if (typeof picked !== 'string' || !picked) return;
    setUploading(true);
    try {
      const imported = await invoke<{ file: string }>('import_user_icon', { path: picked });
      invalidateIconList();
      setStatus(`已上传 ${imported.file}`);
      listIcons().then((icons) => {
        setAllCount(icons.length);
        onPick(pairSizes(imported.file, icons));
      });
    } catch (error) {
      setStatus(`上传失败：${String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal label="选择图标" cardClassName="icon-picker" onClose={onClose}>
      <div className="next-modal-head">
        <strong>选择图标</strong>
        <button onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
      </div>
      <div className="icon-picker-toolbar">
        <label className="icon-search">
          <Search size={13} />
          <input
            autoFocus
            aria-label="搜索图标"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图标，例如 图层 / 地图 / 放大"
            spellCheck={false}
          />
        </label>
        <button
          className="icon-upload"
          onClick={() => void uploadIcon()}
          disabled={uploading}
          title="上传自己的 PNG 图标"
        >
          <Upload size={13} />
          {uploading ? '上传中...' : '上传图标'}
        </button>
      </div>
      <div className="icon-picker-status">
        {status} · 开源图标库共 {allCount} 张（Tabler Icons · MIT，可上传自定义 PNG）
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
    </Modal>
  );
}
