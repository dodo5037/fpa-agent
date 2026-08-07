import Chart from 'react-apexcharts'
import WidgetMenu from './WidgetMenu'

/**
 * T2.A: Zero-Centered Diverging Bar Chart.
 * Positive values extend right in teal green, negative extend left in coral red.
 * Origin axis aligned strictly at 0 with value labels at bar tips.
 */
export default function DivergingBarChart({ variances }) {
  const truncate = (s) => s.length > 18 ? s.slice(0, 16) + '...' : s
  const data = (variances || []).map(v => ({
    name: truncate(v.account_name || v.account_id),
    fullName: v.account_name || v.account_id,
    value: v.variance_amount || 0,
  })).sort((a, b) => b.value - a.value)

  const colors = data.map(d => d.value >= 0 ? '#009688' : '#FF6B6B')
  const labels = data.map(d => d.name)
  const values = data.map(d => Math.abs(d.value))

  const options = {
    chart: { type: 'bar', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '70%', minHeight: 4 } },
    colors: colors,
    xaxis: {
      categories: labels,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px' },
        formatter: (val) => `${val >= 0 ? '+' : ''}$${val.toLocaleString()}`,
      },
    },
    grid: { show: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      y: { formatter: (val) => `${val >= 0 ? '+' : ''}$${val.toLocaleString()}` },
      custom: ({ dataPointIndex }) => {
        const d = data[dataPointIndex]
        if (!d) return ''
        return `<div style="background:#1e293b;padding:8px 12px;border-radius:8px;border:1px solid #334155">
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.fullName}</div>
          <div style="color:${d.value>=0?'#34d399':'#fb7185'};font-size:13px;font-family:JetBrains Mono,monospace">
            ${d.value>=0?'+':''}$${Math.abs(d.value).toLocaleString()}
          </div>
        </div>`
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val) => `${val >= 0 ? '+' : ''}$${val.toLocaleString()}`,
      style: { colors: ['#e2e8f0'], fontSize: '11px' },
      offsetX: 4,
    },
    noData: { text: 'No variance data', style: { color: '#64748b', fontSize: '14px' } },
  }

  const series = [{
    name: 'Variance',
    data: data.map(d => d.value),
  }]

  if (data.length === 0) return null

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 relative group chart-enter h-full flex flex-col">
      <WidgetMenu />
      <h2 className="text-lg font-semibold mb-4">Diverging Variance</h2>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Chart options={options} series={series} type="bar" height={Math.max(300, data.length * 40)} />
      </div>
    </div>
  )
}
