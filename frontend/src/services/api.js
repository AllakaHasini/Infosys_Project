import axios from 'axios'

// Configurable API base URL: defaults to '/api' for Vite dev proxy,
// but can be overridden via VITE_API_URL or VITE_API_BASE_URL for mobile / production / HTTPS setups.
// If accessed from another device on the network, ensures 127.0.0.1 is not used as the remote backend address.
function resolveApiBase() {
  const configured =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    '/api'

  if (typeof window !== 'undefined' && configured.startsWith('http')) {
    const currentHost = window.location.hostname
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      try {
        const parsed = new URL(configured)
        if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
          parsed.hostname = currentHost
          return parsed.toString().replace(/\/$/, '')
        }
      } catch {
        // fallback to configured
      }
    }
  }
  return configured
}

const apiBase = resolveApiBase()

const api = axios.create({
  baseURL: apiBase,
  timeout: 30000,
  withCredentials: true,
})

// Attach JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ekyc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ekyc_token')
      localStorage.removeItem('ekyc_user')
      // Only redirect if not already on login or register page
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register')
      ) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
