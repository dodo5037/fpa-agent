import { useState, useMemo } from 'react'

function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const SORT_FIELDS = {
  period: 'period_id',
  budget: 'budget_amount',
  actual: 'actual_amount',
  variance: 'variance_amount',
  percent: 'variance_pct',
  type: 'account_type',
}

export default function VarianceTable({ variances, onRefClick }) {
  const [sortKey, setSortKey] = useState('period')
  const [sortDir, setSortDir] = useState('asc')

  if (!variances) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Variance Detail</h2>
        </div>
        <div className="p-8 space-y-3 animate-pulse">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-4 bg-slate-700 rounded" style={{width: `${85 - i*5}%`}}></div>
          ))}
        </div>
      </div>
    )
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const field = SORT_FIELDS[sortKey]
    const dir = sortDir === 'asc' ? 1 : -1
    return [...variances].sort((a, b) => {
      const va = a[field] ?? ''
      const vb = b[field] ?? ''
      if (typeof va === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [variances, sortKey, sortDir])

  const SortHeader = ({ label, field, align = 'left' }) => {
    const active = sortKey === field
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
    return (
      <th
        className={`px-4 py-3 font-medium cursor-pointer hover:text-white transition-colors select-none ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
        onClick={() => handleSort(field)}
      >
        {label}
        <span className={active ? 'text-emerald-400' : 'text-slate-600'}>
          {active ? arrow : ' ⇅'}
        </span>
      </th>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold">Variance Detail</h2>
        <p className="text-sm text-slate-400 mt-1">{variances.length} rows</p>
      </div>
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 sticky top-0">
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <SortHeader label="Type" field="type" />
              <SortHeader label="Period" field="period" />
              <SortHeader label="Budget" field="budget" align="right" />
              <SortHeader label="Actual" field="actual" align="right" />
              <SortHeader label="Variance" field="variance" align="right" />
              <SortHeader label="Variance %" field="percent" align="right" />
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-center">Audit</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const varianceColor = row.favorable ? 'text-emerald-400' : 'text-rose-400'
              return (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-slate-300">{row.entity_id}</td>
                  <td className="px-4 py-3 text-slate-200">{row.account_name}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{row.account_type}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono-fin">{row.period_id}</td>
                  <td className="px-4 py-3 text-right font-mono-fin text-slate-300">${formatCurrency(row.budget_amount)}</td>
                  <td className="px-4 py-3 text-right font-mono-fin text-slate-300">${formatCurrency(row.actual_amount)}</td>
                  <td className={`px-4 py-3 text-right font-mono-fin ${varianceColor}`}>
                    {row.variance_amount >= 0 ? '+' : ''}{formatCurrency(row.variance_amount)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono-fin ${varianceColor}`}>
                    {row.variance_pct != null ? `${row.variance_pct.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      row.favorable ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'
                    }`}>
                      {row.favorable ? 'Favorable' : 'Unfavorable'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.calc_ref ? (
                    <button
                      onClick={() => onRefClick?.(row.calc_ref)}
                      className="text-xs text-slate-500 hover:text-slate-300 underline"
                    >
                      {row.calc_ref.slice(0, 8)}
                    </button>
                    ) : (
                    <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
