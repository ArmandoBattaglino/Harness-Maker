# Research B: React Flow GroupNode / DepartmentNode

## Question

How do you implement collapsible group nodes (DepartmentNode) in @xyflow/react v12, where child AgentNodes live inside the group, and double-clicking the group "drills into" it showing only its children on a clean canvas (matrioska drill-down)? Are there official patterns or examples?

---

## Findings

### 1. Parent-Child Nodes — the `parentId` / `extent` system

React Flow v12 uses a **flat nodes array** with a `parentId` string field to express hierarchy. There are no nested data structures — every node lives at the top level of the array, and parent-before-child ordering in that array is mandatory.

Key fields on the `Node` type (v12):

| Field | Type | Purpose |
|-------|------|---------|
| `parentId` | `string` | Makes this node a child of another node. Position becomes relative to parent top-left. |
| `extent` | `"parent"` or `CoordinateExtent` | `"parent"` locks child inside parent bounds during drag. Without it, child can be dragged outside but still moves with parent. |
| `expandParent` | `boolean` | Auto-expands parent when child reaches parent edge during drag. |
| `hidden` | `boolean` | Removes node from canvas render while keeping it in state. |
| `measured.width/height` | `number` | Read-only computed dimensions (do not set width/height directly). |

The `group` node type is a built-in convenience: it has no handles, making it ideal for department containers. Any custom node type can also act as a parent.

**Critical ordering rule:** Parent nodes must appear **before** their children in the nodes array. React Flow processes them in sequence; violating this causes rendering glitches.

Example node array structure:

```js
[
  // DepartmentNode (parent) — MUST come first
  { id: 'dept-1', type: 'departmentNode', position: { x: 100, y: 100 },
    style: { width: 400, height: 300 }, data: { label: 'Research Dept' } },

  // AgentNodes (children) — position is relative to dept-1 top-left
  { id: 'agent-1', type: 'agentNode', parentId: 'dept-1',
    extent: 'parent', position: { x: 20, y: 60 }, data: { ... } },
  { id: 'agent-2', type: 'agentNode', parentId: 'dept-1',
    extent: 'parent', position: { x: 200, y: 60 }, data: { ... } },
]
```

Parent node dimensions must be set via `style: { width, height }` — NOT via `width`/`height` node fields (those are read-only computed values). There is no auto-sizing of parent to fit children; the dev must calculate and set this manually.

---

### 2. Expand / Collapse a Group Node

React Flow does **not** provide a built-in expand/collapse toggle. There are two patterns:

**Pattern A — `hidden` flag (free, open-source)**

Set `hidden: true` on all child nodes (and their edges) to visually collapse the group, and toggle back to `hidden: false` to expand. The group node itself stays visible as the collapsed indicator.

```js
// Collapse dept-1
setNodes(nodes => nodes.map(n =>
  n.parentId === 'dept-1'
    ? { ...n, hidden: true }   // immutable update — new object required in v12
    : n
));
// Also hide edges whose source/target are children of dept-1
setEdges(edges => edges.map(e =>
  childIds.has(e.source) || childIds.has(e.target)
    ? { ...e, hidden: true }
    : e
));
```

This is the lightest approach. The collapsed state can be stored in `node.data.collapsed` (a boolean in Zustand or React state). The `DepartmentNode` component reads `data.collapsed` and fires `updateNodeData` or `setNodes` on double-click or button press.

**Pattern B — `useExpandCollapse` hook + Dagre layout (React Flow Pro)**

The Pro example uses a custom hook that tracks which nodes are expanded and uses Dagre to re-layout descendants. This is overkill for a fixed-position swarm canvas where layout is user-defined.

**Recommendation for this project:** Use Pattern A (`hidden` flag) — it fits the fixed-canvas model, costs nothing, and integrates cleanly with a Zustand execution store.

---

### 3. Matrioska Drill-Down — Showing Only One Department's Children

There is **no native React Flow drill-down API**. The pattern must be implemented in application state. Two approaches:

**Approach A — Canvas filtering (recommended)**

Maintain a `focusedDepartmentId` value in Zustand (or React state). When set to a department ID, filter the nodes array before passing to `<ReactFlow>`:

```js
const displayedNodes = useMemo(() => {
  if (!focusedDepartmentId) return allNodes;   // top-level view

  // Show only the focused department and its direct children
  return allNodes.filter(n =>
    n.id === focusedDepartmentId || n.parentId === focusedDepartmentId
  );
}, [allNodes, focusedDepartmentId]);

const displayedEdges = useMemo(() => {
  if (!focusedDepartmentId) return allEdges;
  const visibleIds = new Set(displayedNodes.map(n => n.id));
  return allEdges.filter(e =>
    visibleIds.has(e.source) && visibleIds.has(e.target)
  );
}, [allEdges, displayedNodes, focusedDepartmentId]);
```

A breadcrumb component reads the department stack (array of IDs, pushed on drill-down, popped on back-navigation) to allow multi-level nesting.

The `<ReactFlow>` component receives `displayedNodes` and `displayedEdges`. React Flow calls `fitView()` on the filtered set to center the drill-down view. The full node state (positions, edges) is preserved in Zustand — never mutated by the filter.

**Approach B — Embedded ReactFlow per node (community workaround)**

One community member embeds a full `<ReactFlow>` instance inside a custom node, with panning disabled. This creates a matryoshka effect natively but is extremely expensive: each group node becomes an independent React Flow instance with its own store, event system, and DOM tree. Not viable for live-execution scenarios with frequent state updates.

**Recommendation:** Approach A (canvas filtering) is the correct choice for this project. It is performant, avoids multiple ReactFlow stores, and keeps all execution state in one Zustand store.

---

### 4. Gotchas with Group Nodes + Live Execution Updates

**Immutability is mandatory:** Every node update in v12 must produce a new object (`{ ...node, data: { ...node.data, status: 'running' } }`). Mutating the existing node object silently breaks React Flow's change detection. This applies both to layout state and execution state data.

**Separate stores prevent re-render storms:** Do NOT store agent status, loop counters, or output directly as `node.data` fields that trigger `setNodes`. Instead, keep execution state in Zustand separate from canvas state, and have `AgentNode` subscribe directly to the Zustand slice for its own execution data. Only push to `setNodes` for layout changes (position, hidden, parentId, style).

**`updateNode` vs `setNodes` for execution updates:** There is a known bug (xyflow/xyflow #5036) where `updateNode` causes unintended node selection after drag-drop. Prefer `setNodes` with a map callback for bulk updates; use `updateNodeData` for targeted data-only changes.

**Parent ordering on dynamic insert:** When dynamically adding a new AgentNode to a DepartmentNode at runtime, insert the parent's entry into the array first, then the child. If the parent is already in the array, append the child anywhere after it — React Flow processes the array in order on each render.

**`extent: 'parent'` and execution overlays:** When status badges or progress rings extend outside the node's bounding box, they may be clipped by the parent's overflow. Either give children a slightly inset position or add `overflow: visible` to the parent group's style.

---

## Key Takeaways

- **`parentId` + `extent: 'parent'`** is the v12 mechanism for child nodes. Child positions are relative to parent top-left. Parent must precede children in the nodes array. Width/height are set via `style`, not node fields.

- **Expand/collapse** is implemented by toggling `hidden: true/false` on child nodes (and their edges) via an immutable `setNodes` map. No official built-in toggle exists. Store collapsed state in `node.data.collapsed` inside Zustand.

- **Matrioska drill-down** is best implemented as canvas filtering: keep full node state in Zustand, maintain a `focusedDepartmentId` + a breadcrumb stack, and compute `displayedNodes`/`displayedEdges` as a `useMemo` before passing to `<ReactFlow>`. Call `fitView()` after filter changes.

- **Gotchas:** Always use immutable updates; separate execution state (Zustand) from layout state (React Flow nodes); prefer `setNodes` over `updateNode` for batched updates; watch for `extent: 'parent'` clipping execution overlays.

---

## Implications for this Project

### `DepartmentNode.jsx` needs to:

1. Render as a `type: 'group'`-equivalent custom node with explicit `style: { width, height }`.
2. Accept `data.collapsed` boolean — when `true`, render a compact card; when `false`, render the full container with a visible interior.
3. Handle `onDoubleClick` → dispatch `setFocusedDepartment(node.id)` to Zustand, which triggers the drill-down view.
4. Show a collapse/expand toggle button that fires `setNodes` to batch-toggle `hidden` on all children with matching `parentId`.
5. Wrap in `React.memo` (already known requirement).

### `SwarmCanvasView` needs to:

1. Subscribe to `focusedDepartmentId` from Zustand.
2. Compute `displayedNodes` and `displayedEdges` via `useMemo` — filter to show only top-level nodes when `focusedDepartmentId === null`, or the focused department + its children when set.
3. Maintain a `departmentStack: string[]` in Zustand for breadcrumb navigation (push on drill-down, pop on back).
4. Call `reactFlowInstance.fitView()` whenever `focusedDepartmentId` changes (use `useEffect`).
5. Render a `<BreadcrumbBar>` component above the canvas showing the stack with click-to-navigate.

### State management implications:

- Zustand store needs: `focusedDepartmentId: string | null`, `departmentStack: string[]`, `collapsedDepartments: Set<string>`.
- Execution state (agent status, counters) stays in a separate Zustand slice — never written to canvas node state.
- The `displayedNodes` memo should be inside `SwarmCanvasView` (not global state) to avoid re-filtering on every Zustand tick.

---

## Sources

- [Sub Flows — React Flow official docs](https://reactflow.dev/learn/layouting/sub-flows)
- [Sub Flow example — React Flow](https://reactflow.dev/examples/grouping/sub-flows)
- [Parent Child Relation example — React Flow Pro](https://reactflow.dev/examples/grouping/parent-child-relation)
- [Expand and Collapse example — React Flow Pro](https://reactflow.dev/examples/layout/expand-collapse)
- [Hidden nodes example — React Flow](https://reactflow.dev/examples/nodes/hidden)
- [Node API reference (v12) — React Flow](https://reactflow.dev/api-reference/types/node)
- [Migrate to React Flow 12 — React Flow](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)
- [Sub Flows / Nested Flows GitHub Discussion #1024 — xyflow](https://github.com/xyflow/xyflow/discussions/1024)
- [updateNode unintended selection bug #5036 — xyflow](https://github.com/xyflow/xyflow/issues/5036)
- [State Management with React Flow — Synergy Codes](https://www.synergycodes.com/blog/state-management-in-react-flow)
- [Using a State Management Library — React Flow](https://reactflow.dev/learn/advanced-use/state-management)
