import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { getConfig, setConfig, type ApiTokenRecord } from './appState'

const TOKEN_PREFIX = 'fst_'

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export type PublicApiTokenRecord = Omit<ApiTokenRecord, 'tokenHash'>

function toPublic({ tokenHash: _tokenHash, ...rest }: ApiTokenRecord): PublicApiTokenRecord {
  return rest
}

export async function listApiTokens(): Promise<PublicApiTokenRecord[]> {
  const config = await getConfig()
  return (config.auth?.apiTokens ?? []).map(toPublic)
}

export async function createApiToken(label: string, allowLoad: boolean): Promise<{ record: PublicApiTokenRecord; rawToken: string }> {
  const rawToken = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  const record: ApiTokenRecord = {
    id: `tok-${Date.now()}`,
    label,
    tokenHash: hashToken(rawToken),
    allowLoad,
    createdAt: Date.now(),
    lastUsedAt: null,
  }

  const config = await getConfig()
  const apiTokens = [...(config.auth?.apiTokens ?? []), record]
  config.auth = { ...(config.auth ?? {}), apiTokens }
  await setConfig(config)

  return { record: toPublic(record), rawToken }
}

export async function revokeApiToken(id: string): Promise<boolean> {
  const config = await getConfig()
  const apiTokens = config.auth?.apiTokens ?? []
  const next = apiTokens.filter((t) => t.id !== id)
  if (next.length === apiTokens.length) return false
  config.auth = { ...(config.auth ?? {}), apiTokens: next }
  await setConfig(config)
  return true
}

/** Verifies a raw bearer token against stored hashes and returns the matching record,
 *  or null. Updates lastUsedAt on success (fire-and-forget, does not delay the caller). */
export async function verifyApiToken(rawToken: string): Promise<ApiTokenRecord | null> {
  if (!rawToken) return null
  const config = await getConfig()
  const apiTokens = config.auth?.apiTokens ?? []
  const digest = hashToken(rawToken)
  const match = apiTokens.find((t) => safeEqualHex(t.tokenHash, digest))
  if (!match) return null

  touchApiToken(match.id).catch((err: unknown) => {
    console.error('[apiTokens] failed to update lastUsedAt:', err)
  })
  return match
}

async function touchApiToken(id: string): Promise<void> {
  const config = await getConfig()
  const apiTokens = config.auth?.apiTokens ?? []
  const target = apiTokens.find((t) => t.id === id)
  if (!target) return
  target.lastUsedAt = Date.now()
  config.auth = { ...(config.auth ?? {}), apiTokens }
  await setConfig(config)
}
