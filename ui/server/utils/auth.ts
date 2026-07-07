import { SignJWT, jwtVerify } from 'jose'

export interface SessionPayload {
  userId: string
  username: string
  role: 'viewer' | 'operator' | 'admin'
}

export const COOKIE_NAME = 'fs_session'
const TTL_SECONDS = 7 * 24 * 60 * 60

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getKey(secret))
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret))
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export function parseCookie(header: string, name: string): string | null {
  const prefix = `${name}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length)
  }
  return null
}
