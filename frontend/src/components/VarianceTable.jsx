function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

export default function VarianceTable({ variances, onRefClick }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold">Variance Detail</h2>
        <p className="text-sm text-slate-400 mt-1">{variances.length} rows</p>
      </div>
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 sticky top-0">
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium text-right">Budget</th>
              <th className="px-4 py-3 font-medium text-right">Actual</th>
              <th className="px-4 py-3 font-medium text-right">Variance</th>
              <th className="px-4 py-3 font-medium text-right">Variance %</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-center">Audit</th>
            </tr>
          </thead>
          <tbody>
            {variances.map((row, i) => {
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
                    <button
                      onClick={() => onRefClick(row.calc_ref)}
                      className="text-xs text-slate-500 hover:text-slate-300 underline"
                    >
                      {row.calc_ref?.slice(0, 8)}
                    </button>
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
