import os from 'os';
import path from 'path';
import type { InheritanceChain, Scope } from './types.js';

export type RootOptions = {
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
};

export type MonorepoRootOptions = {
  scope: 'monorepo';
  chain: InheritanceChain;
  projectRoot?: string;
  homeDir?: string;
};

export type ResolvedRoots = {
  canonicalRoot: string;
  claudeRoot: string;
  factoryRoot: string;
  codexRoot: string;
  cursorRoot: string;
  opencodeRoot: string;
  opencodeConfigRoot: string;
  projectRoot: string;
  homeDir: string;
};

export function resolveRoots(opts: RootOptions): ResolvedRoots {
  const homeDir = opts.homeDir || os.homedir();
  const projectRoot = path.resolve(opts.projectRoot || process.cwd());
  if (opts.scope === 'global') {
    return {
      canonicalRoot: path.join(homeDir, '.agents'),
      claudeRoot: path.join(homeDir, '.claude'),
      factoryRoot: path.join(homeDir, '.factory'),
      codexRoot: path.join(homeDir, '.codex'),
      cursorRoot: path.join(homeDir, '.cursor'),
      opencodeRoot: path.join(homeDir, '.opencode'),
      opencodeConfigRoot: path.join(homeDir, '.config', 'opencode'),
      projectRoot,
      homeDir,
    };
  }
  return {
    canonicalRoot: path.join(projectRoot, '.agents'),
    claudeRoot: path.join(projectRoot, '.claude'),
    factoryRoot: path.join(projectRoot, '.factory'),
    codexRoot: path.join(projectRoot, '.codex'),
    cursorRoot: path.join(projectRoot, '.cursor'),
    opencodeRoot: path.join(projectRoot, '.opencode'),
    opencodeConfigRoot: path.join(homeDir, '.config', 'opencode'),
    projectRoot,
    homeDir,
  };
}

export type MonorepoResolvedRoots = ResolvedRoots & {
  chain: InheritanceChain;
  effectiveRoot: string;
  mergedDir: string | null;
};

export function resolveMonorepoRoots(opts: MonorepoRootOptions): MonorepoResolvedRoots {
  const homeDir = opts.homeDir || os.homedir();
  const { chain } = opts;

  const effectiveRoot = chain.current || chain.ancestors[0] || chain.global || path.join(homeDir, '.agents');
  const projectRoot = chain.current ? path.dirname(chain.current) : opts.projectRoot || process.cwd();

  const mergedDir =
    chain.current && (chain.ancestors.length > 0 || chain.global) ? path.join(chain.current, 'merged') : null;

  return {
    canonicalRoot: effectiveRoot,
    claudeRoot: path.join(projectRoot, '.claude'),
    factoryRoot: path.join(projectRoot, '.factory'),
    codexRoot: path.join(projectRoot, '.codex'),
    cursorRoot: path.join(projectRoot, '.cursor'),
    opencodeRoot: path.join(projectRoot, '.opencode'),
    opencodeConfigRoot: path.join(homeDir, '.config', 'opencode'),
    projectRoot,
    homeDir,
    chain,
    effectiveRoot,
    mergedDir,
  };
}
