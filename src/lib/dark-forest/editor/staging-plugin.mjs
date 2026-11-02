// @ts-check
/**
 * The Dark Forest editor's save path (dev server only). Edits are never written straight into
 * the source: they're staged in .forest-staging/ (gitignored, outside src so staging never
 * reloads the page), the editor shows what changed, and only "apply" writes the real data
 * file (formatted with the project's Prettier, so it diffs cleanly).
 *
 *   GET  /__forest/staged           { [file]: { staged, current } } for every staged file
 *   POST /__forest/stage   {file, data}  stage a file's new contents
 *   POST /__forest/apply   {file}        make a staged file permanent (writes data/<file>.json)
 *   POST /__forest/discard {file}        drop a staged file
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const FILES = new Set(['sprites', 'props', 'palette', 'lights', 'layout'])

/**
 * How data files are written: small things (a tree, a part, a position) on one line, bigger
 * ones expanded, then Prettier (which keeps that shape). The same everywhere, so a diff shows
 * only what was edited.
 * @param {unknown} data
 * @param {string} as  a path whose Prettier config applies
 */
export async function formatData(data, as) {
  const prettier = await import('prettier')
  const options = (await prettier.resolveConfig(as)) ?? {}
  return prettier.format(compact(data, 0), { ...options, plugins: [], parser: 'json' })
}
/** @param {unknown} v @param {number} depth @returns {string} */
function compact(v, depth) {
  const flat = JSON.stringify(v)
  if (v === null || typeof v !== 'object' || (depth >= 2 && flat.length <= 110 && !flat.includes('[['))) return flat
  const pad = '  '.repeat(depth + 1)
  const end = '  '.repeat(depth)
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + compact(x, depth + 1)).join(',\n')}\n${end}]` : '[]'
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (v))
  return entries.length ? `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${compact(x, depth + 1)}`).join(',\n')}\n${end}}` : '{}'
}

/** @param {{ root: string }} opts */
export function forestStaging({ root }) {
  const dataDir = join(root, 'src/lib/dark-forest/data')
  const stageDir = join(root, '.forest-staging')
  const read = async (/** @type {string} */ path) => JSON.parse(await readFile(path, 'utf8'))
  const format = (/** @type {unknown} */ data) => formatData(data, join(dataDir, 'x.json'))

  /** @type {import('vite').Plugin} */
  const plugin = {
    name: 'forest-staging',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__forest/')) return next()
        const reply = (/** @type {number} */ code, /** @type {unknown} */ body) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          const action = req.url.slice('/__forest/'.length).split('?')[0]
          if (req.method === 'GET' && action === 'staged') {
            const out = /** @type {Record<string, unknown>} */ ({})
            if (existsSync(stageDir))
              for (const f of await readdir(stageDir)) {
                const file = f.replace(/\.json$/, '')
                if (!FILES.has(file)) continue
                const current = existsSync(join(dataDir, f)) ? await read(join(dataDir, f)) : null
                out[file] = { staged: await read(join(stageDir, f)), current }
              }
            return reply(200, out)
          }
          if (req.method !== 'POST') return reply(405, { error: 'POST only' })
          let raw = ''
          for await (const chunk of req) raw += chunk
          const body = JSON.parse(raw || '{}')
          const file = String(body.file ?? '')
          if (!FILES.has(file)) return reply(400, { error: `unknown data file: ${file}` })
          const staged = join(stageDir, `${file}.json`)
          if (action === 'stage') {
            await mkdir(stageDir, { recursive: true })
            await writeFile(staged, JSON.stringify(body.data))
            return reply(200, { ok: true })
          }
          if (action === 'apply') {
            if (!existsSync(staged)) return reply(404, { error: 'nothing staged' })
            await writeFile(join(dataDir, `${file}.json`), await format(await read(staged)))
            await rm(staged)
            return reply(200, { ok: true })
          }
          if (action === 'discard') {
            await rm(staged, { force: true })
            return reply(200, { ok: true })
          }
          return reply(404, { error: `unknown action: ${action}` })
        } catch (err) {
          return reply(500, { error: String(err) })
        }
      })
    },
  }
  return plugin
}
