// 真实第三方 add-in 冒烟:解包取 Config.daml → parseDamlToDocument → 打印统计。
// 损坏包(全零文件)按「期望的优雅失败路径」处理;只有合法 zip 却解析抛异常才算失败。
// 用法:node --experimental-strip-types tools/smoke-import-real-packages.mts [包路径...]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseDamlToDocument } from '../designer-app/src/core/damlImport.ts';

const DEFAULT_PACKAGES = [
  'D:/00安装包/CC工具箱2.1.3【适用版本Pro3.5】.esriAddInX',
  '~/Documents/ArcGIS/AddIns/ArcGISPro/{2025215F-4710-4256-8637-303CED9990FA}/GisProAddinWorkbench.AddIn.esriAddinX',
  '~/Documents/ArcGIS/AddIns/ArcGISPro/{a1b2c3d4-e5f6-7890-abcd-ef1234567890}/SimpleAddin.esriAddinX',
  'D:/00安装包/AlailaiPro.esriAddInX', // 已知损坏(全零),验证优雅失败
];
const packages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PACKAGES;

function extractConfigDaml(packagePath: string): string | null {
  const tmp = mkdtempSync(path.join(tmpdir(), 'smoke-import-'));
  try {
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

let failures = 0;
for (const packagePath of packages) {
  const name = packagePath.split(/[\\/]/).pop() ?? packagePath;
  if (!existsSync(packagePath)) {
    console.log(`- ${name}: 文件不存在,跳过`);
    continue;
  }
  const daml = extractConfigDaml(packagePath);
  if (!daml) {
    if (name.startsWith('AlailaiPro')) {
      console.log(`- ${name}: 无法解包(文件损坏)— 期望的优雅失败路径`);
      continue;
    }
    console.error(`FAIL ${name}: 无法解包`);
    failures += 1;
    continue;
  }
  try {
    const { stats } = parseDamlToDocument(daml);
    console.log(
      `- ${name}: tabs=${stats.tabs} groups=${stats.groups} controls=${stats.controls}` +
        ` 占位控件=${stats.placeholders} 占位组=${stats.placeholderGroups}` +
        ` 跳过组=${stats.skippedGroups} 无空位=${stats.unplacedControls} 忽略模块=${stats.ignoredModules}`,
    );
  } catch (error) {
    console.error(`FAIL ${name}: 合法 zip 但解析抛异常 — ${String(error)}`);
    failures += 1;
  }
}

if (failures) {
  process.exit(1);
}
console.log('SMOKE PASS');
