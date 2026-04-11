import { useState, useEffect, useRef, useCallback } from 'react';

export default function NodeActionMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((prev) => !prev);
  }, []);

  const stopProp = useCallback((e) => {
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickAway = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickAway);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!actions || actions.length === 0) return null;

  return (
    <div className="relative z-30 -mr-1 shrink-0" onMouseDown={stopProp} onClick={stopProp}>
      <button
        ref={buttonRef}
        onClick={toggle}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
        title="Actions"
        aria-label="Agent actions"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px] z-50"
        >
          {actions.map((action, i) => (
            <button
              key={action.label || i}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                setOpen(false);
              }}
              disabled={action.disabled}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {action.icon && <span className="text-xs">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
