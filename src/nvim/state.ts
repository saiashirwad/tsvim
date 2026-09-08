import { owner, type Scope } from "./scope"
import type { Stream } from "./stream"
import * as Task from "./task"
// Reactive state: signals with automatic dependency tracking.
//
//   const branch = cell("")
//   const label = derive(() => branch.get() === "" ? "" : ` ${branch.get()}`)
//   effect(() => redraw(label.get()))       // re-runs whenever `branch` changes
//   branch.set("main")

/** @noSelf */
export interface Readable<T> {
  get(): T
}

/** @noSelf */
export interface Cell<T> extends Readable<T> {
  set(value: T): void
  update(fn: (current: T) => T): void
}

type Observer = { run: () => void; deps: Set<Set<Observer>> }

let active: Observer | undefined
let batchDepth = 0
const queued = new Set<Observer>()

const track = (subscribers: Set<Observer>) => {
  if (!active) return
  subscribers.add(active)
  active.deps.add(subscribers)
}

const notify = (subscribers: Set<Observer>) => {
  for (const o of [...subscribers]) queued.add(o)
  if (batchDepth === 0) flush()
}

const flush = () => {
  while (queued.size > 0) {
    let next: Observer | undefined
    for (const o of queued) {
      next = o
      break
    }
    queued.delete(next!)
    next!.run()
  }
}

const unlink = (o: Observer) => {
  for (const d of o.deps) d.delete(o)
  o.deps.clear()
}

/** A mutable reactive value. */
export const cell = <T>(
  initial: T,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): Cell<T> => {
  let value = initial
  const subscribers = new Set<Observer>()
  return {
    get: () => {
      track(subscribers)
      return value
    },
    set: (next) => {
      if (!equals(value, next)) {
        value = next
        notify(subscribers)
      }
    },
    update: (fn) => {
      const next = fn(value)
      if (!equals(value, next)) {
        value = next
        notify(subscribers)
      }
    },
  }
}

/** A pure projection. Dependencies flow through to its readers; no retained observer. */
export const derive = <T>(fn: () => T): Readable<T> => ({ get: fn })

/** Run `fn` now and again whenever any cell it read changes. Returns a stop function. */
export const effect = (fn: () => void, scope: Scope = owner()): (() => void) => {
  const observer: Observer = { deps: new Set(), run: () => {} }
  let stopped = false
  observer.run = () => {
    if (stopped) return
    unlink(observer)
    const prev = active
    active = observer
    try {
      fn()
    } finally {
      active = prev
    }
  }
  const stop = () => {
    stopped = true
    unlink(observer)
    queued.delete(observer)
  }
  const release = scope.own(stop)
  if (scope.alive()) observer.run()
  return () => {
    release()
    stop()
  }
}

/** React to a specific readable's changes with its new value. */
export const watch = <T>(source: Readable<T>, fn: (value: T) => void): (() => void) => {
  let first = true
  return effect(() => {
    const v = source.get()
    if (first) first = false
    else untracked(() => fn(v))
  })
}

/** Read signals without subscribing the current effect to them. */
export const untracked = <T>(fn: () => T): T => {
  const prev = active
  active = undefined
  try {
    return fn()
  } finally {
    active = prev
  }
}

/** Coalesce several writes into one round of updates. */
export const batch = (fn: () => void): void => {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) flush()
  }
}

/** Retain the latest occurrence for this component's lifetime. */
export const hold = <A>(source: Stream<A>, initial: A, scope = owner()): Readable<A> => {
  const state = cell(initial)
  scope.own(source.subscribe(state.set))
  return { get: state.get }
}
export const scan = <A, S>(
  source: Stream<A>,
  initial: S,
  reduce: (state: S, event: A) => S,
  scope = owner(),
): Readable<S> => {
  const state = cell(initial)
  scope.own(source.subscribe((event) => state.update((value) => reduce(value, event))))
  return { get: state.get }
}
export const read = <A>(source: Readable<A>): Task.Task<A> => Task.sync(source.get)
export const set = <A>(state: Cell<A>, value: A): Task.Task<void> =>
  Task.sync(() => state.set(value))
export const update = <A>(state: Cell<A>, fn: (value: A) => A): Task.Task<void> =>
  Task.sync(() => state.update(fn))
