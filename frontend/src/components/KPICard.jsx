import WidgetMenu from './WidgetMenu'

function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

/**
 * L1.1: Individual KPI metric card — standalone draggable widget.
 */
export default function KPICard({ label, value, budget, type, onRefClick, calcRef }) {
  const variance = budget != null ? value - budget : 0
  const isFavorable = type === 'revenue' ? variance >= 0 : type === 'expense' ? variance <= 0 : variance >= 0
  const varianceColor = isFavorable ? 'text-emerald-400' : 'text-rose-400'

  return (
    <div
      onClick={() => calcRef && onRefClick?.(calcRef)}
      className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer relative group h-full flex flex-col justify-center min-h-[130px]"
    >
      <WidgetMenu />
      <p className="text-sm text-slate-400 mb-2">{label}</p>
      <p className="font-mono-fin text-2xl font-semibold text-slate-100 count-up">
        ${formatCurrency(value)}
      </p>
      {budget != null && (
        <p className="text-xs text-slate-500 mt-1">
          Budget: ${formatCurrency(budget)}
        </p>
      )}
      {type !== 'net' && (
        <p className={`text-xs font-mono-fin mt-2 ${varianceColor}`}>
          {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
        </p>
      )}
    </div>
  )
}
