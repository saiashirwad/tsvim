import type { Dispose } from "./scope"
import { untracked } from "./state"
/** Lazy occurrences. Operators are ordinary data-last functions. @noSelf */
export interface Stream<A> {
  readonly subscribe: (emit: (value: A) => void) => Dispose
}
export const make = <A>(producer: (emit: (value: A) => void) => Dispose): Stream<A> => ({
  subscribe: (emit) => {
    let active = true
    const down = producer((value) => {
      if (active) untracked(() => emit(value))
    })
    return () => {
      if (active) {
        active = false
        down()
      }
    }
  },
})
export const map =
  <A, B>(fn: (value: A) => B) =>
  (source: Stream<A>): Stream<B> =>
    make((emit) => source.subscribe((value) => emit(fn(value))))
export const filter =
  <A>(test: (value: A) => boolean) =>
  (source: Stream<A>): Stream<A> =>
    make((emit) =>
      source.subscribe((value) => {
        if (test(value)) emit(value)
      }),
    )
export const merge = <A>(...sources: readonly Stream<A>[]): Stream<A> =>
  make((emit) => {
    const downs = sources.map((source) => source.subscribe(emit))
    return () => {
      for (const down of downs.reverse()) down()
    }
  })
export const take =
  (count: number) =>
  <A>(source: Stream<A>): Stream<A> =>
    make((emit) => {
      if (count <= 0) return () => {}
      let seen = 0
      let down = () => {}
      down = source.subscribe((value) => {
        if (seen >= count) return
        seen++
        emit(value)
        if (seen >= count) down()
      })
      if (seen >= count) down()
      return down
    })
export const until =
  (end: Stream<unknown>) =>
  <A>(source: Stream<A>): Stream<A> =>
    make((emit) => {
      let stopped = false
      let stopEnd = () => {}
      let stopSource = () => {}
      const close = () => {
        stopped = true
        stopEnd()
        stopSource()
      }
      stopEnd = end.subscribe(close)
      if (stopped) stopEnd()
      else {
        stopSource = source.subscribe((value) => {
          if (!stopped) emit(value)
        })
        if (stopped) stopSource()
      }
      return close
    })
export const debounce =
  (ms: number) =>
  <A>(source: Stream<A>): Stream<A> =>
    make((emit) => {
      const timer = vim.uv.new_timer()
      let generation = 0
      const down = source.subscribe((value) => {
        const id = ++generation
        timer.stop()
        timer.start(ms, 0, () =>
          vim.schedule(() => {
            if (id === generation) emit(value)
          }),
        )
      })
      return () => {
        generation++
        down()
        if (!timer.is_closing()) {
          timer.stop()
          timer.close()
        }
      }
    })
export const throttle =
  (ms: number) =>
  <A>(source: Stream<A>): Stream<A> =>
    make((emit) => {
      let last = -Infinity
      return source.subscribe((value) => {
        const now = vim.uv.now()
        if (now - last >= ms) {
          last = now
          emit(value)
        }
      })
    })
export const scheduled = <A>(source: Stream<A>): Stream<A> =>
  make((emit) => source.subscribe((value) => vim.schedule(() => emit(value))))
export const interval = (ms: number): Stream<number> =>
  make((emit) => {
    let index = 0
    const timer = vim.uv.new_timer()
    timer.start(ms, ms, () => vim.schedule(() => emit(index++)))
    return () => {
      if (!timer.is_closing()) {
        timer.stop()
        timer.close()
      }
    }
  })
/** A local event channel; dispose subscribers through listen/State.hold. */
export const channel = <A>(): { readonly stream: Stream<A>; readonly send: (value: A) => void } => {
  const subscribers = new Set<(value: A) => void>()
  return {
    stream: make((emit) => {
      subscribers.add(emit)
      return () => {
        subscribers.delete(emit)
      }
    }),
    send: (value) => {
      for (const emit of [...subscribers]) emit(value)
    },
  }
}
