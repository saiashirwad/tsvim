// Function plumbing: pipe, flow and small combinators.

export function pipe<A>(a: A): A
export function pipe<A, B>(a: A, ab: (a: A) => B): B
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): G
export function pipe(a: unknown, ...fns: Array<(x: unknown) => unknown>): unknown {
  let v = a
  for (const f of fns) v = f(v)
  return v
}

export function flow<A extends unknown[], B>(ab: (...a: A) => B): (...a: A) => B
export function flow<A extends unknown[], B, C>(ab: (...a: A) => B, bc: (b: B) => C): (...a: A) => C
export function flow<A extends unknown[], B, C, D>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): (...a: A) => D
export function flow<A extends unknown[], B, C, D, E>(
  ab: (...a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): (...a: A) => E
export function flow(
  first: (...a: unknown[]) => unknown,
  ...rest: Array<(x: unknown) => unknown>
): (...a: unknown[]) => unknown {
  return (...a) => {
    let v = first(...a)
    for (const f of rest) v = f(v)
    return v
  }
}

/** Run a side effect on a value and pass it through. */
export const tap =
  <T>(fn: (value: T) => void) =>
  (value: T): T => {
    fn(value)
    return value
  }
export const identity = <T>(x: T): T => x
export const constant =
  <T>(x: T) =>
  (): T =>
    x

// ---- curried, data-last list helpers (they read well inside `pipe`)
export const map =
  <A, B>(fn: (a: A, i: number) => B) =>
  (xs: readonly A[]): B[] =>
    xs.map((a, i) => fn(a, i))
export const filter =
  <A>(fn: (a: A, i: number) => boolean) =>
  (xs: readonly A[]): A[] =>
    xs.filter((a, i) => fn(a, i))
export const join =
  (sep: string) =>
  (xs: readonly string[]): string =>
    xs.join(sep)
export const compact = <A>(xs: readonly (A | false | undefined | null | "")[]): A[] =>
  xs.filter((x): x is A => !!x)
export const entries = <V>(dict: Record<string, V>): Array<[string, V]> => {
  const out: Array<[string, V]> = []
  for (const k in dict) out.push([k, dict[k] as V])
  return out
}

// ---- strings (Lua patterns, no regex in TSTL)
export const trimEnd = (s: string): string => string.gsub(s, "%s+$", "")[0]
export const trimStart = (s: string): string => string.gsub(s, "^%s+", "")[0]
export const trim = (s: string): string => trimEnd(trimStart(s))
export const startsWith =
  (prefix: string) =>
  (s: string): boolean =>
    vim.startswith(s, prefix)
export const endsWith =
  (suffix: string) =>
  (s: string): boolean =>
    vim.endswith(s, suffix)
