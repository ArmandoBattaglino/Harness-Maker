import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import semver from 'semver';

const execFileAsync = promisify(execFile);

function normalizeCacheMs(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000;
}

export function parseGitHubRemoteUrl(remoteUrl) {
  if (typeof remoteUrl !== 'string' || !remoteUrl.trim()) return null;
  const trimmed = remoteUrl.trim();
  const patterns = [
    /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/i,
    /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i,
    /^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.groups?.owner && match?.groups?.repo) {
      const owner = match.groups.owner;
      const repo = match.groups.repo;
      return {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        repositoryUrl: `https://github.com/${owner}/${repo}`,
      };
    }
  }
  return null;
}

async function defaultGitRunner(args, { cwd }) {
  return execFileAsync('git', args, { cwd, windowsHide: true });
}

async function defaultCommandRunner(command, args, { cwd }) {
  return execFileAsync(command, args, { cwd, windowsHide: true });
}

export default class UpdateChecker {
  constructor({
    repoRoot,
    appVersion,
    branch = process.env.APP_UPDATE_BRANCH || 'main',
    repository = process.env.APP_UPDATE_REPOSITORY || null,
    cacheMs = normalizeCacheMs(process.env.APP_UPDATE_CACHE_MS),
    gitRunner = defaultGitRunner,
    commandRunner = defaultCommandRunner,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
  } = {}) {
    this.repoRoot = repoRoot;
    this.appVersion = appVersion || '0.0.0';
    this.branch = branch;
    this.repository = repository;
    this.cacheMs = cacheMs;
    this.gitRunner = gitRunner;
    this.commandRunner = commandRunner;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this._cache = null;
  }

  async getStatus() {
    if (this._cache && (this.now() - this._cache.at) < this.cacheMs) {
      return this._cache.value;
    }

    let status;
    try {
      status = await this._buildStatus();
    } catch (error) {
      status = this._baseStatus({
        enabled: false,
        mode: 'error',
        updateAvailable: false,
        reason: error.message || 'Update check failed',
      });
    }

    this._cache = { at: this.now(), value: status };
    return status;
  }

  async _buildStatus() {
    const gitContext = await this._getGitContext();
    if (gitContext?.githubRepo && gitContext.localCommit) {
      return this._buildGitStatus(gitContext);
    }

    const githubRepo = parseGitHubRemoteUrl(this.repository) || parseGitHubRemoteUrl(`https://github.com/${this.repository}`);
    if (githubRepo) {
      return this._buildReleaseStatus(githubRepo);
    }

    return this._baseStatus({
      enabled: false,
      mode: 'disabled',
      updateAvailable: false,
      reason: 'No GitHub repository configured for update checks',
    });
  }

  _baseStatus(patch = {}) {
    return {
      enabled: false,
      updateAvailable: false,
      currentVersion: this.appVersion,
      branch: this.branch,
      checkedAt: new Date(this.now()).toISOString(),
      ...patch,
    };
  }

  async _getGitContext() {
    if (!this.repoRoot) return null;
    try {
      const [remoteUrl, localCommit, localBranch] = await Promise.all([
        this._git(['remote', 'get-url', 'origin']),
        this._git(['rev-parse', 'HEAD']),
        this._git(['rev-parse', '--abbrev-ref', 'HEAD']),
      ]);
      const githubRepo = parseGitHubRemoteUrl(remoteUrl);
      return {
        githubRepo,
        localCommit,
        localBranch,
      };
    } catch {
      return null;
    }
  }

  async _buildGitStatus({ githubRepo, localCommit, localBranch }) {
    let remoteCommit = null;
    try {
      const lsRemote = await this._git(['ls-remote', '--heads', 'origin', `refs/heads/${this.branch}`]);
      remoteCommit = lsRemote.split(/\s+/)[0] || null;
    } catch {
      remoteCommit = null;
    }

    if (!remoteCommit) {
      return this._buildReleaseStatus(githubRepo, {
        localCommit,
        localBranch,
      });
    }

    let relation = 'unknown';
    let aheadBy = 0;
    let behindBy = 0;
    let updateAvailable = false;

    if (localCommit === remoteCommit) {
      relation = 'up-to-date';
    } else {
      const [localIsAncestor, remoteIsAncestor] = await Promise.all([
        this._isAncestor(localCommit, remoteCommit),
        this._isAncestor(remoteCommit, localCommit),
      ]);

      if (localIsAncestor && !remoteIsAncestor) {
        relation = 'behind';
        updateAvailable = true;
        behindBy = await this._countCommits(localCommit, remoteCommit);
      } else if (!localIsAncestor && remoteIsAncestor) {
        relation = 'ahead';
        aheadBy = await this._countCommits(remoteCommit, localCommit);
      } else {
        relation = 'diverged';
        aheadBy = await this._countCommits(remoteCommit, localCommit);
        behindBy = await this._countCommits(localCommit, remoteCommit);
      }
    }

    const comparePath = relation === 'behind'
      ? `/compare/${localCommit}...${this.branch}`
      : `/commits/${this.branch}`;

    return this._baseStatus({
      enabled: true,
      mode: 'git-remote',
      updateAvailable,
      repository: githubRepo.fullName,
      repositoryUrl: githubRepo.repositoryUrl,
      actionUrl: `${githubRepo.repositoryUrl}${comparePath}`,
      actionLabel: updateAvailable ? 'Open updates' : 'Open repo',
      localBranch,
      localCommit,
      remoteCommit,
      relation,
      aheadBy,
      behindBy,
    });
  }

  async getAutoUpdatePlan(status = null) {
    const resolvedStatus = status ?? await this.getStatus();
    if (!resolvedStatus?.updateAvailable) {
      return { eligible: false, reason: 'No update available' };
    }
    if (resolvedStatus.mode !== 'git-remote') {
      return { eligible: false, reason: 'Automatic update requires a Git checkout' };
    }
    if (resolvedStatus.relation !== 'behind') {
      return { eligible: false, reason: `Automatic update is only supported when the local branch is behind ${this.branch}` };
    }
    if (resolvedStatus.localBranch !== this.branch) {
      return { eligible: false, reason: `Automatic update is only supported on branch ${this.branch}` };
    }

    const dirtyFiles = await this._getDirtyFiles();
    if (dirtyFiles.length > 0) {
      return {
        eligible: false,
        reason: 'Local changes detected; commit or stash them before updating',
        dirtyFiles,
      };
    }

    return {
      eligible: true,
      reason: null,
      branch: this.branch,
      localCommit: resolvedStatus.localCommit,
      remoteCommit: resolvedStatus.remoteCommit,
      behindBy: resolvedStatus.behindBy,
    };
  }

  async applyAutoUpdate(status = null) {
    const plan = await this.getAutoUpdatePlan(status);
    if (!plan.eligible) {
      throw new Error(plan.reason || 'Automatic update is not available');
    }

    const beforeCommit = plan.localCommit || await this._git(['rev-parse', 'HEAD']);
    await this._git(['pull', '--ff-only', 'origin', this.branch]);
    const afterCommit = await this._git(['rev-parse', 'HEAD']);

    const changedFiles = beforeCommit === afterCommit
      ? []
      : await this._git([
        'diff',
        '--name-only',
        `${beforeCommit}..${afterCommit}`,
        '--',
        'package.json',
        'package-lock.json',
        'client/package.json',
        'client/package-lock.json',
        'server/package.json',
        'server/package-lock.json',
      ]).then((stdout) => stdout ? stdout.split(/\r?\n/).filter(Boolean) : []);

    const installedScopes = [];
    if (changedFiles.some((file) => file === 'package.json' || file === 'package-lock.json')) {
      await this._runNpm(['install'], this.repoRoot);
      installedScopes.push('root');
    }
    if (changedFiles.some((file) => file.startsWith('server/'))) {
      await this._runNpm(['install'], this._resolveSubdir('server'));
      installedScopes.push('server');
    }
    if (changedFiles.some((file) => file.startsWith('client/'))) {
      await this._runNpm(['install'], this._resolveSubdir('client'));
      installedScopes.push('client');
    }

    await this._runNpm(['run', 'build', '--prefix', 'client'], this.repoRoot);
    this._cache = null;

    return {
      updated: beforeCommit !== afterCommit,
      beforeCommit,
      afterCommit,
      changedFiles,
      installedScopes,
      rebuiltClient: true,
    };
  }

  async _buildReleaseStatus(githubRepo, extra = {}) {
    if (typeof this.fetchImpl !== 'function') {
      return this._baseStatus({
        enabled: false,
        mode: 'disabled',
        updateAvailable: false,
        repository: githubRepo.fullName,
        repositoryUrl: githubRepo.repositoryUrl,
        reason: 'Fetch API unavailable for release checks',
        ...extra,
      });
    }

    try {
      const response = await this.fetchImpl(`https://api.github.com/repos/${githubRepo.fullName}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'claude-code-visual-manager-update-check',
        },
      });

      if (response.status === 404) {
        return this._baseStatus({
          enabled: false,
          mode: 'release-unavailable',
          updateAvailable: false,
          repository: githubRepo.fullName,
          repositoryUrl: githubRepo.repositoryUrl,
          reason: 'No GitHub releases found for this repository',
          ...extra,
        });
      }

      if (!response.ok) {
        throw new Error(`GitHub release check failed with HTTP ${response.status}`);
      }

      const release = await response.json();
      const latestVersion = semver.valid(semver.coerce(release.tag_name || release.name || ''));
      const currentVersion = semver.valid(semver.coerce(this.appVersion));
      const updateAvailable = Boolean(latestVersion && currentVersion && semver.gt(latestVersion, currentVersion));

      return this._baseStatus({
        enabled: true,
        mode: 'github-release',
        updateAvailable,
        repository: githubRepo.fullName,
        repositoryUrl: githubRepo.repositoryUrl,
        latestVersion: latestVersion || release.tag_name || release.name || null,
        releaseName: release.name || null,
        actionUrl: release.html_url || `${githubRepo.repositoryUrl}/releases`,
        actionLabel: updateAvailable ? 'Open release' : 'Open releases',
        reason: latestVersion ? null : 'Latest release tag is not a semantic version',
        ...extra,
      });
    } catch (error) {
      return this._baseStatus({
        enabled: false,
        mode: 'error',
        updateAvailable: false,
        repository: githubRepo.fullName,
        repositoryUrl: githubRepo.repositoryUrl,
        reason: error.message || 'Release check failed',
        ...extra,
      });
    }
  }

  async _git(args) {
    const { stdout } = await this.gitRunner(args, { cwd: this.repoRoot });
    return String(stdout || '').trim();
  }

  async _getDirtyFiles() {
    try {
      const stdout = await this._git(['status', '--porcelain']);
      return stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
    } catch {
      return ['git status unavailable'];
    }
  }

  async _runNpm(args, cwd) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await this.commandRunner(npmCommand, args, { cwd });
  }

  _resolveSubdir(name) {
    return join(this.repoRoot, name);
  }

  async _isAncestor(base, head) {
    try {
      await this.gitRunner(['merge-base', '--is-ancestor', base, head], { cwd: this.repoRoot });
      return true;
    } catch (error) {
      if (error && (error.code === 1 || error.exitCode === 1)) {
        return false;
      }
      throw error;
    }
  }

  async _countCommits(base, head) {
    try {
      const count = await this._git(['rev-list', '--count', `${base}..${head}`]);
      const parsed = Number.parseInt(count, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }
}
