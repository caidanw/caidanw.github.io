/**
 * The editor's side of saving (see staging-plugin.mjs): edits are staged as you make them,
 * listed in the Changes tab, and only written to data/ when applied.
 */
import { applyData, snapshot, type DataFile } from '../art'

export interface Staged {
  staged: unknown
  current: unknown
}

const post = (action: string, body: unknown) =>
  fetch(`/__forest/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) =>
    r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error ?? r.statusText))),
  )

/** Whether the dev server's staging endpoint is there (it isn't on a production build). */
export async function stagingAvailable(): Promise<boolean> {
  try {
    return (await fetch('/__forest/staged')).ok
  } catch {
    return false
  }
}

export async function loadStaged(): Promise<Record<string, Staged>> {
  const r = await fetch('/__forest/staged')
  return r.ok ? r.json() : {}
}

const timers = new Map<DataFile, number>()
/** Stage a data file's current contents (debounced: edits come in bursts). */
export function stage(file: DataFile, then?: () => void) {
  window.clearTimeout(timers.get(file))
  timers.set(
    file,
    window.setTimeout(() => {
      timers.delete(file)
      post('stage', { file, data: snapshot(file) }).then(then, (e) => console.error('staging failed', e))
    }, 300),
  )
}

/** Make a staged file permanent (the dev server then reloads the page with it). */
export const applyStaged = (file: DataFile) => post('apply', { file })

/** Drop a staged file, and put the live data back to what's on disk. */
export async function discardStaged(file: DataFile, current: unknown) {
  await post('discard', { file })
  if (current) applyData(file, current)
}

/** What changed between two versions of a data file, as readable paths ("knight › frames › seated"). */
export function changedPaths(a: unknown, b: unknown, depth = 4, path: string[] = []): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  const objects = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)
  if (!objects || path.length >= depth) return [path.join(' › ') || '(everything)']
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
  return [...keys].flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth, [...path, k]))
}
