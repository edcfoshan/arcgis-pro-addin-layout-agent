// 断言：同一设计稿在不同编辑时刻（metadata.lastUpdated 不同）导出，
// <AddInInfo id> 必须保持一致。ArcGIS Pro 用该 id 作插件安装目录名，
// id 抖动会导致 Pro 里累积多份同名插件而非更新已有那份。
// 用法：node --experimental-strip-types tools/ui-check/node-checks/addin-id.mts
import { buildConfigDaml } from '../../../designer-app/src/core/arcgisProValidation.ts';
// 打包链用的是 shared 变体，两者必须产出同一个插件身份——只改一侧正是本任务的核心风险。
import { buildConfigDaml as buildSharedConfigDaml } from '../../../ribbon-designer/shared/arcgisProValidation.ts';
import type { RibbonDocument } from '../../../designer-app/src/core/types.ts';

// 最小可导出的文档：一个页签、一个分组、一个按钮。
// 不引 demoLayout 是为了让本检查的输入完全自足、不受别处改动影响。
const makeDoc = (lastUpdated: string, name = '恒定插件名'): RibbonDocument =>
  ({
    metadata: {
      id: 'doc_stable0001',
      name,
      app: 'gispro-ribbon-designer',
      schemaVersion: '1.0',
      lastUpdated,
    },
    tabs: [
      {
        id: 'tab_1',
        caption: '测试页签',
        keytip: 'T1',
        groupIds: ['grp_1'],
      },
    ],
    groups: [
      {
        id: 'grp_1',
        tabId: 'tab_1',
        caption: '测试分组',
        keytip: 'G1',
        launcherButton: false,
        sizePriorities: [1, 1, 1],
        subgroupIds: ['sub_1'],
      },
    ],
    subgroups: [
      {
        id: 'sub_1',
        groupId: 'grp_1',
        caption: '测试子组',
        sizeMode: 'Default',
        verticalAlignment: 'Top',
        controlIds: ['ctl_1'],
        layout: { row: 0, columns: 8, rows: 3 },
      },
    ],
    controls: [
      {
        id: 'ctl_1',
        subgroupId: 'sub_1',
        type: 'button',
        caption: '测试按钮',
        condition: '',
        size: 'large',
        supportedSizes: ['small', 'middle', 'large'],
        tooltip: '测试用',
        aiNotes: '',
        icon: { small: '', large: '' },
        behavior: { commandType: 'button', className: 'Test.Button', target: 'Test', arguments: {} },
        eventBindings: [],
        layout: { x: 0, y: 0, w: 2, h: 3 },
        children: [],
      },
    ],
    // 返回类型标注已是 RibbonDocument，tsc 会在此校验字段完整性——
    // 若报缺字段，照提示补齐。不要用 as 强转绕过去（那会屏蔽掉这个校验）。
  });

const extractAddInId = (daml: string): string => {
  const match = daml.match(/<AddInInfo[^>]*\bid="([^"]+)"/i);
  if (!match) throw new Error('生成的 DAML 里找不到 <AddInInfo id="...">');
  return match[1];
};

const early = extractAddInId(buildConfigDaml(makeDoc('2026-01-01T00:00:00.000Z')));
const late = extractAddInId(buildConfigDaml(makeDoc('2026-09-15T12:34:56.000Z')));
// 改名的同一份设计稿：metadata.name 也是被移出种子的可变分量（界面可双击改名），
// 若它被加回种子，这一项会与 early 不等。
const renamed = extractAddInId(buildConfigDaml(makeDoc('2026-01-01T00:00:00.000Z', '改过名的插件')));
// 同一份文档交给打包链用的 shared 变体，身份必须与设计器变体逐字一致。
const shared = extractAddInId(buildSharedConfigDaml(makeDoc('2026-01-01T00:00:00.000Z')));

console.log(`  早期编辑时刻的 addInId：${early}`);
console.log(`  后期编辑时刻的 addInId：${late}`);
console.log(`  仅改名后的 addInId：${renamed}`);
console.log(`  shared 变体（打包链）的 addInId：${shared}`);

let failures = 0;
const expectSame = (label: string, actual: string, expected: string) => {
  if (actual === expected) return;
  failures += 1;
  console.error(`\nFAIL ${label}`);
  console.error(`      期望：${expected}`);
  console.error(`      实得：${actual}`);
};

expectSame(
  '同一设计稿在不同编辑时刻导出，插件身份 GUID 不同——ArcGIS Pro 会把它装进不同目录，导致同名插件在 Pro 里累积。',
  late,
  early,
);
expectSame('仅改插件名就改变了插件身份 GUID。', renamed, early);
expectSame('shared 变体（打包链）与设计器变体产出了不同的插件身份 GUID，两文件已漂移。', shared, early);

if (failures) {
  console.error(`\nFAIL：${failures} 项不通过。`);
  process.exit(1);
}

console.log('\nPASS：插件身份 GUID 稳定，且两个变体一致。');
