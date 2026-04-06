// client/src/canvas/ContextMenu.jsx
// Right-click context menu for SwarmCanvas — canvas, node, and edge contexts.
// FR-V5-21 through FR-V5-24
import { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, actions, onClose }) {
  const menuRef = useRef(null);

  // Close on click-away
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Use a microtask delay so the same right-click event doesn't immediately close the menu
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!actions || actions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {actions.map((action, i) => (
        <button
          key={action.label || i}
          onClick={() => { action.onClick(); onClose(); }}
          disabled={action.disabled}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {action.icon && <span className="text-xs">{action.icon}</span>}
          {action.label}
        </button>
      ))}
    </div>
  );
}
