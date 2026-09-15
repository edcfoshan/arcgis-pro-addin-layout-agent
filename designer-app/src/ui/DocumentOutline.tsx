import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { getSubgroupControls } from '../core/ribbonLayout';
import type { RibbonDocument, RibbonGroup } from '../core/types';

// 右栏空态：把当前文档的 页签 → 分组 → 控件 三级结构摊开，
// 既是导航入口，也填掉了右栏 320px 的死区。
export function DocumentOutline({
  document,
  activeTabId,
  selectedControlId,
  onSelectTab,
  onSelectControl,
}: {
  document: RibbonDocument;
  activeTabId: string;
  selectedControlId: string | null;
  onSelectTab: (tabId: string) => void;
  onSelectControl: (controlId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setCollapsed((current) => ({ ...current, [id]: !current[id] }));

  return (
    <nav className="next-outline" aria-label="文档结构">
      <div className="next-outline-head">文档结构</div>
      <ul className="next-outline-list">
        {document.tabs.map((tab) => {
          const groups = tab.groupIds
            .map((groupId) => document.groups.find((group) => group.id === groupId))
            .filter((group): group is RibbonGroup => Boolean(group));
          const isCollapsed = collapsed[tab.id] ?? false;

          return (
            <li key={tab.id}>
              <div
                className={`next-outline-row next-outline-tab${
                  tab.id === activeTabId ? ' active' : ''
                }`}
              >
                <button
                  type="button"
                  className="next-outline-toggle"
                  aria-label={isCollapsed ? `展开 ${tab.caption}` : `折叠 ${tab.caption}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(tab.id)}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <button
                  type="button"
                  className="next-outline-label"
                  onClick={() => onSelectTab(tab.id)}
                >
                  {tab.caption}
                </button>
              </div>

              {!isCollapsed ? (
                <ul className="next-outline-list">
                  {groups.map((group) => {
                    // 控件挂在 subgroup 上，分组经 subgroupIds[0] 指向它 —— 查表复用
                    // core 里同一份 getSubgroupControls，不另推一套。
                    const subgroup = document.subgroups.find(
                      (item) => item.id === group.subgroupIds[0],
                    );
                    const controls = subgroup ? getSubgroupControls(document, subgroup) : [];

                    return (
                      <li key={group.id}>
                        <div className="next-outline-row next-outline-group">
                          <span className="next-outline-spacer" />
                          <span className="next-outline-label muted">{group.caption}</span>
                        </div>
                        <ul className="next-outline-list">
                          {controls.map((control) => (
                            <li key={control.id}>
                              <button
                                type="button"
                                className={`next-outline-row next-outline-control${
                                  control.id === selectedControlId ? ' active' : ''
                                }`}
                                onClick={() => onSelectControl(control.id)}
                              >
                                <span className="next-outline-spacer" />
                                <span className="next-outline-label">{control.caption}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
