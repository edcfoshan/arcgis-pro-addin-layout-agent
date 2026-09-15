// 断言：同一设计稿在不同编辑时刻（metadata.lastUpdated 不同）导出，
// <AddInInfo id> 必须保持一致。ArcGIS Pro 用该 id 作插件安装目录名，
// id 抖动会导致 Pro 里累积多份同名插件而非更新已有那份。
// 用法：node --experimental-strip-types tools/ui-check/node-checks/addin-id.mts
import { buildConfigDaml } from '../../../designer-app/src/core/arcgisProValidation.ts';
// 打包链用的是 shared 变体，两者必须产出同一个插件身份——只改一侧正是本任务的核心风险。
import { buildConfigDaml as buildSharedConfigDaml } from '../../../ribbon-designer/shared/arcgisProValidation.ts';
import { parseImportedDocument } from '../../../designer-app/src/core/ribbon.ts';
import type { RibbonDocument } from '../../../designer-app/src/core/types.ts';

// 最小可导出的文档：一个页签、一个分组、一个按钮。
// 不引 demoLayout 是为了让本检查的输入完全自足、不受别处改动影响。
const makeDoc = (
  lastUpdated: string,
  name = '恒定插件名',
  id = 'doc_stable0001',
): RibbonDocument =>
  ({
    metadata: {
      id,
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

// 导入链路（第三方/手写 JSON 走的就是这条）：这里全程经 parseImportedDocument，
// 与上面的字面量构造区分开 —— 上面那几条证明不了「解析时补文档身份」那行代码。
// 参数化 id 是为了造出「合法但不带 metadata.id」的 JSON。
const makeDocJson = (opts: { lastUpdated: string; name?: string; id?: string }): string => {
  const raw = JSON.parse(
    JSON.stringify(makeDoc(opts.lastUpdated, opts.name ?? '恒定插件名', opts.id ?? 'unused')),
  );
  if (opts.id === undefined) delete raw.metadata.id;
  return JSON.stringify(raw);
};
const parseOrThrow = (raw: string): RibbonDocument => {
  const doc = parseImportedDocument(raw);
  if (!doc) throw new Error('parseImportedDocument 拒绝了本检查自造的合法 JSON');
  return doc;
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
const expectDifferent = (label: string, actual: string, other: string) => {
  if (actual !== other) return;
  failures += 1;
  console.error(`\nFAIL ${label}`);
  console.error(`      两者都是：${actual}`);
};

expectSame(
  '同一设计稿在不同编辑时刻导出，插件身份 GUID 不同——ArcGIS Pro 会把它装进不同目录，导致同名插件在 Pro 里累积。',
  late,
  early,
);
expectSame('仅改插件名就改变了插件身份 GUID。', renamed, early);
expectSame('shared 变体（打包链）与设计器变体产出了不同的插件身份 GUID，两文件已漂移。', shared, early);

// ===== 导入链路：metadata.id 的回填 =====
// ribbon.ts 的 parseImportedDocument 会给「手写/第三方 JSON」补一个 metadata.id，而导出身份
// 的 GUID 由它派生。少了这行，两份互不相干的设计稿会塌缩成同一个种子、同一个 <AddInInfo id>，
// 在 ArcGIS Pro 里互相覆盖。上面几条全程直接构造 RibbonDocument 字面量、从不经解析，
// 所以这行回填在删除临时探针后一直零守护——本段就是它的网。
// 两份 JSON 除「都没有 metadata.id」外只有 lastUpdated 不同（而 lastUpdated 不在种子里），
// 名字必须相同：名字参与种子，若不同则即使回填丢了也会得到不同 GUID，这条就白测了。
const noIdA = extractAddInId(
  buildConfigDaml(parseOrThrow(makeDocJson({ lastUpdated: '2026-01-01T00:00:00.000Z' }))),
);
const noIdB = extractAddInId(
  buildConfigDaml(parseOrThrow(makeDocJson({ lastUpdated: '2026-09-15T12:34:56.000Z' }))),
);
console.log(`  无 id 的 JSON（甲）回填后的 addInId：${noIdA}`);
console.log(`  无 id 的 JSON（乙）回填后的 addInId：${noIdB}`);

expectDifferent(
  '两份都不带 metadata.id 的合法 JSON 被回填成了同一个文档身份——不相关的设计稿会在 ArcGIS Pro 里互相覆盖。',
  noIdA,
  noIdB,
);

// 带 id 的必须原样保留，不能被重新生成：拿同一 id 直接构造的文档当基准逐字比对。
const KEPT_ID = 'doc_keepme0001';
expectSame(
  '导入时覆盖了 JSON 里已经写好的 metadata.id——用户固定下来的插件身份被改掉了。',
  extractAddInId(
    buildConfigDaml(
      parseOrThrow(
        makeDocJson({ lastUpdated: '2026-01-01T00:00:00.000Z', id: KEPT_ID }),
      ),
    ),
  ),
  extractAddInId(buildConfigDaml(makeDoc('2026-01-01T00:00:00.000Z', '恒定插件名', KEPT_ID))),
);

if (failures) {
  console.error(`\nFAIL：${failures} 项不通过。`);
  process.exit(1);
}

console.log('\nPASS：插件身份 GUID 稳定、导入回填可用，且两个变体一致。');
