import { action } from "./action"
import { behavior, mount, type Node } from "./spec"
import { within, type Scope } from "./scope"
import { cell, derive, effect, batch, type Readable } from "./state"
import { keys } from "./keys"
import { events } from "./events"
import { buffer } from "./buffer"
import { createView, view, line, text, type Document, type Line } from "./view"
import { resource } from "./resource"
import * as Stream from "./stream"
import * as Task from "./task"

export interface Match {
  readonly score: number
  readonly positions: readonly number[]
}
/** Byte-oriented subsequence matching, with word-boundary and adjacency bonuses. */
export const fuzzyMatch = (query: string, label: string): Match | undefined => {
  if (query === "") return { score: 0, positions: [] }
  const needle = query.toLowerCase()
  const haystack = label.toLowerCase()
  const positions: number[] = []
  let from = 0
  let score = 0
  let previous = -2
  for (let i = 0; i < needle.length; i++) {
    const at = haystack.indexOf(needle.substring(i, i + 1), from)
    if (at < 0) return undefined
    const before = at === 0 ? "" : label.substring(at - 1, at)
    const boundary = at === 0 || "/\\_- .".includes(before)
    score += 10 + (boundary ? 12 : 0) + (at === previous + 1 ? 18 : 0) - Math.min(at - from, 8)
    positions.push(at)
    previous = at
    from = at + 1
  }
  return { score: score - label.length * 0.01, positions }
}
export interface Ranked<A> {
  readonly item: A
  readonly label: string
  readonly key: string
  readonly match: Match
  readonly index: number
}
export const rank = <A>(
  items: readonly A[],
  query: string,
  label: (item: A) => string,
  key: (item: A) => string,
): readonly Ranked<A>[] => {
  const ranked: Ranked<A>[] = []
  const seen = new Set<string>()
  items.forEach((item, index) => {
    const identity = key(item)
    if (seen.has(identity)) throw new Error(`Duplicate picker key: ${identity}`)
    seen.add(identity)
    const value = label(item)
      .split("\n")
      .join("\\n")
      .split("\r")
      .join("\\r")
      .split("\t")
      .join("\\t")
    const match = fuzzyMatch(query, value)
    if (match) ranked.push({ item, label: value, key: identity, match, index })
  })
  return ranked.sort((a, b) =>
    a.match.score === b.match.score ? a.index - b.index : b.match.score - a.match.score,
  )
}
/** @noSelf */
export interface PickerOptions<A> {
  readonly title: string
  readonly items:
    | readonly A[]
    | Task.Task<readonly A[]>
    | ((query: string) => Task.Task<readonly A[]>)
  readonly key: (item: A) => string
  readonly label: (item: A) => string
  readonly accept: (item: A) => Task.Task<unknown>
  readonly preview?: (item: A) => Task.Task<Document>
  /** Disable local matching when a source (e.g. ripgrep) already performs matching. */
  readonly filter?: boolean
  readonly debounce?: number
  readonly limit?: number
  readonly initialQuery?: string | ((this: void) => string)
}
/** A reusable picker definition; every opening has its own cancellable session. @noSelf */
export interface Picker<A> extends Node {
  readonly open: Task.Task<void>
  readonly resume: Task.Task<void>
  readonly close: Task.Task<void>
  readonly accept: Task.Task<void>
  readonly next: Task.Task<void>
  readonly previous: Task.Task<void>
  readonly query: Readable<string>
  readonly selected: Readable<A | undefined>
  readonly count: Readable<number>
  readonly closed: Stream.Stream<boolean>
}
/** Prompt + results + optional preview, all owned by one session. */
export const picker = <A>(options: PickerOptions<A>): Picker<A> => {
  let lifetime: Scope | undefined
  let session: Scope | undefined
  let origin: number | undefined
  let inputWindow: number | undefined
  const query = cell("")
  let previousQuery = ""
  let resuming = false
  const selected = cell<A | undefined>(undefined)
  const count = cell(0)
  const index = cell(0)
  let ranked: readonly Ranked<A>[] = []
  const closed = Stream.channel<boolean>()
  let accepting = false
  const close = () => {
    const current = session
    if (current) previousQuery = query.get()
    session = undefined
    current?.close()
    inputWindow = undefined
    if (origin !== undefined && vim.api.nvim_win_is_valid(origin))
      vim.api.nvim_set_current_win(origin)
    if (current) closed.send(accepting)
  }
  const accept = Task.sync(() => {
    const item = selected.get()
    if (
      item === undefined ||
      !lifetime?.alive() ||
      origin === undefined ||
      !vim.api.nvim_win_is_valid(origin)
    )
      return
    // Accepted work is handed to the component, so closing the session cannot cancel it.
    const destination = lifetime.child("accepted", {
      window: origin,
      buffer: vim.api.nvim_win_get_buf(origin),
    })
    accepting = true
    close()
    accepting = false
    Task.execute(
      destination,
      Task.defer(() => options.accept(item)),
      (exit) => {
        destination.close()
        if (exit.tag === "failure") lifetime?.report(exit.error)
      },
    )
  })
  const move = (delta: number) =>
    Task.sync(() => {
      if (ranked.length === 0) return
      index.set((index.get() + delta + ranked.length) % ranked.length)
    })
  const next = move(1)
  const previous = move(-1)
  const open = Task.sync(() => {
    if (!lifetime?.alive()) throw new Error("Mount the picker before opening it")
    if (session?.alive()) {
      if (inputWindow !== undefined) vim.api.nvim_set_current_win(inputWindow)
      return
    }
    origin = vim.api.nvim_get_current_win()
    session = lifetime.child(`picker:${options.title}`)
    const scope = session
    scope.own(() => {
      if (session === scope) session = undefined
      ranked = []
      selected.set(undefined)
      count.set(0)
    })
    try {
      within(scope, () => {
        batch(() => {
          query.set(
            resuming
              ? previousQuery
              : typeof options.initialQuery === "function"
                ? options.initialQuery()
                : (options.initialQuery ?? ""),
          )
          resuming = false
          index.set(0)
        })
        const changes = Stream.channel<string>()
        const selectedChanges = Stream.channel<A | undefined>()
        const dynamic = typeof options.items === "function"
        const source: Task.Task<readonly A[]> = Task.defer(() => {
          if (typeof options.items === "function") return options.items(query.get())
          return Array.isArray(options.items)
            ? Task.succeed(options.items as readonly A[])
            : (options.items as Task.Task<readonly A[]>)
        })
        const load = dynamic ? Task.andThen(source)(Task.sleep(options.debounce ?? 80)) : source
        const items = resource(load, {
          initial: [],
          ...(dynamic ? { refresh: changes.stream } : {}),
        })
        const matches = derive(() => {
          const state = items.state.get()
          if (
            state.tag === "failed" ||
            (dynamic && (state.tag === "loading" || state.tag === "refreshing"))
          )
            return []
          return rank(
            items.value.get(),
            options.filter === false ? "" : query.get(),
            options.label,
            options.key,
          ).slice(0, options.limit ?? 200)
        })
        effect(() => {
          const old = ranked[index.get()]?.key
          const current = matches.get()
          ranked = current
          const nextIndex =
            query.get() === "" && old !== undefined
              ? current.findIndex((item) => item.key === old)
              : index.get()
          const chosen = Math.max(0, Math.min(current.length - 1, nextIndex < 0 ? 0 : nextIndex))
          count.set(current.length)
          selected.set(current[chosen]?.item)
          if (index.get() !== chosen) index.set(chosen)
        })
        effect(() => {
          selectedChanges.send(selected.get())
        })
        const preview = options.preview
          ? resource(
              Task.andThen(
                Task.defer(() => {
                  const item = selected.get()
                  return item === undefined ? Task.succeed<Document>([]) : options.preview!(item)
                }),
              )(Task.sleep(40)),
              { initial: [] as Document, refresh: selectedChanges.stream },
            )
          : undefined
        const results = view(
          () => {
            const state = items.state.get()
            const entries = matches.get()
            const selectedIndex = index.get()
            if (state.tag === "failed")
              return [line(text("Source failed — Ctrl-r to retry", "DiagnosticError"))]
            if (entries.length === 0)
              return [
                line(
                  text(
                    state.tag === "loading" || state.tag === "refreshing"
                      ? "Loading…"
                      : "No matches",
                    "Comment",
                  ),
                ),
              ]
            return entries.map((entry, row): Line => {
              const active = row === selectedIndex
              const chunks = [text(active ? "› " : "  ", active ? "DiagnosticInfo" : "Normal")]
              let from = 0
              for (const position of entry.match.positions) {
                if (position > from)
                  chunks.push(
                    text(entry.label.substring(from, position), active ? "PmenuSel" : "Normal"),
                  )
                chunks.push(text(entry.label.substring(position, position + 1), "Special"))
                from = position + 1
              }
              chunks.push(text(entry.label.substring(from), active ? "PmenuSel" : "Normal"))
              return chunks
            })
          },
          { name: "picker-results", filetype: "purepicker" },
        ).attach(scope)
        const input = createView(
          (local, bufferId) => {
            vim.api.nvim_buf_set_lines(bufferId, 0, -1, false, [query.get()])
            local.own(
              buffer.changes(bufferId).subscribe((value) => {
                const valueQuery = value.lines[0] ?? ""
                if (valueQuery === query.get()) return
                batch(() => {
                  index.set(0)
                  query.set(valueQuery)
                })
                changes.send(valueQuery)
              }),
            )
          },
          { name: "picker-prompt", filetype: "purepicker_prompt" },
        ).attach(scope)
        const previewView = preview
          ? view(
              () => {
                const state = preview.state.get()
                return state.tag === "failed"
                  ? [line(text("Preview unavailable", "Comment"))]
                  : state.tag === "loading" || state.tag === "refreshing"
                    ? [line(text("Loading preview…", "Comment"))]
                    : preview.value.get()
              },
              { name: "picker-preview", filetype: "purepicker_preview" },
            ).attach(scope)
          : undefined
        const windows: number[] = []
        const geometry = () => {
          const totalWidth = Math.max(8, (vim.o.columns as number) - 4)
          const totalHeight = Math.max(4, (vim.o.lines as number) - (vim.o.cmdheight as number) - 4)
          const width = Math.min(totalWidth, Math.max(8, Math.floor(totalWidth * 0.9)))
          const height = Math.min(totalHeight, Math.max(4, Math.floor(totalHeight * 0.8)))
          const withPreview = previewView !== undefined && width >= 70
          const left = withPreview ? Math.floor((width - 2) * 0.5) : width
          const row = Math.max(0, Math.floor((totalHeight - height) / 2))
          const col = Math.max(0, Math.floor((totalWidth - width) / 2))
          return { width, height, left, row, col, withPreview }
        }
        const configs = () => {
          const g = geometry()
          const common = { relative: "editor", style: "minimal", border: "rounded" }
          return [
            {
              ...common,
              width: g.left,
              height: Math.max(1, g.height - 3),
              row: g.row + 3,
              col: g.col,
              title: ` ${options.title} `,
              title_pos: "center",
            },
            {
              ...common,
              width: g.left,
              height: 1,
              row: g.row,
              col: g.col,
              title: " Search ",
              title_pos: "left",
            },
            {
              ...common,
              width: Math.max(1, g.width - g.left - 2),
              height: g.height,
              row: g.row,
              col: g.col + g.left + 2,
              title: " Preview ",
              title_pos: "center",
              hide: !g.withPreview,
            },
          ]
        }
        const initial = configs()
        for (const [i, mounted] of [results, input, previewView].entries()) {
          if (!mounted) continue
          const win = vim.api.nvim_open_win(mounted.buffer, i === 1, initial[i]!)
          windows.push(win)
          scope.own(() => {
            if (vim.api.nvim_win_is_valid(win)) vim.api.nvim_win_close(win, true)
          })
          vim.api.nvim_set_option_value("wrap", false, { win, scope: "local" })
          vim.api.nvim_set_option_value("number", false, { win, scope: "local" })
          vim.api.nvim_set_option_value("relativenumber", false, { win, scope: "local" })
        }
        inputWindow = windows[1]
        scope.own(
          events("WinClosed").subscribe((ev) => {
            if (windows.includes(tonumber(ev.match)!)) close()
          }),
        )
        scope.own(
          events("VimResized").subscribe(() => {
            const values = configs()
            windows.forEach((win, i) => {
              if (vim.api.nvim_win_is_valid(win)) vim.api.nvim_win_set_config(win, values[i]!)
            })
          }),
        )
        effect(() => {
          const at = index.get()
          if (
            ranked.length > 0 &&
            windows[0] !== undefined &&
            vim.api.nvim_win_is_valid(windows[0])
          )
            vim.api.nvim_win_set_cursor(windows[0], [at + 1, 0])
        })
        const bindings = {
          "<CR>": action("Accept", accept),
          "<Esc>": action("Close picker", Task.sync(close)),
          "<C-c>": action("Close picker", Task.sync(close)),
          "<C-n>": action("Next result", next),
          "<C-p>": action("Previous result", previous),
          "<Down>": action("Next result", next),
          "<Up>": action("Previous result", previous),
          "<C-r>": action("Refresh source", items.refresh),
        }
        mount(keys.in(["n", "i"], bindings), input.scope)
        mount(
          keys.normal({
            ...bindings,
            j: action("Next result", next),
            k: action("Previous result", previous),
            q: action("Close picker", Task.sync(close)),
          }),
          results.scope,
        )
        // Clicking a result changes the same selection used by keyboard actions.
        scope.own(
          events("CursorMoved", { buffer: results.buffer }).subscribe(() => {
            if (vim.api.nvim_get_current_win() === windows[0])
              index.set(vim.api.nvim_win_get_cursor(windows[0]!)[0] - 1)
          }),
        )
        scope.own(() => {
          if (vim.fn.mode() === "i") vim.cmd("stopinsert")
        })
        vim.cmd("startinsert!")
      })
    } catch (error) {
      close()
      throw error
    }
  })
  return {
    ...behavior((scope) => {
      if (lifetime?.alive()) throw new Error("Picker already mounted; create another instance")
      lifetime = scope.child(options.title)
      lifetime.own(() => {
        close()
        lifetime = undefined
      })
    }),
    open,
    resume: Task.defer(() => {
      resuming = true
      return open
    }),
    close: Task.sync(close),
    accept,
    next,
    previous,
    query: { get: query.get },
    selected: { get: selected.get },
    count: { get: count.get },
    closed: closed.stream,
  }
}
