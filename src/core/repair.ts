/**
 * Repair command - fast, silent, idempotent symlink recreation.
 * Designed for postinstall hooks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureDir, pathExists } from '../utils/fs.js';
import { detectAllClients } from './detect.js';
import { getMappings, getMonorepoMappings } from './mappings.js';
import { detectMonorepoChain, hasMonorepoParent } from './monorepo.js';
import type { Client, InheritanceChain, Scope, SourceKind } from './types.js';

export type RepairResult = {
  scope: 'global' | 'project' | 'monorepo';
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type DetectedScope = {
  scope: 'global' | 'project' | 'monorepo';
  chain: InheritanceChain | null;
};

/**
 * Auto-detect scope: project .agents > monorepo > global ~/.agents
 */
async function detectScope(): Promise<DetectedScope | null> {
  const cwd = process.cwd();
  const projectAgents = path.join(cwd, '.agents');
  const globalAgents = path.join(os.homedir(), '.agents');

  if (await pathExists(projectAgents)) {
    const chain = await detectMonorepoChain();
    if (hasMonorepoParent(chain)) {
      return { scope: 'monorepo', chain };
    }
    return { scope: 'project', chain: null };
  }

  if (await pathExists(globalAgents)) {
    return { scope: 'global', chain: null };
  }

  return null;
}

async function getClients(): Promise<Client[]> {
  const results = await detectAllClients();
  const detected = Array.from(results.entries())
    .filter(([_, result]) => result.detected)
    .map(([client]) => client);

  return detected.length > 0 ? detected : ['claude', 'factory', 'codex', 'cursor', 'opencode'];
}

async function ensureSymlink(
  source: string,
  target: string,
  kind: SourceKind
): Promise<'created' | 'updated' | 'skipped' | 'error'> {
  try {
    if (!(await pathExists(source))) {
      return 'skipped';
    }

    const targetExists = await pathExists(target);

    if (targetExists) {
      const stat = await fs.promises.lstat(target);

      if (stat.isSymbolicLink()) {
        const currentTarget = await fs.promises.readlink(target);
        const resolvedCurrent = path.isAbsolute(currentTarget)
          ? currentTarget
          : path.resolve(path.dirname(target), currentTarget);

        if (path.resolve(resolvedCurrent) === path.resolve(source)) {
          return 'skipped';
        }

        await fs.promises.unlink(target);
        await ensureDir(path.dirname(target));
        await fs.promises.symlink(source, target, kind === 'dir' ? 'junction' : 'file');
        return 'updated';
      }

      return 'skipped';
    }

    await ensureDir(path.dirname(target));
    await fs.promises.symlink(source, target, kind === 'dir' ? 'junction' : 'file');
    return 'created';
  } catch {
    return 'error';
  }
}

/**
 * Repair symlinks - fast, silent, idempotent.
 */
export async function repair(): Promise<RepairResult> {
  const detected = await detectScope();

  if (!detected) {
    return {
      scope: 'project',
      created: 0,
      updated: 0,
      skipped: 0,
      errors: ['No .agents folder found (local or global). Run `agentlinker init` first.'],
    };
  }

  const { scope, chain } = detected;
  const clients = await getClients();

  const mappings =
    scope === 'monorepo' && chain
      ? await getMonorepoMappings({ chain, clients })
      : await getMappings({ scope: scope as Scope, clients });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    for (const target of mapping.targets) {
      const result = await ensureSymlink(mapping.source, target, mapping.kind);
      switch (result) {
        case 'created':
          created++;
          break;
        case 'updated':
          updated++;
          break;
        case 'skipped':
          skipped++;
          break;
        case 'error':
          errors.push(`Failed to link ${target}`);
          break;
      }
    }
  }

  return { scope, created, updated, skipped, errors };
}
