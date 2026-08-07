import { useState, useEffect } from 'react'
import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

const API = import.meta.env.VITE_API_URL || ''

/**
 * P4.2: Annual Sales by Region Chart.
 * Grouped bar chart comparing budget vs actual across entities/regions.
 * Uses /api/regional endpoint.
 */
export default function RegionalChart({ sessionId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/regional?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => setData(d.results || []))
      .catch(() => setData([]))
  }, [sessionId])

  if (!data || data.length === 0) return null

  const entities = data.map(d => d.entity_id || d.entity_name || 'Unknown')
  const budgets = data.map(d => d.total_budget || 0)
  const actuals = data.map(d => d.total_actual || 0)
  const variances = data.map(d => (d.total_actual || 0) - (d.total_budget || 0))

  const options = {
    chart: { type: 'bar', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
    colors: ['#94a3b8', '#34d399'],
    stroke: { show: true, width: 1, colors: ['transparent'] },
    xaxis: {
      categories: entities,
      labels: { style: { colors: '#94a3b8', fontSize: '12px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#94a3b8' }, formatter: v => `$${(v/1000).toFixed(0)}k` },
    },
    grid: { show: false },
    legend: { position: 'top', labels: { colors: '#94a3b8' } },
    tooltip: {
      theme: 'dark',
      custom: ({ series, seriesIndex, dataPointIndex }) => {
        const d = data[dataPointIndex]
        if (!d) return ''
        const delta = (d.total_actual || 0) - (d.total_budget || 0)
        const sign = delta >= 0 ? '+' : ''
        return `<div style="background:#1e293b;padding:10px 14px;border-radius:8px;border:1px solid #334155">
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.entity_id || d.entity_name}</div>
          <div style="color:#94a3b8;font-size:12px">Budget: <span style="color:#94a3b8">$${(d.total_budget||0).toLocaleString()}</span></div>
          <div style="color:#34d399;font-size:12px">Actual: <span style="color:#34d399">$${(d.total_actual||0).toLocaleString()}</span></div>
          <div style="color:${delta>=0?'#34d399':'#fb7185'};font-size:12px;font-family:JetBrains Mono,monospace">Δ ${sign}$${delta.toLocaleString()}</div>
        </div>`
      },
    },
    dataLabels: { enabled: false },
    fill: {
      type: ['solid', 'gradient'],
      gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 1, opacityTo: 0.7 },
    },
    noData: { text: 'No regional data', style: { color: '#64748b' } },
  }

  const series = [
    { name: 'Budget', data: budgets },
    { name: 'Actual', data: actuals },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu />
      <h2 className="text-lg font-semibold mb-4">Budget vs Actual by Region</h2>
      <div className="flex-1 min-h-0">
        <Chart options={options} series={series} type="bar" height="100%" />
      </div>
      <div className="mt-3 flex gap-4 justify-end text-xs text-slate-500">
        {data.map((d, i) => (
          <span key={i} className={variances[i] >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {d.entity_id}: {variances[i] >= 0 ? '+' : ''}${variances[i].toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  )
}
