import { describe, expect, test } from 'bun:test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { makeTempDir, writeFile } from './helpers.js';

async function runCli(
  args: string[],
  options?: { cwd?: string; home?: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const env: Record<string, string> = { ...process.env, NO_COLOR: '1' } as Record<string, string>;
    if (options?.home) {
      env.HOME = options.home;
    }
    const proc = spawn('bun', ['run', path.join(process.cwd(), 'src/cli.tsx'), ...args], {
      cwd: options?.cwd || process.cwd(),
      env,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe('agentlinker apply', () => {
  test('requires --scope flag', async () => {
    const result = await runCli(['apply']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--scope flag is required');
  });

  test('rejects invalid scope', async () => {
    const result = await runCli(['apply', '--scope=invalid']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid scope');
  });

  test('rejects invalid clients', async () => {
    const home = await makeTempDir('apply-invalid-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Test');

    const result = await runCli(['apply', '--scope=project', '--clients=invalid'], { cwd: home, home });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid client');
  });

  test('accepts valid clients with dry-run', async () => {
    const home = await makeTempDir('apply-valid-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Test');
    await fs.promises.mkdir(path.join(agentsDir, 'commands'), { recursive: true });

    const result = await runCli(['apply', '--scope=project', '--clients=claude,cursor', '--dry-run'], {
      cwd: home,
      home,
    });
    expect(result.stdout).toContain('Claude');
    expect(result.stdout).toContain('Cursor');
  });

  test('--dry-run prevents changes', async () => {
    const home = await makeTempDir('apply-dryrun-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Test');
    await fs.promises.mkdir(path.join(agentsDir, 'commands'), { recursive: true });

    const result = await runCli(['apply', '--scope=project', '--clients=claude', '--dry-run'], { cwd: home, home });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dry-run');

    const claudeDir = path.join(home, '.claude');
    const exists = fs.existsSync(claudeDir);
    expect(exists).toBe(false);
  });

  test('applies changes with --yes', async () => {
    const home = await makeTempDir('apply-yes-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Test');
    await fs.promises.mkdir(path.join(agentsDir, 'commands'), { recursive: true });
    await writeFile(path.join(agentsDir, 'commands', 'test.md'), '# Test command');

    const result = await runCli(['apply', '--scope=project', '--clients=claude', '--yes'], { cwd: home, home });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Done');
  });

  test('global scope with dry-run', async () => {
    const home = await makeTempDir('apply-global-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Global test');
    await fs.promises.mkdir(path.join(agentsDir, 'commands'), { recursive: true });

    const result = await runCli(['apply', '--scope=global', '--dry-run'], { cwd: home, home });
    expect(result.stdout).toContain('global scope');
  });

  test('outputs progress messages', async () => {
    const home = await makeTempDir('apply-output-');
    const agentsDir = path.join(home, '.agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'AGENTS.md'), '# Test');
    await fs.promises.mkdir(path.join(agentsDir, 'commands'), { recursive: true });

    const result = await runCli(['apply', '--scope=project', '--clients=claude', '--dry-run'], { cwd: home, home });
    expect(result.stdout).toContain('Applying agentlinker');
    expect(result.stdout).toContain('Scanning');
    expect(result.stdout).toContain('Found');
  });
});
