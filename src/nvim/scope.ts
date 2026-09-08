/** Structured ownership. Every registration belongs to one scope. */
export type Dispose = () => void
export interface Target {
  readonly buffer?: number
  readonly window?: number
}
/** @noSelf */
export interface Scope extends Target {
  readonly name: string
  readonly alive: () => boolean
  readonly own: (dispose: Dispose) => Dispose
  readonly child: (name?: string, target?: Target) => Scope
  readonly close: Dispose
  readonly report: (error: unknown) => void
}
let current: Scope | undefined
export const owner = (): Scope => {
  if (!current)
    throw new Error("Create this value inside component(), or provide a scope explicitly")
  return current
}
export const currentScope = (): Scope | undefined => current
export const within = <A>(scope: Scope, fn: () => A): A => {
  const previous = current
  current = scope
  try {
    return fn()
  } finally {
    current = previous
  }
}
export const createScope = (
  name: string,
  target: Target = {},
  report?: (error: unknown) => void,
): Scope => {
  let alive = true
  const finalizers = new Set<Dispose>()
  const handle =
    report ??
    ((error: unknown) =>
      vim.notify(
        `${name}: ${typeof error === "string" ? error : vim.inspect(error)}`,
        vim.log.levels.ERROR,
      ))
  const scope: Scope = {
    ...target,
    name,
    alive: () => alive,
    report: handle,
    own: (dispose) => {
      let registered = true
      const once = () => {
        if (!registered) return
        registered = false
        finalizers.delete(once)
        dispose()
      }
      if (alive) finalizers.add(once)
      else once()
      // Release registration without executing it, useful for completed tasks.
      return () => {
        registered = false
        finalizers.delete(once)
      }
    },
    child: (label = name, local = {}) => {
      const child = createScope(label, { ...target, ...local }, handle)
      const release = scope.own(child.close)
      child.own(release)
      return child
    },
    close: () => {
      if (!alive) return
      alive = false
      for (const dispose of [...finalizers].reverse()) {
        try {
          dispose()
        } catch (error) {
          handle(error)
        }
      }
      finalizers.clear()
    },
  }
  return scope
}
