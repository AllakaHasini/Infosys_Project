import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { applicationsService } from '../services/services'
import { LoadingSpinner, ErrorAlert } from '../components/Alerts'
import { getRiskBadgeClass, getDecisionBadgeClass, formatDate, getErrorMessage } from '../utils/utils'
import { useAuth } from '../hooks/useAuth'

export default function ApplicationsPage() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 20 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    applicationsService.list({
      page,
      page_size: 20,
      search: search.trim() ? search.trim() : undefined,
      status: statusFilter || undefined,
    })
      .then(res => { setData(res.data); setError(null) })
      .catch(err => {
        setError(getErrorMessage(err))
      })
      .finally(() => setLoading(false))
  }, [page, search, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDeleteApplication = async (appId) => {
    if (!window.confirm(`Are you sure you want to delete application ${appId}?\n\nThis action cannot be undone.`)) return
    setDeletingId(appId)
    try {
      await applicationsService.delete(appId)
      fetchData()
    } catch (err) {
      setError('Failed to delete: ' + (err?.response?.data?.detail || err.message || 'Unknown error'))
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = Math.ceil((data.total || 0) / (data.page_size || 20)) || 1

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isAdmin ? 'All Applications (Admin Review Queue)' : 'My Applications'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAdmin
              ? 'Comprehensive administrative register of all eKYC submissions across users.'
              : 'Secure record of your personal eKYC submissions.'}
          </p>
        </div>
        <Link to="/ekyc/verify" className="btn-primary text-sm">+ New eKYC Verification</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
        <input
          className="input-field w-full sm:max-w-xs"
          placeholder="🔍 Search by name or ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <div className="flex gap-2">
          <select
            className="input-field flex-1 sm:w-48"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <option value="">All Statuses / Decisions</option>
            <option value="completed">Status: Completed</option>
            <option value="pending">Status: Pending</option>
            <option value="APPROVED">Decision: Approved</option>
            <option value="MANUAL_REVIEW">Decision: Manual Review</option>
            <option value="REJECTED">Decision: Rejected</option>
          </select>
          <button onClick={fetchData} className="btn-secondary text-xs sm:text-sm px-3 shrink-0">🔄 Refresh</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <LoadingSpinner text="Loading applications…" />
      ) : error ? null : (
        <>
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs sm:text-sm font-medium text-gray-500">
                {data.total} application(s) found
              </p>
            </div>

            {data.items.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p className="text-sm">No applications found.</p>
                <Link to="/ekyc/verify" className="text-blue-600 text-sm hover:underline mt-1 inline-block">
                  Create your first verification →
                </Link>
              </div>
            ) : (
              <>
                {/* Mobile View: Touch Cards */}
                <div className="md:hidden space-y-3">
                  {data.items.map((app) => (
                    <div
                      key={app.application_id}
                      className="p-3.5 rounded-xl bg-gray-50 border border-gray-200/80 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm leading-snug">{app.applicant_name}</p>
                          <p className="font-mono text-xs text-blue-600 truncate mt-0.5">{app.application_id}</p>
                        </div>
                        <span className={getDecisionBadgeClass(app.decision)}>{app.decision}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-gray-200/60">
                        <div>
                          <span className="text-gray-500 block text-[11px]">Risk Category</span>
                          <span className={getRiskBadgeClass(app.risk_category)}>{app.risk_category || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[11px]">Risk Score</span>
                          <span className="font-semibold text-gray-900">{app.risk_score?.toFixed(1) ?? '—'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="text-gray-500 text-[11px]">{formatDate(app.created_at)}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <Link
                            to={`/applications/${app.application_id}`}
                            className="btn-primary text-xs py-1.5 px-3 min-h-[34px]"
                          >
                            View Details →
                          </Link>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteApplication(app.application_id)}
                              disabled={deletingId === app.application_id}
                              style={{
                                padding: '6px 10px', background: '#fef2f2',
                                color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px',
                                cursor: deletingId === app.application_id ? 'wait' : 'pointer',
                                fontSize: '14px',
                              }}
                            >
                              {deletingId === app.application_id ? '⏳' : '🗑️'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: Full Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="text-left text-gray-500 border-b text-xs uppercase tracking-wide">
                        <th className="pb-3 font-medium">Application ID</th>
                        <th className="pb-3 font-medium">Applicant Name</th>
                        <th className="pb-3 font-medium">Decision</th>
                        <th className="pb-3 font-medium">Risk Category</th>
                        <th className="pb-3 font-medium">Risk Score</th>
                        <th className="pb-3 font-medium">Created</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((app) => (
                        <tr key={app.application_id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="py-3 font-mono text-xs text-blue-600">{app.application_id}</td>
                          <td className="py-3 font-medium">{app.applicant_name}</td>
                          <td className="py-3">
                            <span className={getDecisionBadgeClass(app.decision)}>{app.decision}</span>
                          </td>
                          <td className="py-3">
                            <span className={getRiskBadgeClass(app.risk_category)}>{app.risk_category || '—'}</span>
                          </td>
                          <td className="py-3 font-semibold text-gray-900">
                            {app.risk_score?.toFixed(1) ?? '—'}
                          </td>
                          <td className="py-3 text-gray-500 text-xs whitespace-nowrap">
                            {formatDate(app.created_at)}
                          </td>
                          <td className="py-3">
                            <Link
                              to={`/applications/${app.application_id}`}
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >
                              View →
                            </Link>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteApplication(app.application_id)}
                                disabled={deletingId === app.application_id}
                                style={{
                                  marginLeft: '8px', padding: '3px 8px', background: '#fef2f2',
                                  color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px',
                                  cursor: deletingId === app.application_id ? 'wait' : 'pointer',
                                  fontSize: '11px', fontWeight: 500,
                                }}
                              >
                                {deletingId === app.application_id ? '⏳' : '🗑️'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
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
