export default defineEventHandler((event) => {
  const session = event.context.session
  const authEnabled = event.context.authEnabled
  if (!authEnabled) return { authenticated: true, role: 'admin' as const, username: 'local' }
  if (!session) return { authenticated: false, role: null, username: null }
  return { authenticated: true, role: session.role, username: session.username }
})
