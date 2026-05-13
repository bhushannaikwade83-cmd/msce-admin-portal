/**
 * Dev-only middleware: POST /api/b2-sign-photo { objectPath }
 * Reads B2B_* via vite.config loadMergedEnv (repo root `.env`, Flutter app `.env`, portal `.env`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function b2SignedUrl(
  objectPath: string,
  env: { keyId: string; appKey: string; bucketId: string; bucketName: string },
): Promise<string> {
  const basic = Buffer.from(`${env.keyId}:${env.appKey}`).toString('base64')
  const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${basic}` },
  })
  if (!authRes.ok) {
    const t = await authRes.text()
    throw new Error(`b2_authorize_account ${authRes.status}: ${t.slice(0, 200)}`)
  }
  const auth = (await authRes.json()) as {
    authorizationToken: string
    apiUrl: string
    downloadUrl: string
  }

  const durRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: env.bucketId,
      fileNamePrefix: objectPath,
      validDurationInSeconds: 3600,
    }),
  })
  if (!durRes.ok) {
    const t = await durRes.text()
    throw new Error(`b2_get_download_authorization ${durRes.status}: ${t.slice(0, 200)}`)
  }
  const dur = (await durRes.json()) as { authorizationToken: string }
  const enc = encodeURIComponent(objectPath)
  return `${auth.downloadUrl}/file/${env.bucketName}/${enc}?Authorization=${dur.authorizationToken}`
}

function sendJson(res: ServerResponse, code: number, body: Record<string, unknown>) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function b2DevSignPlugin(merged: Record<string, string>): Plugin {
  return {
    name: 'msce-b2-dev-sign',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || !req.url?.startsWith('/api/b2-sign-photo')) {
          return next()
        }
        const keyId = merged.B2B_KEY_ID?.trim()
        const appKey = merged.B2B_APPLICATION_KEY?.trim()
        const bucketId = merged.B2B_BUCKET_ID?.trim()
        const bucketName = merged.B2B_BUCKET_NAME?.trim()
        if (!keyId || !appKey || !bucketId || !bucketName) {
          sendJson(res as ServerResponse, 503, {
            error:
              'B2 credentials missing: set B2B_KEY_ID, B2B_APPLICATION_KEY, B2B_BUCKET_ID, B2B_BUCKET_NAME in repository root `.env`, Flutter app `.env`, or msce-admin-portal/.env (restart vite dev server after editing).',
          })
          return
        }
        try {
          const raw = await readBody(req as IncomingMessage)
          const body = (raw ? JSON.parse(raw) : {}) as { objectPath?: string }
          const objectPath = body.objectPath?.trim()
          if (!objectPath) {
            sendJson(res as ServerResponse, 400, { error: 'objectPath required' })
            return
          }
          const url = await b2SignedUrl(objectPath, { keyId, appKey, bucketId, bucketName })
          sendJson(res as ServerResponse, 200, { url })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          sendJson(res as ServerResponse, 500, { error: msg })
        }
      })
    },
  }
}
