import {
  action,
  command,
  component,
  editor,
  floating,
  keys,
  line,
  list,
  pipe,
  prompt,
  resource,
  State,
  Task,
  text,
  view,
} from "../nvim"
export interface Entry {
  readonly name: string
  readonly kind: string
  readonly path: string
}
export const directoryEntries = (directory: string): readonly Entry[] => {
  const entries: Entry[] = []
  for (const [name, kind] of vim.fs.dir(directory))
    entries.push({ name, kind, path: vim.fs.joinpath(directory, name) })
  return entries.sort((a, b) =>
    a.kind === b.kind
      ? a.name.toLowerCase() < b.name.toLowerCase()
        ? -1
        : 1
      : a.kind === "directory"
        ? -1
        : b.kind === "directory"
          ? 1
          : a.kind < b.kind
            ? -1
            : 1,
  )
}
export const validName = (name: string): boolean =>
  name !== "" &&
  name !== "." &&
  name !== ".." &&
  !name.includes("/") &&
  !name.includes("\0") &&
  !name.includes("\n")
const move = (from: string, to: string) => {
  if (vim.uv.fs_lstat(to)) throw new Error(`Already exists: ${to}`)
  if (!vim.uv.fs_rename(from, to)) throw new Error(`Could not move ${from}`)
}
export const explorer = () =>
  component("file-explorer", () => {
    const directory = State.cell(vim.fn.getcwd())
    const hidden = State.cell(true)
    const details = State.cell(false)
    const entries = resource(
      Task.sync(() => directoryEntries(directory.get())),
      { initial: [] },
    )
    const visible = State.derive(() =>
      entries.value.get().filter((entry) => hidden.get() || !entry.name.startsWith(".")),
    )
    const content = list(visible, {
      name: "explorer",
      filetype: "neo-explorer",
      key: (entry) => entry.path,
      row: (entry) => {
        const stat = details.get() ? vim.uv.fs_stat(entry.path) : undefined
        return line(
          text(entry.kind === "directory" ? "▸ " : "  ", "Directory"),
          text(entry.name + (entry.kind === "directory" ? "/" : "")),
          text(stat ? `  ${stat.size} bytes` : "", "Comment"),
        )
      },
    })
    const panel = floating(content, {
      title: "Files",
      size: { width: 0.7, height: 0.6 },
      caption: State.derive(() => directory.get()),
      footer:
        "Enter open · - parent · a create · r rename · d trash · u restore · gd details · gh hidden",
    })
    const previewLines = State.cell<readonly string[]>([])
    const previewContent = view(() => previewLines.get().map((row) => line(text(row))))
    const preview = floating(previewContent, {
      title: "Preview",
      size: { width: 0.75, height: 0.7 },
    })
    const refresh = entries.refresh
    const visit = (path: string) =>
      pipe(
        Task.sync(() => directory.set(path)),
        Task.andThen(refresh),
      )
    const open = content.withSelection((entry) =>
      entry.kind === "directory"
        ? visit(entry.path)
        : pipe(panel.close, Task.andThen(panel.inOrigin(editor.openFile(entry.path)))),
    )
    const start = pipe(
      Task.sync(() => {
        const path = vim.api.nvim_buf_get_name(0)
        directory.set(
          path === ""
            ? vim.fn.getcwd()
            : vim.fn.isdirectory(path) === 1
              ? path
              : vim.fs.dirname(path),
        )
      }),
      Task.andThen(refresh),
      Task.andThen(panel.open),
    )
    const trash: Array<{ original: string; saved: string }> = []
    const create = pipe(
      prompt("New file or directory (end with /): "),
      Task.flatMap((name) => {
        if (name === undefined || name === "") return Task.unit
        const isDirectory = name.endsWith("/")
        const base = isDirectory ? name.slice(0, -1) : name
        return pipe(
          Task.sync(() => {
            if (!validName(base)) throw new Error("Use a single file or directory name")
            const path = vim.fs.joinpath(directory.get(), base)
            if (vim.uv.fs_lstat(path)) throw new Error(`Already exists: ${path}`)
            if (isDirectory) vim.fn.mkdir(path)
            else if (vim.fn.writefile([], path, "s") !== 0) throw new Error("Could not create file")
          }),
          Task.andThen(refresh),
        )
      }),
    )
    return [
      panel,
      preview,
      previewContent.bind(
        keys.normal({
          q: action("Close preview", preview.close),
          "<Esc>": action("Close preview", preview.close),
        }),
      ),
      content.bind(
        keys.normal({
          "<CR>": action("Open", open),
          q: action("Close explorer", panel.close),
          "-": action(
            "Parent directory",
            Task.defer(() => visit(vim.fs.dirname(directory.get()))),
          ),
          gh: action(
            "Toggle hidden files",
            State.update(hidden, (value) => !value),
          ),
          gd: action(
            "Toggle details",
            State.update(details, (value) => !value),
          ),
          a: action("Create file", create),
          r: action(
            "Rename",
            content.withSelection((entry) =>
              pipe(
                prompt("Rename to: ", entry.name),
                Task.flatMap((name) =>
                  name === undefined || name === entry.name
                    ? Task.unit
                    : pipe(
                        Task.sync(() => {
                          if (!validName(name)) throw new Error("Use a single name")
                          move(entry.path, vim.fs.joinpath(directory.get(), name))
                        }),
                        Task.andThen(refresh),
                      ),
                ),
              ),
            ),
          ),
          d: action(
            "Move to recoverable trash",
            content.withSelection((entry) =>
              pipe(
                Task.sync(() => {
                  const folder = vim.fs.joinpath(vim.fn.stdpath("data"), "neots-trash")
                  vim.fn.mkdir(folder, "p")
                  const saved = vim.fs.joinpath(folder, `${vim.uv.hrtime()}-${entry.name}`)
                  move(entry.path, saved)
                  trash.push({ original: entry.path, saved })
                  vim.fn.writefile(
                    [vim.json.encode({ original: entry.path, saved })],
                    `${saved}.origin.json`,
                  )
                }),
                Task.andThen(refresh),
              ),
            ),
          ),
          u: action(
            "Restore last trashed file",
            pipe(
              Task.sync(() => {
                const last = trash[trash.length - 1]
                if (last) {
                  move(last.saved, last.original)
                  vim.fn.delete(`${last.saved}.origin.json`)
                  trash.pop()
                }
              }),
              Task.andThen(refresh),
            ),
          ),
          "<leader>p": action(
            "Preview file",
            content.withSelection((entry) =>
              pipe(
                Task.sync(() => {
                  const stat = vim.uv.fs_stat(entry.path)
                  previewLines.set(
                    entry.kind !== "file"
                      ? ["Not a regular file"]
                      : ((stat?.size as number) ?? 0) > 2_000_000
                        ? ["Too large to preview"]
                        : vim.fn
                            .readfile(entry.path, "", 200)
                            .map((row) => row.split("\n").join("\\0")),
                  )
                }),
                Task.andThen(preview.open),
              ),
            ),
          ),
          "<C-r>": action("Refresh directory", refresh),
        }),
      ),
      keys.normal({ "-": action("Files", start), "<leader>e": action("Files", start) }),
      command("Files", action("File explorer", start)),
      command("Oil", action("File explorer", start)),
    ]
  })
