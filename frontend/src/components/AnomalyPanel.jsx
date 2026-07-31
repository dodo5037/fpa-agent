function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

export default function AnomalyPanel({ anomalies, onRefClick, fullPage }) {
  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 ${fullPage ? 'p-5' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-semibold ${fullPage ? 'text-lg' : 'text-base'}`}>
          <span className="text-rose-400">⚠</span> Anomalies
        </h2>
        <span className="text-xs text-slate-400">{anomalies.length} flagged</span>
      </div>
      {anomalies.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">No anomalies detected</p>
      ) : (
        <div className={`space-y-2 ${fullPage ? '' : 'max-h-80 overflow-y-auto'}`}>
          {anomalies.map((a, i) => (
            <div
              key={i}
              className="bg-rose-400/5 border border-rose-400/20 rounded-lg p-3 hover:bg-rose-400/10 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{a.account_name}</p>
                  <p className="text-xs text-slate-500">
                    {a.entity_id} • {a.period_id} • {a.account_type}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-mono-fin text-sm font-semibold ${a.favorable ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {a.variance_pct?.toFixed(2)}%
                  </p>
                  <p className={`font-mono-fin text-xs ${a.favorable ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {a.variance_amount >= 0 ? '+' : ''}{formatCurrency(a.variance_amount)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onRefClick(a.calc_ref)}
                className="text-xs text-slate-500 hover:text-slate-300 underline mt-2"
              >
                Audit ref: {a.calc_ref?.slice(0, 16)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
