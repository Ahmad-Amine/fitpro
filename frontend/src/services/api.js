import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    sessionStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
    const path = window.location.pathname
    if (path !== '/login' && path !== '/register') window.location.href = '/login'
  }
  return Promise.reject(err)
})

export const authAPI = {
  updateMe: (data) => api.put('/auth/me', data),
  register:          (data)     => api.post('/auth/register', data),
  login:             (data)     => api.post('/auth/login', data),
  me:                ()         => api.get('/auth/me'),
  seedAdmin:         ()         => api.get('/auth/seed-admin'),
  getAllUsers:        (params)   => api.get('/auth/users', { params }),
  resetUserPassword: (id, data) => api.put(`/auth/users/${id}/reset-password`, data),
  toggleUserActive:  (id)       => api.put(`/auth/users/${id}/toggle-active`),
  deleteUser:        (id)       => api.delete(`/auth/users/${id}`),
  getUserActivity:   (id)       => api.get(`/auth/users/${id}/activity`),
}

export const servicesAPI = {
  getAll:  ()   => api.get('/services'),
  getById: (id) => api.get(`/services/${id}`),
  seed:    ()   => api.get('/services/seed'),
}

export const adminServicesAPI = {
  create: (data)     => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  remove: (id)       => api.delete(`/services/${id}`),
}

export const exportAPI = {
  appointments: () => api.get('/export/appointments', { responseType: 'blob' }),
  users:        () => api.get('/export/users',        { responseType: 'blob' }),
}

export const appointmentsAPI = {
  getMine:       ()              => api.get('/appointments/my'),
  getAll:        ()              => api.get('/appointments/all'),
  getRevenue:    ()              => api.get('/appointments/revenue'),
  create:        (data)          => api.post('/appointments', data),
  createMulti:   (data)          => api.post('/appointments/multi', data),
  phoneBooking:  (data)          => api.post('/appointments/phone-booking', data),
  cancel:        (id)            => api.put(`/appointments/${id}/cancel`),
  confirm:       (id, adminNote) => api.put(`/appointments/${id}/confirm`, { adminNote }),
  reject:        (id, adminNote) => api.put(`/appointments/${id}/reject`, { adminNote }),
  markPaid:      (id, data)      => api.put(`/appointments/${id}/mark-paid`, data),
  // Bundles
  getBundles:    ()              => api.get('/appointments/bundles'),
  createBundle:  (data)          => api.post('/appointments/bundles', data),
  updateBundle:  (id, data)      => api.put(`/appointments/bundles/${id}`, data),
  deleteBundle:  (id)            => api.delete(`/appointments/bundles/${id}`),
}

export const availabilityAPI = {
  getSlots:           (date)      => api.get(`/availability/${date}`),
  getMonth:           ()          => api.get('/availability/month'),
  seedHours:          ()          => api.get('/availability/seed-hours'),
  getWorkingHours:    ()          => api.get('/availability/working-hours'),
  updateWorkingHours: (day, data) => api.put(`/availability/working-hours/${day}`, data),
  getDateOverrides:   ()          => api.get('/availability/date-overrides'),
  setDateOverride:    (data)      => api.post('/availability/date-overrides', data),
  removeDateOverride: (id)        => api.delete(`/availability/date-overrides/${id}`),
}

export const settingsAPI = {
  get:    ()     => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}

export const workoutAPI = {
  nutritionPending: () => api.get('/workout/admin/nutrition-pending'),
  customPending:    () => api.get('/workout/admin/custom-pending'),
  eligibleUsers:    () => api.get('/workout/admin/eligible-users'),
  // User
  getMyPlans:          ()           => api.get('/workout/plans/my'),
  getPlanById:         (id)         => api.get(`/workout/plans/${id}`),
  getMyNutrition:      ()           => api.get('/workout/nutrition/my'),
  getMyProgress:       (params)     => api.get('/workout/progress/my', { params }),
  logProgress:         (data)       => api.post('/workout/progress', data),
  deleteProgress:      (id)         => api.delete(`/workout/progress/${id}`),
  // Admin
  getUserPlans:        (uid)        => api.get(`/workout/admin/plans/${uid}`),
  createPlan:          (data)       => api.post('/workout/plans', data),
  updatePlan:          (id, data)   => api.put(`/workout/plans/${id}`, data),
  deletePlan:          (id)         => api.delete(`/workout/plans/${id}`),
  getUserNutrition:    (uid)        => api.get(`/workout/admin/nutrition/${uid}`),
  upsertNutrition:     (uid, data)  => api.put(`/workout/admin/nutrition/${uid}`, data),
  getUserProgress:     (uid, params)=> api.get(`/workout/admin/progress/${uid}`, { params }),
}

export const purchasesAPI = {
  create: (serviceId, extra = {}) => api.post('/purchases', { serviceId, ...extra }),
  mine:   ()          => api.get('/purchases/mine'),
  all:    ()          => api.get('/purchases'),          // admin
  renewals:     ()             => api.get('/purchases/admin/renewals'),          // admin
  markReminded: (kind, id)     => api.put(`/purchases/admin/renewals/${kind}/${id}/remind`), // admin
}

export const paymentAPI = {
  createOrder:  (data)  => api.post('/payment/create-order', data),
  capture:      (data)  => api.post('/payment/capture', data),
  getStatus:    (orderId) => api.get(`/payment/status/${orderId}`),
  refund:       (id)    => api.post(`/payment/refund/${id}`),
  refundPurchase: (id)  => api.post(`/payment/refund-purchase/${id}`),
}

export default api
