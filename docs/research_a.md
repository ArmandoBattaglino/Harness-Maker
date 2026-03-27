# Research A: OpenAI Swarm Framework

## Question

What exactly is the OpenAI Swarm framework (agent primitives, handoff protocol, context_variables, triage patterns), and how can its patterns be adapted for agents running via a CLI binary (Claude Code) rather than the OpenAI function-calling API?

---

## Findings

### What Swarm Is

OpenAI Swarm is an educational, lightweight multi-agent orchestration framework released in late 2024 and managed by the OpenAI Solutions team. It was explicitly described as experimental — not production-ready — and has since been superseded by the OpenAI Agents SDK (released March 2025). Despite its deprecated status, Swarm's conceptual model (Agents + Handoffs) remains the clearest, most-cited reference for how to design decentralized multi-agent systems. The Agents SDK is its production successor with the same two core primitives.

### The Two Core Primitives

**1. Agent**

An `Agent` is an object with four fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Identifier (used in system prompts and handoff signals) |
| `model` | `str` | LLM model to use (e.g., `"gpt-4o"`) |
| `instructions` | `str` or callable | System prompt. If callable, receives `context_variables` dict and returns a string — enabling dynamic prompt generation |
| `functions` | `List[callable]` | Tools the agent can invoke, including handoff functions |

**2. Handoff**

A handoff is a function registered in an agent's `functions` list that returns an `Agent` object instead of a string. When the LLM calls that function, the run loop detects that the return value is an `Agent` instance (type check: `if type(result) is Agent`) and switches the active agent. The new agent immediately receives:
- The full prior message history (conversation continuity)
- The current `context_variables` dictionary
- A system-level signal: `"Transferred to {agent.name}. Adopt persona immediately."`

Only the system prompt changes on handoff — the message history does not reset.

Example handoff function:
```python
def transfer_to_refunds():
    return refund_agent
```

For richer handoffs, the `Result` wrapper can be used:
```python
Result(value="summary text", agent=next_agent, context_variables={"key": "val"})
```
This allows a handoff to simultaneously return a message to the conversation, switch agents, and update shared state.

### context_variables

`context_variables` is a flat dictionary passed into the top-level `client.run()` call and threaded through all agent turns. It serves as the shared mutable state bus:

- **Access in instructions**: If `instructions` is a callable, it receives `context_variables` as its sole parameter and returns the system prompt string. This allows per-turn dynamic prompts.
- **Access in functions**: Any function that declares a `context_variables` parameter receives the current dictionary automatically.
- **Mutation**: Functions return a `Result` object with a `context_variables` dict; these values are merged (not replaced) into the existing context, so downstream agents see accumulated state.
- **Persistence**: The dictionary travels across every handoff without explicit passing — it is maintained by the run loop, not individual agents.

### Run Loop Mechanics

The `client.run()` loop:
1. Sends current agent's system prompt + message history to the LLM
2. LLM responds with text and/or tool calls
3. For each tool call: executes the function, captures return value
4. If return value is an `Agent` → switch active agent, update system prompt
5. If return value is a `Result` → merge `context_variables`, optionally switch agent, append value to messages
6. If no tool calls → return `Response(messages, agent, context_variables)`
7. Repeat up to `max_turns` iterations

### Triage Agent Pattern

The triage agent is a named routing agent that is always the entry point. Its sole job is to read the user's request and call one of several `transfer_to_X()` functions. It has no domain capabilities of its own. Specialist agents (sales, refunds, support) have `transfer_back_to_triage()` in their `functions` list to return out-of-scope requests. This creates a hub-and-spoke topology:

```
User Input
    |
[Triage Agent]
    |--- transfer_to_sales() ---> [Sales Agent]
    |--- transfer_to_refunds() -> [Refunds Agent]
    |--- transfer_to_support() -> [Support Agent]
                                         |
                                  transfer_back_to_triage()
```

### Mapping to CLI-Based Agents

Swarm's handoff mechanism is entirely dependent on OpenAI's function-calling API: the LLM returns a structured JSON tool call, the framework detects the return type as `Agent`, and switches. Claude CLI running in a PTY has no function-calling API surface — it outputs free-form text to stdout. The function call detection loop does not exist.

**The mapping requires replacing the function-call detection mechanism with a stdout-parsing mechanism:**

| Swarm concept | Swarm implementation | CLI PTY equivalent |
|---|---|---|
| Handoff trigger | LLM returns `Agent` from a function | PTY stdout contains a special handoff token |
| Handoff token format | `type(result) is Agent` | `__HANDOFF__:{targetAgentId}:{jsonPayload}` in stdout |
| context_variables update | `Result.context_variables` dict merge | JSON payload inside the handoff token |
| System prompt | `agent.instructions` field | System prompt injected as first stdin write to the PTY |
| Run loop | `client.run()` internal loop | Backend `ExecutionEngine` polling all active PTY stdout streams |
| Triage agent | Entry-point Agent with only transfer functions | Entry-point PTY node whose system prompt instructs it to only output handoff tokens |
| Agent name | `agent.name` string | Node ID + `name` field in `WorkflowDefinition.nodes[]` |

The critical insight: in Swarm, the LLM decides when to hand off by calling a function. In a CLI PTY adaptation, the LLM decides when to hand off by outputting a structured token in its response — functionally identical, mechanically different. The system prompt must instruct the Claude agent to emit the token format instead of calling a function.

---

## Key Takeaways

- **How agents are defined in Swarm**: An `Agent` object with `name`, `model`, `instructions` (static string or callable receiving context_variables), and `functions` (list of callables including handoff functions). In the CLI adaptation, this maps to a node in `WorkflowDefinition` with `id`, `name`, `systemPrompt` (string), and `handoffTargets` (list of node IDs).

- **How handoffs work technically**: A handoff function returns an `Agent` object. The run loop type-checks the return value and switches the active agent. In the CLI adaptation, the `HandoffParser` watches PTY stdout for a `__HANDOFF__:{targetId}:{json}` token and triggers the agent switch in the `ExecutionEngine`.

- **How context is passed between agents**: A flat `context_variables` dict is maintained by the run loop and merged on each `Result` return. In the CLI adaptation, context travels inside the JSON payload of the handoff token, and the `ExecutionEngine` merges it into a `workflowContext` object before writing the next agent's system prompt to its PTY stdin.

- **What "triage agent" pattern means**: A dedicated entry-point agent with no domain logic — its only capability is routing. It reads user intent and calls a transfer function (or emits a handoff token) to the appropriate specialist agent. Specialist agents can hand back to triage for out-of-scope requests, creating a hub-and-spoke topology with a single defined entry point.

- **How to adapt Swarm primitives for Claude CLI PTY instances**: Replace function-call detection with stdout token parsing. Replace `context_variables` dict merging with JSON payload extraction from handoff tokens. Replace `agent.instructions` callable with a system prompt template that is rendered with current context and written to PTY stdin at spawn time. The `ExecutionEngine` becomes the equivalent of `client.run()`.

---

## Implications for This Project

### HandoffParser

The existing `HandoffParser` must produce a structured object matching Swarm's `Result` semantics:
```js
{
  targetAgentId: string,       // equivalent to Result.agent.name
  contextUpdate: object,       // equivalent to Result.context_variables (merged, not replaced)
  summaryMessage: string       // equivalent to Result.value (appended to message history)
}
```
The flush buffer (4 KB cap per SEC-V3-07) must strip ANSI codes before attempting token extraction.

### Agent Node Schema

Each node in `WorkflowDefinition.nodes[]` must carry:
```js
{
  id: string,                  // unique agent identifier
  name: string,                // display name (shown in handoff signal)
  systemPrompt: string,        // static base prompt (equivalent to agent.instructions)
  handoffTargets: string[],    // IDs of agents this node can transfer to
  isTriageNode: boolean        // marks the entry point / hub node
}
```
The system prompt template must include an explicit instruction block telling the Claude CLI agent what token format to emit when it wants to hand off, and to which target IDs it is allowed to hand off.

### System Prompt Template

Every spawned PTY agent must receive a system prompt that includes:
1. The agent's domain instructions (`node.systemPrompt`)
2. A "handoff protocol" block explaining the exact token format: `__HANDOFF__:{targetId}:{"context":{},"summary":"..."}`
3. The list of valid `handoffTargets` (so the LLM knows which IDs to use)
4. The current `workflowContext` values injected as key-value pairs (equivalent to Swarm's `context_variables`)

### Execution Engine

The `ExecutionEngine` must implement the equivalent of `client.run()`:
1. On handoff token detected from PTY stdout of agent A:
   - Parse `targetAgentId` and `contextUpdate`
   - Merge `contextUpdate` into `workflowContext` (do not replace — merge, matching Swarm behavior)
   - Find the target node PTY (spawn if not yet running)
   - Write the rendered system prompt (with updated context) + summary message to target PTY stdin
   - Emit a WebSocket event to update canvas node status
2. Respect `isTriageNode` to enforce single entry point
3. Enforce `max_turns` per node to prevent infinite routing loops (equivalent to Swarm's `max_turns` parameter)

### Triage Node Implementation

The triage node's system prompt should contain only routing logic: a description of each specialist agent's domain and the instruction to emit a handoff token. It must not contain domain-specific tools or logic. The canvas should visually mark this node as the entry point (distinct color or icon in React Flow).

---

## Sources

- [GitHub — openai/swarm (official repo)](https://github.com/openai/swarm)
- [OpenAI Swarm README (raw)](https://raw.githubusercontent.com/openai/swarm/main/README.md)
- [Orchestrating Agents: Routines and Handoffs — OpenAI Cookbook](https://developers.openai.com/cookbook/examples/orchestrating_agents)
- [Swarm triage_agent example — GitHub](https://github.com/openai/swarm/tree/main/examples/triage_agent)
- [OpenAI Swarm Framework Guide — Galileo AI](https://galileo.ai/blog/openai-swarm-framework-multi-agents)
- [Swarm: OpenAI's Experimental Approach — Arize AI](https://arize.com/blog/swarm-openai-experimental-approach-to-multi-agent-systems)
- [OpenAI Agents SDK (Swarm successor)](https://openai.github.io/openai-agents-python/)
- [Multi-Agent Orchestration with OpenAI Swarm — Akira AI](https://www.akira.ai/blog/multi-agent-orchestration-with-openai-swarm)
- [Agent Orchestration Patterns: Swarm vs Mesh vs Hierarchical](https://gurusup.com/blog/agent-orchestration-patterns)
