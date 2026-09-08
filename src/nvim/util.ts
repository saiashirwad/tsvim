// Small runtime helpers: notifications, scheduling, timers, async shell.

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error"

const LEVELS: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }

/** `vim.notify` with a readable level name. */
export const notify = (message: string, level: LogLevel = "info", opts: { title?: string } = {}): void =>
  vim.notify(message, LEVELS[level], { ...opts })

export const log = {
  trace: (m: string) => notify(m, "trace"),
  debug: (m: string) => notify(m, "debug"),
  info: (m: string) => notify(m, "info"),
  warn: (m: string) => notify(m, "warn"),
  error: (m: string) => notify(m, "error"),
}

/** Run `fn` on the main loop soon (safe from callbacks that can't touch the API). */
export const schedule = (fn: () => void): void => vim.schedule(fn)

/** @noSelf */
export interface Timer {
  stop(): void
}

/** Run once after `ms`. */
export const defer = (ms: number, fn: () => void): Timer => {
  const t = vim.uv.new_timer()
  t.start(ms, 0, () => { t.stop(); t.close(); vim.schedule(fn) })
  return { stop: () => { if (!t.is_closing()) { t.stop(); t.close() } } }
}

/** Run every `ms` until stopped. */
export const every = (ms: number, fn: () => void): Timer => {
  const t = vim.uv.new_timer()
  t.start(ms, ms, () => vim.schedule(fn))
  return { stop: () => { if (!t.is_closing()) { t.stop(); t.close() } } }
}

/** Debounce: only the last call within `ms` runs. */
export const debounce = <A extends unknown[]>(ms: number, fn: (...args: A) => void): ((...args: A) => void) => {
  let pending: Timer | undefined
  return (...args) => {
    pending?.stop()
    pending = defer(ms, () => fn(...args))
  }
}

/** Throttle: at most one call per `ms`. */
export const throttle = <A extends unknown[]>(ms: number, fn: (...args: A) => void): ((...args: A) => void) => {
  let last = -Infinity
  return (...args) => {
    const now = vim.uv.now()
    if (now - last >= ms) { last = now; fn(...args) }
  }
}

/** `await sleep(100)` inside an `async` function. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => defer(ms, () => resolve()))

export interface ShellResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly ok: boolean
  /** stdout split into lines, trailing newline dropped */
  readonly lines: string[]
}

export interface ShellOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  stdin?: string
}

/** Run a command asynchronously: `const { lines } = await sh(["git", "status", "--short"])`. */
export const sh = (cmd: readonly string[], options: ShellOptions = {}): Promise<ShellResult> =>
  new Promise((resolve) => {
    const o: LuaDict = { text: true }
    if (options.cwd !== undefined) o.cwd = options.cwd
    if (options.env !== undefined) o.env = options.env
    if (options.timeout !== undefined) o.timeout = options.timeout
    if (options.stdin !== undefined) o.stdin = options.stdin
    vim.system([...cmd], o, (out) => {
      const stdout = out.stdout ?? ""
      vim.schedule(() =>
        resolve({
          code: out.code,
          stdout,
          stderr: out.stderr ?? "",
          ok: out.code === 0,
          lines: vim.split(stdout, "\n", { trimempty: true }),
        }),
      )
    })
  })

/** Synchronous variant (blocks the editor – prefer `sh`). */
export const shSync = (cmd: readonly string[], options: ShellOptions = {}): ShellResult => {
  const o: LuaDict = { text: true }
  if (options.cwd !== undefined) o.cwd = options.cwd
  const out = vim.system([...cmd], o).wait(options.timeout)
  const stdout = out.stdout ?? ""
  return { code: out.code, stdout, stderr: out.stderr ?? "", ok: out.code === 0, lines: vim.split(stdout, "\n", { trimempty: true }) }
}

/** Promise-flavoured `vim.ui.select`. */
export const select = <T>(items: readonly T[], opts: { prompt?: string; format?: (item: T) => string } = {}): Promise<T | undefined> =>
  new Promise((resolve) => {
    const o: { prompt?: string; format_item?: (item: T) => string } = {}
    if (opts.prompt !== undefined) o.prompt = opts.prompt
    if (opts.format !== undefined) o.format_item = opts.format
    vim.ui.select([...items], o, (item) => resolve(item))
  })

/** Promise-flavoured `vim.ui.input`. */
export const input = (prompt: string, def?: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const o: { prompt: string; default?: string } = { prompt }
    if (def !== undefined) o.default = def
    vim.ui.input(o, (v) => resolve(v))
  })

/** Guard: run `fn`, notify on error instead of crashing the callback chain. */
export const safely = <T>(fn: () => T, context = "pureluanvim"): T | undefined => {
  const [ok, result] = pcall(fn)
  if (ok) return result as T
  notify(`${context}: ${tostring(result)}`, "error")
  return undefined
}

/** Does an executable exist on PATH? */
export const hasExecutable = (name: string): boolean => vim.fn.executable(name) === 1

/** The current working directory's git root (if any). */
export const gitRoot = (from?: string): string | undefined => vim.fs.root(from ?? 0, ".git")

/** Iterate a Lua-style dictionary as [key, value] pairs. */
export const entries = <V>(dict: Record<string, V>): Array<[string, V]> => {
  const out: Array<[string, V]> = []
  for (const k in dict) out.push([k, dict[k] as V])
  return out
}
