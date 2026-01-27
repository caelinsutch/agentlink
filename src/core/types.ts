export type Scope = 'global' | 'project';
export type SourceKind = 'file' | 'dir';
export type Client = 'claude' | 'factory' | 'codex' | 'cursor' | 'opencode';

export type Mapping = {
  name: string;
  source: string;
  targets: string[];
  kind: SourceKind;
};

export type LinkTask =
  | { type: 'ensure-source'; path: string; kind: SourceKind }
  | { type: 'link'; source: string; target: string; kind: SourceKind; replaceSymlink?: boolean }
  | { type: 'conflict'; source: string; target: string; reason: string; kind?: SourceKind }
  | { type: 'noop'; source: string; target: string };

export type ConflictTask = Extract<LinkTask, { type: 'conflict' }>;

export type LinkPlan = {
  tasks: LinkTask[];
  changes: LinkTask[];
  conflicts: ConflictTask[];
};

export type LinkStatus = {
  name: string;
  source: string;
  targets: { path: string; status: 'linked' | 'missing' | 'conflict' }[];
};

export type InheritanceChain = {
  global: string | null;
  ancestors: string[];
  current: string | null;
};

export type ExtendBehavior = 'inherit' | 'override' | 'extend' | 'compose';

export type IncludeConfig = {
  commands?: string[];
  skills?: string[];
  hooks?: string[];
};

export type MonorepoConfig = {
  extends?:
    | boolean
    | {
        'AGENTS.md'?: ExtendBehavior;
        commands?: ExtendBehavior;
        skills?: ExtendBehavior;
        hooks?: ExtendBehavior;
        default?: ExtendBehavior;
      };
  include?: IncludeConfig;
  exclude?: string[];
};
