import { owner, type Scope } from "./scope"
import { cell, batch, type Readable } from "./state"
import type { Stream } from "./stream"
import * as Task from "./task"
export type ResourceState<A> =
  | { readonly tag: "loading"; readonly value: A }
  | { readonly tag: "ready"; readonly value: A }
  | { readonly tag: "refreshing"; readonly value: A }
  | { readonly tag: "failed"; readonly value: A; readonly error: unknown }
export interface Resource<A> {
  readonly value: Readable<A>
  readonly state: Readable<ResourceState<A>>
  readonly refresh: Task.Task<void>
}
export interface ResourceOptions<A> {
  readonly initial: A
  readonly refresh?: Stream<unknown>
  readonly concurrency?: "latest" | "exhaust"
  readonly immediate?: boolean
}
export const resource = <A>(
  load: Task.Task<A>,
  options: ResourceOptions<A>,
  scope: Scope = owner(),
): Resource<A> => {
  const value = cell(options.initial)
  const state = cell<ResourceState<A>>({ tag: "loading", value: options.initial })
  let loaded = false
  let generation = 0
  let cancel: (() => void) | undefined
  const refresh: Task.Task<void> = Task.make((caller, done) => {
    if (!scope.alive()) return done({ tag: "cancelled" })
    if (cancel && options.concurrency === "exhaust")
      return done({ tag: "success", value: undefined })
    const id = ++generation
    cancel?.()
    state.set({ tag: loaded ? "refreshing" : "loading", value: value.get() })
    let finished = false
    const stop = Task.execute(scope, load, (exit) => {
      finished = true
      if (id === generation && scope.alive()) {
        cancel = undefined
        if (exit.tag === "success")
          batch(() => {
            loaded = true
            value.set(exit.value)
            state.set({ tag: "ready", value: exit.value })
          })
        else if (exit.tag === "failure")
          state.set({ tag: "failed", value: value.get(), error: exit.error })
      }
      // A resource exposes failures as data; command chains still fail correctly.
      done(exit.tag === "success" ? { tag: "success", value: undefined } : exit)
    })
    if (!finished) cancel = stop
    caller.own(stop)
  })
  // Background failures are represented in state, not reported twice.
  const refreshQuietly = () => {
    Task.execute(scope, refresh, () => {})
  }
  if (options.refresh) scope.own(options.refresh.subscribe(refreshQuietly))
  if (options.immediate !== false) refreshQuietly()
  return { value: { get: value.get }, state: { get: state.get }, refresh }
}
