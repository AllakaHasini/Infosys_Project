import { useState, useEffect, createContext, useContext } from 'react'
import { authService } from '../services/services'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ekyc_user'))
    } catch {
      return null
    }
  })

  const login = async (email, password) => {
    const res = await authService.login(email, password)
    const { access_token, user_email, role, full_name, user_id } = res.data
    const userData = {
      email: user_email,
      role: role || 'user',
      fullName: full_name || user_email,
      userId: user_id,
    }
    localStorage.setItem('ekyc_token', access_token)
    localStorage.setItem('ekyc_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const register = async (email, password, fullName, role = 'user', extra = {}) => {
    const payload = typeof email === 'object'
      ? email
      : {
          email,
          password,
          full_name: fullName,
          role,
          ...extra,
        }
    const res = await authService.register(payload)
    const { access_token, user_email, role: resRole, full_name, user_id } = res.data
    const userData = {
      email: user_email,
      role: resRole || role,
      fullName: full_name || fullName,
      userId: user_id,
    }
    localStorage.setItem('ekyc_token', access_token)
    localStorage.setItem('ekyc_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
