const TOKEN_KEY = 'customer_token'
const EXPIRE_KEY = 'customer_token_expire_at'

export function getToken() {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(TOKEN_KEY)
  const expiresAt = Number(localStorage.getItem(EXPIRE_KEY) || 0)
  return token && Date.now() < expiresAt - 60_000 ? token : null
}

export function saveToken(token: string, expiresIn: number) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRE_KEY, String(Date.now() + expiresIn * 1000))
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRE_KEY)
}
