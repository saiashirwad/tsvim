import { owner, within, type Scope, type Dispose } from "./scope"

export type Exit<A> =
  | { readonly tag: "success"; readonly value: A }
  | { readonly tag: "failure"; readonly error: unknown }
  | { readonly tag: "cancelled" }
/** Deferred, repeatable work. Only the runtime calls start. @noSelf */
export interface Task<A> {
  readonly start: (scope: Scope, finish: (exit: Exit<A>) => void) => void
}
export const make = <A>(start: Task<A>["start"]): Task<A> => ({ start })
export const succeed = <A>(value: A): Task<A> => make((_, done) => done({ tag: "success", value }))
export const unit: Task<void> = succeed(undefined)
export const fail = (error: unknown): Task<never> =>
  make((_, done) => done({ tag: "failure", error }))
export const sync = <A>(fn: (scope: Scope) => A): Task<A> =>
  make((scope, done) => done({ tag: "success", value: fn(scope) }))
export const defer = <A>(fn: () => Task<A>): Task<A> =>
  make((scope, done) => {
    execute(scope, fn(), done)
  })

/** Execute in a child scope; completion and cancellation both release resources. */
export const execute = <A>(
  parent: Scope,
  task: Task<A>,
  receive: (exit: Exit<A>) => void,
): Dispose => {
  const scope = parent.child("task")
  let settled = false
  let release: Dispose = () => {}
  const finish = (exit: Exit<A>) => {
    if (settled) return
    settled = true
    release()
    scope.close()
    try {
      receive(exit)
    } catch (error) {
      parent.report(error)
    }
  }
  release = scope.own(() => finish({ tag: "cancelled" }))
  if (scope.alive()) {
    try {
      within(scope, () => task.start(scope, finish))
    } catch (error) {
      finish({ tag: "failure", error })
    }
  }
  return scope.close
}
export const run = <A>(scope: Scope, task: Task<A>): Dispose =>
  execute(scope, task, (exit) => {
    if (exit.tag === "failure") scope.report(exit.error)
  })
export const map =
  <A, B>(fn: (value: A) => B) =>
  (task: Task<A>): Task<B> =>
    flatMap((value: A) => sync(() => fn(value)))(task)
export const flatMap =
  <A, B>(fn: (value: A) => Task<B>) =>
  (task: Task<A>): Task<B> =>
    make((scope, done) => {
      execute(scope, task, (exit) => {
        if (exit.tag !== "success") return done(exit)
        if (!scope.alive()) return
        try {
          execute(scope, fn(exit.value), done)
        } catch (error) {
          done({ tag: "failure", error })
        }
      })
    })
export const andThen =
  <B>(next: Task<B>) =>
  <A>(task: Task<A>): Task<B> =>
    flatMap((_: A) => next)(task)
export const tap =
  <A>(fn: (value: A) => Task<unknown>) =>
  (task: Task<A>): Task<A> =>
    flatMap((value: A) => map(() => value)(fn(value)))(task)
export const catchAll =
  <A>(recover: (error: unknown) => Task<A>) =>
  (task: Task<A>): Task<A> =>
    make((scope, done) =>
      execute(scope, task, (exit) => {
        if (exit.tag !== "failure") return done(exit)
        try {
          execute(scope, recover(exit.error), done)
        } catch (error) {
          done({ tag: "failure", error })
        }
      }),
    )
export const all = <A>(tasks: readonly Task<A>[]): Task<readonly A[]> =>
  make((scope, done) => {
    if (tasks.length === 0) return done({ tag: "success", value: [] })
    const values: A[] = []
    let remaining = tasks.length
    for (let i = 0; i < tasks.length && scope.alive(); i++) {
      const index = i
      execute(scope, tasks[i]!, (exit) => {
        if (exit.tag !== "success") return done(exit)
        values[index] = exit.value
        if (--remaining === 0) done({ tag: "success", value: values })
      })
    }
  })
export const sleep = (ms: number): Task<void> =>
  make((scope, done) => {
    const timer = vim.uv.new_timer()
    scope.own(() => {
      if (!timer.is_closing()) {
        timer.stop()
        timer.close()
      }
    })
    timer.start(ms, 0, () =>
      vim.schedule(() => {
        if (scope.alive()) done({ tag: "success", value: undefined })
      }),
    )
  })
export const timeout =
  (ms: number) =>
  <A>(task: Task<A>): Task<A> =>
    make((scope, done) => {
      execute(scope, sleep(ms), (exit) => {
        if (exit.tag === "success") done({ tag: "failure", error: `Timed out after ${ms}ms` })
      })
      if (scope.alive()) execute(scope, task, done)
    })
/** Acquire lasts until the owner closes, not merely until acquisition completes. */
export const acquire = <A>(get: () => A, release: (value: A) => void, scope = owner()): A => {
  const value = get()
  scope.own(() => release(value))
  return value
}
/** A shared FIFO lane. Selection can be captured before submitting work. */
export const serial = (lifetime = owner()) => {
  const pending: Array<() => void> = []
  let busy = false
  const next = () => {
    if (busy || !lifetime.alive()) return
    const start = pending.shift()
    if (start) {
      busy = true
      start()
    }
  }
  lifetime.own(() => {
    pending.length = 0
  })
  return <A>(task: Task<A>): Task<A> =>
    make((caller, done) => {
      if (!lifetime.alive()) return done({ tag: "cancelled" })
      const start = () => {
        if (!caller.alive()) {
          busy = false
          next()
          return
        }
        const cancel = execute(caller, task, (exit) => {
          busy = false
          done(exit)
          next()
        })
        const release = lifetime.own(cancel)
        caller.own(release)
      }
      pending.push(start)
      caller.own(() => {
        const i = pending.indexOf(start)
        if (i >= 0) pending.splice(i, 1)
      })
      next()
    })
}
