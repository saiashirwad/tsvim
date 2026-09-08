import type { Dispose } from "./scope"
/** Layer library-owned declarations; removing an older layer never erases a newer one. */
const leases = new Map<string, { base: () => void; layers: Array<() => void> }>()
export const lease = (key: string, restore: () => void, apply: () => void): Dispose => {
  let entry = leases.get(key)
  if (!entry) {
    entry = { base: restore, layers: [] }
    leases.set(key, entry)
  }
  const record = entry
  record.layers.push(apply)
  try {
    apply()
  } catch (error) {
    record.layers.pop()
    if (record.layers.length === 0) leases.delete(key)
    restore()
    throw error
  }
  let active = true
  return () => {
    if (!active) return
    active = false
    const index = record.layers.indexOf(apply)
    const top = index === record.layers.length - 1
    if (index >= 0) record.layers.splice(index, 1)
    if (record.layers.length === 0) leases.delete(key)
    if (top) (record.layers[record.layers.length - 1] ?? record.base)()
  }
}
