import { useMemo } from 'react'
import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

/**
 * P4.3: Stepped Variance Area Chart.
 * Area chart with conditional green (positive variance) and red (negative) fill.
 * Stepped line style makes period transitions explicit.
 */
export default function SteppedAreaChart({ variances }) {
  const data = useMemo(() => {
    if (!variances || variances.length === 0) return []
    // Aggregate by period for the stepped area
    const byPeriod = {}
    variances.forEach(v => {
      const p = v.period_id
      if (!byPeriod[p]) byPeriod[p] = { budget: 0, actual: 0, count: 0 }
      byPeriod[p].budget += v.budget_amount || 0
      byPeriod[p].actual += v.actual_amount || 0
      byPeriod[p].count++
    })
    return Object.entries(byPeriod)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]) => ({
        period,
        budget: vals.budget,
        actual: vals.actual,
        variance: vals.actual - vals.budget,
        pct: vals.budget ? ((vals.actual - vals.budget) / vals.budget) * 100 : 0,
      }))
  }, [variances])

  if (data.length === 0) return null

  const periods = data.map(d => d.period)
  const actualSeries = data.map(d => d.actual)
  const budgetSeries = data.map(d => d.budget)
  const varianceSeries = data.map(d => d.variance)

  const varianceColors = varianceSeries.map(v => v >= 0 ? '#34d399' : '#fb7185')

  const options = {
    chart: { type: 'area', toolbar: { show: false } },
    stroke: {
      curve: 'stepline',
      width: [2, 2, 2],
      dashArray: [0, 5, 0],
    },
    colors: ['#34d399', '#94a3b8', '#f97316'],
    fill: {
      type: ['gradient', 'solid', 'gradient'],
      gradient: {
        shade: 'dark', type: 'vertical',
        opacityFrom: 0.3, opacityTo: 0,
        gradientToColors: varianceColors,
      },
    },
    xaxis: {
      categories: periods,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      {
        labels: { style: { colors: '#94a3b8' }, formatter: v => `$${(v/1000).toFixed(0)}k` },
      },
      { show: false },
      { show: false },
    ],
    grid: { show: true, borderColor: '#1e293b', strokeDashArray: 3 },
    legend: { position: 'top', labels: { colors: '#94a3b8' } },
    tooltip: {
      theme: 'dark',
      custom: ({ series, dataPointIndex }) => {
        const d = data[dataPointIndex]
        if (!d) return ''
        return `<div style="background:#1e293b;padding:10px 14px;border-radius:8px;border:1px solid #334155">
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.period}</div>
          <div style="color:#94a3b8;font-size:12px">Budget: $${d.budget.toLocaleString()}</div>
          <div style="color:#34d399;font-size:12px">Actual: $${d.actual.toLocaleString()}</div>
          <div style="color:${d.variance>=0?'#34d399':'#fb7185'};font-size:12px;font-family:JetBrains Mono,monospace">
            Δ ${d.variance>=0?'+':''}$${d.variance.toLocaleString()} (${d.pct.toFixed(1)}%)
          </div>
        </div>`
      },
    },
    dataLabels: { enabled: false },
    markers: { size: 4, colors: varianceColors },
    noData: { text: 'No variance data', style: { color: '#64748b' } },
    annotations: {
      yaxis: [{
        y: 0,
        borderColor: '#475569',
        borderWidth: 1,
        strokeDashArray: 4,
      }],
    },
  }

  const series = [
    { name: 'Actual', data: actualSeries },
    { name: 'Budget', data: budgetSeries },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu />
      <h2 className="text-lg font-semibold mb-4">Stepped Variance Area</h2>
      <div className="flex-1 min-h-0">
        <Chart options={options} series={series} type="area" height="100%" />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Stepped transitions show period-over-period changes clearly
      </div>
    </div>
  )
}
