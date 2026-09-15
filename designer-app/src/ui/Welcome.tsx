import { Layers, MousePointerClick, PackagePlus, X } from 'lucide-react';
import { Modal } from './Modal';

const STEPS = [
  {
    icon: Layers,
    title: '1 · 新建分组',
    body: '在画布上方点「新增分组」，功能区按 3 行网格排布，可横向加列。',
  },
  {
    icon: MousePointerClick,
    title: '2 · 拖入控件',
    body: '从底部控件库选好尺寸徽章，按住拖进分组；选中控件可在右侧编辑标题与图标。',
  },
  {
    icon: PackagePlus,
    title: '3 · 导出安装包',
    body: '工具栏「导出 ▾ → .esriAddInX」，双击安装、重启 ArcGIS Pro 即可看到设计的效果。',
  },
];

export function Welcome({
  onOpenDemo,
  onStartBlank,
  onClose,
}: {
  onOpenDemo: () => void;
  onStartBlank: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      label="欢迎使用 极思G GISpro 插件设计器"
      className="welcome-modal"
      cardClassName="welcome-card"
      onClose={onClose}
    >
      <button className="welcome-close" onClick={onClose} aria-label="关闭">
        <X size={14} />
      </button>
      <div className="welcome-head">
        <strong>欢迎使用 极思G GISpro 插件设计器</strong>
        <span>三步做出你的第一个 ArcGIS Pro 功能区插件</span>
      </div>
      <div className="welcome-steps">
        {STEPS.map((step) => (
          <div className="welcome-step" key={step.title}>
            <div className="welcome-step-icon">
              <step.icon size={18} />
            </div>
            <div className="welcome-step-text">
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="welcome-actions">
        <button className="primary" onClick={onOpenDemo}>
          打开示例布局
        </button>
        <button onClick={onStartBlank}>从空白开始</button>
      </div>
    </Modal>
  );
}
