import { describe, expect, it, vi } from 'vitest';

import UpdateChecker, { parseGitHubRemoteUrl } from '../services/UpdateChecker.js';

function createGitRunner(resolver) {
  return vi.fn(async (args) => {
    const result = resolver(args);
    if (result instanceof Error) {
      throw result;
    }
    return { stdout: result ?? '' };
  });
}

describe('parseGitHubRemoteUrl', () => {
  it('parses https and ssh GitHub remotes', () => {
    expect(parseGitHubRemoteUrl('https://github.com/ArmandoBattaglino/Harness-Maker.git')).toMatchObject({
      fullName: 'ArmandoBattaglino/Harness-Maker',
      repositoryUrl: 'https://github.com/ArmandoBattaglino/Harness-Maker',
    });
    expect(parseGitHubRemoteUrl('git@github.com:ArmandoBattaglino/Harness-Maker.git')).toMatchObject({
      fullName: 'ArmandoBattaglino/Harness-Maker',
    });
  });
});

describe('UpdateChecker', () => {
  it('reports when local checkout is behind remote main', async () => {
    const gitRunner = createGitRunner((args) => {
      const key = args.join(' ');
      if (key === 'remote get-url origin') return 'https://github.com/ArmandoBattaglino/Harness-Maker.git\n';
      if (key === 'rev-parse HEAD') return '1111111111111111111111111111111111111111\n';
      if (key === 'rev-parse --abbrev-ref HEAD') return 'main\n';
      if (key === 'ls-remote --heads origin refs/heads/main') return '2222222222222222222222222222222222222222\trefs/heads/main\n';
      if (key === 'merge-base --is-ancestor 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222') return '';
      if (key === 'merge-base --is-ancestor 2222222222222222222222222222222222222222 1111111111111111111111111111111111111111') {
        const error = new Error('not ancestor');
        error.code = 1;
        return error;
      }
      if (key === 'rev-list --count 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222') return '3\n';
      throw new Error(`Unexpected git args: ${key}`);
    });

    const checker = new UpdateChecker({
      repoRoot: process.cwd(),
      appVersion: '9.0.0',
      gitRunner,
      fetchImpl: vi.fn(),
    });

    const status = await checker.getStatus();

    expect(status.mode).toBe('git-remote');
    expect(status.updateAvailable).toBe(true);
    expect(status.relation).toBe('behind');
    expect(status.behindBy).toBe(3);
    expect(status.actionUrl).toContain('/compare/1111111111111111111111111111111111111111...main');
  });

  it('reports when local checkout is up to date', async () => {
    const gitRunner = createGitRunner((args) => {
      const key = args.join(' ');
      if (key === 'remote get-url origin') return 'https://github.com/ArmandoBattaglino/Harness-Maker.git\n';
      if (key === 'rev-parse HEAD') return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';
      if (key === 'rev-parse --abbrev-ref HEAD') return 'main\n';
      if (key === 'ls-remote --heads origin refs/heads/main') return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/main\n';
      throw new Error(`Unexpected git args: ${key}`);
    });

    const checker = new UpdateChecker({
      repoRoot: process.cwd(),
      appVersion: '9.0.0',
      gitRunner,
      fetchImpl: vi.fn(),
    });

    const status = await checker.getStatus();

    expect(status.mode).toBe('git-remote');
    expect(status.updateAvailable).toBe(false);
    expect(status.relation).toBe('up-to-date');
  });

  it('falls back to latest GitHub release when git metadata is unavailable', async () => {
    const gitRunner = vi.fn(async () => {
      throw new Error('git unavailable');
    });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v9.1.0',
        name: 'v9.1.0',
        html_url: 'https://github.com/ArmandoBattaglino/Harness-Maker/releases/tag/v9.1.0',
      }),
    }));

    const checker = new UpdateChecker({
      repoRoot: process.cwd(),
      appVersion: '9.0.0',
      repository: 'ArmandoBattaglino/Harness-Maker',
      gitRunner,
      fetchImpl,
    });

    const status = await checker.getStatus();

    expect(status.mode).toBe('github-release');
    expect(status.updateAvailable).toBe(true);
    expect(status.latestVersion).toBe('9.1.0');
    expect(status.actionUrl).toContain('/releases/tag/v9.1.0');
  });

  it('blocks automatic updates when the worktree is dirty', async () => {
    const gitRunner = createGitRunner((args) => {
      const key = args.join(' ');
      if (key === 'remote get-url origin') return 'https://github.com/ArmandoBattaglino/Harness-Maker.git\n';
      if (key === 'rev-parse HEAD') return '1111111111111111111111111111111111111111\n';
      if (key === 'rev-parse --abbrev-ref HEAD') return 'main\n';
      if (key === 'ls-remote --heads origin refs/heads/main') return '2222222222222222222222222222222222222222\trefs/heads/main\n';
      if (key === 'merge-base --is-ancestor 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222') return '';
      if (key === 'merge-base --is-ancestor 2222222222222222222222222222222222222222 1111111111111111111111111111111111111111') {
        const error = new Error('not ancestor');
        error.code = 1;
        return error;
      }
      if (key === 'rev-list --count 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222') return '2\n';
      if (key === 'status --porcelain') return ' M server/index.js\n';
      throw new Error(`Unexpected git args: ${key}`);
    });

    const checker = new UpdateChecker({
      repoRoot: process.cwd(),
      appVersion: '9.0.0',
      gitRunner,
      fetchImpl: vi.fn(),
    });

    const plan = await checker.getAutoUpdatePlan();
    expect(plan.eligible).toBe(false);
    expect(plan.reason).toContain('Local changes detected');
  });

  it('applies a fast-forward update, reinstalls changed scopes, and rebuilds the client', async () => {
    const gitRunner = createGitRunner((args) => {
      const key = args.join(' ');
      if (key === 'remote get-url origin') return 'https://github.com/ArmandoBattaglino/Harness-Maker.git\n';
      if (key === 'rev-parse HEAD') return gitRunner.headCalls++ === 0
        ? '1111111111111111111111111111111111111111\n'
        : '2222222222222222222222222222222222222222\n';
      if (key === 'rev-parse --abbrev-ref HEAD') return 'main\n';
      if (key === 'ls-remote --heads origin refs/heads/main') return '2222222222222222222222222222222222222222\trefs/heads/main\n';
      if (key === 'merge-base --is-ancestor 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222') return '';
      if (key === 'merge-base --is-ancestor 2222222222222222222222222222222222222222 1111111111111111111111111111111111111111') {
        const error = new Error('not ancestor');
        error.code = 1;
        return error;
      }
      if (key === 'rev-list --count 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222') return '2\n';
      if (key === 'status --porcelain') return '';
      if (key === 'pull --ff-only origin main') return 'Updating 1111111..2222222\n';
      if (key === 'diff --name-only 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 -- package.json package-lock.json client/package.json client/package-lock.json server/package.json server/package-lock.json') {
        return 'client/package.json\nserver/package-lock.json\n';
      }
      throw new Error(`Unexpected git args: ${key}`);
    });
    gitRunner.headCalls = 0;
    const commandRunner = vi.fn(async () => ({ stdout: '' }));

    const checker = new UpdateChecker({
      repoRoot: process.cwd(),
      appVersion: '9.0.0',
      gitRunner,
      commandRunner,
      fetchImpl: vi.fn(),
    });

    const result = await checker.applyAutoUpdate();

    expect(result.updated).toBe(true);
    expect(result.installedScopes).toEqual(['server', 'client']);
    expect(commandRunner).toHaveBeenCalledWith(expect.stringMatching(/npm(\.cmd)?$/), ['install'], expect.objectContaining({
      cwd: expect.stringContaining('server'),
    }));
    expect(commandRunner).toHaveBeenCalledWith(expect.stringMatching(/npm(\.cmd)?$/), ['install'], expect.objectContaining({
      cwd: expect.stringContaining('client'),
    }));
    expect(commandRunner).toHaveBeenCalledWith(expect.stringMatching(/npm(\.cmd)?$/), ['run', 'build', '--prefix', 'client'], expect.objectContaining({
      cwd: process.cwd(),
    }));
  });
});
