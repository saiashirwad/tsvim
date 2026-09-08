import * as nv from "../src/nvim"
import { createScope, within, type Scope } from "../src/nvim/scope"
import { mount, mountRoot } from "../src/nvim/spec"
import { repository, parseStatus } from "../src/plugins/git-repository"
import { gitPanel } from "../src/plugins/git"
import * as Task from "../src/nvim/task"
const { State, Stream, Text, pipe } = nv
let count = 0
const equal = (actual: unknown, expected: unknown, message = "equal") => {
  if (vim.inspect(actual) !== vim.inspect(expected))
    throw new Error(`${message}: ${vim.inspect(actual)} != ${vim.inspect(expected)}`)
}
const assert = (test: unknown, message: string) => {
  if (!test) throw new Error(message)
}
const wait = (test: () => boolean) => {
  if (!vim.wait(2000, test, 5)) throw new Error("Timed out")
}
const test = (name: string, body: (scope: Scope) => void) => {
  const failures: unknown[] = []
  const scope = createScope(name, {}, (error) => failures.push(error))
  try {
    within(scope, () => body(scope))
    scope.close()
    equal(failures, [], "unhandled errors")
    count++
    print(`PASS ${name}`)
  } finally {
    scope.close()
  }
}
const result = <A>(scope: Scope, task: Task.Task<A>): Task.Exit<A> => {
  let exit: Task.Exit<A> | undefined
  Task.execute(scope, task, (value) => {
    exit = value
  })
  if (!exit) wait(() => exit !== undefined)
  return exit!
}
const success = <A>(scope: Scope, task: Task.Task<A>): A => {
  const exit = result(scope, task)
  if (exit.tag !== "success") throw new Error(vim.inspect(exit))
  return exit.value
}
const floats = () =>
  vim.api.nvim_list_wins().filter((win) => vim.api.nvim_win_get_config(win).relative !== "")
const invokeKey = (key: string, mode = "n") => {
  const canonical = vim.api.nvim_replace_termcodes(key, true, true, true)
  const map =
    vim.api
      .nvim_buf_get_keymap(0, mode)
      .find(
        (map) => vim.api.nvim_replace_termcodes(map.lhs as string, true, true, true) === canonical,
      ) ??
    vim.api
      .nvim_get_keymap(mode)
      .find(
        (map) => vim.api.nvim_replace_termcodes(map.lhs as string, true, true, true) === canonical,
      )
  assert(map?.callback !== undefined, `Missing mapping ${key}`)
  ;(map!.callback as (this: void) => void)()
}

test("tasks are lazy, sequence values, and recover failures", (scope) => {
  let calls = 0
  const task = pipe(
    Task.sync(() => ++calls),
    Task.flatMap((value) => Task.succeed(value * 2)),
  )
  equal(calls, 0)
  equal(success(scope, task), 2)
  equal(success(scope, task), 4)
  equal(
    success(
      scope,
      pipe(
        Task.fail("bad"),
        Task.catchAll(() => Task.succeed(7)),
      ),
    ),
    7,
  )
  equal(
    result(
      scope,
      Task.sync(() => {
        throw new Error("bad")
      }),
    ).tag,
    "failure",
  )
})
test("scope teardown is reverse ordered, idempotent, and exception safe", (scope) => {
  const order: number[] = []
  const errors: unknown[] = []
  const child = createScope("isolated", {}, (error) => errors.push(error))
  child.own(() => {
    order.push(1)
  })
  child.own(() => {
    order.push(2)
    throw new Error("cleanup")
  })
  child.child().own(() => {
    order.push(3)
  })
  child.close()
  child.close()
  equal(order, [3, 2, 1])
  equal(errors.length, 1)
})
test("cancelled tasks cannot continue, including scheduled timers", (scope) => {
  let continued = false
  let exit: Task.Exit<void> | undefined
  const child = scope.child()
  Task.execute(
    child,
    pipe(
      Task.sleep(5),
      Task.andThen(
        Task.sync(() => {
          continued = true
        }),
      ),
    ),
    (value) => {
      exit = value
    },
  )
  child.close()
  vim.wait(30)
  equal(exit?.tag, "cancelled")
  equal(continued, false)
})
test("parallel failure cancels siblings and timeout completes", (scope) => {
  let cancelled = 0
  const pending = Task.make<number>((child) => {
    child.own(() => {
      cancelled++
    })
  })
  equal(result(scope, Task.all([pending, Task.fail("failure")])).tag, "failure")
  equal(cancelled, 1)
  equal(result(scope, pipe(Task.sleep(100), Task.timeout(5))).tag, "failure")
})
test("serial lanes preserve order and remove cancelled queued work", (scope) => {
  const queue = nv.serial()
  const order: number[] = []
  const task = (value: number) =>
    queue(
      pipe(
        Task.sleep(10),
        Task.andThen(
          Task.sync(() => {
            order.push(value)
          }),
        ),
      ),
    )
  Task.run(scope, task(1))
  const second = scope.child()
  Task.run(second, task(2))
  second.close()
  Task.run(scope, task(3))
  wait(() => order.length === 2)
  equal(order, [1, 3])
})
test("latest resource rejects stale results and keeps previous data on failure", (scope) => {
  const pending: Array<(exit: Task.Exit<number>) => void> = []
  const value = nv.resource(
    Task.make<number>((_, done) => {
      pending.push(done)
    }),
    { initial: 0 },
  )
  const refresh = scope.child()
  Task.execute(refresh, value.refresh, () => {})
  pending[1]!({ tag: "success", value: 20 })
  pending[0]!({ tag: "success", value: 10 })
  equal(value.value.get(), 20)
  equal(value.state.get().tag, "ready")
  Task.execute(scope, value.refresh, () => {})
  pending[2]!({ tag: "failure", error: "offline" })
  equal(value.value.get(), 20)
  equal(value.state.get().tag, "failed")
})
test("reactive diamonds batch once and release observers", (scope) => {
  const value = State.cell(1)
  const a = State.derive(() => value.get() * 2)
  const b = State.derive(() => value.get() * 3)
  const seen: number[] = []
  const stop = State.effect(() => {
    seen.push(a.get() + b.get())
  })
  State.batch(() => {
    value.set(2)
    value.set(3)
  })
  equal(seen, [5, 15])
  stop()
  value.set(4)
  equal(seen, [5, 15])
})
test("stream cancellation suppresses queued delivery; synchronous until is safe", (scope) => {
  const channel = Stream.channel<number>()
  const seen: number[] = []
  const stop = pipe(channel.stream, Stream.scheduled).subscribe((value) => seen.push(value))
  channel.send(1)
  stop()
  vim.wait(10)
  equal(seen, [])
  const immediate = Stream.make<number>((emit) => {
    emit(1)
    return () => {}
  })
  pipe(immediate, Stream.until(immediate)).subscribe((value) => seen.push(value))
  equal(seen, [])
  pipe(immediate, Stream.take(0)).subscribe((value) => seen.push(value))
  equal(seen, [])
})
test("Lua patterns produce valid byte ranges", (scope) => {
  const edits = Text.findAll(["hello  ", "world\t"], "%s+$").map((range) => Text.remove(range))
  equal(
    edits.map((edit) => edit.range),
    [Text.span(0, 5, 7), Text.span(1, 5, 6)],
  )
  equal(Text.applyEdits(["hello  ", "world\t"], edits), ["hello", "world"])
})
test("text edits validate before writes and async commits reject stale snapshots", (scope) => {
  const id = vim.api.nvim_create_buf(false, true)
  scope.own(() => vim.api.nvim_buf_delete(id, { force: true }))
  vim.api.nvim_buf_set_lines(id, 0, -1, false, ["hello", "world"])
  const base = success(scope, pipe(nv.buffer.read, nv.buffer.at(id)))
  equal(
    result(
      scope,
      pipe(
        nv.buffer.edit(Text.remove(Text.span(0, 0, 4)), Text.remove(Text.span(0, 1, 3))),
        nv.buffer.at(id),
      ),
    ).tag,
    "failure",
  )
  equal(vim.api.nvim_buf_get_lines(id, 0, -1, false), ["hello", "world"])
  success(scope, pipe(nv.buffer.edit(Text.setLine(0, "hi")), nv.buffer.at(id)))
  equal(result(scope, nv.buffer.commit(base, [Text.setLine(0, "stale")])).tag, "failure")
  equal(Text.applyEdits(["a", "b"], [Text.removeLines(0, 2)]), [""])
})
test("component instances are isolated and partial mount failure rolls back", (scope) => {
  const initial = vim.api.nvim_get_option_value("scrolloff", { scope: "global" })
  let instances = 0
  const definition = nv.component("instance", () => {
    instances++
    return nv.options({ scrolloff: 17 })
  })
  const a = scope.child()
  const b = scope.child()
  mount(definition, a)
  mount(definition, b)
  equal(instances, 2)
  a.close()
  equal(vim.o.scrolloff, 17)
  b.close()
  equal(vim.api.nvim_get_option_value("scrolloff", { scope: "global" }), initial)
  let failed = false
  try {
    mountRoot([
      nv.options({ scrolloff: 23 }),
      nv.native(() => {
        throw new Error("mount")
      }),
    ])
  } catch {
    failed = true
  }
  assert(failed, "mount must fail")
  equal(vim.api.nvim_get_option_value("scrolloff", { scope: "global" }), initial)
})
test("overlapping keymaps restore the surviving layer and original mapping", (scope) => {
  vim.keymap.set("n", "<F9>", "original")
  scope.own(() => vim.keymap.del("n", "<F9>"))
  let selected = 0
  const a = scope.child()
  const b = scope.child()
  mount(
    nv.keys.normal({
      "<F9>": nv.action(
        "one",
        Task.sync(() => {
          selected = 1
        }),
      ),
    }),
    a,
  )
  mount(
    nv.keys.normal({
      "<F9>": nv.action(
        "two",
        Task.sync(() => {
          selected = 2
        }),
      ),
    }),
    b,
  )
  a.close()
  invokeKey("<F9>")
  equal(selected, 2)
  b.close()
  equal(vim.api.nvim_get_keymap("n").find((map) => map.lhs === "<F9>")?.rhs, "original")
})
test("lists keep identity across reorder and map multiline rows to items", (scope) => {
  const items = State.cell<readonly string[]>(["alpha", "beta"])
  const content = nv.list(items, {
    key: (item) => item,
    row: (item) => nv.lines(nv.line(nv.text(item, "Title")), nv.line(nv.text("detail"))),
  })
  const panel = nv.floating(content)
  mount(panel, scope)
  success(scope, panel.open)
  const win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_cursor(win, [4, 0])
  items.set(["beta", "alpha"])
  equal(vim.api.nvim_win_get_cursor(win)[0], 2)
  equal(
    success(
      scope,
      content.withSelection((item) => Task.succeed(item)),
    ),
    "beta",
  )
  const id = vim.api.nvim_win_get_buf(win)
  success(scope, panel.close)
  equal(floats().length, 0)
  assert(vim.api.nvim_buf_is_valid(id), "hide retains buffer")
  success(scope, panel.open)
  equal(vim.api.nvim_win_get_buf(vim.api.nvim_get_current_win()), id)
  scope.close()
  equal(floats().length, 0)
  equal(vim.api.nvim_buf_is_valid(id), false)
})
test("Git porcelain handles rename destinations, spaces, and newlines", (scope) => {
  const entries = parseStatus("R  new name\0old name\0?? line\nbreak\0", "/repo")
  equal(entries.length, 2)
  equal(entries[0]?.path, "new name")
  equal(entries[0]?.original, "old name")
  equal(entries[1]?.path, "line\nbreak")
})
test("Git actions use selected items and refresh after successful mutations", (scope) => {
  let loads = 0
  const staged: string[] = []
  mount(nv.leaders(), scope)
  mount(
    gitPanel({
      status: Task.sync(() => {
        loads++
        return [{ root: "/tmp", path: "one", status: " M" }]
      }),
      stage: (entry) =>
        Task.sync(() => {
          staged.push(entry.path)
          return ""
        }),
      unstage: () => Task.succeed(""),
    }),
    scope,
  )
  invokeKey(" gg")
  equal(floats().length, 1)
  invokeKey("s")
  equal(staged, ["one"])
  equal(loads, 2)
  invokeKey("q")
  equal(floats().length, 0)
})

test("picker fuzzy ranking prefers consecutive words and keeps stable ties", (scope) => {
  assert(nv.fuzzyMatch("xyz", "alpha") === undefined, "nonmatch")
  assert(
    nv.fuzzyMatch("src", "src/main.ts")!.score >
      nv.fuzzyMatch("src", "some/random/config.ts")!.score,
    "consecutive bonus",
  )
  equal(
    nv
      .rank(
        ["alpha", "beta"],
        "",
        (item) => item,
        (item) => item,
      )
      .map((item) => item.item),
    ["alpha", "beta"],
  )
})
test("picker filters typed input, navigates, previews, and accepts in origin", (scope) => {
  const origin = vim.api.nvim_get_current_win()
  const accepted: string[] = []
  const pick = nv.picker({
    title: "Test picker",
    items: ["alpha", "beta", "gamma"],
    key: (item) => item,
    label: (item) => item,
    preview: (item) => Task.succeed([nv.line(nv.text(`preview ${item}`))]),
    accept: (item) =>
      Task.sync((target) => {
        equal(target.window, origin)
        accepted.push(item)
      }),
  })
  mount(pick, scope)
  success(scope, pick.open)
  equal(floats().length, 3)
  equal(pick.selected.get(), "alpha")
  success(scope, pick.next)
  equal(pick.selected.get(), "beta")
  const input = vim.api.nvim_get_current_buf()
  vim.api.nvim_buf_set_lines(input, 0, -1, false, ["gm"])
  wait(() => pick.query.get() === "gm")
  equal(pick.count.get(), 1)
  equal(pick.selected.get(), "gamma")
  vim.api.nvim_buf_set_lines(input, 0, -1, false, ["zzzz"])
  wait(() => pick.query.get() === "zzzz")
  equal(pick.count.get(), 0)
  vim.api.nvim_buf_set_lines(input, 0, -1, false, ["bt"])
  wait(() => pick.selected.get() === "beta")
  invokeKey("<CR>")
  equal(accepted, ["beta"])
  equal(floats().length, 0)
  equal(vim.api.nvim_get_current_win(), origin)
  success(scope, pick.open)
  equal(pick.query.get(), "")
  equal(pick.count.get(), 3)
  success(scope, pick.close)
  equal(floats().length, 0)
})
test("picker cancels old sources and previews on query, close, and reload", (scope) => {
  const queries: string[] = []
  let cancelled = 0
  const pick = nv.picker({
    title: "Async picker",
    debounce: 1,
    key: (item: string) => item,
    label: (item) => item,
    items: (query) =>
      Task.make<readonly string[]>((child, done) => {
        queries.push(query)
        child.own(() => {
          cancelled++
        })
        const childTimer = vim.uv.new_timer()
        child.own(() => {
          if (!childTimer.is_closing()) {
            childTimer.stop()
            childTimer.close()
          }
        })
        childTimer.start(20, 0, () =>
          vim.schedule(() => done({ tag: "success", value: [query || "initial"] })),
        )
      }),
    accept: () => Task.unit,
  })
  mount(pick, scope)
  success(scope, pick.open)
  wait(() => queries.length === 1)
  vim.api.nvim_buf_set_lines(0, 0, -1, false, ["second"])
  wait(() => queries.length === 2)
  assert(cancelled >= 1, "old request cancelled")
  equal(pick.selected.get(), undefined)
  wait(() => pick.selected.get() === "second")
  scope.close()
  equal(floats().length, 0)
  vim.wait(40)
  equal(pick.selected.get(), undefined)
})

test("view bindings can unmount without closing their content", (scope) => {
  const content = nv.view(() => [nv.line(nv.text("hello"))])
  const panel = nv.floating(content)
  mount(panel, scope)
  success(scope, panel.open)
  const bindings = scope.child()
  mount(content.bind(nv.keys.normal({ "<F8>": nv.action("local", Task.unit) })), bindings)
  assert(
    vim.api.nvim_buf_get_keymap(0, "n").some((map) => map.lhs === "<F8>"),
    "binding exists",
  )
  bindings.close()
  assert(!vim.api.nvim_buf_get_keymap(0, "n").some((map) => map.lhs === "<F8>"), "binding removed")
  equal(floats().length, 1)
})
test("buffer window options follow visibility without changing defaults", (scope) => {
  const original = vim.api.nvim_get_option_value("wrap", { scope: "global" })
  mount(nv.options({ wrap: false }), scope)
  const a = vim.api.nvim_create_buf(false, true)
  const b = vim.api.nvim_create_buf(false, true)
  scope.own(() => {
    vim.api.nvim_buf_delete(a, { force: true })
    vim.api.nvim_buf_delete(b, { force: true })
  })
  mount(nv.local({ buffer: a }, nv.options({ wrap: true })), scope)
  vim.api.nvim_win_set_buf(0, a)
  equal(vim.wo.wrap, true)
  equal(vim.api.nvim_get_option_value("wrap", { scope: "global" }), false)
  vim.api.nvim_win_set_buf(0, b)
  equal(vim.wo.wrap, false)
  scope.close()
  equal(vim.api.nvim_get_option_value("wrap", { scope: "global" }), original)
})
test("document saves across hide, reopen, and unmount", (scope) => {
  const path = vim.fn.tempname()
  scope.own(() => {
    vim.fn.delete(path)
  })
  const content = nv.document(path, { filetype: "markdown", initial: ["initial"] })
  const panel = nv.floating(content)
  mount(panel, scope)
  success(scope, panel.open)
  vim.api.nvim_buf_set_lines(0, 0, -1, false, ["saved"])
  success(scope, panel.close)
  equal(vim.fn.readfile(path), ["saved"])
  success(scope, panel.open)
  equal(vim.api.nvim_buf_get_lines(0, 0, -1, false), ["saved"])
  const local = scope.child()
  const otherPath = vim.fn.tempname()
  scope.own(() => {
    vim.fn.delete(otherPath)
  })
  const other = nv.document(otherPath)
  const otherPanel = nv.floating(other)
  mount(otherPanel, local)
  success(scope, otherPanel.open)
  vim.api.nvim_buf_set_lines(0, 0, -1, false, ["finalizer"])
  local.close()
  equal(vim.fn.readfile(otherPath), ["finalizer"])
})
test("native processes preserve bytes and expose exit codes", (scope) => {
  equal(success(scope, nv.exec(["printf", "%s", "hello world"])), "hello world")
  const failure = result(scope, nv.exec(["sh", "-c", "printf failed >&2; exit 7"]))
  equal(failure.tag, "failure")
  if (failure.tag === "failure") equal((failure.error as { code: number }).code, 7)
  equal(success(scope, nv.process(["sh", "-c", "exit 3"])).code, 3)
})
test("Git adapter stages and unstages real paths without shell quoting", (scope) => {
  const root = vim.fn.tempname()
  vim.fn.mkdir(root, "p")
  scope.own(() => {
    vim.fn.delete(root, "rf")
  })
  success(scope, nv.exec(["git", "init", "-q", "-b", "main", root]))
  const path = "space name.txt"
  vim.fn.writefile(["first"], `${root}/${path}`)
  const repo = repository(Task.succeed(root))
  const entry = success(scope, repo.status)[0]!
  equal(entry.path, path)
  success(scope, repo.stage(entry))
  success(
    scope,
    nv.exec(
      [
        "git",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-qm",
        "initial",
      ],
      { cwd: root },
    ),
  )
  vim.fn.writefile(["changed"], `${root}/${path}`)
  success(scope, repo.stage(entry))
  equal(success(scope, repo.status)[0]?.status, "M ")
  success(scope, repo.unstage(entry))
  equal(success(scope, repo.status)[0]?.status, " M")
  success(scope, nv.exec(["git", "mv", "--", path, "new name.txt"], { cwd: root }))
  const renamed = success(scope, repo.status)[0]!
  equal(renamed.path, "new name.txt")
  equal(renamed.original, path)
})
test("language attachments share one buffer lifetime across clients", (scope) => {
  const original = vim.lsp.get_clients
  const id = vim.api.nvim_get_current_buf()
  const makeClient = (clientId: number): vim.LspClient => ({
    id: clientId,
    name: `client${clientId}`,
    offset_encoding: "utf-16",
    server_capabilities: {},
    supports_method: (_method, buffer) => {
      equal(buffer, id)
      return true
    },
  })
  let clients = [makeClient(1)]
  vim.lsp.get_clients = (filter) => (filter?.bufnr === id ? clients : [])
  scope.own(() => {
    vim.lsp.get_clients = original
  })
  let mounted = 0
  let alive = 0
  mount(
    nv.language.attached(({ supports }) => {
      assert(supports("textDocument/hover"), "capability")
      return nv.native((local) => {
        mounted++
        alive++
        local.own(() => {
          alive--
        })
      })
    }),
    scope,
  )
  equal(mounted, 1)
  equal(alive, 1)
  clients = [makeClient(1), makeClient(2)]
  vim.api.nvim_exec_autocmds("LspAttach", { buffer: id, data: { client_id: 2 } })
  equal(alive, 1)
  equal(mounted, 2)
  vim.api.nvim_exec_autocmds("LspDetach", { buffer: id, data: { client_id: 2 } })
  equal(alive, 1)
  clients = []
  vim.api.nvim_exec_autocmds("LspDetach", { buffer: id, data: { client_id: 1 } })
  equal(alive, 0)
})

test("picker hides stale previews immediately and failed sources cannot be accepted", (scope) => {
  const previews: Array<{
    item: string
    finish: (this: void, exit: Task.Exit<nv.Document>) => void
  }> = []
  const pick = nv.picker({
    title: "Preview race",
    items: ["one", "two"],
    key: (item) => item,
    label: (item) => item,
    preview: (item) =>
      Task.make<nv.Document>((_, finish) => {
        previews.push({ item, finish })
      }),
    accept: () => Task.unit,
  })
  mount(pick, scope)
  success(scope, pick.open)
  wait(() => previews.length === 1)
  success(scope, pick.next)
  previews[0]!.finish({ tag: "success", value: [nv.line(nv.text("stale"))] })
  const previewBuffer = vim.api
    .nvim_list_bufs()
    .find((id) => vim.api.nvim_buf_get_name(id).includes("picker-preview"))!
  assert(
    !vim.api.nvim_buf_get_lines(previewBuffer, 0, -1, false).includes("stale"),
    "old preview hidden",
  )
  wait(() => previews.length === 2)
  previews[1]!.finish({ tag: "success", value: [nv.line(nv.text("two"))] })
  equal(vim.api.nvim_buf_get_lines(previewBuffer, 0, -1, false), ["two"])
  success(scope, pick.close)
  let acceptCount = 0
  const remote = nv.picker({
    title: "Failure",
    debounce: 1,
    filter: false,
    items: (query: string) => (query === "bad" ? Task.fail("offline") : Task.succeed(["one"])),
    key: (item) => item,
    label: (item) => item,
    accept: () =>
      Task.sync(() => {
        acceptCount++
      }),
  })
  mount(remote, scope)
  success(scope, remote.open)
  wait(() => remote.count.get() === 1)
  vim.api.nvim_buf_set_lines(0, 0, -1, false, ["bad"])
  wait(() => remote.query.get() === "bad")
  vim.wait(10)
  equal(remote.count.get(), 0)
  success(scope, remote.accept)
  equal(acceptCount, 0)
})

test("event consumers do not become dependencies of the producing effect", (scope) => {
  const source = State.cell(1)
  const unrelated = State.cell(0)
  const channel = Stream.channel<number>()
  let deliveries = 0
  scope.own(
    channel.stream.subscribe(() => {
      unrelated.get()
      deliveries++
    }),
  )
  State.effect(() => channel.send(source.get()))
  equal(deliveries, 1)
  unrelated.set(1)
  equal(deliveries, 1)
  source.set(2)
  equal(deliveries, 2)
})
print(`${count} TESTS PASSED`)
