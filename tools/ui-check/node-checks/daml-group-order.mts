// 断言：DAML 分组内控件的引用顺序必须与设计器 controlIds 声明顺序一字不差。
//
// ArcGIS Pro 对分组按声明顺序做列优先流式渲染（2026-09-16 实机确认，规则见
// designer-app/src/core/ribbonLayout.ts 的 flowLayout），DAML 本身没有坐标。
// 设计器画布同样按 controlIds 声明顺序派生位置——所以导出端任何「聪明」的重排
// （历史上是按存储坐标 y 优先、x 其次的行优先排序）都会直接变成
// 「设计器里所见 ≠ Pro 里所得」：示例布局曾有 7/9 个分组因此错位。
// 本检查用示例布局当输入：它的存储坐标由列优先流式生成，行优先排序后必然与
// 声明顺序不同（先断言这个陷阱真的存在，防止输入退化后检查失去牙齿），
// 再断言两个生成器变体产出的 DAML 顺序都等于声明顺序。
// 用法：node --experimental-strip-types tools/ui-check/node-checks/daml-group-order.mts
import { createDemoDocument } from '../../../designer-app/src/core/demoLayout.ts';
import { buildConfigDaml } from '../../../designer-app/src/core/arcgisProValidation.ts';
// 打包链用的是 shared 变体，两者必须产出同一顺序——只改一侧正是历史事故的形态。
import { buildConfigDaml as buildSharedConfigDaml } from '../../../ribbon-designer/shared/arcgisProValidation.ts';
import type { RibbonControl, RibbonDocument } from '../../../designer-app/src/core/types.ts';

let failures = 0;
const expectSame = (label: string, actual: string, expected: string) => {
  if (actual === expected) return;
  failures += 1;
  console.error(`\nFAIL ${label}`);
  console.error(`      期望：${expected}`);
  console.error(`      实得：${actual}`);
};

// 与生成器同构的 refId 推导（createRefId/sanitizeToken 是模块私有，这里按规则复刻）
const sanitizeToken = (value: string) =>
  value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const projectToken = sanitizeToken('GisProRibbonLayoutValidator.AddIn'.replace(/\./g, '_'));
const refOf = (control: RibbonControl) => {
  const suffix =
    control.type === 'menu' ? `${control.id}_menu`
    : control.type === 'splitButton' ? `${control.id}_split`
    : control.type === 'toolPalette' ? `${control.id}_palette`
    : control.id;
  return `${projectToken}_${sanitizeToken(suffix)}`;
};

const controlById = (doc: RibbonDocument) =>
  new Map(doc.controls.map((control) => [control.id, control]));

// 每个分组的 refID 串，按 DAML 里 <group> 声明块的出现顺序
const damlGroupOrders = (daml: string) =>
  [...daml.matchAll(/<group id="[^"]+"[^>]*>([\s\S]*?)<\/group>/g)]
    .map((block) => [...block[1].matchAll(/refID="([^"]+)"/g)].map((m) => m[1]).join('|'));

const doc = createDemoDocument();
const byId = controlById(doc);
// 期望顺序：group.subgroupIds（refId 形态）→ subgroup.controlIds → 控件 refId
const subgroupByRefId = new Map(
  doc.subgroups.map((subgroup) => [`${projectToken}_${sanitizeToken(subgroup.id)}`, subgroup]),
);
const expectedOrders = doc.groups.map((group) =>
  group.subgroupIds
    .flatMap((id) => subgroupByRefId.get(`${projectToken}_${sanitizeToken(id)}`)?.controlIds ?? [])
    .map((controlId) => byId.get(controlId))
    .filter((control): control is RibbonControl => Boolean(control))
    .map((control) => refOf(control))
    .join('|'),
);

// 前置：示例布局确实存在「行优先排序 ≠ 声明顺序」的分组（输入保持杀伤力）
const rowMajorOrders = doc.groups.map((group) =>
  group.subgroupIds
    .flatMap((id) => subgroupByRefId.get(`${projectToken}_${sanitizeToken(id)}`)?.controlIds ?? [])
    .map((controlId) => byId.get(controlId))
    .filter((control): control is RibbonControl => Boolean(control))
    .sort((left, right) => {
      const ly = left.layout?.y ?? Number.MAX_SAFE_INTEGER;
      const ry = right.layout?.y ?? Number.MAX_SAFE_INTEGER;
      if (ly !== ry) return ly - ry;
      const lx = left.layout?.x ?? Number.MAX_SAFE_INTEGER;
      const rx = right.layout?.x ?? Number.MAX_SAFE_INTEGER;
      return lx === rx ? left.id.localeCompare(right.id) : lx - rx;
    })
    .map((control) => refOf(control))
    .join('|'),
);
const trapExists = expectedOrders.some((order, index) => order !== rowMajorOrders[index]);
if (!trapExists) {
  failures += 1;
  console.error('\nFAIL 示例布局的所有分组在行优先排序后都与声明顺序相同——本检查的输入已退化，失去守护意义。');
}

const designerDaml = buildConfigDaml(doc, { placeholderBehaviors: true });
const sharedDaml = buildSharedConfigDaml(doc, { placeholderBehaviors: true });
const designerOrders = damlGroupOrders(designerDaml);
const sharedOrders = damlGroupOrders(sharedDaml);

console.log(`  分组数：期望 ${expectedOrders.length}，设计器变体 ${designerOrders.length}，shared 变体 ${sharedOrders.length}`);
expectSame('设计器变体的分组数量不对。', String(designerOrders.length), String(expectedOrders.length));
expectSame('shared 变体的分组数量不对。', String(sharedOrders.length), String(expectedOrders.length));

expectedOrders.forEach((expected, index) => {
  const groupName = doc.groups[index].caption;
  expectSame(
    `分组「${groupName}」的设计器变体 DAML 顺序与 controlIds 声明顺序不一致——Pro 里会错位。`,
    designerOrders[index] ?? '(缺失)',
    expected,
  );
  expectSame(
    `分组「${groupName}」的 shared 变体 DAML 顺序与 controlIds 声明顺序不一致——两文件已漂移。`,
    sharedOrders[index] ?? '(缺失)',
    expected,
  );
});

if (failures) {
  console.error(`\nFAIL：${failures} 项不通过。`);
  process.exit(1);
}

console.log('\nPASS：两个变体的 DAML 分组顺序都与声明顺序一致（Pro 列优先流式 = 设计器所见）。');
