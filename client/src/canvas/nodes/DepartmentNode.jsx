// Group container node for departments in the swarm canvas.
// type: "department"
// React Flow group nodes use { extent: 'parent' } on child nodes to contain them
import { useSwarmStore } from '../../store/SwarmContext';

export default function DepartmentNode({ id, data, selected }) {
  const setFocusedDepartment = useSwarmStore((s) => s.setFocusedDepartment);
  const focusedDepartmentId = useSwarmStore((s) => s.focusedDepartmentId);
  const isFocused = focusedDepartmentId === id;

  return (
    <div
      className={`rounded-xl border-2 w-full h-full
        ${isFocused ? 'border-blue-400 bg-blue-950/20' : 'border-gray-600 bg-gray-900/40'}
        ${selected ? 'ring-2 ring-white/30' : ''}
        transition-all duration-200`}
    >
      {/* Department header — clickable to drill-down */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setFocusedDepartment(id)}
      >
        <span className="text-base" role="img" aria-label="department">🏢</span>
        <span className="text-sm font-semibold text-white truncate">
          {data.label || 'Department'}
        </span>
        {data.agentCount != null && (
          <span className="ml-auto text-xs text-gray-400">{data.agentCount} agents</span>
        )}
      </div>

      {/* NodeResizer handle is handled by React Flow automatically for group nodes */}
      {/* Child nodes are rendered by React Flow inside this container */}
    </div>
  );
}
