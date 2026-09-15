import { invoke } from '@tauri-apps/api/core';

interface IconEntry {
  file: string;
  base: string;
  theme: string;
  px: number;
}

export interface IconHit {
  file: string;
  dataUrl: string;
}

const iconUrlCache = new Map<string, string>();
let allIconsPromise: Promise<IconEntry[]> | null = null;

export function listIcons(): Promise<IconEntry[]> {
  if (!allIconsPromise) {
    allIconsPromise = invoke<IconEntry[]>('list_icons').catch((err) => {
      allIconsPromise = null;
      throw err;
    });
  }
  return allIconsPromise;
}

/** 导入包落盘新图标后调用,让 IconPicker 重新拉取列表 */
export function invalidateIconList(): void {
  allIconsPromise = null;
}

export async function searchIcons(query: string, theme = 'light', limit = 120): Promise<IconHit[]> {
  const hits = await invoke<IconHit[]>('search_icons', {
    query,
    theme,
    limit,
  });
  for (const hit of hits) iconUrlCache.set(hit.file, hit.dataUrl);
  return hits;
}

export async function getIconUrl(file: string): Promise<string> {
  const cached = iconUrlCache.get(file);
  if (cached) return cached;
  const hit = await invoke<IconHit>('get_icon_data_url', { file });
  iconUrlCache.set(hit.file, hit.dataUrl);
  return hit.dataUrl;
}

/** Pair a 16px and 32px file from a selected icon file (prefers same base name). */
export function pairSizes(file: string, candidates: IconEntry[]): { small: string; large: string } {
  const entry = candidates.find((item) => item.file === file);
  const base = entry?.base ?? file.replace(/\d+\.png$/, '');
  const theme = entry?.theme ?? 'light';
  const sameBase = candidates.filter((item) => item.theme === theme && item.base === base);
  const small = sameBase.find((item) => item.px === 16)?.file ?? file;
  const large = sameBase.find((item) => item.px === 32)?.file ?? file;
  return { small, large };
}
