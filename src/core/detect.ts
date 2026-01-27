import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { pathExists } from '../utils/fs.js';
import type { Client } from './types.js';

const execAsync = promisify(exec);

export type DetectionResult = {
  client: Client;
  detected: boolean;
  reason?: string;
};

async function commandExists(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

async function detectClaude(): Promise<DetectionResult> {
  const home = os.homedir();
  const configDir = path.join(home, '.claude');

  if (await pathExists(configDir)) {
    return { client: 'claude', detected: true, reason: '~/.claude exists' };
  }

  if (await commandExists('claude')) {
    return { client: 'claude', detected: true, reason: 'claude command available' };
  }

  return { client: 'claude', detected: false };
}

async function detectFactory(): Promise<DetectionResult> {
  const home = os.homedir();
  const configDir = path.join(home, '.factory');

  if (await pathExists(configDir)) {
    return { client: 'factory', detected: true, reason: '~/.factory exists' };
  }

  if (await commandExists('factory')) {
    return { client: 'factory', detected: true, reason: 'factory command available' };
  }

  return { client: 'factory', detected: false };
}

async function detectCodex(): Promise<DetectionResult> {
  const home = os.homedir();
  const configDir = path.join(home, '.codex');

  if (await pathExists(configDir)) {
    return { client: 'codex', detected: true, reason: '~/.codex exists' };
  }

  if (await commandExists('codex')) {
    return { client: 'codex', detected: true, reason: 'codex command available' };
  }

  return { client: 'codex', detected: false };
}

async function detectCursor(): Promise<DetectionResult> {
  const home = os.homedir();
  const configDir = path.join(home, '.cursor');
  const macAppPath = '/Applications/Cursor.app';

  if (await pathExists(configDir)) {
    return { client: 'cursor', detected: true, reason: '~/.cursor exists' };
  }

  if (process.platform === 'darwin' && (await pathExists(macAppPath))) {
    return { client: 'cursor', detected: true, reason: 'Cursor.app installed' };
  }

  return { client: 'cursor', detected: false };
}

async function detectOpenCode(): Promise<DetectionResult> {
  const home = os.homedir();
  const configDir = path.join(home, '.opencode');
  const xdgConfigDir = path.join(home, '.config', 'opencode');

  if (await pathExists(configDir)) {
    return { client: 'opencode', detected: true, reason: '~/.opencode exists' };
  }

  if (await pathExists(xdgConfigDir)) {
    return { client: 'opencode', detected: true, reason: '~/.config/opencode exists' };
  }

  if (await commandExists('opencode')) {
    return { client: 'opencode', detected: true, reason: 'opencode command available' };
  }

  return { client: 'opencode', detected: false };
}

const detectors: Record<Client, () => Promise<DetectionResult>> = {
  claude: detectClaude,
  factory: detectFactory,
  codex: detectCodex,
  cursor: detectCursor,
  opencode: detectOpenCode,
};

export async function detectClient(client: Client): Promise<DetectionResult> {
  return detectors[client]();
}

export async function detectAllClients(): Promise<Map<Client, DetectionResult>> {
  const results = new Map<Client, DetectionResult>();
  const clients: Client[] = ['claude', 'factory', 'codex', 'cursor', 'opencode'];

  const detectionPromises = clients.map((client) => detectClient(client));
  const detectionResults = await Promise.all(detectionPromises);

  for (let i = 0; i < clients.length; i++) {
    results.set(clients[i]!, detectionResults[i]!);
  }

  return results;
}

export async function getDetectedClients(): Promise<Client[]> {
  const results = await detectAllClients();
  return Array.from(results.entries())
    .filter(([_, result]) => result.detected)
    .map(([client, _]) => client);
}
