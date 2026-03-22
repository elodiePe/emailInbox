const AUTH_STORAGE_KEY = 'emailInboxAuth'

// Update these two values to control who can access the app.
const AUTH_USERNAME = 'admin'
const AUTH_PASSWORD = 'inbox123'

export function isAuthenticated() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
}

export function login(username, password) {
  const isValid = username === AUTH_USERNAME && password === AUTH_PASSWORD

  if (isValid) {
    localStorage.setItem(AUTH_STORAGE_KEY, 'true')
  }

  return isValid
}

export function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
