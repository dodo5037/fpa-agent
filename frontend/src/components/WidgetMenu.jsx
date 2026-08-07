import { useState, useRef, useEffect } from 'react'

/**
 * P2.3: Slow-fade hover menu. An ellipsis icon fades in on parent hover.
 * Clicking opens a placeholder dropdown. Clicking outside closes it.
 *
 * DESIGN NOTE: The dropdown is intentionally empty as a placeholder.
 * Future iterations can add widget-specific actions (edit, remove, export, etc.)
 * by passing an `actions` prop: [{ label: 'Edit', onClick: fn }, ...]
 * The component API supports this via the `actions` prop which is currently
 * unused but reserved for future widget action menus.
 */
export default function WidgetMenu({ actions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="absolute top-3 right-3 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="widget-drag-handle text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100
                   transition-opacity duration-300 text-lg leading-none px-1 cursor-grab active:cursor-grabbing"
        title="Drag to move · Click for menu"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-slate-700 border border-slate-600
                        rounded-lg shadow-lg py-1 text-sm">
          {actions && actions.length > 0 ? (
            actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.onClick(); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-600
                           hover:text-white transition-colors"
              >
                {a.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-slate-500 text-xs text-center italic">
              No actions available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
