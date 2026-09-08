# pureluanvim

Write Neovim configurations and plugins as compositions of values, tasks, and
owned views. TypeScript compiles to Lua; Neovim runs the result directly.

```ts
run([
  leaders(" "),
  editing.indent(2),
  editing.trimWhitespace({ except: ["markdown"] }),
  search({ case: "smart", preview: true }),
  keys.normal({ "<C-s>": action("Save", editor.save) }),
  filetypes("markdown", options({ wrap: true, spell: true })),
  language.servers({ lua_ls: {}, ts_ls: {} }),
  language.formatOnSave(),
  pickers(),
])
```

The supplied config includes a Git panel, persistent scratchpad, reactive
statusline, and built-in pickers. It does not depend on Telescope.

## Run it

Requires Node.js, Neovim 0.12+, Git, and ripgrep (`rg`) for file/text pickers.
Language-server executables and Tree-sitter parsers are installed separately.
The shipped config loads server definitions from `nvim-lspconfig`; standalone
configs must supply server definitions or load that package themselves. Configured
third-party packages are installed through Neovim's `vim.pack` on first launch.

```sh
npm install
./nvim.sh             # build and launch, isolated from your usual config
npm run watch        # compile on change; :Reload mounts the new bundle
npm test             # type checks, Lua compilation, offline headless tests
npm run format       # oxfmt, with project settings
npm run format:check
```

`<leader>r` reloads. Removing a behavior and reloading removes its registrations.
The public API is also available as `_G.nv` while the config is mounted.

## Three kinds of composition

**Values** describe text, edits, styles, and presentation. Pure functions transform
them without accessing Neovim.

**Tasks** describe repeatable work. Creating a task does nothing; actions, events,
and resources interpret it inside an owner. Tasks compose values, failures, and
cancellation. Synchronous tasks complete synchronously, including `BufWritePre`.

**Behaviors** describe what exists while mounted. Arrays compose behaviors;
`false`, `null`, and `undefined` are empty. A component builds a fresh instance
on every mount and owns its state, subscriptions, resources, and children.

```ts
const refresh = action("Refresh", status.refresh)

// Reuse one action, with the same label and task.
keys.normal({ r: refresh })
command("RefreshStatus", refresh)

// Compose results, rather than coordinating callbacks.
const commit = pipe(
  exec(["git", "rev-parse", "--short", "HEAD"]),
  Task.map((output) => output.trim()),
  Task.flatMap((sha) => editor.notify(sha)),
)
```

`exec` fails on nonzero exit; `process` returns the exit code as data. Both take
argument vectors, own the spawned process, and suppress callbacks after
cancellation. `Task.catchAll`, `Task.timeout`, `Task.all`, and `serial()` express
recovery, deadlines, parallel work, and shared FIFO execution.

## A general-purpose picker

A picker accepts ordinary values, a loading task, or a query-dependent task.
Item identity, labels, previews, and acceptance are independent functions.

```ts
const projects = () =>
  component("projects", () => {
    const choose = picker({
      title: "Projects",
      items: [
        { name: "Editor", path: "/work/editor/README.md" },
        { name: "Website", path: "/work/site/README.md" },
      ],
      key: (project) => project.path,
      label: (project) => project.name,
      preview: (project) =>
        pipe(
          files.read(project.path),
          Task.map((rows) => rows.slice(0, 100).map((row) => line(text(row)))),
        ),
      accept: (project) => editor.openFile(project.path),
    })

    return [choose, keys.leader({ p: action("Projects", choose.open) })]
  })
```

The prompt supports fuzzy subsequence matching, adjacency/word-boundary ranking,
match highlighting, stable tie ordering, and a selected result. Results and
preview occupy separate windows; preview hides on narrow screens. Resizing
reflows the layout. Every opening creates a new session.

| Key               | Action                           |
| ----------------- | -------------------------------- |
| Type              | Filter results                   |
| `Ctrl-n` / `Down` | Next result                      |
| `Ctrl-p` / `Up`   | Previous result                  |
| `Enter`           | Accept in the originating window |
| `Esc` / `Ctrl-c`  | Close                            |
| `Ctrl-r`          | Retry or reload the source       |

Normal mode in the results window also supports `j`, `k`, and `q`.

For live search, supply `items: query => Task<readonly Item[]>`. Requests debounce
(default 80ms), cancel superseded work immediately, and never publish stale
results. Use `filter: false` when the source performs its own search. Previews
also cancel when selection changes. Failures and empty results are visible;
`Ctrl-r` retries. `limit` bounds displayed results (default 200).

The built-in bindings are:

| Binding      | Picker                                             |
| ------------ | -------------------------------------------------- |
| `<leader>ff` | Files, including hidden files but excluding `.git` |
| `<leader>fg` | Live literal text search with ripgrep              |
| `<leader>fb` | Listed buffers                                     |
| `<leader>fh` | Help tags                                          |
| `<leader>fr` | Recent existing files                              |
| `<leader>fs` | Document symbols from attached language servers    |

Sources and previews are cancellable tasks. Accepting hands the chosen item to
the component's lifetime, then disposes the search session. Typing and preview
work cannot outlive the picker.

## State and async resources

```ts
component("results", () => {
  const query = State.cell("")
  const label = State.derive(() => `Search: ${query.get()}`)
  const mode = State.hold(
    pipe(
      events("ModeChanged"),
      Stream.map(() => vim.api.nvim_get_mode().mode),
    ),
    "n",
  )

  const status = resource(loadStatus, {
    initial: [],
    refresh: events("FocusGained"),
    concurrency: "latest",
  })

  return [/* views and bindings */]
})
```

`State.derive` is a pure projection; readers track its dependencies directly.
`State.effect`, `State.hold`, and `State.scan` subscribe for the component's
lifetime. `State.batch` coalesces writes. Cells have immediate `set`/`update`
operations for local state; `State.set`/`State.update` produce reusable tasks.

A resource exposes `value`, `state`, and a `refresh` task. Its states are
`loading`, `ready`, `refreshing`, and `failed`. The last successful value survives
a refresh failure. Background errors are state; an explicitly invoked refresh
also fails its task. `latest` cancels the previous request; `exhaust` ignores
refresh requests while one is running.

Streams have data-last operators: `map`, `filter`, `merge`, `debounce`, `throttle`,
`take`, `until`, and `scheduled`. Use `listen(source, event => task)` to subscribe
as a behavior. `Stream.make` and `Task.make` are the extension points for native
callbacks, each with explicit disposal.

## Views and editing

```ts
component("entries", () => {
  const entries = State.cell<readonly Entry[]>([])
  const content = list(entries, {
    key: (entry) => entry.id,
    row: (entry) => line(text(entry.status, "DiagnosticInfo"), text(`  ${entry.name}`)),
    empty: line(text("No entries", "Comment")),
  })
  const panel = floating(content, { title: "Entries", size: { width: 0.6, height: 0.5 } })

  return [
    panel,
    content.bind(
      keys.normal({
        q: action("Close", panel.close),
        "<CR>": action(
          "Inspect",
          content.withSelection((entry) => inspect(entry)),
        ),
      }),
    ),
    keys.leader({ e: action("Entries", panel.toggle) }),
  ]
})
```

`text`, `line`, and `lines` build rich text; the renderer calculates byte ranges
for highlights. `view(() => document)` renders reactive content. `list` adds
stable-key selection and supports multiline rows. Selection survives reordering;
empty rows never become items. Duplicate keys are errors.

Content and placement are separate: put a view in `floating` or `split`. A view
instance has one live placement. Hiding a panel retains its buffer and content;
unmounting disposes both. `panel.inOrigin(task)` targets the window from which
it opened. `document(path, options)` supplies editable, persistent content with
save-on-leave and save-on-unmount.

The editing API uses **zero-based byte columns and end-exclusive ranges**:

```ts
const trim = buffer.transform((rows) =>
  Text.findAll(rows, "%s+$").map((range) => Text.remove(range)),
)
const replace = buffer.edit(Text.replace(Text.span(0, 0, 5), "hello"))
const specificBuffer = pipe(replace, buffer.at(bufferId))

// Long-running transformations reject a changed buffer at commit time.
const format = pipe(
  buffer.read,
  Task.flatMap((snapshot) =>
    pipe(
      calculateEdits(snapshot.lines),
      Task.flatMap((edits) => buffer.commit(snapshot, edits)),
    ),
  ),
)
```

Edits validate before writing, apply back to front, and share an undo entry.
`buffer.transform` preserves window views. `Text.applyEdits` previews the same
edits purely. `decorations(name, readableMarks)` owns a reactive annotation layer.

## Config and integration surface

| Area             | Public surface                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Composition      | `component`, `when`, `local`, `start`, `listen`                                                       |
| Editing policies | `editing.indent`, `trimWhitespace`, `rememberPosition`, `highlightYank`, `search`, `syntax`           |
| Input            | `action`, `keys.normal/insert/visual/terminal/in/leader/prefix`, `keys.feed`, `command`               |
| Locality         | `filetypes`, `forBuffers`, `events`, `on`, `userEvents`, `emit`                                       |
| Appearance       | `options`, `highlights`, `palette`, `mix`, `lighten`, `darken`, `statusbar`                           |
| Language         | `language.servers`, `attached`, `formatOnSave`, `inlayHints`, `symbols`, navigation/refactoring tasks |
| Editor           | `buffer`, `editor`, `diagnostics`, `decorations`                                                      |
| IO               | `files`, `exec`, `process`, `prompt`, `choose`                                                        |
| Packages         | `packages`, `plugin`, `updatePackages`                                                                |
| UI               | `view`, `list`, `document`, `floating`, `split`, `picker`                                             |
| Runtime          | `run`, `reload`, `stop`, `native`                                                                     |

`options` remains the precise typed escape hatch for native option names. A
buffer-local declaration applies window options only while a window shows that
buffer. Library-owned options, keymaps, and highlights stack and restore their
previous values. Commands reject existing names instead of silently replacing
them. Language attachment is one scope per buffer, even with multiple clients.

Use `editor.native(fn)` for a deferred native action, or `native(scope => ...)`
for an integration that needs an owned lifetime. Register cleanup with
`scope.own(dispose)` before subsequent fallible work.

This is a breaking redesign: there are no compatibility aliases for the previous
`Buffer`/`Window` classes, callback keymaps, or `Spec` surface. See
[the runtime contracts](docs/design.md) and the real [plugins](src/plugins).
