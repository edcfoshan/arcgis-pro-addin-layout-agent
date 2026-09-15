// 往返测试:自家 demo 包 Config.daml → parseDamlToDocument → 与源 layout JSON 逐项比对。
// 用法:node --experimental-strip-types tools/test-daml-roundtrip.mts
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildConfigDaml } from '../designer-app/src/core/arcgisProValidation.ts';
import { parseDamlToDocument } from '../designer-app/src/core/damlImport.ts';
import type { RibbonControl } from '../designer-app/src/core/types.ts';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, '00测试包', 'all-controls-layout.json');
const packagePath = path.join(root, '00测试包', 'AllControls-Demo-1.0.1.esriAddInX');

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));

// 取 Config.daml:真实包解出(tar --force-local,失败回退 PowerShell Expand-Archive),
// 包缺失/解包失败回退 buildConfigDaml(生成器确定性,内容等价)
function extractConfigDaml(): string | null {
  const tmp = mkdtempSync(path.join(tmpdir(), 'daml-roundtrip-'));
  try {
    // GNU tar 不认 zip,Expand-Archive 又拒绝非 .zip 后缀:复制成 .zip 再解
    const zipCopy = path.join(tmp, 'pkg.zip');
    copyFileSync(packagePath, zipCopy);
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}\\out' -Force`],
      { stdio: 'pipe' },
    );
    return readFileSync(path.join(tmp, 'out', 'Config.daml'), 'utf8');
  } catch {
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

let daml: string;
if (exists(packagePath)) {
  daml = extractConfigDaml() ?? buildConfigDaml(source);
} else {
  daml = buildConfigDaml(source);
}

const { document: doc, stats } = parseDamlToDocument(daml, { packageName: '全控件演示' });

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  }
};

check('tabs', stats.tabs, 1);
check('groups', stats.groups, 3);
check('controls(声明区子项不得混入)', stats.controls, 21);
check('placeholders', stats.placeholders, 0);
check('placeholderGroups', stats.placeholderGroups, 0);
check('unplacedControls', stats.unplacedControls, 0);

const srcTab = source.tabs[0];
check('tab.caption', doc.tabs[0]?.caption, srcTab.caption);
check('tab.keytip', doc.tabs[0]?.keytip, srcTab.keytip);

check('group count/caption/keytip', true, true);
for (const srcGroup of source.groups as { caption: string; keytip: string; subgroupIds: string[] }[]) {
  const imported = doc.groups.find((g) => g.caption === srcGroup.caption);
  if (!imported) {
    failures += 1;
    console.error(`FAIL group caption 缺失: ${srcGroup.caption}`);
    continue;
  }
  check(`group[${srcGroup.caption}].keytip`, imported.keytip, srcGroup.keytip);
  const srcSubId = srcGroup.subgroupIds[0];
  const srcSub = (source.subgroups as { id: string; controlIds: string[] }[]).find(
    (s) => s.id === srcSubId,
  );
  const importedSub = doc.subgroups.find(
    (s) => s.id === imported.subgroupIds[0],
  );
  check(`group[${srcGroup.caption}] 控件数`, importedSub?.controlIds.length, srcSub?.controlIds.length);
}

// 按 caption 配对控件,比对 type/size/图标/tooltip/aiNotes/布局坐标(装箱算法与生成器同源,应逐格一致)
for (const srcControl of source.controls as RibbonControl[]) {
  const imported = doc.controls.find((c) => c.caption === srcControl.caption);
  if (!imported) {
    failures += 1;
    console.error(`FAIL control caption 缺失: ${srcControl.caption}`);
    continue;
  }
  const label = `[${srcControl.caption}]`;
  check(`${label}.type`, imported.type, srcControl.type);
  check(`${label}.size`, imported.size, srcControl.size);
  check(`${label}.icon.small`, imported.icon.small, srcControl.icon.small);
  check(`${label}.icon.large`, imported.icon.large, srcControl.icon.large);
  check(`${label}.tooltip`, imported.tooltip, srcControl.tooltip);
  check(`${label}.aiNotes`, imported.aiNotes, srcControl.aiNotes);
  check(
    `${label}.layout`,
    imported.layout && `${imported.layout.x},${imported.layout.y},${imported.layout.w},${imported.layout.h}`,
    srcControl.layout && `${srcControl.layout.x},${srcControl.layout.y},${srcControl.layout.w},${srcControl.layout.h}`,
  );
}

if (failures) {
  console.error(`ROUNDTRIP FAIL: ${failures} 处不一致`);
  process.exit(1);
}
console.log(`ROUNDTRIP PASS 21/21(tabs=${stats.tabs} groups=${stats.groups} controls=${stats.controls})`);

function exists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}
