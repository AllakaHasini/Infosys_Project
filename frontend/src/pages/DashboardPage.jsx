import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { dashboardService } from '../services/services'
import { LoadingSpinner, ErrorAlert, SimulatedBanner } from '../components/Alerts'
import { getRiskBadgeClass, getDecisionBadgeClass, formatDate, getErrorMessage } from '../utils/utils'

const RISK_COLORS = {
  LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#f97316', VERY_HIGH: '#ef4444'
}

import { useAuth } from '../hooks/useAuth'

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    dashboardService.getSummary()
      .then(res => setData(res.data))
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner text="Loading dashboard…" />
  if (error) return <ErrorAlert message={error} />

  const pieData = Object.entries(data.risk_distribution || {})
    .map(([name, value]) => ({ name, value }))
    .filter(d => d.value > 0)

  const barData = [
    { name: 'Approved', count: data.approved, fill: '#22c55e' },
    { name: 'Review', count: data.manual_review, fill: '#f59e0b' },
    { name: 'Rejected', count: data.rejected, fill: '#ef4444' },
    { name: 'Pending', count: data.pending, fill: '#94a3b8' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
              isAdmin ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {isAdmin ? '🛡️ Admin Portal' : '👤 Applicant Portal'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'Enterprise Risk Operations Dashboard' : 'My eKYC Dashboard'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data.note || 'Real-time telemetry from MongoDB'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <Link to="/ekyc/verify" className="btn-primary text-sm shadow-md">
              + Submit eKYC Application
            </Link>
          )}
          <SimulatedBanner />
        </div>
      </div>

      {/* USER SELF-SERVICE DASHBOARD */}
      {!isAdmin && (
        <div className="space-y-6">
          {/* Latest Verification Status Card */}
          {data.latest_application ? (
            <div className="card border-l-4 border-blue-600 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Latest Verification</span>
                  <h2 className="text-lg font-bold text-gray-900 mt-0.5">
                    Application #{data.latest_application.application_id}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getDecisionBadgeClass(data.latest_application.decision)}>
                    {data.latest_application.decision === 'MANUAL_REVIEW'
                      ? 'Manual review required'
                      : data.latest_application.decision}
                  </span>
                  <Link
                    to={`/applications/${data.latest_application.application_id}`}
                    className="btn-secondary text-xs"
                  >
                    View Details →
                  </Link>
                </div>
              </div>

              {/* Score & Category metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Risk Score (0–100)</p>
                  <p className="text-3xl font-extrabold text-gray-900">
                    {data.latest_application.risk_score?.toFixed(1) ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Risk Category</p>
                  <span className={getRiskBadgeClass(data.latest_application.risk_category)}>
                    {data.latest_application.risk_category || 'LOW'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Document Analysis</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    data.latest_application.document_suspicious ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {data.latest_application.document_suspicious ? '⚠️ Quality Anomalies' : '✓ Quality Passed'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Liveness Assessment</p>
                  <span className="text-xs px-2 py-0.5 rounded font-semibold bg-purple-100 text-purple-800">
                    {data.latest_application.liveness_status || 'Prototype Passed'}
                  </span>
                </div>
              </div>

              {/* Simulation status */}
              {data.latest_application.simulated && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
                  <span>ℹ️</span>
                  <span><strong>Simulated Demonstration Result:</strong> Verified in sandbox demo mode with mock biometric algorithms.</span>
                </div>
              )}

              {/* Explainable reasons affecting the score */}
              {data.latest_application.risk_reasons?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Factors Influencing Your Risk Score:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {data.latest_application.risk_reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-10 space-y-3">
              <div className="text-4xl text-gray-400">📄</div>
              <p className="text-sm font-semibold text-gray-700">No applications submitted yet</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Submit your first eKYC verification to view your risk score, document assessment, and liveness status.
              </p>
              <Link to="/ekyc/verify" className="btn-primary text-xs inline-block">
                Start eKYC Verification →
              </Link>
            </div>
          )}

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center p-4">
              <p className="text-xs text-gray-500">Total Personal Applications</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.total_applications}</p>
            </div>
            <div className="card text-center p-4">
              <p className="text-xs text-gray-500">Latest Status</p>
              <p className="text-base font-semibold text-gray-900 mt-1">
                {data.latest_application ? (
                  data.latest_application.decision === 'MANUAL_REVIEW'
                    ? 'Manual review required'
                    : data.latest_application.decision
                ) : 'No submissions'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN OPERATIONS VIEW */}
      {isAdmin && (
        <>
          {/* Admin Manual Review Queue Notification */}
          {data.manual_review > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🔍</div>
                <div>
                  <p className="text-sm font-bold text-amber-900">Action Required: Pending Manual Reviews</p>
                  <p className="text-xs text-amber-700">
                    {data.manual_review} application(s) flagged for manual human review due to suspicious indicators or simulation thresholds.
                  </p>
                </div>
              </div>
              <Link to="/applications" className="btn-primary text-xs bg-amber-600 hover:bg-amber-700">
                Open Review Queue →
              </Link>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {[
              { label: 'Total Applications', value: data.total_applications, emoji: '📋' },
              { label: 'Approved', value: data.approved, emoji: '✅' },
              { label: 'Manual Review', value: data.manual_review, emoji: '🔍' },
              { label: 'Rejected', value: data.rejected, emoji: '❌' },
              { label: 'Avg Risk Score', value: data.avg_risk_score?.toFixed(1) ?? '0.0', emoji: '⚠️' },
            ].map((card) => (
              <div key={card.label} className="card text-center hover:shadow-md transition-shadow p-3 sm:p-5">
                <div className="text-2xl mb-1">{card.emoji}</div>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{card.value}</p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-1 line-clamp-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="card">
              <h2 className="text-base sm:text-lg font-semibold mb-3">Risk Distribution</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={RISK_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <div className="text-4xl mb-2">📊</div>
                  <p className="text-sm">No data yet</p>
                  <Link to="/ekyc/verify" className="text-blue-600 text-sm mt-1 hover:underline">Create your first verification →</Link>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="text-base sm:text-lg font-semibold mb-3">Decision Breakdown</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Recent Applications */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base sm:text-lg font-semibold">Recent Applications</h2>
          <Link to="/applications" className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium">
            View all →
          </Link>
        </div>
        {!data.recent_applications?.length ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm">No applications yet.</p>
            <Link to="/ekyc/verify" className="text-blue-600 text-sm hover:underline">
              Start a new eKYC verification →
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile View (< md): Touch Cards */}
            <div className="md:hidden space-y-2.5">
              {data.recent_applications.map((app) => (
                <Link
                  key={app.application_id}
                  to={`/applications/${app.application_id}`}
                  className="block p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200/70 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-gray-900 text-sm truncate">{app.applicant_name}</span>
                    <span className={getDecisionBadgeClass(app.decision)}>{app.decision}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 font-mono">
                    <span className="text-blue-600 truncate">{app.application_id}</span>
                    <span className="text-[11px] whitespace-nowrap">{formatDate(app.created_at)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-gray-200/60">
                    <span className={getRiskBadgeClass(app.risk_category)}>{app.risk_category || 'Unclassified'}</span>
                    <span className="text-blue-600 font-semibold text-xs">View details →</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop View (md+): Traditional Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b text-xs uppercase tracking-wide">
                    <th className="pb-3 font-medium">ID</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Decision</th>
                    <th className="pb-3 font-medium">Risk</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_applications.map((app) => (
                    <tr key={app.application_id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <Link to={`/applications/${app.application_id}`} className="text-blue-600 hover:underline font-mono text-xs">
                          {app.application_id}
                        </Link>
                      </td>
                      <td className="py-3 font-medium">{app.applicant_name}</td>
                      <td className="py-3">
                        <span className={getDecisionBadgeClass(app.decision)}>{app.decision}</span>
                      </td>
                      <td className="py-3">
                        <span className={getRiskBadgeClass(app.risk_category)}>{app.risk_category || '—'}</span>
                      </td>
                      <td className="py-3 text-gray-500 text-xs">{formatDate(app.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">{data.note}</p>
    </div>
  )
}
