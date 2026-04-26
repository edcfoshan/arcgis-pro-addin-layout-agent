import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildArcGISProValidationArtifacts } from '../ribbon-designer/shared/arcgisProValidation.ts';
import type { RibbonDocument } from '../ribbon-designer/src/types.ts';

const args = process.argv.slice(2);

const getArgValue = (name: string) => {
  const index = args.findIndex((arg) => arg === name);
  return index >= 0 ? args[index + 1] : undefined;
};

const inputJson = getArgValue('--input');
const projectDir = getArgValue('--project-dir');
const version = getArgValue('--version');

if (!inputJson || !projectDir) {
  console.error('Usage: node --experimental-strip-types tools/generate-arcgis-pro-validation.mts --input <layout.json> --project-dir <project>');
  process.exit(1);
}

const absoluteInput = path.resolve(process.cwd(), inputJson);
const absoluteProjectDir = path.resolve(process.cwd(), projectDir);
const raw = readFileSync(absoluteInput, 'utf8');
const document = JSON.parse(raw) as RibbonDocument;

const artifacts = buildArcGISProValidationArtifacts(
  document,
  version ? { version } : undefined,
);

mkdirSync(path.join(absoluteProjectDir, 'Generated'), { recursive: true });
mkdirSync(path.join(absoluteProjectDir, 'Layout'), { recursive: true });

writeFileSync(path.join(absoluteProjectDir, 'Config.daml'), artifacts.configDaml, 'utf8');
writeFileSync(
  path.join(absoluteProjectDir, 'Generated', 'LayoutControls.g.cs'),
  artifacts.generatedControls,
  'utf8',
);
writeFileSync(
  path.join(absoluteProjectDir, 'Layout', 'current-layout.json'),
  artifacts.layoutSnapshot,
  'utf8',
);

console.log(`Generated ArcGIS Pro validation artifacts in ${absoluteProjectDir}`);
