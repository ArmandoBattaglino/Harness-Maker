// client/src/canvas/BreadcrumbBar.jsx
// Breadcrumb navigation for swarm canvas drill-down.
import { useSwarmStore } from '../store/SwarmContext';

export default function BreadcrumbBar({ nodes }) {
  const departmentStack = useSwarmStore((s) => s.departmentStack);
  const navigateBreadcrumb = useSwarmStore((s) => s.navigateBreadcrumb);

  // Build breadcrumb items: [{ id, label }]
  const crumbs = departmentStack.map((deptId) => {
    const node = nodes?.find((n) => n.id === deptId);
    return { id: deptId, label: node?.data?.label || deptId };
  });

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-700 text-sm text-gray-300">
      {/* Root crumb — always shown */}
      <button
        onClick={() => navigateBreadcrumb(0)}
        className="hover:text-white transition-colors"
      >
        🗺️ All Agents
      </button>

      {crumbs.map((crumb, index) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span className="text-gray-600">/</span>
          <button
            onClick={() => navigateBreadcrumb(index + 1)}
            className={`hover:text-white transition-colors ${
              index === crumbs.length - 1 ? 'text-white font-medium' : ''
            }`}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}
