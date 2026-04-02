const path = require('path');
const { chromium } = require('playwright-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://127.0.0.1:3000/';
const DEBUG_DIR = 'C:\\Users\\arman\\Downloads\\Test workflows - Copia\\Debugging';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installSwarmSimulation(page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const NativeWebSocket = window.WebSocket;

    const workflowId = 'sim-wf-1';
    const executionId = 'sim-exec-1';

    const workflowDef = {
      id: workflowId,
      name: 'Simulated Swarm QA Workflow',
      description: 'Synthetic workflow used to test the Swarm UI without a real Claude runtime.',
      settings: {
        budgetTokens: 100000,
        circuitBreakerThreshold: 3,
      },
      initialContext: {
        testMode: 'simulated',
      },
      nodes: [
        {
          id: 'dept-1',
          type: 'department',
          data: { label: 'Editorial Department', agentCount: 3 },
          position: { x: 60, y: 80 },
          style: { width: 360, height: 260 },
        },
        {
          id: 'trigger-1',
          type: 'trigger',
          data: {
            label: 'RSS Trigger',
            triggerType: 'rss',
            rssUrl: 'https://example.com/feed.xml',
          },
          position: { x: 40, y: 420 },
        },
        {
          id: 'node-1',
          type: 'agent',
          parentId: 'dept-1',
          extent: 'parent',
          data: {
            label: 'Triage Agent',
            systemPrompt: 'Analyze the incoming request and route it to the right specialist.',
            isTriageNode: true,
          },
          position: { x: 24, y: 56 },
        },
        {
          id: 'node-2',
          type: 'agent',
          parentId: 'dept-1',
          extent: 'parent',
          data: {
            label: 'Writer Agent',
            systemPrompt: 'Write a concise first draft for the requested content.',
            isTriageNode: false,
          },
          position: { x: 190, y: 56 },
        },
        {
          id: 'node-3',
          type: 'agent',
          parentId: 'dept-1',
          extent: 'parent',
          data: {
            label: 'Reviewer Agent',
            systemPrompt: 'Review and approve the content before publication.',
            isTriageNode: false,
          },
          position: { x: 106, y: 156 },
        },
      ],
      edges: [
        { id: 'edge-t1', source: 'trigger-1', target: 'node-1', type: 'handoff' },
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'handoff' },
        { id: 'edge-2', source: 'node-2', target: 'node-3', type: 'handoff' },
      ],
    };

    const sim = {
      workflowId,
      executionId,
      workflowDef,
      running: false,
      paused: false,
      deleted: false,
      sentBroadcasts: [],
      timelineStarted: false,
      inboxItems: [],
      execution: {
        executionId,
        workflowId,
        status: 'idle',
        agentStates: {},
        edgeCounters: {},
        budget: {
          estimatedTokensUsed: 0,
          limitTokens: workflowDef.settings.budgetTokens,
        },
      },
      sockets: {
        swarm: new Set(),
        terminal: new Set(),
      },
      terminalBuffers: {
        'sess-triage': '[triage] waiting for incoming content request...\r\n',
        'sess-writer': '[writer] idle\r\n',
        'sess-reviewer': '[reviewer] idle\r\n',
      },
    };

    function clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    function jsonResponse(body, status = 200) {
      return Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    function swarmSnapshot() {
      return {
        executionId: sim.executionId,
        workflowId: sim.workflowId,
        status: sim.execution.status,
        agentStates: clone(sim.execution.agentStates),
        edgeCounters: clone(sim.execution.edgeCounters),
        budget: clone(sim.execution.budget),
      };
    }

    function emitSwarm(event) {
      for (const socket of sim.sockets.swarm) {
        socket._emitMessage(JSON.stringify(event));
      }
    }

    function emitTerminal(sessionId, text) {
      const current = sim.terminalBuffers[sessionId] || '';
      sim.terminalBuffers[sessionId] = current + text;
      for (const socket of sim.sockets.terminal) {
        if (socket._sessionId === sessionId) {
          socket._emitMessage(text);
        }
      }
    }

    function ensurePendingHitl() {
      if (sim.inboxItems.find((item) => item.id === 'hitl-1')) return;
      sim.inboxItems.push({
        id: 'hitl-1',
        type: 'user_requested',
        status: 'pending',
        agentId: 'node-3',
        agentName: 'Reviewer Agent',
        message: 'Reviewer wants approval to publish the article draft.',
        timestamp: Date.now(),
      });
    }

    function startExecutionState() {
      sim.running = true;
      sim.deleted = false;
      sim.paused = false;
      sim.execution.status = 'running';
      sim.execution.agentStates = {
        'node-1': {
          sessionId: 'sess-triage',
          status: 'running',
          handoffCount: 0,
          lastOutputSnippet: '[triage] routing incoming request',
        },
        'node-2': {
          sessionId: 'sess-writer',
          status: 'idle',
          handoffCount: 0,
          lastOutputSnippet: '[writer] idle',
        },
        'node-3': {
          sessionId: 'sess-reviewer',
          status: 'idle',
          handoffCount: 0,
          lastOutputSnippet: '[reviewer] idle',
        },
      };
      sim.execution.edgeCounters = {};
      sim.execution.budget = {
        estimatedTokensUsed: 1200,
        limitTokens: workflowDef.settings.budgetTokens,
      };
      sim.inboxItems = [];
    }

    function startTimeline() {
      if (sim.timelineStarted) return;
      sim.timelineStarted = true;

      setTimeout(() => {
        if (!sim.running || sim.deleted) return;
        emitSwarm({ type: 'trigger_fired', nodeId: 'trigger-1', triggerId: 'trigger-1', firedAt: Date.now() });
      }, 1000);

      setTimeout(() => {
        if (!sim.running || sim.deleted) return;
        sim.execution.edgeCounters['edge-1'] = 1;
        sim.execution.agentStates['node-1'].handoffCount = 1;
        sim.execution.agentStates['node-1'].status = 'done';
        sim.execution.agentStates['node-2'].status = 'running';
        sim.execution.agentStates['node-2'].lastOutputSnippet = '[writer] drafting content';
        emitSwarm({ type: 'handoff_started', sourceNodeId: 'node-1', targetNodeId: 'node-2', edgeId: 'edge-1', counter: 1 });
        emitSwarm({ type: 'handoff_completed', sourceNodeId: 'node-1', targetNodeId: 'node-2' });
        emitSwarm({ type: 'agent_status', nodeId: 'node-1', status: 'done', sessionId: 'sess-triage' });
        emitSwarm({ type: 'agent_status', nodeId: 'node-2', status: 'running', sessionId: 'sess-writer' });
        emitTerminal('sess-writer', '[writer] first draft ready for review\r\n');
      }, 2500);

      setTimeout(() => {
        if (!sim.running || sim.deleted) return;
        sim.execution.budget.estimatedTokensUsed = 85000;
        emitSwarm({ type: 'budget_update', estimatedTokensUsed: 85000, limitTokens: workflowDef.settings.budgetTokens });
      }, 4000);

      setTimeout(() => {
        if (!sim.running || sim.deleted) return;
        ensurePendingHitl();
        sim.execution.agentStates['node-3'].status = 'paused';
        emitSwarm({
          type: 'hitl_required',
          nodeId: 'node-3',
          item: clone(sim.inboxItems[0]),
        });
        emitSwarm({ type: 'agent_status', nodeId: 'node-3', status: 'paused', sessionId: 'sess-reviewer' });
      }, 5500);

      setTimeout(() => {
        if (!sim.running || sim.deleted) return;
        sim.execution.edgeCounters['edge-2'] = 3;
        emitSwarm({ type: 'circuit_breaker', edgeId: 'edge-2', counter: 3, threshold: 3 });
      }, 7000);
    }

    class MockSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this._sessionId = null;
        this._kind = null;

        if (url.includes('/ws/swarm?executionId=')) {
          this._kind = 'swarm';
          sim.sockets.swarm.add(this);
          queueMicrotask(() => {
            this.readyState = 1;
            if (typeof this.onopen === 'function') this.onopen();
            this._emitMessage(JSON.stringify({ type: 'execution_status', ...swarmSnapshot() }));
          });
        } else if (url.includes('/ws?sessionId=')) {
          this._kind = 'terminal';
          const parsed = new URL(url, window.location.origin);
          this._sessionId = parsed.searchParams.get('sessionId');
          sim.sockets.terminal.add(this);
          queueMicrotask(() => {
            this.readyState = 1;
            if (typeof this.onopen === 'function') this.onopen();
            const existing = sim.terminalBuffers[this._sessionId];
            if (existing) this._emitMessage(existing);
          });
        }
      }

      send(data) {
        if (this._kind === 'terminal') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'input' && parsed.data) {
              emitTerminal(this._sessionId, `[user] ${parsed.data}\r\n[sim] terminal input accepted\r\n`);
            }
          } catch (err) {
            emitTerminal(this._sessionId, `[sim] malformed terminal payload\r\n`);
          }
        }
      }

      close(code = 1000) {
        this.readyState = 3;
        if (this._kind === 'swarm') sim.sockets.swarm.delete(this);
        if (this._kind === 'terminal') sim.sockets.terminal.delete(this);
        if (typeof this.onclose === 'function') this.onclose({ code });
      }

      _emitMessage(data) {
        if (typeof this.onmessage === 'function') {
          this.onmessage({ data });
        }
      }
    }

    MockSocket.OPEN = 1;
    MockSocket.CLOSED = 3;
    MockSocket.CONNECTING = 0;
    MockSocket.CLOSING = 2;

    window.WebSocket = function patchedWebSocket(url, protocols) {
      if (typeof url === 'string' && (url.includes('/ws/swarm?executionId=') || url.includes('/ws?sessionId='))) {
        return new MockSocket(url, protocols);
      }
      return new NativeWebSocket(url, protocols);
    };
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;

    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

      if (url.includes('/api/v1/swarm/scaffold') && method === 'POST') {
        return jsonResponse({ workflowId, workflowDef: clone(workflowDef) }, 201);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/start$/.test(url) && method === 'POST') {
        startExecutionState();
        setTimeout(startTimeline, 250);
        return jsonResponse({ executionId, status: 'running' }, 201);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/pause$/.test(url) && method === 'POST') {
        sim.paused = true;
        sim.execution.status = 'paused';
        Object.entries(sim.execution.agentStates).forEach(([nodeId, state]) => {
          if (state.status === 'running') {
            state.status = 'paused';
            emitSwarm({ type: 'agent_status', nodeId, status: 'paused', sessionId: state.sessionId });
          }
        });
        emitSwarm({ type: 'execution_status', executionId, status: 'paused' });
        return jsonResponse({ ok: true }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/resume$/.test(url) && method === 'POST') {
        sim.paused = false;
        sim.execution.status = 'running';
        Object.entries(sim.execution.agentStates).forEach(([nodeId, state]) => {
          if (state.status === 'paused' && nodeId !== 'node-3') {
            state.status = 'running';
            emitSwarm({ type: 'agent_status', nodeId, status: 'running', sessionId: state.sessionId });
          }
        });
        emitSwarm({ type: 'execution_status', executionId, status: 'running' });
        return jsonResponse({ ok: true }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/broadcast$/.test(url) && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        sim.sentBroadcasts.push(body);
        if (body.text) {
          emitTerminal('sess-triage', `[broadcast:${body.mode || 'soft'}] ${body.text}\r\n`);
          emitTerminal('sess-writer', `[broadcast:${body.mode || 'soft'}] ${body.text}\r\n`);
          emitTerminal('sess-reviewer', `[broadcast:${body.mode || 'soft'}] ${body.text}\r\n`);
        }
        return jsonResponse({ sent: 3 }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/inbox$/.test(url) && method === 'GET') {
        return jsonResponse({ items: clone(sim.inboxItems.filter((item) => item.status === 'pending')) }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/inbox\/[^/]+\/approve$/.test(url) && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const item = sim.inboxItems.find((entry) => entry.id === 'hitl-1');
        if (item) item.status = 'approved';
        sim.execution.agentStates['node-3'].status = 'running';
        sim.execution.agentStates['node-3'].lastOutputSnippet = '[reviewer] approval received';
        emitSwarm({ type: 'agent_status', nodeId: 'node-3', status: 'running', sessionId: 'sess-reviewer' });
        emitTerminal('sess-reviewer', `[reviewer] approved with text: ${body.resumeText || '(none)'}\r\n`);
        return jsonResponse({ ok: true }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/inbox\/[^/]+\/reject$/.test(url) && method === 'POST') {
        const item = sim.inboxItems.find((entry) => entry.id === 'hitl-1');
        if (item) item.status = 'rejected';
        sim.execution.agentStates['node-3'].status = 'paused';
        emitTerminal('sess-reviewer', '[reviewer] request rejected by user\r\n');
        return jsonResponse({ ok: true }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+\/agent\/[^/]+\/output$/.test(url) && method === 'GET') {
        const match = url.match(/agent\/([^/]+)\/output$/);
        const nodeId = match ? match[1] : null;
        const sessionMap = {
          'node-1': 'sess-triage',
          'node-2': 'sess-writer',
          'node-3': 'sess-reviewer',
        };
        const sessionId = sessionMap[nodeId];
        return jsonResponse({ output: sim.terminalBuffers[sessionId] || '' }, 200);
      }

      if (/\/api\/v1\/swarm\/[^/]+$/.test(url) && method === 'DELETE') {
        sim.deleted = true;
        sim.running = false;
        sim.execution.status = 'stopped';
        emitSwarm({ type: 'execution_status', executionId, status: 'stopped' });
        return jsonResponse({}, 204);
      }

      return nativeFetch(input, init);
    };

    window.__swarmSimulation = {
      workflowId,
      executionId,
      getState: () => clone({
        running: sim.running,
        paused: sim.paused,
        deleted: sim.deleted,
        inboxItems: sim.inboxItems,
        sentBroadcasts: sim.sentBroadcasts,
        execution: sim.execution,
      }),
    };
  });
}

async function runVisibleWalkthrough() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,
    executablePath: EDGE_PATH,
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await installSwarmSimulation(page);

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  console.log('Opening app...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  console.log('Selecting project...');
  await page.getByText('Prova', { exact: true }).click();
  await sleep(1000);

  console.log('Opening Swarm view...');
  await page.getByText('Swarm', { exact: true }).click();
  await sleep(1500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-01-idle.png'), fullPage: true });

  console.log('Opening HITL drawer...');
  await page.getByRole('button', { name: /HITL/ }).click();
  await sleep(1500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-02-hitl-empty.png'), fullPage: true });

  console.log('Closing HITL drawer...');
  await page.locator('div.border-t.border-gray-700.bg-gray-900 button').first().click();
  await sleep(1000);

  console.log('Generating synthetic workflow...');
  const input = page.locator('input').first();
  await input.fill('Create a content workflow with triage, writer, reviewer, and an RSS trigger');
  await page.getByRole('button', { name: /^Generate$/ }).click();
  await sleep(2500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-03-generated.png'), fullPage: true });

  console.log('Selecting workflow node...');
  await page.getByText('Triage Agent').click();
  await sleep(1500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-04-inspector.png'), fullPage: true });

  console.log('Starting synthetic execution...');
  await page.getByRole('button', { name: /^Run$/ }).click();
  await sleep(8500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-05-running.png'), fullPage: true });

  console.log('Opening inspector for running reviewer...');
  await page.getByText('Reviewer Agent').click();
  await sleep(1500);
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-06-reviewer-hitl.png'), fullPage: true });

  console.log('Opening PTY explosion...');
  const openTerminal = page.getByRole('button', { name: /Open Terminal/i });
  if (await openTerminal.count()) {
    await openTerminal.click();
    await sleep(2500);
    await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-07-pty-explosion.png'), fullPage: true });
    await page.getByRole('button', { name: /Close PTY Explosion/i }).click();
    await sleep(1000);
  }

  console.log('Approving HITL item...');
  await page.getByRole('button', { name: /HITL/ }).click();
  await sleep(1200);
  const approveButton = page.getByRole('button', { name: /Approve/i }).first();
  if (await approveButton.count()) {
    await approveButton.click();
    await sleep(800);
    const textArea = page.locator('textarea');
    if (await textArea.count()) {
      await textArea.fill('Approved by simulation walkthrough.');
    }
    await page.getByRole('button', { name: /Confirm/i }).click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-08-hitl-approved.png'), fullPage: true });

  console.log('Sending broadcast...');
  const broadcastInput = page.getByPlaceholder('Broadcast to all agents...');
  if (await broadcastInput.count()) {
    await broadcastInput.fill('Focus on brevity and publish only after review.');
    await page.getByRole('button', { name: /^Send$/ }).click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-09-broadcast.png'), fullPage: true });

  console.log('Pausing execution...');
  const pauseButton = page.getByRole('button', { name: /^Pause$/ });
  if (await pauseButton.count()) {
    await pauseButton.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-10-paused.png'), fullPage: true });

  console.log('Resuming execution...');
  const resumeButton = page.getByRole('button', { name: /^Resume$/ });
  if (await resumeButton.count()) {
    await resumeButton.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-11-resumed.png'), fullPage: true });

  console.log('Stopping execution...');
  const stopButton = page.getByRole('button', { name: /^Stop$/ });
  if (await stopButton.count()) {
    await stopButton.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-12-stopped.png'), fullPage: true });

  console.log('Resetting view...');
  const resetButton = page.getByRole('button', { name: /^Reset$/ });
  if (await resetButton.count()) {
    await resetButton.click();
    await sleep(1500);
  }
  await page.screenshot({ path: path.join(DEBUG_DIR, 'swarm-sim-13-reset.png'), fullPage: true });

  console.log('Simulation walkthrough complete. Keeping the browser open for 20 seconds so the user can inspect it.');
  await sleep(20000);
  await browser.close();
}

runVisibleWalkthrough().catch((error) => {
  console.error(error);
  process.exit(1);
});
