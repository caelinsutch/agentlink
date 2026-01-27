import os from 'os';
import path from 'path';
import { pathExists } from '../utils/fs.js';
import { loadMonorepoConfig } from './config.js';
import type { InheritanceChain, MonorepoConfig } from './types.js';

export type DetectOptions = {
  startDir?: string;
  homeDir?: string;
};

export async function detectMonorepoChain(opts: DetectOptions = {}): Promise<InheritanceChain> {
  const homeDir = opts.homeDir || os.homedir();
  const startDir = path.resolve(opts.startDir || process.cwd());
  const globalAgents = path.join(homeDir, '.agents');

  const chain: InheritanceChain = {
    global: (await pathExists(globalAgents)) ? globalAgents : null,
    ancestors: [],
    current: null,
  };

  let currentDir = startDir;
  const agentsFolders: string[] = [];

  while (true) {
    const agentsPath = path.join(currentDir, '.agents');

    if (await pathExists(agentsPath)) {
      agentsFolders.push(agentsPath);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || parentDir === homeDir || currentDir === homeDir) {
      break;
    }
    currentDir = parentDir;
  }

  if (agentsFolders.length > 0) {
    chain.current = agentsFolders[0] ?? null;
    chain.ancestors = agentsFolders.slice(1);
  }

  return chain;
}

export function hasMonorepoParent(chain: InheritanceChain): boolean {
  return chain.ancestors.length > 0 || chain.global !== null;
}

export function getEffectiveChain(chain: InheritanceChain): string[] {
  const effective: string[] = [];

  if (chain.current) {
    effective.push(chain.current);
  }

  effective.push(...chain.ancestors);

  if (chain.global) {
    effective.push(chain.global);
  }

  return effective;
}

export type ResolvedInheritance = {
  chain: InheritanceChain;
  configs: Map<string, MonorepoConfig>;
  effectiveRoot: string | null;
};

export async function resolveInheritance(opts: DetectOptions = {}): Promise<ResolvedInheritance> {
  const chain = await detectMonorepoChain(opts);
  const configs = new Map<string, MonorepoConfig>();
  const effectiveChain = getEffectiveChain(chain);

  for (const agentsPath of effectiveChain) {
    const config = await loadMonorepoConfig(agentsPath);
    configs.set(agentsPath, config);
  }

  return {
    chain,
    configs,
    effectiveRoot: chain.current,
  };
}

export function formatInheritanceDisplay(chain: InheritanceChain): string[] {
  const lines: string[] = [];

  if (chain.current) {
    lines.push(`Current: ${chain.current}`);
  }

  if (chain.ancestors.length > 0) {
    lines.push('Inherits from:');
    for (const ancestor of chain.ancestors) {
      lines.push(`  \u2514 ${ancestor}`);
    }
  }

  if (chain.global) {
    if (chain.ancestors.length === 0) {
      lines.push('Inherits from:');
    }
    lines.push(`  \u2514 ${chain.global} (global)`);
  }

  return lines;
}
