import { useState, useMemo } from 'react'
import Chart from 'react-apexcharts'

export default function VarianceChart({ variances, onRefClick }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [chartType, setChartType] = useState('bar')
  const [detailType, setDetailType] = useState('flow')

  const mainData = useMemo(() => {
    if (!variances || variances.length === 0) return []
    const byAccount = {}
    variances.forEach(v => {
      if (!v.account_name) return
      if (!byAccount[v.account_name]) {
        byAccount[v.account_name] = { total: 0, count: 0, type: v.account_type }
      }
      byAccount[v.account_name].total += v.variance_amount
      byAccount[v.account_name].count++
    })
    return Object.entries(byAccount).map(([name, data]) => ({
      name, total: data.total, type: data.type,
    }))
  }, [variances])

  const detailData = useMemo(() => {
    if (!selectedAccount || !variances) return []
    return variances
      .filter(v => v.account_name === selectedAccount)
      .map(v => ({
        period: v.period_id, pct: v.variance_pct, amount: v.variance_amount,
        budget: v.budget_amount, actual: v.actual_amount, favorable: v.favorable,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [selectedAccount, variances])

  const colorForType = (type, value) => {
    if (type === 'revenue') return value >= 0 ? '#34d399' : '#fb7185'
    return value >= 0 ? '#fb7185' : '#34d399'
  }

  // ── Main chart ──
  const mainColors = mainData.map(d => colorForType(d.type, d.total))

  const mainOptions = {
    chart: {
      type: chartType === 'area' ? 'area' : chartType === 'donut' ? 'donut' : chartType === 'pie' ? 'pie' : chartType,
      toolbar: { show: false },
      events: {
        dataPointSelection: (event, chartContext, config) => {
          if (chartType === 'pie' || chartType === 'donut') {
            const slice = mainData[config.dataPointIndex]
            if (slice) { setSelectedAccount(slice.name); setExpanded(true) }
          }
        },
        click: (event, chartContext, config) => {
          if (chartType !== 'pie' && chartType !== 'donut') {
            const account = mainData[config.dataPointIndex]
            if (account) { setSelectedAccount(account.name); setExpanded(true) }
          }
        },
      },
    },
    plotOptions: {
      bar: { borderRadius: 6, horizontal: false },
      pie: { expandOnClick: true, dataLabels: { offset: -10 }, donut: { size: '55%' } },
    },
    colors: mainColors,
    labels: mainData.map(d => d.name),
    xaxis: chartType !== 'pie' && chartType !== 'donut' ? {
      categories: mainData.map(d => d.name),
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, rotate: -15 },
      axisBorder: { show: false }, axisTicks: { show: false },
    } : undefined,
    yaxis: chartType !== 'pie' && chartType !== 'donut' ? {
      labels: { style: { colors: '#94a3b8' } },
    } : undefined,
    grid: { show: false },
    legend: { show: true, position: 'right', labels: { colors: '#94a3b8' }, fontSize: '12px' } ,
    tooltip: {
      theme: 'dark',
      custom: ({ series, seriesIndex, dataPointIndex, w }) => {
        const d = mainData[dataPointIndex]
        if (!d) return ''
        const val = series[seriesIndex] || seriesIndex === 0 ? series[seriesIndex] : series[0]
        return `<div style="background:#1e293b;padding:10px 14px;border-radius:8px;border:1px solid #334155">
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.name}</div>
          <div style="color:${colorForType(d.type, d.total)};font-family:JetBrains Mono,monospace">
            ${d.total >= 0 ? '+' : ''}$${d.total.toFixed(2)}
          </div>
          <div style="color:#94a3b8;font-size:11px;margin-top:2px">
            ${d.count} periods • ${d.type} • ${d.total >= 0 ? (d.type==='revenue'?'Favorable':'Unfavorable') : (d.type==='revenue'?'Unfavorable':'Favorable')}
          </div>
        </div>`
      },
    },
    dataLabels: chartType === 'pie' || chartType === 'donut' ? {
      enabled: true,
      formatter: (val, opts) => `${opts.w.config.series[opts.seriesIndex].toFixed(1)}%`,
      style: { colors: ['#e2e8f0'], fontSize: '12px' },
    } : { enabled: false },
    fill: chartType === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } }
      : chartType === 'bar' ? { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, gradientToColors: mainColors.map(c => c+'80'), opacityFrom: 1, opacityTo: 0.7 } }
      : {},
    stroke: chartType !== 'bar' && chartType !== 'pie' && chartType !== 'donut' ? { curve: 'smooth', width: 2 } : {},
    noData: { text: 'No data available', align: 'center', verticalAlign: 'middle', style: { color: '#64748b', fontSize: '14px' } },
  }

  // ── Detail chart ──
  const detailOptions = useMemo(() => {
    if (detailType === 'flow') {
      return {
        chart: { type: 'bar', toolbar: { show: false }, stacked: false },
        plotOptions: { bar: { borderRadius: 6 } },
        colors: ['#64748b', detailData.length > 0 ? colorForType('revenue', detailData[0].actual - detailData[0].budget) : '#34d399'],
        xaxis: {
          categories: detailData.map(d => d.period || ''),
          labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: (val) => `$${(val/1000).toFixed(0)}k` } },
        grid: { show: false },
        legend: { show: true, position: 'top', labels: { colors: '#94a3b8' } },
        tooltip: {
          theme: 'dark',
          custom: ({ series, dataPointIndex }) => {
            const d = detailData[dataPointIndex]
            if (!d) return ''
            const delta = d.actual - d.budget
            const deltaSign = delta >= 0 ? '+' : ''
            return `<div style="background:#1e293b;padding:10px 14px;border-radius:8px;border:1px solid #334155">
              <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.period}</div>
              <div style="color:#94a3b8;font-size:12px">Budget: <span style="font-family:JetBrains Mono,monospace;color:#94a3b8">$${d.budget.toFixed(2)}</span></div>
              <div style="color:#e2e8f0;font-size:12px">Actual: <span style="font-family:JetBrains Mono,monospace;color:#e2e8f0">$${d.actual.toFixed(2)}</span></div>
              <div style="color:${delta >= 0 ? '#34d399' : '#fb7185'};font-size:12px;font-family:JetBrains Mono,monospace">Δ ${deltaSign}$${delta.toFixed(2)} (${d.pct?.toFixed(2)}%)</div>
            </div>`
          },
        },
        dataLabels: { enabled: false },
        fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 1, opacityTo: 0.7 } },
        noData: { text: 'No data available', style: { color: '#64748b', fontSize: '14px' } },
      }
    }
    return {
      chart: { type: detailType === 'area' ? 'area' : detailType, toolbar: { show: false } },
      plotOptions: detailType === 'bar' ? { bar: { borderRadius: 6 } } : {},
      colors: detailData.map(d => d.favorable ? '#34d399' : '#fb7185'),
      xaxis: {
        categories: detailData.map(d => d.period || ''),
        labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: (val) => `${val?.toFixed?.(1) ?? '0.0'}%` } },
      grid: { show: false },
      legend: { show: true, position: 'right', labels: { colors: '#94a3b8' } },
      tooltip: {
        theme: 'dark',
        custom: ({ series, dataPointIndex }) => {
          const d = detailData[dataPointIndex]
          if (!d) return ''
          return `<div style="background:#1e293b;padding:10px 14px;border-radius:8px;border:1px solid #334155">
            <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px">${d.period}</div>
            <div style="color:${d.favorable ? '#34d399' : '#fb7185'};font-family:JetBrains Mono,monospace">${d.pct?.toFixed(2)}%</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:2px">${d.favorable ? 'Favorable' : 'Unfavorable'}</div>
          </div>`
        },
      },
      dataLabels: { enabled: false },
      fill: detailType === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } }
        : detailType === 'bar' ? { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 1, opacityTo: 0.7 } } : {},
      stroke: detailType !== 'bar' ? { curve: 'smooth', width: 2 } : {},
      noData: { text: 'No data available', style: { color: '#64748b', fontSize: '14px' } },
    }
  }, [detailType, detailData])

  const detailSeries = useMemo(() => {
    if (detailType === 'flow') {
      return [
        { name: 'Budget', data: detailData.map(d => d.budget) },
        { name: 'Actual', data: detailData.map(d => d.actual) },
      ]
    }
    return [{ name: 'Variance %', data: detailData.map(d => d.pct || 0) }]
  }, [detailType, detailData])

  const chartTypeButtons = [
    { id: 'bar', label: 'Bar' },
    { id: 'line', label: 'Line' },
    { id: 'area', label: 'Area' },
    { id: 'pie', label: 'Pie' },
    { id: 'donut', label: 'Donut' },
  ]

  const detailTypeButtons = [
    { id: 'flow', label: '💰 Money Flow' },
    { id: 'bar', label: '📊 Bar %' },
    { id: 'line', label: '📈 Line %' },
    { id: 'area', label: '🏔️ Area %' },
  ]

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {expanded ? (
            <span>
              <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-200 mr-2">← Back</button>
              {selectedAccount}
            </span>
          ) : 'Variance by Account'}
        </h2>
        {!expanded && (
          <div className="flex gap-1 flex-wrap">
            {chartTypeButtons.map(btn => (
              <button key={btn.id} onClick={() => setChartType(btn.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  chartType === btn.id ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!expanded && chartType !== 'pie' && chartType !== 'donut' && (
        <p className="text-xs text-slate-500 mb-3">Click a bar to see period detail</p>
      )}

      {expanded ? (
        <div key={selectedAccount} className="reveal-animation">
          <div className="flex gap-1 mb-4 flex-wrap">
            {detailTypeButtons.map(btn => (
              <button key={btn.id} onClick={() => setDetailType(btn.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  detailType === btn.id ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {btn.label}
              </button>
            ))}
          </div>
          <Chart options={detailOptions} series={detailSeries}
            type={detailType === 'flow' ? 'bar' : detailType} height={350} />
          <div className="mt-3 text-xs text-slate-500">
            {detailType === 'flow' ? `Budget vs Actual for ${selectedAccount} across ${detailData.length} periods`
              : `Variance % for ${selectedAccount} across ${detailData.length} periods`}
          </div>
        </div>
      ) : (
        <Chart options={mainOptions}
          series={chartType === 'pie' || chartType === 'donut'
            ? mainData.map(d => Math.abs(d.total))
            : [{ name: 'Variance Amount', data: mainData.map(d => d.total) }]}
          type={chartType === 'donut' ? 'donut' : chartType === 'pie' ? 'pie' : chartType === 'area' ? 'area' : chartType}
          height={350} />
      )}
    </div>
  )
}
