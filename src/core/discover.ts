import path from 'path';
import { listDirs, listFiles, pathExists } from '../utils/fs.js';
import { getEffectiveChain } from './monorepo.js';
import type { InheritanceChain } from './types.js';

export type DiscoveredItem = {
  name: string; // e.g., "build.md" or "shared-skill/"
  path: string; // Full path
  source: string; // Which .agents it came from
  type: 'command' | 'skill' | 'hook';
};

export type DiscoveryOptions = {
  chain: InheritanceChain;
  excludeCurrent?: boolean; // When true, excludes items from chain.current
};

async function discoverFromDirectory(
  agentsPath: string,
  resourceDir: string,
  type: DiscoveredItem['type'],
  isDirectory: boolean
): Promise<DiscoveredItem[]> {
  const fullPath = path.join(agentsPath, resourceDir);

  if (!(await pathExists(fullPath))) {
    return [];
  }

  const items: DiscoveredItem[] = [];

  if (isDirectory) {
    // For skills/hooks directories, discover subdirectories
    const dirs = await listDirs(fullPath);
    for (const dir of dirs) {
      const name = `${path.basename(dir)}/`;
      items.push({
        name,
        path: dir,
        source: agentsPath,
        type,
      });
    }
  } else {
    // For commands, discover files
    const files = await listFiles(fullPath);
    for (const file of files) {
      const name = path.basename(file);
      items.push({
        name,
        path: file,
        source: agentsPath,
        type,
      });
    }
  }

  return items;
}

export async function discoverCommands(opts: DiscoveryOptions): Promise<DiscoveredItem[]> {
  const { chain, excludeCurrent } = opts;
  const effectiveChain = getEffectiveChain(chain);
  const sources = excludeCurrent && chain.current ? effectiveChain.filter((p) => p !== chain.current) : effectiveChain;

  const allItems: DiscoveredItem[] = [];
  const seen = new Set<string>();

  for (const agentsPath of sources) {
    const items = await discoverFromDirectory(agentsPath, 'commands', 'command', false);
    for (const item of items) {
      // Only add if we haven't seen this name yet (child items take precedence)
      if (!seen.has(item.name)) {
        seen.add(item.name);
        allItems.push(item);
      }
    }
  }

  return allItems;
}

export async function discoverSkills(opts: DiscoveryOptions): Promise<DiscoveredItem[]> {
  const { chain, excludeCurrent } = opts;
  const effectiveChain = getEffectiveChain(chain);
  const sources = excludeCurrent && chain.current ? effectiveChain.filter((p) => p !== chain.current) : effectiveChain;

  const allItems: DiscoveredItem[] = [];
  const seen = new Set<string>();

  for (const agentsPath of sources) {
    const items = await discoverFromDirectory(agentsPath, 'skills', 'skill', true);
    for (const item of items) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        allItems.push(item);
      }
    }
  }

  return allItems;
}

export async function discoverHooks(opts: DiscoveryOptions): Promise<DiscoveredItem[]> {
  const { chain, excludeCurrent } = opts;
  const effectiveChain = getEffectiveChain(chain);
  const sources = excludeCurrent && chain.current ? effectiveChain.filter((p) => p !== chain.current) : effectiveChain;

  const allItems: DiscoveredItem[] = [];
  const seen = new Set<string>();

  for (const agentsPath of sources) {
    const items = await discoverFromDirectory(agentsPath, 'hooks', 'hook', true);
    for (const item of items) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        allItems.push(item);
      }
    }
  }

  return allItems;
}

export type ParentDiscovery = {
  commands: DiscoveredItem[];
  skills: DiscoveredItem[];
  hooks: DiscoveredItem[];
};

export async function discoverParentResources(chain: InheritanceChain): Promise<ParentDiscovery> {
  const opts: DiscoveryOptions = { chain, excludeCurrent: true };

  const [commands, skills, hooks] = await Promise.all([
    discoverCommands(opts),
    discoverSkills(opts),
    discoverHooks(opts),
  ]);

  return { commands, skills, hooks };
}
