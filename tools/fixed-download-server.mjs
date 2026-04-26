import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DOWNLOAD_DIR = 'C:\\Users\\13975\\Documents\\arcgis-pro-addin-layout-agent\\arcgis-pro-validation\\GisProRibbonLayoutValidator.AddIn\\bin\\Debug\\net8.0-windows7.0';
const SETTINGS_FILE = path.join(process.cwd(), 'tools', 'download-settings.json');
const PROJECT_DIR = path.join(process.cwd(), 'arcgis-pro-validation', 'GisProRibbonLayoutValidator.AddIn');
const BUILD_SCRIPT = path.join(process.cwd(), 'tools', 'build-arcgis-pro-validation.ps1');
const PORT = Number(process.env.RIBBON_DESIGNER_DOWNLOAD_PORT || 4174);
const ALLOW_ORIGIN = 'http://127.0.0.1:4173';
let downloadDir = await loadInitialDownloadDir();

const writeCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const sanitizeFilename = (filename) => {
  const base = path.basename(String(filename || '').trim());
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid filename');
  }
  return base;
};

const normalizeDownloadDir = (value) => {
  const dir = String(value || '').trim();
  if (!dir) throw new Error('Missing downloadDir');
  if (!path.isAbsolute(dir)) throw new Error('downloadDir must be an absolute path');
  return path.normalize(dir);
};

async function loadInitialDownloadDir() {
  if (process.env.RIBBON_DESIGNER_DOWNLOAD_DIR) {
    return normalizeDownloadDir(process.env.RIBBON_DESIGNER_DOWNLOAD_DIR);
  }

  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeDownloadDir(parsed.downloadDir);
  } catch {
    return DEFAULT_DOWNLOAD_DIR;
  }
}

async function persistDownloadDir(nextDir) {
  await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify({ downloadDir: nextDir }, null, 2), 'utf8');
}

const readRequestBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const runProcess = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Command failed with exit code ${code}\n${stderr || stdout}`));
    });
  });

const runPowerShell = async (command, cwd) => {
  const powershell = process.env.SYSTEMROOT
    ? path.join(process.env.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  return runProcess(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { cwd });
};

const escapePowerShellSingleQuoted = (value) => `'${String(value).replace(/'/g, "''")}'`;

const computeBuildVersion = (layoutSnapshot) => {
  try {
    const parsed = JSON.parse(layoutSnapshot);
    const lastUpdated = Date.parse(parsed?.metadata?.lastUpdated || '');
    if (!Number.isNaN(lastUpdated)) {
      const daysSinceEpoch = Math.floor(lastUpdated / 86_400_000);
      const secondsOfDay = Math.floor((lastUpdated % 86_400_000) / 1000);
      const minor = daysSinceEpoch % 65_535;
      const patch = Math.floor(secondsOfDay / 2);
      return `1.${minor}.${patch}`;
    }
  } catch {
    // Fall back to a timestamp-derived version below.
  }

  const now = Date.now();
  const daysSinceEpoch = Math.floor(now / 86_400_000);
  const secondsOfDay = Math.floor((now % 86_400_000) / 1000);
  return `1.${daysSinceEpoch % 65_535}.${Math.floor(secondsOfDay / 2)}`;
};

const buildAddInPackage = async ({ packageFileName, layoutSnapshot }) => {
  await mkdir(path.join(PROJECT_DIR, 'Layout'), { recursive: true });
  await writeFile(path.join(PROJECT_DIR, 'Layout', 'current-layout.json'), layoutSnapshot, 'utf8');
  const version = computeBuildVersion(layoutSnapshot);

  await runProcess(
    process.env.SYSTEMROOT
      ? path.join(process.env.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      BUILD_SCRIPT,
      '-ProjectDir',
      PROJECT_DIR,
      '-InputJson',
      path.join(PROJECT_DIR, 'Layout', 'current-layout.json'),
      '-Version',
      version,
    ],
    { cwd: process.cwd() },
  );

  const installSourceDir = path.join(
    PROJECT_DIR,
    'obj',
    'Debug',
    'net8.0-windows7.0',
    'temp_archive',
    'Install',
  );
  const stagingDir = await mkdtemp(path.join(os.tmpdir(), 'ribbon-addon-'));
  await cp(installSourceDir, stagingDir, { recursive: true });
  await cp(path.join(PROJECT_DIR, 'Config.daml'), path.join(stagingDir, 'Config.daml'));

  await mkdir(downloadDir, { recursive: true });
  const targetPath = path.join(downloadDir, packageFileName);
  const archivePath = targetPath;
  const archiveCommand = `Compress-Archive -Path ${escapePowerShellSingleQuoted(path.join(stagingDir, '*'))} -DestinationPath ${escapePowerShellSingleQuoted(archivePath)} -Force`;
  await runPowerShell(archiveCommand, process.cwd());
  await rm(stagingDir, { recursive: true, force: true });
  return targetPath;
};

const server = createServer(async (req, res) => {
  writeCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, downloadDir }));
    return;
  }

  if (req.method === 'POST' && req.url === '/config') {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body.toString('utf8'));
      const nextDir = normalizeDownloadDir(parsed.downloadDir);
      downloadDir = nextDir;
      await persistDownloadDir(nextDir);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, downloadDir }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/package-addon') {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body.toString('utf8'));
      const packageFileName = sanitizeFilename(
        String(parsed.packageFileName || 'GisProRibbonLayoutValidator.AddIn.esriAddInX'),
      );
      if (!packageFileName.toLowerCase().endsWith('.esriaddinx')) {
        throw new Error('packageFileName must end with .esriAddInX');
      }

      const layoutSnapshot = String(parsed.layoutSnapshot || '');
      const targetPath = await buildAddInPackage({ packageFileName, layoutSnapshot });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, path: targetPath }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    return;
  }

  if (req.method !== 'POST' || req.url !== '/write-file') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  try {
    const filename = sanitizeFilename(req.headers['x-filename']);
    const body = await readRequestBody(req);
    if (!body.length) throw new Error('Empty payload');

    await mkdir(downloadDir, { recursive: true });
    const targetPath = path.join(downloadDir, filename);
    await writeFile(targetPath, body);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, path: targetPath }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fixed-download-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[fixed-download-server] writing to ${downloadDir}`);
});
