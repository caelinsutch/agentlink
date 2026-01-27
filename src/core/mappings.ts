import path from 'path';
import { pathExists } from '../utils/fs.js';
import { getExtendBehavior, getIncludeList, loadMonorepoConfig } from './config.js';
import { mergeAgentsMd, mergeDirectoryChain } from './merge.js';
import { getEffectiveChain } from './monorepo.js';
import { resolveMonorepoRoots, resolveRoots } from './paths.js';
import type { Client, InheritanceChain, Mapping, Scope } from './types.js';

export type MappingOptions = {
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
  clients?: Client[];
};

export async function getMappings(opts: MappingOptions): Promise<Mapping[]> {
  const roots = resolveRoots(opts);
  const canonical = roots.canonicalRoot;
  const claudeOverride = path.join(canonical, 'CLAUDE.md');
  const agentsFallback = path.join(canonical, 'AGENTS.md');
  const agentsSource = (await pathExists(claudeOverride)) ? claudeOverride : agentsFallback;
  const clients = new Set<Client>(opts.clients ?? ['claude', 'factory', 'codex', 'cursor', 'opencode']);

  const mappings: Mapping[] = [];
  const includeAgentFiles = opts.scope === 'global';
  if (includeAgentFiles && clients.has('claude')) {
    mappings.push({
      name: 'claude-md',
      source: agentsSource,
      targets: [path.join(roots.claudeRoot, 'CLAUDE.md')],
      kind: 'file',
    });
  }

  if (includeAgentFiles) {
    const agentTargets = [
      clients.has('factory') ? path.join(roots.factoryRoot, 'AGENTS.md') : null,
      clients.has('codex') ? path.join(roots.codexRoot, 'AGENTS.md') : null,
      clients.has('opencode') ? path.join(roots.opencodeConfigRoot, 'AGENTS.md') : null,
    ].filter(Boolean) as string[];

    if (agentTargets.length > 0) {
      mappings.push({
        name: 'agents-md',
        source: agentsFallback,
        targets: agentTargets,
        kind: 'file',
      });
    }
  }

  mappings.push(
    {
      name: 'commands',
      source: path.join(canonical, 'commands'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'commands') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'commands') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'prompts') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'commands') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'commands') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'hooks',
      source: path.join(canonical, 'hooks'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'hooks') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'hooks') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'skills',
      source: path.join(canonical, 'skills'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'skills') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'skills') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'skills') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'skills') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'skills') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    }
  );

  return mappings;
}

export type MonorepoMappingOptions = {
  chain: InheritanceChain;
  projectRoot?: string;
  homeDir?: string;
  clients?: Client[];
};

export async function getMonorepoMappings(opts: MonorepoMappingOptions): Promise<Mapping[]> {
  const roots = resolveMonorepoRoots({ scope: 'monorepo', ...opts });
  const clients = new Set<Client>(opts.clients ?? ['claude', 'factory', 'codex', 'cursor', 'opencode']);

  const effectiveChain = getEffectiveChain(opts.chain);
  if (effectiveChain.length === 0) {
    return [];
  }

  const firstInChain = effectiveChain[0];
  if (!firstInChain) {
    return [];
  }

  const currentRoot = opts.chain.current || firstInChain;
  const config = await loadMonorepoConfig(currentRoot);

  const mappings: Mapping[] = [];

  const agentsBehavior = getExtendBehavior(config, 'AGENTS.md');
  const agentsSource = await mergeAgentsMd({
    agentsPaths: effectiveChain,
    currentRoot,
    behavior: agentsBehavior,
  });

  if (agentsSource) {
    const isClaudeOverride = path.basename(agentsSource) === 'CLAUDE.md';

    if (clients.has('claude')) {
      mappings.push({
        name: 'claude-md',
        source: agentsSource,
        targets: [path.join(roots.claudeRoot, 'CLAUDE.md')],
        kind: 'file',
      });
    }

    if (!isClaudeOverride) {
      const agentTargets = [
        clients.has('factory') ? path.join(roots.factoryRoot, 'AGENTS.md') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'AGENTS.md') : null,
        clients.has('opencode') ? path.join(roots.opencodeConfigRoot, 'AGENTS.md') : null,
      ].filter(Boolean) as string[];

      if (agentTargets.length > 0) {
        mappings.push({
          name: 'agents-md',
          source: agentsSource,
          targets: agentTargets,
          kind: 'file',
        });
      }
    }
  }

  const commandsBehavior = getExtendBehavior(config, 'commands');
  const commandsSource = await mergeDirectoryChain({
    agentsPaths: effectiveChain,
    currentRoot,
    resource: 'commands',
    behavior: commandsBehavior,
    includeList: commandsBehavior === 'compose' ? getIncludeList(config, 'commands') : null,
  });

  if (commandsSource) {
    mappings.push({
      name: 'commands',
      source: commandsSource,
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'commands') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'commands') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'prompts') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'commands') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'commands') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    });
  }

  const hooksBehavior = getExtendBehavior(config, 'hooks');
  const hooksSource = await mergeDirectoryChain({
    agentsPaths: effectiveChain,
    currentRoot,
    resource: 'hooks',
    behavior: hooksBehavior,
    includeList: hooksBehavior === 'compose' ? getIncludeList(config, 'hooks') : null,
  });

  if (hooksSource) {
    mappings.push({
      name: 'hooks',
      source: hooksSource,
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'hooks') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'hooks') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    });
  }

  const skillsBehavior = getExtendBehavior(config, 'skills');
  const skillsSource = await mergeDirectoryChain({
    agentsPaths: effectiveChain,
    currentRoot,
    resource: 'skills',
    behavior: skillsBehavior,
    includeList: skillsBehavior === 'compose' ? getIncludeList(config, 'skills') : null,
  });

  if (skillsSource) {
    mappings.push({
      name: 'skills',
      source: skillsSource,
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'skills') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'skills') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'skills') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'skills') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'skills') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    });
  }

  return mappings;
}
