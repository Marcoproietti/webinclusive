// src/lib/api.ts
import axios, { type AxiosInstance } from 'axios'

const api: AxiosInstance = axios.create({
  baseURL:         '/api/v1',
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
})

let accessToken: string | null = null

// Interceptor: inietta token
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Interceptor: auto-refresh su 401
let isRefreshing = false
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !isRefreshing) {
      isRefreshing = true
      try {
        const res   = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        accessToken = res.data.access_token
        err.config.headers.Authorization = `Bearer ${accessToken}`
        return api(err.config)
      } catch {
        accessToken = null
        window.location.href = '/login'
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export function setAccessToken(token: string) { accessToken = token }
export default api
