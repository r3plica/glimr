import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { readMarks, writeMarks } from './lib/duplicate-marks.mjs'

const ROUTE = '/api/duplicate-marks'
const MAX_BODY_BYTES = 1_000_000

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Serves GET/PUT /api/duplicate-marks backed by data/duplicate-marks.json so
 * galleries flagged in the UI can be merged by `npm run galleries:duplicates`.
 */
export function duplicateMarksPlugin(root: string): Plugin {
  const file = path.join(root, 'data', 'duplicate-marks.json')
  // Serialise writes so concurrent PUTs cannot interleave.
  let queue: Promise<unknown> = Promise.resolve()

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (url !== ROUTE) return next()

    if (req.method === 'GET') {
      readMarks(file).then(
        (marks) => send(res, 200, marks),
        (err: Error) => send(res, 500, { error: err.message }),
      )
      return
    }
    if (req.method === 'PUT') {
      // Read the body straight away; only the file write is serialised.
      const body = readBody(req)
      body.catch(() => undefined)
      const task = queue.then(async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(await body)
        } catch (err) {
          send(res, 400, { error: `Invalid JSON: ${(err as Error).message}` })
          return
        }
        try {
          send(res, 200, await writeMarks(file, parsed))
        } catch (err) {
          send(res, 400, { error: (err as Error).message })
        }
      })
      queue = task.catch(() => undefined)
      return
    }
    res.setHeader('Allow', 'GET, PUT')
    send(res, 405, { error: 'Method not allowed.' })
  }

  return {
    name: 'glimr-duplicate-marks',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
