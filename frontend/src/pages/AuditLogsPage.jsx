import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { auditService } from '../services/services'
import { LoadingSpinner, ErrorAlert } from '../components/Alerts'
import { formatDate, getErrorMessage } from '../utils/utils'

const EVENT_TYPES = [
  'AUTH_LOGIN', 'EKYC_VERIFICATION', 'MANUAL_DECISION', 'DOCUMENT_ANALYSIS'
]

const eventColors = {
  AUTH_LOGIN: 'bg-blue-100 text-blue-700',
  EKYC_VERIFICATION: 'bg-purple-100 text-purple-700',
  MANUAL_DECISION: 'bg-orange-100 text-orange-700',
  DOCUMENT_ANALYSIS: 'bg-teal-100 text-teal-700',
}

export default function AuditLogsPage() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 20 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [eventFilter, setEventFilter] = useState('')
  const [page, setPage] = useState(1)

  const fetchData = useCallback(() => {
    setLoading(true)
    auditService.getLogs({
      page,
      page_size: 20,
      event_type: eventFilter || undefined,
    })
      .then(res => { setData(res.data); setError(null) })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [page, eventFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil((data.total || 0) / (data.page_size || 20)) || 1

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Security and application event history</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">🔄 Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          className="input-field max-w-[240px]"
          value={eventFilter}
          onChange={e => { setEventFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Event Types</option>
          {EVENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {error && <ErrorAlert message={error} />}

      {loading ? (
        <LoadingSpinner text="Loading audit logs…" />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <p className="text-sm text-gray-500 mb-4">{data.total} event(s)</p>
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="text-left text-gray-500 border-b uppercase tracking-wide">
                  <th className="pb-3 font-medium">Event Type</th>
                  <th className="pb-3 font-medium">Application</th>
                  <th className="pb-3 font-medium">Performed By</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      <div className="text-4xl mb-2">🔒</div>
                      <p>No audit events yet.</p>
                    </td>
                  </tr>
                ) : (
                  data.items.map((log, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold font-mono ${eventColors[log.event_type] || 'bg-gray-100 text-gray-700'}`}>
                          {log.event_type}
                        </span>
                      </td>
                      <td className="py-3">
                        {log.application_id ? (
                          <Link
                            to={`/applications/${log.application_id}`}
                            className="text-blue-600 hover:underline font-mono"
                          >
                            {log.application_id}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-3 text-gray-600">{log.performed_by || '—'}</td>
                      <td className="py-3 text-gray-700 max-w-xs">{log.description}</td>
                      <td className="py-3 text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
