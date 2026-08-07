import { useState, useEffect, useCallback } from 'react'
import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

const API = import.meta.env.VITE_API_URL || ''

/**
 * P4.1: Interactive Time-Series Plot with annotation.
 * Clickable data points that show detailed budget/actual/variance annotations.
 * Date range selector for zooming into specific periods.
 */
export default function TimeSeriesChart({ sessionId }) {
  const [data, setData] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [range, setRange] = useState({ start: 0, end: -1 })

  useEffect(() => {
    fetch(`${API}/api/timeseries?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => setData(d.results || []))
      .catch(() => setData([]))
  }, [sessionId])

  const handleClick = useCallback((event, chartContext, config) => {
    if (config.dataPointIndex >= 0 && data) {
      setSelectedPoint(data[config.dataPointIndex])
    }
  }, [data])

  if (!data || data.length === 0) return null

  const sliced = range.end === -1 ? data : data.slice(range.start, range.end + 1)
  const periods = sliced.map(d => d.period_id)
  const actuals = sliced.map(d => d.total_actual || 0)
  const budgets = sliced.map(d => d.total_budget || 0)
  const cumulative = sliced.map(d => d.cumulative_ytd || 0)

  const annotations = selectedPoint ? {
    xaxis: [{
      x: selectedPoint.period_id,
      borderColor: '#f97316',
      borderWidth: 2,
      label: {
        text: `Actual: $${(selectedPoint.total_actual || 0).toLocaleString()}\nBudget: $${(selectedPoint.total_budget || 0).toLocaleString()}\nΔ: $${(selectedPoint.variance_amount || 0).toLocaleString()}`,
        style: { color: '#e2e8f0', background: '#1e293b', fontSize: '11px' },
        position: 'top',
      },
    }],
  } : {}

  const options = {
    chart: { type: 'area', toolbar: { show: false }, events: { click: handleClick } },
    stroke: { curve: 'smooth', width: [2, 2, 2], dashArray: [0, 5, 0] },
    colors: ['#34d399', '#94a3b8', '#f97316'],
    fill: {
      type: ['gradient', 'solid', 'solid'],
      gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.3, opacityTo: 0 },
    },
    xaxis: {
      categories: periods,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      { labels: { style: { colors: '#94a3b8' }, formatter: v => `$${(v/1000).toFixed(0)}k` } },
      { show: false },
      { show: false },
    ],
    grid: { show: true, borderColor: '#1e293b', strokeDashArray: 3 },
    legend: { position: 'top', labels: { colors: '#94a3b8' } },
    tooltip: { theme: 'dark', shared: true },
    annotations: annotations,
    markers: { size: 5, hover: { size: 8 } },
    noData: { text: 'No data', style: { color: '#64748b' } },
  }

  const series = [
    { name: 'Actual', type: 'area', data: actuals },
    { name: 'Budget', type: 'line', data: budgets },
    { name: 'Cumul. YTD', type: 'line', data: cumulative },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu actions={[
        { label: 'Reset zoom', onClick: () => { setRange({ start: 0, end: -1 }); setSelectedPoint(null) } },
      ]} />
      <h2 className="text-lg font-semibold mb-3">Time-Series Analysis</h2>
      {data.length > 12 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {['All', 'Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
            const qSize = Math.ceil(data.length / 4)
            const s = i === 0 ? 0 : (i - 1) * qSize
            const e = i === 0 ? -1 : Math.min(i * qSize - 1, data.length - 1)
            return (
              <button key={q} onClick={() => setRange({ start: s, end: e })}
                className={`text-xs px-2 py-1 rounded ${(range.start === s && range.end === e) ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {q}
              </button>
            )
          })}
        </div>
      )}
      {selectedPoint && (
        <div className="mb-3 p-3 bg-slate-700/50 rounded-lg text-xs text-slate-300 grid grid-cols-3 gap-2">
          <div><span className="text-slate-500">Period:</span> {selectedPoint.period_id}</div>
          <div><span className="text-slate-500">Actual:</span> ${(selectedPoint.total_actual || 0).toLocaleString()}</div>
          <div><span className="text-slate-500">Budget:</span> ${(selectedPoint.total_budget || 0).toLocaleString()}</div>
          <div><span className="text-slate-500">Variance:</span> <span className={selectedPoint.variance_amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${(selectedPoint.variance_amount || 0).toLocaleString()}</span></div>
          <div><span className="text-slate-500">Cumul. YTD:</span> ${(selectedPoint.cumulative_ytd || 0).toLocaleString()}</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Chart options={options} series={series} type="area" height="100%" />
      </div>
      <p className="text-xs text-slate-500 mt-2">Click a data point for detailed annotations</p>
    </div>
  )
}
