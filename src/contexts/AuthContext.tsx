import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { UserWithRole } from '../db/users'
import { authenticateUser } from '../db/users'

type AuthContextType = {
  user: UserWithRole | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  hasPermission: (viewName: string) => boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserWithRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for stored user session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser')
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setUser(parsedUser)
      } catch (error) {
        console.error('Error parsing stored user:', error)
        localStorage.removeItem('currentUser')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const authenticatedUser = await authenticateUser(username, password)
      if (authenticatedUser) {
        // Don't store password hash
        const { password_hash, ...userWithoutPassword } = authenticatedUser
        setUser(userWithoutPassword as UserWithRole)
        localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword))
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('currentUser')
  }

  const hasPermission = (viewName: string): boolean => {
    if (!user) {
      return false
    }

    // Superadmin has access to everything
    if (user.is_superadmin === 1) {
      return true
    }

    // Check if user's role has permission for this view
    return user.role_permissions.includes(viewName)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

