import yaml from 'js-yaml';
import path from 'path';
import { pathExists, readText, writeText } from '../utils/fs.js';
import type { ExtendBehavior, IncludeConfig, MonorepoConfig } from './types.js';

const CONFIG_FILENAME = 'config.yaml';

export function getConfigPath(agentsRoot: string): string {
  return path.join(agentsRoot, CONFIG_FILENAME);
}

export async function loadMonorepoConfig(agentsRoot: string): Promise<MonorepoConfig> {
  const configPath = getConfigPath(agentsRoot);

  if (!(await pathExists(configPath))) {
    return {};
  }

  try {
    const content = await readText(configPath);
    const parsed = yaml.load(content) as MonorepoConfig | null;
    return parsed || {};
  } catch {
    return {};
  }
}

export async function saveMonorepoConfig(agentsRoot: string, config: MonorepoConfig): Promise<void> {
  const configPath = getConfigPath(agentsRoot);
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: 80,
    noRefs: true,
  });
  await writeText(configPath, content);
}

export async function configExists(agentsRoot: string): Promise<boolean> {
  return pathExists(getConfigPath(agentsRoot));
}

export type ResourceName = 'AGENTS.md' | 'commands' | 'skills' | 'hooks';

export function getExtendBehavior(config: MonorepoConfig, resource: ResourceName): ExtendBehavior {
  if (config.extends === undefined || config.extends === true) {
    return 'inherit';
  }

  if (config.extends === false) {
    return 'override';
  }

  const specific = config.extends[resource];
  if (specific) {
    return specific;
  }

  return config.extends.default || 'inherit';
}

export function isExcluded(config: MonorepoConfig, filePath: string): boolean {
  if (!config.exclude || config.exclude.length === 0) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of config.exclude) {
    if (matchesGlobPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  return false;
}

function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

export function createDefaultConfig(extendsAll: boolean): MonorepoConfig {
  return {
    extends: extendsAll,
  };
}

export function createDetailedConfig(behaviors: Record<ResourceName, ExtendBehavior>): MonorepoConfig {
  return {
    extends: {
      'AGENTS.md': behaviors['AGENTS.md'],
      commands: behaviors.commands,
      skills: behaviors.skills,
      hooks: behaviors.hooks,
      default: 'inherit',
    },
  };
}

export type IncludeResourceName = 'commands' | 'skills' | 'hooks';

export function getIncludeList(config: MonorepoConfig, resource: IncludeResourceName): string[] | null {
  if (!config.include) {
    return null;
  }
  return config.include[resource] || null;
}

export type ComposeConfigOptions = {
  behaviors: Record<ResourceName, ExtendBehavior>;
  include?: IncludeConfig;
};

export function createComposeConfig(opts: ComposeConfigOptions): MonorepoConfig {
  const config: MonorepoConfig = {
    extends: {
      'AGENTS.md': opts.behaviors['AGENTS.md'],
      commands: opts.behaviors.commands,
      skills: opts.behaviors.skills,
      hooks: opts.behaviors.hooks,
      default: 'inherit',
    },
  };

  if (opts.include) {
    config.include = opts.include;
  }

  return config;
}
