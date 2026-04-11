import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';

import {
  normalizePackDefinition,
  normalizePackFixture,
  normalizePackInstall,
  validatePackDefinition,
  validatePackFixture,
} from '../services/packContracts.js';

const MAX_VERSIONS_PER_PACK = 50;

export class PackStore {
  constructor(configDir, workflowStore = null) {
    this._packsDir = path.join(configDir, 'packs');
    this._versionsDir = path.join(this._packsDir, 'versions');
    this._fixturesDir = path.join(this._packsDir, 'fixtures');
    this._installsDir = path.join(this._packsDir, 'installs');
    this._workflowStore = workflowStore;
  }

  setWorkflowStore(workflowStore) {
    this._workflowStore = workflowStore;
  }

  async init() {
    for (const dir of [this._packsDir, this._versionsDir, this._fixturesDir, this._installsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  async list() {
    const entries = this._listJsonEntries(this._packsDir);
    const packs = [];
    for (const entry of entries) {
      const pack = await this.get(entry.slice(0, -5));
      if (pack) {
        packs.push(pack);
      }
    }
    packs.sort((left, right) => {
      const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    });
    return packs;
  }

  async get(id) {
    const filePath = this._resolvePackPath(id);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return normalizePackDefinition(parsed);
    } catch {
      return null;
    }
  }

  async create(data) {
    const pack = normalizePackDefinition(data);
    const workflow = await this._getLinkedWorkflowOrThrow(pack.workflowId);

    const validation = validatePackDefinition(pack, { workflowDef: workflow });
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join('; ')}`);
      err.statusCode = 400;
      throw err;
    }

    await this._writePack(pack);
    return pack;
  }

  async update(id, data) {
    const existing = await this.get(id);
    if (!existing) {
      const err = new Error(`Pack not found: ${id}`);
      err.statusCode = 404;
      throw err;
    }
    if (['published', 'deprecated', 'archived'].includes(existing.status)) {
      const err = new Error(`Pack ${id} is ${existing.status} and cannot be edited directly`);
      err.statusCode = 409;
      throw err;
    }

    const next = normalizePackDefinition({
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });

    const workflow = await this._getLinkedWorkflowOrThrow(next.workflowId);

    const validation = validatePackDefinition(next, { workflowDef: workflow });
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join('; ')}`);
      err.statusCode = 400;
      throw err;
    }

    await this._saveVersion(id, existing);
    await this._writePack(next);
    return next;
  }

  async delete(id) {
    const filePath = this._resolvePackPath(id);
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  async listVersions(id) {
    const pack = await this.get(id);
    if (!pack) return [];

    const versionsDir = this._resolveVersionsDir(id);
    if (!versionsDir || !fs.existsSync(versionsDir)) return [];

    return this._listJsonEntries(versionsDir)
      .map((entry) => {
        const timestamp = entry.slice(0, -5);
        const version = this._readJsonFile(path.join(versionsDir, entry));
        if (!version) return null;
        return {
          timestamp,
          packVersion: version.packVersion ?? '',
          status: version.status ?? 'draft',
          savedAt: timestamp,
          name: version.name ?? '',
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async getVersion(id, timestamp) {
    const versionsDir = this._resolveVersionsDir(id);
    if (!versionsDir) return null;
    const filePath = this._resolveVersionPath(versionsDir, timestamp);
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = this._readJsonFile(filePath);
    return parsed ? normalizePackDefinition(parsed) : null;
  }

  async restoreVersion(id, timestamp) {
    const version = await this.getVersion(id, timestamp);
    if (!version) {
      const err = new Error(`Version not found: ${id}@${timestamp}`);
      err.statusCode = 404;
      throw err;
    }

    const current = await this.get(id);
    if (current) {
      await this._saveVersion(id, current);
    }

    const restored = normalizePackDefinition({
      ...version,
      id,
      updatedAt: new Date().toISOString(),
    });
    await this._writePack(restored);
    return restored;
  }

  async createPublishedVersion(id) {
    const pack = await this.get(id);
    if (!pack) {
      const err = new Error(`Pack not found: ${id}`);
      err.statusCode = 404;
      throw err;
    }
    await this._saveVersion(id, pack);
    const next = normalizePackDefinition({
      ...pack,
      status: 'published',
      updatedAt: new Date().toISOString(),
    });
    await this._writePack(next);
    return next;
  }

  async saveFixture(packId, fixtureData) {
    const pack = await this.get(packId);
    if (!pack) {
      const err = new Error(`Pack not found: ${packId}`);
      err.statusCode = 404;
      throw err;
    }

    const fixture = normalizePackFixture(fixtureData);
    const validation = validatePackFixture(fixture);
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join('; ')}`);
      err.statusCode = 400;
      throw err;
    }

    const fixturesDir = this._resolveFixturesDir(packId);
    fs.mkdirSync(fixturesDir, { recursive: true });
    const filePath = this._resolveFixturePath(fixturesDir, fixture.id);
    await writeFileAtomic(filePath, JSON.stringify(fixture, null, 2));
    return fixture;
  }

  async listFixtures(packId) {
    const fixturesDir = this._resolveFixturesDir(packId);
    if (!fixturesDir || !fs.existsSync(fixturesDir)) return [];
    return this._listJsonEntries(fixturesDir)
      .map((entry) => this._readJsonFile(path.join(fixturesDir, entry)))
      .filter(Boolean)
      .map((fixture) => normalizePackFixture(fixture));
  }

  async getFixture(packId, fixtureId) {
    const fixturesDir = this._resolveFixturesDir(packId);
    if (!fixturesDir) return null;
    const filePath = this._resolveFixturePath(fixturesDir, fixtureId);
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = this._readJsonFile(filePath);
    return parsed ? normalizePackFixture(parsed) : null;
  }

  async saveInstall(installData) {
    const install = normalizePackInstall(installData);
    const filePath = this._resolveInstallPath(install.id);
    await writeFileAtomic(filePath, JSON.stringify(install, null, 2));
    return install;
  }

  async listInstalls() {
    return this._listJsonEntries(this._installsDir)
      .map((entry) => this._readJsonFile(path.join(this._installsDir, entry)))
      .filter(Boolean)
      .map((install) => normalizePackInstall(install));
  }

  async getInstall(id) {
    const filePath = this._resolveInstallPath(id);
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = this._readJsonFile(filePath);
    return parsed ? normalizePackInstall(parsed) : null;
  }

  async exportBundle(id) {
    const pack = await this.get(id);
    if (!pack) {
      const err = new Error(`Pack not found: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    const workflow = this._workflowStore ? await this._workflowStore.get(pack.workflowId) : null;
    return {
      manifest: {
        bundleVersion: 1,
        exportedAt: new Date().toISOString(),
        packId: pack.id,
        packVersion: pack.packVersion,
        workflowId: pack.workflowId,
        provenance: pack.installMetadata ?? null,
      },
      pack,
      workflow,
    };
  }

  async importBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      const err = new Error('Bundle payload is required');
      err.statusCode = 400;
      throw err;
    }
    if (!bundle.pack || !bundle.workflow) {
      const err = new Error('Bundle must include pack and workflow');
      err.statusCode = 400;
      throw err;
    }
    if (!this._workflowStore) {
      const err = new Error('Workflow store unavailable');
      err.statusCode = 503;
      throw err;
    }

    const importedWorkflow = await this._workflowStore.create({
      name: bundle.workflow.name,
      description: bundle.workflow.description,
      projectId: bundle.workflow.projectId,
      nodes: bundle.workflow.nodes,
      edges: bundle.workflow.edges,
      settings: bundle.workflow.settings,
      initialContext: bundle.workflow.initialContext,
    });

    const importedPack = await this.create({
      ...bundle.pack,
      id: undefined,
      workflowId: importedWorkflow.id,
      dependencies: this._rebindWorkflowDependency(bundle.pack.dependencies, importedWorkflow.id),
      status: 'draft',
      installMetadata: bundle.manifest?.provenance ?? null,
    });

    return {
      pack: importedPack,
      workflow: importedWorkflow,
    };
  }

  async forkPack(id) {
    const pack = await this.get(id);
    if (!pack) {
      const err = new Error(`Pack not found: ${id}`);
      err.statusCode = 404;
      throw err;
    }
    return this.create({
      ...pack,
      id: undefined,
      name: `${pack.name} Fork`,
      status: 'draft',
      installMetadata: {
        sourcePackId: pack.id,
        sourceVersion: pack.packVersion,
        forkedAt: new Date().toISOString(),
      },
    });
  }

  _rebindWorkflowDependency(dependencies, workflowId) {
    const nextDependencies = Array.isArray(dependencies)
      ? dependencies.map((dependency) => (
          dependency?.type === 'workflow'
            ? { ...dependency, targetId: workflowId }
            : { ...dependency }
        ))
      : [];
    if (!nextDependencies.some((dependency) => dependency?.type === 'workflow' && dependency?.targetId === workflowId)) {
      nextDependencies.push({
        id: 'linked-workflow',
        type: 'workflow',
        targetId: workflowId,
        version: 'current',
        required: true,
      });
    }
    return nextDependencies;
  }

  _listJsonEntries(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((entry) => entry.endsWith('.json'))
      .sort();
  }

  _readJsonFile(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  _resolvePackPath(id) {
    return this._resolveChildPath(this._packsDir, `${id}.json`);
  }

  _resolveInstallPath(id) {
    return this._resolveChildPath(this._installsDir, `${id}.json`);
  }

  _resolveVersionsDir(id) {
    return this._resolveChildPath(this._versionsDir, id);
  }

  _resolveFixturesDir(id) {
    return this._resolveChildPath(this._fixturesDir, id);
  }

  _resolveVersionPath(versionsDir, timestamp) {
    return this._resolveChildPath(versionsDir, `${timestamp}.json`);
  }

  _resolveFixturePath(fixturesDir, fixtureId) {
    return this._resolveChildPath(fixturesDir, `${fixtureId}.json`);
  }

  _resolveChildPath(baseDir, childName) {
    if (typeof childName !== 'string' || !childName.trim()) return null;
    if (childName.includes('/') || childName.includes('\\') || childName.includes('..') || childName.includes('\0')) {
      return null;
    }
    const resolved = path.resolve(baseDir, childName);
    if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
      return null;
    }
    return resolved;
  }

  async _writePack(pack) {
    fs.mkdirSync(this._packsDir, { recursive: true });
    const filePath = this._resolvePackPath(pack.id);
    if (!filePath) {
      throw new Error(`Invalid pack id: ${pack.id}`);
    }
    await writeFileAtomic(filePath, JSON.stringify(pack, null, 2));
  }

  async _saveVersion(id, packData) {
    const versionsDir = this._resolveVersionsDir(id);
    if (!versionsDir) return;
    fs.mkdirSync(versionsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = this._resolveVersionPath(versionsDir, timestamp);
    await writeFileAtomic(filePath, JSON.stringify(packData, null, 2));

    const entries = this._listJsonEntries(versionsDir);
    while (entries.length > MAX_VERSIONS_PER_PACK) {
      const oldest = entries.shift();
      if (!oldest) break;
      try {
        fs.unlinkSync(path.join(versionsDir, oldest));
      } catch {
        break;
      }
    }
  }

  async _getLinkedWorkflowOrThrow(workflowId) {
    if (!this._workflowStore) return null;
    const workflow = await this._workflowStore.get(workflowId);
    if (!workflow) {
      const err = new Error(`Linked workflow not found: ${workflowId}`);
      err.statusCode = 400;
      throw err;
    }
    return workflow;
  }
}

export default PackStore;
