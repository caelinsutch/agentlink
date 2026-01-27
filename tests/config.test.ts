import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  configExists,
  createComposeConfig,
  createDefaultConfig,
  createDetailedConfig,
  getConfigPath,
  getExtendBehavior,
  getIncludeList,
  isExcluded,
  loadMonorepoConfig,
  saveMonorepoConfig,
} from '../src/core/config.js';
import type { MonorepoConfig } from '../src/core/types.js';
import { makeTempDir, writeFile } from './helpers.js';

describe('getConfigPath', () => {
  test('returns config.yaml path within agents root', () => {
    const agentsRoot = '/path/to/.agents';
    const configPath = getConfigPath(agentsRoot);

    expect(configPath).toBe('/path/to/.agents/config.yaml');
  });
});

describe('loadMonorepoConfig', () => {
  test('returns empty object when config.yaml does not exist', async () => {
    const agentsRoot = await makeTempDir('config-agents-');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config).toEqual({});
  });

  test('loads simple extends: true config', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), 'extends: true\n');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config.extends).toBe(true);
  });

  test('loads simple extends: false config', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), 'extends: false\n');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config.extends).toBe(false);
  });

  test('loads detailed extends config with resource behaviors', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(
      path.join(agentsRoot, 'config.yaml'),
      `extends:
  AGENTS.md: extend
  commands: override
  skills: inherit
  hooks: extend
  default: inherit
`
    );

    const config = await loadMonorepoConfig(agentsRoot);

    expect(typeof config.extends).toBe('object');
    if (typeof config.extends === 'object') {
      expect(config.extends['AGENTS.md']).toBe('extend');
      expect(config.extends.commands).toBe('override');
      expect(config.extends.skills).toBe('inherit');
      expect(config.extends.hooks).toBe('extend');
      expect(config.extends.default).toBe('inherit');
    }
  });

  test('loads config with exclude patterns', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(
      path.join(agentsRoot, 'config.yaml'),
      `extends: true
exclude:
  - "*.test.ts"
  - "node_modules/**"
  - "dist/**/*.js"
`
    );

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config.extends).toBe(true);
    expect(config.exclude).toEqual(['*.test.ts', 'node_modules/**', 'dist/**/*.js']);
  });

  test('returns empty object for invalid YAML', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), '{ invalid yaml: [[');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config).toEqual({});
  });

  test('returns empty object for empty file', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), '');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config).toEqual({});
  });

  test('returns empty object for file with only whitespace', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), '   \n\n   ');

    const config = await loadMonorepoConfig(agentsRoot);

    expect(config).toEqual({});
  });
});

describe('saveMonorepoConfig', () => {
  test('saves simple config', async () => {
    const agentsRoot = await makeTempDir('config-save-');
    const config: MonorepoConfig = { extends: true };

    await saveMonorepoConfig(agentsRoot, config);

    const content = await fs.promises.readFile(path.join(agentsRoot, 'config.yaml'), 'utf8');
    expect(content).toContain('extends: true');
  });

  test('saves detailed config', async () => {
    const agentsRoot = await makeTempDir('config-save-');
    const config: MonorepoConfig = {
      extends: {
        'AGENTS.md': 'extend',
        commands: 'override',
        default: 'inherit',
      },
    };

    await saveMonorepoConfig(agentsRoot, config);

    const content = await fs.promises.readFile(path.join(agentsRoot, 'config.yaml'), 'utf8');
    expect(content).toContain('AGENTS.md: extend');
    expect(content).toContain('commands: override');
    expect(content).toContain('default: inherit');
  });

  test('saves config with exclude patterns', async () => {
    const agentsRoot = await makeTempDir('config-save-');
    const config: MonorepoConfig = {
      extends: true,
      exclude: ['*.test.ts', 'node_modules/**'],
    };

    await saveMonorepoConfig(agentsRoot, config);

    const content = await fs.promises.readFile(path.join(agentsRoot, 'config.yaml'), 'utf8');
    expect(content).toContain('exclude:');
    expect(content).toMatch(/- ['"]?\*\.test\.ts['"]?/);
  });

  test('overwrites existing config', async () => {
    const agentsRoot = await makeTempDir('config-save-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), 'extends: false\n');

    await saveMonorepoConfig(agentsRoot, { extends: true });

    const loaded = await loadMonorepoConfig(agentsRoot);
    expect(loaded.extends).toBe(true);
  });
});

describe('configExists', () => {
  test('returns false when config does not exist', async () => {
    const agentsRoot = await makeTempDir('config-exists-');

    const exists = await configExists(agentsRoot);

    expect(exists).toBe(false);
  });

  test('returns true when config exists', async () => {
    const agentsRoot = await makeTempDir('config-exists-');
    await writeFile(path.join(agentsRoot, 'config.yaml'), 'extends: true');

    const exists = await configExists(agentsRoot);

    expect(exists).toBe(true);
  });
});

describe('getExtendBehavior', () => {
  test('returns inherit when extends is undefined', () => {
    const config: MonorepoConfig = {};

    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('inherit');
    expect(getExtendBehavior(config, 'commands')).toBe('inherit');
    expect(getExtendBehavior(config, 'skills')).toBe('inherit');
    expect(getExtendBehavior(config, 'hooks')).toBe('inherit');
  });

  test('returns inherit when extends is true', () => {
    const config: MonorepoConfig = { extends: true };

    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('inherit');
    expect(getExtendBehavior(config, 'commands')).toBe('inherit');
    expect(getExtendBehavior(config, 'skills')).toBe('inherit');
    expect(getExtendBehavior(config, 'hooks')).toBe('inherit');
  });

  test('returns override when extends is false', () => {
    const config: MonorepoConfig = { extends: false };

    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('override');
    expect(getExtendBehavior(config, 'commands')).toBe('override');
    expect(getExtendBehavior(config, 'skills')).toBe('override');
    expect(getExtendBehavior(config, 'hooks')).toBe('override');
  });

  test('returns specific behavior when defined', () => {
    const config: MonorepoConfig = {
      extends: {
        'AGENTS.md': 'extend',
        commands: 'override',
        skills: 'inherit',
        default: 'inherit',
      },
    };

    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('extend');
    expect(getExtendBehavior(config, 'commands')).toBe('override');
    expect(getExtendBehavior(config, 'skills')).toBe('inherit');
  });

  test('falls back to default when resource not specified', () => {
    const config: MonorepoConfig = {
      extends: {
        'AGENTS.md': 'extend',
        default: 'override',
      },
    };

    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('extend');
    expect(getExtendBehavior(config, 'commands')).toBe('override');
    expect(getExtendBehavior(config, 'skills')).toBe('override');
    expect(getExtendBehavior(config, 'hooks')).toBe('override');
  });

  test('returns inherit when resource not specified and no default', () => {
    const config: MonorepoConfig = {
      extends: {
        'AGENTS.md': 'extend',
      },
    };

    expect(getExtendBehavior(config, 'commands')).toBe('inherit');
  });
});

describe('isExcluded', () => {
  test('returns false when no exclude patterns', () => {
    const config: MonorepoConfig = {};

    expect(isExcluded(config, 'src/file.ts')).toBe(false);
  });

  test('returns false when exclude is empty array', () => {
    const config: MonorepoConfig = { exclude: [] };

    expect(isExcluded(config, 'src/file.ts')).toBe(false);
  });

  test('matches simple glob pattern', () => {
    const config: MonorepoConfig = {
      exclude: ['*.test.ts'],
    };

    expect(isExcluded(config, 'file.test.ts')).toBe(true);
    expect(isExcluded(config, 'file.ts')).toBe(false);
    expect(isExcluded(config, 'src/file.test.ts')).toBe(false); // No path matching
  });

  test('matches double star glob pattern', () => {
    const config: MonorepoConfig = {
      exclude: ['node_modules/**'],
    };

    expect(isExcluded(config, 'node_modules/foo')).toBe(true);
    expect(isExcluded(config, 'node_modules/foo/bar')).toBe(true);
    expect(isExcluded(config, 'node_modules/foo/bar/baz.js')).toBe(true);
    expect(isExcluded(config, 'src/node_modules/foo')).toBe(false);
  });

  test('matches pattern with extension', () => {
    const config: MonorepoConfig = {
      exclude: ['dist/**/*.js'],
    };

    // dist/**/*.js requires at least one path segment after dist/
    expect(isExcluded(config, 'dist/sub/file.js')).toBe(true);
    expect(isExcluded(config, 'dist/a/b/file.js')).toBe(true);
    expect(isExcluded(config, 'dist/sub/file.ts')).toBe(false);
  });

  test('matches direct children with single star', () => {
    const config: MonorepoConfig = {
      exclude: ['dist/*.js'],
    };

    expect(isExcluded(config, 'dist/file.js')).toBe(true);
    expect(isExcluded(config, 'dist/file.ts')).toBe(false);
    expect(isExcluded(config, 'dist/sub/file.js')).toBe(false);
  });

  test('normalizes backslashes to forward slashes', () => {
    const config: MonorepoConfig = {
      exclude: ['dist/**'],
    };

    expect(isExcluded(config, 'dist\\file.js')).toBe(true);
    expect(isExcluded(config, 'dist\\sub\\file.js')).toBe(true);
  });

  test('matches multiple patterns', () => {
    const config: MonorepoConfig = {
      exclude: ['*.test.ts', 'node_modules/**', '*.spec.ts'],
    };

    expect(isExcluded(config, 'file.test.ts')).toBe(true);
    expect(isExcluded(config, 'file.spec.ts')).toBe(true);
    expect(isExcluded(config, 'node_modules/pkg')).toBe(true);
    expect(isExcluded(config, 'file.ts')).toBe(false);
  });

  test('handles dots in patterns correctly', () => {
    const config: MonorepoConfig = {
      exclude: ['.hidden/**'],
    };

    expect(isExcluded(config, '.hidden/file')).toBe(true);
    expect(isExcluded(config, 'xhidden/file')).toBe(false);
  });
});

describe('createDefaultConfig', () => {
  test('creates config with extends: true', () => {
    const config = createDefaultConfig(true);

    expect(config).toEqual({ extends: true });
  });

  test('creates config with extends: false', () => {
    const config = createDefaultConfig(false);

    expect(config).toEqual({ extends: false });
  });
});

describe('createDetailedConfig', () => {
  test('creates config with all resource behaviors', () => {
    const config = createDetailedConfig({
      'AGENTS.md': 'extend',
      commands: 'override',
      skills: 'inherit',
      hooks: 'extend',
    });

    expect(config.extends).toEqual({
      'AGENTS.md': 'extend',
      commands: 'override',
      skills: 'inherit',
      hooks: 'extend',
      default: 'inherit',
    });
  });
});

describe('getIncludeList', () => {
  test('returns null when no include config', () => {
    const config: MonorepoConfig = { extends: true };

    expect(getIncludeList(config, 'commands')).toBeNull();
    expect(getIncludeList(config, 'skills')).toBeNull();
    expect(getIncludeList(config, 'hooks')).toBeNull();
  });

  test('returns null when include config exists but resource is not specified', () => {
    const config: MonorepoConfig = {
      extends: true,
      include: {
        commands: ['build.md'],
      },
    };

    expect(getIncludeList(config, 'skills')).toBeNull();
    expect(getIncludeList(config, 'hooks')).toBeNull();
  });

  test('returns include list for specified resource', () => {
    const config: MonorepoConfig = {
      extends: true,
      include: {
        commands: ['build.md', 'test.md'],
        skills: ['shared-skill/'],
      },
    };

    expect(getIncludeList(config, 'commands')).toEqual(['build.md', 'test.md']);
    expect(getIncludeList(config, 'skills')).toEqual(['shared-skill/']);
    expect(getIncludeList(config, 'hooks')).toBeNull();
  });
});

describe('createComposeConfig', () => {
  test('creates config with behaviors only when no include list', () => {
    const config = createComposeConfig({
      behaviors: {
        'AGENTS.md': 'extend',
        commands: 'compose',
        skills: 'override',
        hooks: 'inherit',
      },
    });

    expect(config.extends).toEqual({
      'AGENTS.md': 'extend',
      commands: 'compose',
      skills: 'override',
      hooks: 'inherit',
      default: 'inherit',
    });
    expect(config.include).toBeUndefined();
  });

  test('creates config with behaviors and include list', () => {
    const config = createComposeConfig({
      behaviors: {
        'AGENTS.md': 'extend',
        commands: 'compose',
        skills: 'compose',
        hooks: 'inherit',
      },
      include: {
        commands: ['build.md', 'lint.md'],
        skills: ['shared-skill/'],
      },
    });

    expect(config.extends).toEqual({
      'AGENTS.md': 'extend',
      commands: 'compose',
      skills: 'compose',
      hooks: 'inherit',
      default: 'inherit',
    });
    expect(config.include).toEqual({
      commands: ['build.md', 'lint.md'],
      skills: ['shared-skill/'],
    });
  });

  test('creates config with empty include object when provided', () => {
    const config = createComposeConfig({
      behaviors: {
        'AGENTS.md': 'inherit',
        commands: 'override',
        skills: 'override',
        hooks: 'inherit',
      },
      include: {},
    });

    // Empty object should still be included
    expect(config.include).toEqual({});
  });
});

describe('getExtendBehavior - compose', () => {
  test('returns compose when specified for resource', () => {
    const config: MonorepoConfig = {
      extends: {
        'AGENTS.md': 'extend',
        commands: 'compose',
        skills: 'compose',
        hooks: 'inherit',
      },
    };

    expect(getExtendBehavior(config, 'commands')).toBe('compose');
    expect(getExtendBehavior(config, 'skills')).toBe('compose');
    expect(getExtendBehavior(config, 'AGENTS.md')).toBe('extend');
  });
});

describe('loadMonorepoConfig - compose and include', () => {
  test('loads config with compose behavior and include list', async () => {
    const agentsRoot = await makeTempDir('config-agents-');
    await writeFile(
      path.join(agentsRoot, 'config.yaml'),
      `extends:
  AGENTS.md: extend
  commands: compose
  skills: compose
  hooks: inherit
include:
  commands:
    - build.md
    - lint.md
  skills:
    - shared-skill/
`
    );

    const config = await loadMonorepoConfig(agentsRoot);

    expect(typeof config.extends).toBe('object');
    if (typeof config.extends === 'object') {
      expect(config.extends.commands).toBe('compose');
      expect(config.extends.skills).toBe('compose');
    }
    expect(config.include).toEqual({
      commands: ['build.md', 'lint.md'],
      skills: ['shared-skill/'],
    });
  });
});

describe('saveMonorepoConfig - compose and include', () => {
  test('saves config with compose behavior and include list', async () => {
    const agentsRoot = await makeTempDir('config-save-');
    const config = createComposeConfig({
      behaviors: {
        'AGENTS.md': 'extend',
        commands: 'compose',
        skills: 'compose',
        hooks: 'inherit',
      },
      include: {
        commands: ['build.md'],
        skills: ['shared-skill/'],
      },
    });

    await saveMonorepoConfig(agentsRoot, config);

    const loaded = await loadMonorepoConfig(agentsRoot);
    expect(loaded.extends).toEqual(config.extends);
    expect(loaded.include).toEqual(config.include);
  });
});
