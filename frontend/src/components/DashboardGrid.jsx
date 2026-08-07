import { useState, useCallback, useEffect } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const STORAGE_PREFIX = 'fpa-layout-'

const DEFAULT_LAYOUTS = {
  lg: [
    { i: 'kpi-revenue',     x: 0, y: 0, w: 4,  h: 4, minH: 3, maxH: 6 },
    { i: 'kpi-expense',     x: 4, y: 0, w: 4,  h: 4, minH: 3, maxH: 6 },
    { i: 'kpi-net',         x: 8, y: 0, w: 4,  h: 4, minH: 3, maxH: 6 },
    { i: 'variance-chart',  x: 0, y: 4, w: 8,  h: 6, minH: 4, maxH: 10 },
    { i: 'anomalies',       x: 8, y: 4, w: 4,  h: 6, minH: 3, maxH: 8 },
    { i: 'diverging',       x: 0, y: 10, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'ytd-combo',       x: 6, y: 10, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'vector-delta',    x: 0, y: 15, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'timeseries',      x: 6, y: 16, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'regional',        x: 0, y: 20, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'stepped-area',    x: 6, y: 22, w: 6, h: 6, minH: 4, maxH: 10 },
  ],
  md: [
    { i: 'kpi-revenue',     x: 0, y: 0, w: 2,  h: 4, minH: 3, maxH: 6 },
    { i: 'kpi-expense',     x: 2, y: 0, w: 2,  h: 4, minH: 3, maxH: 6 },
    { i: 'kpi-net',         x: 4, y: 0, w: 2,  h: 4, minH: 3, maxH: 6 },
    { i: 'variance-chart',  x: 0, y: 4, w: 6,  h: 6, minH: 4, maxH: 10 },
    { i: 'anomalies',       x: 0, y: 10, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'diverging',       x: 0, y: 15, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'ytd-combo',       x: 0, y: 20, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'vector-delta',    x: 0, y: 26, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'timeseries',      x: 0, y: 31, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'regional',        x: 0, y: 37, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'stepped-area',    x: 0, y: 43, w: 6, h: 6, minH: 4, maxH: 10 },
  ],
  sm: [
    { i: 'kpi-revenue',     x: 0, y: 0, w: 3,  h: 5, minH: 4, maxH: 8 },
    { i: 'kpi-expense',     x: 3, y: 0, w: 3,  h: 5, minH: 4, maxH: 8 },
    { i: 'kpi-net',         x: 0, y: 5, w: 6,  h: 4, minH: 3, maxH: 6 },
    { i: 'variance-chart',  x: 0, y: 9, w: 6,  h: 6, minH: 4, maxH: 10 },
    { i: 'anomalies',       x: 0, y: 15, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'diverging',       x: 0, y: 20, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'ytd-combo',       x: 0, y: 25, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'vector-delta',    x: 0, y: 31, w: 6, h: 5, minH: 3, maxH: 8 },
    { i: 'timeseries',      x: 0, y: 36, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'regional',        x: 0, y: 42, w: 6, h: 6, minH: 4, maxH: 10 },
    { i: 'stepped-area',    x: 0, y: 48, w: 6, h: 6, minH: 4, maxH: 10 },
  ],
}

export default function DashboardGrid({ children, className = '', sessionId }) {
  const storageKey = `${STORAGE_PREFIX}${sessionId || 'default'}`

  // Load saved layout or use defaults
  const [layouts, setLayouts] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_LAYOUTS
  })

  // Reset layouts when session changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setLayouts(JSON.parse(saved))
      } else {
        setLayouts(DEFAULT_LAYOUTS)
      }
    } catch {
      setLayouts(DEFAULT_LAYOUTS)
    }
  }, [sessionId])

  const onLayoutChange = useCallback((currentLayout, allLayouts) => {
    setLayouts(allLayouts)
    try {
      localStorage.setItem(storageKey, JSON.stringify(allLayouts))
    } catch {}
  }, [storageKey])

  // L2.3: Wobble animation on drop
  const handleDragStop = useCallback((layout, oldItem, newItem) => {
    if (oldItem.x !== newItem.x || oldItem.y !== newItem.y) {
      const el = document.querySelector(`.react-grid-item[data-grid-key="${newItem.i}"]`)
      if (el) {
        el.classList.add('widget-wobble')
        setTimeout(() => el.classList.remove('widget-wobble'), 600)
      }
    }
  }, [])

  // L2.2: Auto-sort — compact vertical layout
  const handleAutoLayout = useCallback(() => {
    const merged = { ...layouts }
    Object.keys(merged).forEach(bp => {
      const sorted = [...merged[bp]].sort((a, b) => a.y - b.y || a.x - b.x)
      let y = 0
      merged[bp] = sorted.map(item => {
        const updated = { ...item, y, x: 0 }
        y += item.h
        return updated
      })
    })
    setLayouts(merged)
    try {
      localStorage.setItem(storageKey, JSON.stringify(merged))
    } catch {}
  }, [layouts, storageKey])

  const childArray = Array.isArray(children) ? children : [children]

  return (
    <div className={className}>
      <div className="flex justify-end mb-2">
        <button
          onClick={handleAutoLayout}
          className="text-xs px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-600 transition-all"
          title="Auto-arrange widgets compactly"
        >
          ▦ Auto-Layout
        </button>
      </div>
      <ResponsiveGridLayout
        className="dashboard-grid"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 6, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        onLayoutChange={onLayoutChange}
        draggableHandle=".widget-drag-handle"
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isResizable={true}
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        compactType="vertical"
        onDragStop={handleDragStop}
      >
        {childArray.map((child, i) => (
          <div key={child.key || `widget-${i}`} className="dashboard-widget">
            {child}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  )
}
