import { useState, useEffect } from 'react'
import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

const API = import.meta.env.VITE_API_URL || ''

/**
 * T2.C: Vector Delta Callout Trendline Chart.
 * Smooth curve tracking period actuals. Vertical dotted reference lines
 * from each data point to the X-axis. Arrow indicators at each point:
 * teal up-arrow for positive delta, red down-arrow for negative delta.
 */
export default function VectorDeltaChart({ sessionId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/timeseries?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => setData(d.results || []))
      .catch(() => setData([]))
  }, [sessionId])

  if (!data || data.length === 0) return null

  const periods = data.map(d => d.period_id)
  const actuals = data.map(d => d.total_actual)
  const budgets = data.map(d => d.total_budget)
  const annotations = data.flatMap((d, i) => {
    const delta = d.variance_amount
    const label = delta >= 0 ? '▲' : '▼'
    return [{
      x: d.period_id,
      y: d.total_actual,
      marker: { size: 6, fillColor: delta >= 0 ? '#009688' : '#FF6B6B', strokeColor: '#fff', strokeWidth: 1 },
      label: {
        text: label,
        borderColor: 'transparent',
        style: { color: delta >= 0 ? '#009688' : '#FF6B6B', fontSize: '16px', fontWeight: 'bold' },
        offsetY: -10,
      },
    }]
  })

  const options = {
    chart: { type: 'line', toolbar: { show: false } },
    stroke: { curve: 'smooth', width: [2, 2, 0], dashArray: [0, 5, 0] },
    colors: ['#34d399', '#94a3b8', '#64748b'],
    xaxis: {
      categories: periods,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#94a3b8' }, formatter: (v) => `$${(v/1000).toFixed(0)}k` },
    },
    grid: { show: true, borderColor: '#1e293b', strokeDashArray: 3 },
    legend: { position: 'top', labels: { colors: '#94a3b8' } },
    tooltip: { theme: 'dark' },
    annotations: {
      points: annotations,
    },
    markers: { size: 5, colors: ['#34d399'], strokeColors: '#fff', strokeWidth: 1 },
    noData: { text: 'No data', style: { color: '#64748b' } },
  }

  const series = [
    { name: 'Actual', data: actuals },
    { name: 'Budget', data: budgets },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu />
      <h2 className="text-lg font-semibold mb-4">Vector Delta Trendline</h2>
      <div className="flex-1 min-h-0">
        <Chart options={options} series={series} type="line" height="100%" />
      </div>
    </div>
  )
}
