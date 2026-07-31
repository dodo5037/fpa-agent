function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

export default function KPICards({ summary, onRefClick }) {
  const cards = [
    {
      label: 'Total Revenue (Actual)',
      value: summary.total_revenue_actual,
      budget: summary.total_revenue_budget,
      type: 'revenue',
    },
    {
      label: 'Total Expenses (Actual)',
      value: summary.total_expense_actual,
      budget: summary.total_expense_budget,
      type: 'expense',
    },
    {
      label: 'Net Variance',
      value: summary.net_variance,
      type: 'net',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card, i) => {
        const variance = card.value - (card.budget || 0)
        const isFavorable = card.type === 'revenue' ? variance >= 0 : card.type === 'expense' ? variance <= 0 : variance >= 0
        const varianceColor = isFavorable ? 'text-emerald-400' : 'text-rose-400'

        return (
          <div
            key={i}
            onClick={() => card.calc_ref && onRefClick(card.calc_ref)}
            className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
          >
            <p className="text-sm text-slate-400 mb-2">{card.label}</p>
            <p className="font-mono-fin text-2xl font-semibold text-slate-100">
              ${formatCurrency(card.value)}
            </p>
            {card.budget != null && (
              <p className="text-xs text-slate-500 mt-1">
                Budget: ${formatCurrency(card.budget)}
              </p>
            )}
            {card.type !== 'net' && (
              <p className={`text-xs font-mono-fin mt-2 ${varianceColor}`}>
                {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
