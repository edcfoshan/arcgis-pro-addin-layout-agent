import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, X } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Modal } from './Modal';

const REPO_URL = 'https://github.com/edcfoshan/arcgis-pro-addin-layout-agent';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; percent: number }
  | { kind: 'error'; message: string };

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [version, setVersion] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion('(浏览器预览)'));
  }, [open]);

  if (!open) return null;

  const checkForUpdate = async () => {
    if (updateState.kind === 'checking' || updateState.kind === 'downloading') return;
    setUpdateState({ kind: 'checking' });
    try {
      const update = await check();
      if (update) {
        setUpdateState({ kind: 'available', update });
      } else {
        setUpdateState({ kind: 'none' });
      }
    } catch (error) {
      setUpdateState({ kind: 'error', message: String(error) });
    }
  };

  const runUpdate = async () => {
    if (updateState.kind !== 'available') return;
    const { update } = updateState;
    try {
      setUpdateState({ kind: 'downloading', percent: 0 });
      let total = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            break;
          case 'Progress': {
            if (total > 0) {
              setUpdateState({
                kind: 'downloading',
                percent: Math.round((event.data.chunkLength / total) * 100),
              });
            }
            break;
          }
          case 'Finished':
            setUpdateState({ kind: 'downloading', percent: 100 });
            break;
        }
      });
      await relaunch();
    } catch (error) {
      setUpdateState({ kind: 'error', message: String(error) });
    }
  };

  const updateBlock = () => {
    switch (updateState.kind) {
      case 'checking':
        return <span className="about-update-status">正在检查更新...</span>;
      case 'none':
        return <span className="about-update-status">已是最新版本</span>;
      case 'available':
        return (
          <div className="about-update-available">
            <span>
              发现新版本 v{updateState.update.version}
              {updateState.update.currentVersion
                ? `（当前 v${updateState.update.currentVersion}）`
                : ''}
            </span>
            <button className="primary" onClick={() => void runUpdate()}>
              立即更新
            </button>
          </div>
        );
      case 'downloading':
        return (
          <span className="about-update-status">
            正在下载更新 {updateState.percent}%，完成后将自动重启
          </span>
        );
      case 'error':
        return <span className="about-update-status about-update-error">{updateState.message}</span>;
      default:
        return null;
    }
  };

  return (
    <Modal label="关于" cardClassName="about-card" onClose={onClose}>
      <div className="next-modal-head">
        <strong>关于</strong>
        <button onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
      </div>
      <div className="about-body">
        <div className="about-logo">G</div>
        <div className="about-title">
          <strong>极思G GISpro 插件设计器</strong>
          <span>版本 {version || '...'}</span>
        </div>
      </div>
      <p className="about-desc">
        可视化设计 ArcGIS Pro Add-in 功能区布局，一键导出 .esriAddInX 安装包。图标来自 Tabler
        Icons（MIT）。
      </p>
      <div className="about-update">
        {updateBlock()}
        <button
          className="about-check-update"
          onClick={() => void checkForUpdate()}
          disabled={updateState.kind === 'checking' || updateState.kind === 'downloading'}
        >
          <RefreshCw size={13} />
          检查更新
        </button>
      </div>
      <div className="about-links">
        <button onClick={() => void openUrl(REPO_URL).catch(() => undefined)}>
          <ExternalLink size={13} />
          项目主页与源码
        </button>
      </div>
    </Modal>
  );
}
