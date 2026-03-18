// tests/JobRunner.test.js
// Tests for JobRunner: job hang prevention, cancellation, timeout handling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

// ---------------------------------------------------------------------------
// Mock child_process.spawn before importing JobRunner
// ---------------------------------------------------------------------------
let spawnMock;

vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal();
  spawnMock = vi.fn();
  return { ...orig, spawn: spawnMock };
});

// Mock tree-kill (CJS)
vi.mock('tree-kill', () => ({
  default: vi.fn((pid, signal, cb) => { if (cb) cb(); }),
}));

import { JobRunner } from '../services/JobRunner.js';

// ---------------------------------------------------------------------------
// Helpers to create mock child processes
// ---------------------------------------------------------------------------
function makeMockChild(pid = 12345) {
  const stdout = new EventEmitter();
  stdout.pipe = vi.fn();
  const stderr = new EventEmitter();
  stderr.pipe = vi.fn();
  const stdin = new EventEmitter();
  stdin.end = vi.fn(); // CRITICAL: DEC-005 — stdin.end() must be called

  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = stdin;
  child.kill = vi.fn();

  return child;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('JobRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new JobRunner();
    runner.claudeBin = '/usr/local/bin/claude';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // startJob — basic behaviour
  // -------------------------------------------------------------------------
  describe('startJob', () => {
    it('should throw if claudeBin is not set', () => {
      const freshRunner = new JobRunner();
      expect(() => freshRunner.startJob('proj', '/path', 'test prompt')).toThrow(
        /claudeBin not set/
      );
    });

    it('should return a jobId and createdAt immediately', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const result = runner.startJob('proj-1', '/project', 'describe this code');

      expect(typeof result.jobId).toBe('string');
      expect(result.projectId).toBe('proj-1');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should call child.stdin.end() immediately — hang prevention (DEC-005)', () => {
      // This test catches the critical GitHub #7497 hang bug.
      // If stdin.end() is NOT called, the claude process hangs forever.
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      runner.startJob('proj-1', '/project', 'a prompt');

      expect(child.stdin.end).toHaveBeenCalledOnce();
    });

    it('should spawn with shell: false (SEC-02)', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      runner.startJob('proj-1', '/project', 'a prompt');

      expect(spawnMock).toHaveBeenCalledOnce();
      const spawnOptions = spawnMock.mock.calls[0][2];
      expect(spawnOptions.shell).toBe(false);
    });

    it('should record the job in listJobs', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const jobs = runner.listJobs();
      const found = jobs.find(j => j.jobId === jobId);

      expect(found).toBeDefined();
      expect(found.status).toBe('running');
    });

    it('should set job status to done when process exits with code 0', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const job = runner.getJob(jobId);

      // Simulate process exit
      child.emit('close', 0);

      expect(job.status).toBe('done');
      expect(job.completedAt).toBeInstanceOf(Date);
    });

    it('should set job status to error when process exits with non-zero code', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const job = runner.getJob(jobId);

      child.emit('close', 1);

      expect(job.status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // cancelJob
  // -------------------------------------------------------------------------
  describe('cancelJob', () => {
    it('should return false for unknown jobId', () => {
      expect(runner.cancelJob('nonexistent')).toBe(false);
    });

    it('should return false if job is already done', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const job = runner.getJob(jobId);
      child.emit('close', 0); // complete it first

      expect(runner.cancelJob(jobId)).toBe(false);
    });

    it('should cancel a running job and return true', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const result = runner.cancelJob(jobId);

      expect(result).toBe(true);
      expect(runner.getJob(jobId).status).toBe('cancelled');
    });

    it('should prevent close handler from overwriting status to error after cancel', () => {
      // This tests the race condition: job cancelled → process exits non-zero
      // status must stay 'cancelled', not become 'error'
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      runner.cancelJob(jobId);

      // Process exits with non-zero after cancellation
      child.emit('close', 143); // SIGTERM exit code

      const job = runner.getJob(jobId);
      expect(job.status).toBe('cancelled'); // Must NOT be 'error'
    });

    it('should send cancelled SSE event to connected clients', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('proj-1', '/project', 'prompt');
      const job = runner.getJob(jobId);

      // Add a fake SSE client
      const mockRes = {
        _written: [],
        write(data) { this._written.push(data); },
        end: vi.fn(),
        on: vi.fn(),
        setHeader: vi.fn(),
      };
      job.clients.add(mockRes);

      runner.cancelJob(jobId);

      const sentData = mockRes._written.join('');
      expect(sentData).toContain('"type":"cancelled"');
    });
  });

  // -------------------------------------------------------------------------
  // cancelAll
  // -------------------------------------------------------------------------
  describe('cancelAll', () => {
    it('should cancel all running jobs', () => {
      spawnMock.mockImplementation(() => makeMockChild(Math.floor(Math.random() * 9000) + 1000));

      const { jobId: j1 } = runner.startJob('p1', '/p1', 'prompt1');
      const { jobId: j2 } = runner.startJob('p2', '/p2', 'prompt2');

      runner.cancelAll();

      expect(runner.getJob(j1).status).toBe('cancelled');
      expect(runner.getJob(j2).status).toBe('cancelled');
    });

    it('should not affect already-finished jobs', () => {
      const child1 = makeMockChild(1111);
      const child2 = makeMockChild(2222);
      spawnMock
        .mockReturnValueOnce(child1)
        .mockReturnValueOnce(child2);

      const { jobId: j1 } = runner.startJob('p1', '/p1', 'prompt1');
      const { jobId: j2 } = runner.startJob('p2', '/p2', 'prompt2');

      child1.emit('close', 0); // j1 finishes before cancelAll

      runner.cancelAll();

      expect(runner.getJob(j1).status).toBe('done');
      expect(runner.getJob(j2).status).toBe('cancelled');
    });
  });

  // -------------------------------------------------------------------------
  // addSseClient
  // -------------------------------------------------------------------------
  describe('addSseClient', () => {
    it('should return false for unknown jobId', () => {
      const mockRes = { setHeader: vi.fn(), on: vi.fn() };
      expect(runner.addSseClient('nonexistent', mockRes)).toBe(false);
    });

    it('should return true and set SSE headers for a running job', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('p1', '/p', 'prompt');
      const mockRes = { setHeader: vi.fn(), on: vi.fn() };
      const result = runner.addSseClient(jobId, mockRes);

      expect(result).toBe(true);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    });

    it('should immediately send done event if job already completed', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      const { jobId } = runner.startJob('p1', '/p', 'prompt');
      child.emit('close', 0); // complete the job first

      const written = [];
      const mockRes = {
        setHeader: vi.fn(),
        write(data) { written.push(data); },
        end: vi.fn(),
        on: vi.fn(),
      };
      runner.addSseClient(jobId, mockRes);

      const body = written.join('');
      expect(body).toContain('"type":"done"');
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listJobs — sanitized output (SEC-08: no prompt in output)
  // -------------------------------------------------------------------------
  describe('listJobs', () => {
    it('should not include prompt content in listJobs output', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      runner.startJob('proj-1', '/project', 'super secret prompt content');
      const jobs = runner.listJobs();

      const jobJson = JSON.stringify(jobs);
      expect(jobJson).not.toContain('super secret prompt content');
    });

    it('should not include child process in listJobs output', () => {
      const child = makeMockChild();
      spawnMock.mockReturnValue(child);

      runner.startJob('proj-1', '/project', 'prompt');
      const jobs = runner.listJobs();

      expect(jobs[0]).not.toHaveProperty('child');
      expect(jobs[0]).not.toHaveProperty('clients');
      expect(jobs[0]).not.toHaveProperty('prompt');
      expect(jobs[0]).not.toHaveProperty('result');
    });
  });
});
