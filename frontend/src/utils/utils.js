export function getRiskBadgeClass(category) {
  const map = {
    LOW: 'badge-low',
    MEDIUM: 'badge-medium',
    HIGH: 'badge-high',
    VERY_HIGH: 'badge-very_high',
  }
  return map[category?.toUpperCase()] || 'badge-medium'
}

export function getDecisionBadgeClass(decision) {
  const map = {
    APPROVED: 'badge-approved',
    MANUAL_REVIEW: 'badge-manual_review',
    REJECTED: 'badge-rejected',
  }
  return map[decision?.toUpperCase()] || 'badge-manual_review'
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
}

export function getErrorMessage(error) {
  // Structured API error detail (FastAPI HTTPException)
  const detail = error?.response?.data?.detail
  if (detail) {
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ')
    }
    if (typeof detail === 'object') return JSON.stringify(detail)
  }

  const altMsg = error?.response?.data?.message || error?.response?.data?.error
  if (altMsg && typeof altMsg === 'string') return altMsg

  const status = error?.response?.status
  // 502/503/504 mean the backend proxy cannot reach the FastAPI server
  if (status === 502 || status === 503 || status === 504) {
    return 'Backend server is not reachable. Please ensure the FastAPI server is running on port 8000.'
  }
  // 500 from the proxy usually means the backend is down or threw an unhandled exception
  if (status === 500) {
    return 'Internal server error. The backend server may be unavailable or encountered an unexpected issue.'
  }
  if (status === 401) return 'Invalid credentials. Please check your email and password.'
  if (status === 403) return 'Access denied. You do not have permission to perform this action.'

  // Network error (no response at all — e.g. ECONNREFUSED or CORS block)
  if (!error?.response) {
    if (
      error?.code === 'ERR_NETWORK' ||
      error?.message?.toLowerCase().includes('network') ||
      error?.message?.toLowerCase().includes('failed')
    ) {
      return 'Backend server is not reachable. Please ensure the FastAPI server is running on port 8000.'
    }
    if (error?.message) return error.message
  }

  return 'An unexpected error occurred. Please try again.'
}

