import { COOKIE_NAME } from '../../utils/auth'

export default defineEventHandler((event) => {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
  return { ok: true }
})
