// Tabler SVG(vendored) → 单文件图标包 icons-tabler.zip
// 源:   tools/tabler-icons/svg/*.svg
// 产物: designer-app/src-tauri/icons-tabler.zip(打包进 bundle.resources,Rust 侧按 zip 读取)
// 幂等: --if-missing 且 zip 比 svg 目录新时跳过(dev 启动加速)
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require2 = createRequire(import.meta.url);
const AdmZip = require2('adm-zip');
const sharp = require2('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../tabler-icons/svg');
const ALIASES = resolve(here, 'zh-aliases.json');
const OUT_ZIP = resolve(here, '../../designer-app/src-tauri/icons-tabler.zip');

// 与 designer.css --icon-ink 同色(浅色主题下与 Pro 原生图标观感一致)
const COLOR = '#4e6172';
const SIZES = [
  { px: 16, stroke: 1.5 },
  { px: 32, stroke: 2 },
];

const ifMissing = process.argv.includes('--if-missing');

function svgDirNewest(dir) {
  let newest = 0;
  for (const name of readdirSync(dir)) {
    const m = statSync(join(dir, name)).mtimeMs;
    if (m > newest) newest = m;
  }
  return newest;
}

if (!existsSync(SRC)) {
  console.error(`SVG 源目录不存在: ${SRC}(先执行 vendored 拷贝)`);
  process.exit(1);
}

if (ifMissing && existsSync(OUT_ZIP) && statSync(OUT_ZIP).mtimeMs > svgDirNewest(SRC)) {
  console.log('icons-tabler.zip 已是最新,跳过生成');
  process.exit(0);
}

const svgFiles = readdirSync(SRC).filter((f) => f.endsWith('.svg'));
const svgNames = new Set(svgFiles.map((f) => basename(f, '.svg')));
console.log(`源 SVG: ${svgFiles.length} 个`);

// 别名自校验:剔除指向不存在图标的条目,保证 Rust 侧搜索不落空
let aliases = {};
if (existsSync(ALIASES)) {
  const raw = JSON.parse(readFileSync(ALIASES, 'utf8'));
  let dropped = 0;
  for (const [zh, name] of Object.entries(raw)) {
    if (svgNames.has(name)) aliases[zh] = name;
    else dropped += 1;
  }
  if (dropped) console.warn(`别名表剔除 ${dropped} 条指向不存在图标的条目`);
}

const tmpZip = OUT_ZIP + '.tmp';
rmSync(tmpZip, { force: true });
const zip = new AdmZip();

let written = 0;
for (const file of svgFiles) {
  const name = basename(file, '.svg');
  let svg = readFileSync(join(SRC, file), 'utf8');
  svg = svg
    .replace(/stroke-width="2"/g, 'STROKE_PLACEHOLDER')
    .replace(/currentColor/g, COLOR);
  for (const { px, stroke } of SIZES) {
    const sized = svg.replace(/STROKE_PLACEHOLDER/g, `stroke-width="${stroke}"`);
    const png = await sharp(Buffer.from(sized)).resize(px, px).png().toBuffer();
    zip.addFile(`images_${name}${px}.png`, png);
    written += 1;
  }
  if (written % 2000 === 0) console.log(`已渲染 ${written} 张...`);
}

zip.addFile(
  'zh-aliases.json',
  Buffer.from(JSON.stringify(aliases, null, 1)),
);
zip.writeZip(tmpZip);
rmSync(OUT_ZIP, { force: true });
const { renameSync } = await import('node:fs');
renameSync(tmpZip, OUT_ZIP);

console.log(`已生成 ${written} 个 PNG + zh-aliases.json → ${OUT_ZIP}`);
