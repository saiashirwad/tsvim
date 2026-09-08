import { createScope, within, type Scope, type Dispose, type Target } from "./scope"
import * as Task from "./task"
import type { Stream } from "./stream"

/** @noSelf */
export interface Node {
  readonly install: (scope: Scope) => void
}
export type Behavior = Node | readonly Behavior[] | false | undefined | null
export const behavior = (install: (scope: Scope) => Dispose | void): Node => ({
  install: (scope) => {
    const down = install(scope)
    if (down) scope.own(down)
  },
})
export const mount = (body: Behavior, scope: Scope): void => {
  if (!body || !scope.alive()) return
  if (Array.isArray(body)) {
    for (const child of body as readonly Behavior[]) mount(child, scope)
    return
  }
  within(scope, () => (body as Node).install(scope))
}
export const component = (name: string, build: () => Behavior): Node =>
  behavior((parent) => {
    const scope = parent.child(name)
    try {
      within(scope, () => mount(build(), scope))
    } catch (error) {
      scope.close()
      throw error
    }
  })
export const when = (condition: boolean | (() => boolean), yes: Behavior, no?: Behavior): Node =>
  behavior((scope) =>
    mount((typeof condition === "function" ? condition() : condition) ? yes : no, scope),
  )
export const local = (target: Target, body: Behavior): Node =>
  behavior((parent) => mount(body, parent.child(parent.name, target)))
export const start = (task: Task.Task<unknown>): Node =>
  behavior((scope) => {
    Task.run(scope, task)
  })
export const listen = <A>(source: Stream<A>, fn: (value: A) => Task.Task<unknown>): Node =>
  behavior((scope) =>
    source.subscribe((value) => {
      Task.run(
        scope,
        Task.defer(() => fn(value)),
      )
    }),
  )
/** Scoped native integration. Register teardown before doing fallible work. */
export const native = behavior
export const mountRoot = (body: Behavior, report?: (error: unknown) => void): Scope => {
  const scope = createScope("config", {}, report)
  try {
    mount(body, scope)
  } catch (error) {
    scope.close()
    throw error
  }
  return scope
}
