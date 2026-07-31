import { useState, useMemo } from 'react'
import Chart from 'react-apexcharts'

export default function VarianceChart({ variances, onRefClick }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)

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

  // Detail data for a specific account (by period)
  const detailData = useMemo(() => {
    if (!selectedAccount) return []
    return variances
      .filter(v => v.account_name === selectedAccount)
      .map(v => ({
        period: v.period_id,
        pct: v.variance_pct,
        amount: v.variance_amount,
        favorable: v.favorable,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [selectedAccount, variances])

  const mainOptions = {
    chart: {
      type: 'bar',
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
    plotOptions: {
      bar: { borderRadius: 4, horizontal: false },
    },
    colors: mainData.map(d => d.type === 'revenue'
      ? (d.total >= 0 ? '#34d399' : '#fb7185')
      : (d.total >= 0 ? '#fb7185' : '#34d399')),
    xaxis: {
      categories: mainData.map(d => d.name),
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: '#94a3b8' } } },
    grid: { show: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      y: { formatter: (val) => `$${val.toFixed(2)}` },
    },
    dataLabels: { enabled: false },
  }

  const detailOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: 'easeout',
        speed: 400,
      },
    },
    plotOptions: {
      bar: { borderRadius: 4, horizontal: false },
    },
    colors: detailData.map(d => d.favorable ? '#34d399' : '#fb7185'),
    xaxis: {
      categories: detailData.map(d => d.period),
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8' },
        formatter: (val) => `${val.toFixed(1)}%`,
      },
    },
    grid: { show: false },
    legend: { show: false },
    tooltip: {
      theme: 'dark',
      y: { formatter: (val) => `${val.toFixed(2)}%` },
    },
    dataLabels: { enabled: false },
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {expanded ? (
            <span>
              <button
                onClick={() => setExpanded(false)}
                className="text-slate-400 hover:text-slate-200 mr-2"
              >
                ← Back
              </button>
              {selectedAccount} — Period Breakdown
            </span>
          ) : (
            'Variance by Account'
          )}
        </h2>
        {!expanded && (
          <p className="text-xs text-slate-500">Click a bar to see period detail</p>
        )}
      </div>

      {expanded ? (
        <div key={selectedAccount} className="reveal-animation">
          <Chart
            options={detailOptions}
            series={[{ name: 'Variance %', data: detailData.map(d => d.pct || 0) }]}
            type="bar"
            height={350}
          />
          <div className="mt-3 text-xs text-slate-500">
            Showing {detailData.length} periods for {selectedAccount}
          </div>
        </div>
      ) : (
        <Chart
          options={mainOptions}
          series={[{ name: 'Variance Amount', data: mainData.map(d => d.total) }]}
          type="bar"
          height={350}
        />
      )}
    </div>
  )
}
