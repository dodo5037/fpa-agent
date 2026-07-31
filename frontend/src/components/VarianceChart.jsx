import { useState, useMemo } from 'react'
import Chart from 'react-apexcharts'

export default function VarianceChart({ variances, onRefClick }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [chartType, setChartType] = useState('bar') // bar, line, area
  const [detailType, setDetailType] = useState('flow') // flow, bar, line, area

  // Aggregate variances by account for the main chart
  const mainData = useMemo(() => {
    const byAccount = {}
    variances.forEach(v => {
      if (!byAccount[v.account_name]) {
        byAccount[v.account_name] = { total: 0, count: 0, type: v.account_type }
      }
      byAccount[v.account_name].total += v.variance_amount
      byAccount[v.account_name].count++
    })
    return Object.entries(byAccount).map(([name, data]) => ({
      name,
      total: data.total,
      type: data.type,
    }))
  }, [variances])

  // Detail data for a specific account
  const detailData = useMemo(() => {
    if (!selectedAccount) return []
    return variances
      .filter(v => v.account_name === selectedAccount)
      .map(v => ({
        period: v.period_id,
        pct: v.variance_pct,
        amount: v.variance_amount,
        budget: v.budget_amount,
        actual: v.actual_amount,
        favorable: v.favorable,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [selectedAccount, variances])

  const colorForType = (type, value) => {
    if (type === 'revenue') return value >= 0 ? '#34d399' : '#fb7185'
    return value >= 0 ? '#fb7185' : '#34d399'
  }

  // ── Main chart options ──
  const mainOptions = {
    chart: {
      type: chartType === 'area' ? 'area' : chartType,
      toolbar: { show: false },
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const account = mainData[config.dataPointIndex]
          if (account) {
            setSelectedAccount(account.name)
            setExpanded(true)
          }
        },
      },
    },
    plotOptions: chartType === 'bar' ? { bar: { borderRadius: 4, horizontal: false } } : {},
    colors: mainData.map(d => colorForType(d.type, d.total)),
    xaxis: {
      categories: mainData.map(d => d.name),
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, rotate: -15 },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: '#94a3b8' } } },
    grid: { show: false },
    legend: { show: false },
    tooltip: { theme: 'dark', y: { formatter: (val) => `$${val.toFixed(2)}` } },
    dataLabels: { enabled: false },
    fill: chartType === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } } : {},
    stroke: chartType !== 'bar' ? { curve: 'smooth', width: 2 } : {},
  }

  // ── Detail chart: "flow" shows budget vs actual side by side ──
  // "bar/line/area" shows variance % over periods
  const detailOptions = useMemo(() => {
    if (detailType === 'flow') {
      return {
        chart: { type: 'bar', toolbar: { show: false }, stacked: false },
        plotOptions: { bar: { borderRadius: 4, dataLabels: { position: 'top' } } },
        colors: ['#64748b', detailData.length > 0 && detailData[0].favorable ? '#34d399' : '#fb7185'],
        xaxis: {
          categories: detailData.map(d => d.period),
          labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: (val) => `$${(val/1000).toFixed(0)}k` } },
        grid: { show: false },
        legend: { show: true, position: 'top', labels: { colors: '#94a3b8' } },
        tooltip: { theme: 'dark', y: { formatter: (val) => `$${val.toFixed(2)}` } },
        dataLabels: { enabled: false },
      }
    }

    return {
      chart: {
        type: detailType === 'area' ? 'area' : detailType,
        toolbar: { show: false },
      },
      plotOptions: detailType === 'bar' ? { bar: { borderRadius: 4 } } : {},
      colors: detailData.map(d => d.favorable ? '#34d399' : '#fb7185'),
      xaxis: {
        categories: detailData.map(d => d.period),
        labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: { style: { colors: '#94a3b8' }, formatter: (val) => `${val.toFixed(1)}%` },
      },
      grid: { show: false },
      legend: { show: false },
      tooltip: { theme: 'dark', y: { formatter: (val) => `${val.toFixed(2)}%` } },
      dataLabels: { enabled: false },
      fill: detailType === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } } : {},
      stroke: detailType !== 'bar' ? { curve: 'smooth', width: 2 } : {},
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
              <button
                onClick={() => setExpanded(false)}
                className="text-slate-400 hover:text-slate-200 mr-2"
              >← Back</button>
              {selectedAccount}
            </span>
          ) : (
            'Variance by Account'
          )}
        </h2>
        {!expanded && (
          <div className="flex gap-1">
            {chartTypeButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setChartType(btn.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  chartType === btn.id
                    ? 'bg-slate-700 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >{btn.label}</button>
            ))}
          </div>
        )}
      </div>

      {!expanded && (
        <p className="text-xs text-slate-500 mb-3">Click a bar to see period detail</p>
      )}

      {expanded ? (
        <div key={selectedAccount} className="reveal-animation">
          {/* Detail chart type selector */}
          <div className="flex gap-1 mb-4">
            {detailTypeButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setDetailType(btn.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  detailType === btn.id
                    ? 'bg-slate-700 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >{btn.label}</button>
            ))}
          </div>

          <Chart
            options={detailOptions}
            series={detailSeries}
            type={detailType === 'flow' ? 'bar' : detailType}
            height={350}
          />

          <div className="mt-3 text-xs text-slate-500">
            {detailType === 'flow'
              ? `Budget vs Actual for ${selectedAccount} across ${detailData.length} periods`
              : `Variance % for ${selectedAccount} across ${detailData.length} periods`
            }
          </div>
        </div>
      ) : (
        mainData.length > 0 && (
          <Chart
            options={mainOptions}
            series={[{ name: 'Variance Amount', data: mainData.map(d => d.total) }]}
            type={chartType === 'area' ? 'area' : chartType}
            height={350}
          />
        )
      )}
    </div>
  )
}
