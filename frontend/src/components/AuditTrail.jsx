import { useState } from 'react'

export default function AuditTrail({ log, onRefresh, selectedRef, auditDetail, onRefClick }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Audit Log List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <button
            onClick={onRefresh}
            className="text-xs text-slate-400 hover:text-slate-200 bg-slate-700 px-3 py-1 rounded"
          >
            Refresh
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {log.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No audit entries yet</p>
          ) : (
            log.map((entry, i) => (
              <div
                key={i}
                onClick={() => onRefClick(entry.result_ref)}
                className={`px-5 py-3 border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors ${
                  selectedRef === entry.result_ref ? 'bg-slate-700/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-fin text-xs text-emerald-400">
                    {entry.result_ref?.slice(0, 16)}
                  </span>
                  <span className="text-xs text-slate-500">
                    #{entry.log_id}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate font-mono-fin">
                  {entry.sql_query?.slice(0, 80)}...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {entry.timestamp}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit Detail */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4">Audit Detail</h2>
        {!auditDetail ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Select an audit entry to view full provenance
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Result Reference</p>
              <p className="font-mono-fin text-sm text-emerald-400">
                {auditDetail.result_ref}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Timestamp</p>
              <p className="text-sm text-slate-300">{auditDetail.timestamp}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Parameters</p>
              <pre className="bg-slate-900 rounded p-3 text-xs text-slate-300 overflow-x-auto font-mono-fin">
                {auditDetail.params_json}
              </pre>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">SQL Query</p>
              <pre className="bg-slate-900 rounded p-3 text-xs text-emerald-400 overflow-x-auto font-mono-fin whitespace-pre-wrap">
                {auditDetail.sql_query}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
