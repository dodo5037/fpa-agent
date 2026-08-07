import { useState, useEffect } from 'react'
import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

const API = import.meta.env.VITE_API_URL || ''

/**
 * T2.B: Monthly Variance + Cumulative YTD Combo Chart.
 * Primary bars = monthly variance per period.
 * Secondary line = continuous orange line tracking cumulative YTD.
 * Gray zero baseline across all periods.
 */
export default function YTDComboChart({ sessionId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/timeseries?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => setData(d.results || []))
      .catch(() => setData([]))
  }, [sessionId])

  if (!data || data.length === 0) return null

  const periods = data.map(d => d.period_id)
  const varianceBar = data.map(d => d.variance_amount)
  const cumulativeLine = data.map(d => d.cumulative_ytd)

  const barColors = varianceBar.map(v => v >= 0 ? '#34d399' : '#fb7185')

  const options = {
    chart: { type: 'line', toolbar: { show: false } },
    stroke: { curve: 'smooth', width: [0, 2] },
    colors: ['#34d399', '#f97316'],
    fill: { type: ['gradient', 'solid'], gradient: { shade: 'dark', type: 'vertical', opacityFrom: 0.8, opacityTo: 0.2 } },
    xaxis: {
      categories: periods,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      {
        labels: { style: { colors: '#94a3b8' }, formatter: (v) => `${v >= 0 ? '+' : ''}$${(v/1000).toFixed(0)}k` },
      },
      {
        opposite: true,
        labels: { style: { colors: '#f97316' }, formatter: (v) => `${v >= 0 ? '+' : ''}$${(v/1000).toFixed(0)}k` },
      },
    ],
    grid: { show: false },
    legend: { position: 'top', labels: { colors: '#94a3b8' } },
    tooltip: { theme: 'dark' },
    annotations: {
      yaxis: [{
        y: 0,
        borderColor: '#475569',
        borderWidth: 1,
        strokeDashArray: 4,
        label: { text: 'Zero baseline', style: { color: '#64748b', fontSize: '10px' } },
      }],
    },
    noData: { text: 'No data', style: { color: '#64748b' } },
  }

  const series = [
    { name: 'Monthly Δ', type: 'bar', data: varianceBar },
    { name: 'Cumulative YTD', type: 'line', data: cumulativeLine },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu />
      <h2 className="text-lg font-semibold mb-4">Monthly Variance + YTD</h2>
      <div className="flex-1 min-h-0">
        <Chart options={options} series={series} type="line" height="100%" />
      </div>
    </div>
  )
}
