import api from './api'

export const authService = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),
  register: (data) =>
    api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  logout: () => {
    localStorage.removeItem('ekyc_token')
    localStorage.removeItem('ekyc_user')
  },
  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }),
  verifyOtp: (email, otp) =>
    api.post('/auth/verify-otp', { email, otp }),
  resetPassword: (reset_token, new_password) =>
    api.post('/auth/reset-password', { reset_token, new_password }),
}

export const dashboardService = {
  getSummary: () => api.get('/dashboard/summary'),
}

export const ekycService = {
  verify: (data) => api.post('/ekyc/verify', data),
}

export const documentService = {
  analyze: (formData) =>
    api.post('/documents/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export const livenessService = {
  check: (formData) =>
    api.post('/liveness/check', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  checkJson: (data) => api.post('/liveness/check', data),
}

export const riskService = {
  score: (data) => api.post('/risk/score', data),
}

export const applicationsService = {
  list: (params) => api.get('/applications', { params }),
  get: (id) => api.get(`/applications/${id}`),
  getReport: (id) => api.get(`/applications/${id}/report`),
  updateDecision: (id, data) => api.patch(`/applications/${id}/decision`, data),
  delete: (id) => api.delete(`/applications/${id}`),
  getImages: (id) => api.get(`/applications/${id}/images`),
}

export const auditService = {
  getLogs: (params) => api.get('/audit-logs', { params }),
}

export const batchService = {
  submit: (data) => api.post('/batch/verify', data),
  status: (batchId) => api.get(`/batch/${batchId}`),
  list: () => api.get('/batch'),
}

export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.patch('/settings', data),
}

export const healthService = {
  check: () => api.get('/health'),
}
