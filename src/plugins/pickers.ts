import {
  action,
  component,
  editor,
  exec,
  keys,
  language,
  line,
  picker,
  pipe,
  process,
  Task,
  text,
  type Document,
  type TaskValue,
} from "../nvim"
interface File {
  readonly path: string
  readonly label: string
}
interface Location extends File {
  readonly row: number
  readonly column: number
  readonly content: string
}
const cwd = Task.sync(() => vim.fn.getcwd())
const fileList: TaskValue<readonly File[]> = pipe(
  cwd,
  Task.flatMap((root) =>
    pipe(
      exec(["rg", "--files", "--hidden", "-0", "-g", "!.git"], { cwd: root }),
      Task.map((output) =>
        output
          .split("\0")
          .filter((path) => path !== "")
          .map((path) => ({ path: vim.fs.joinpath(root, path), label: path })),
      ),
    ),
  ),
)
const previewFile = (file: File): TaskValue<Document> =>
  Task.sync(() => {
    // Read only a bounded prefix; binary files do not get rendered as text.
    const stat = vim.uv.fs_stat(file.path)
    if (!stat || stat.type !== "file") return [line(text("Not a regular file", "Comment"))]
    if ((stat.size as number) > 2_000_000)
      return [line(text("File is too large to preview", "Comment"))]
    const rows = vim.fn.readfile(file.path, "", 200)
    if (rows.some((row) => row.includes("\0"))) return [line(text("Binary file", "Comment"))]
    return rows.map((row) =>
      line(text(row.split("\t").join("  ").split("\n").join("\\0").split("\r").join(""))),
    )
  })
const findText = (query: string, literal = true): TaskValue<readonly Location[]> => {
  if (query === "") return Task.succeed([])
  return pipe(
    cwd,
    Task.flatMap((root) =>
      pipe(
        process(
          [
            "rg",
            "--json",
            "--hidden",
            "-g",
            "!.git",
            ...(literal ? ["--fixed-strings"] : []),
            "--max-count",
            "50",
            "--",
            query,
            ".",
          ],
          {
            cwd: root,
            timeout: 5000,
          },
        ),
        Task.flatMap((output) => {
          if (output.code > 1) return Task.fail(output.stderr)
          const items: Location[] = []
          for (const row of output.stdout.split("\n")) {
            if (row === "" || items.length >= 1000) continue
            const event = vim.json.decode(row) as {
              type: string
              data: {
                path?: { text?: string }
                lines?: { text?: string }
                line_number?: number
                submatches?: Array<{ start: number }>
              }
            }
            if (event.type !== "match" || event.data.path?.text === undefined) continue
            const label = event.data.path.text
            items.push({
              path: vim.fs.joinpath(root, label),
              label,
              row: (event.data.line_number ?? 1) - 1,
              column: event.data.submatches?.[0]?.start ?? 0,
              content: (event.data.lines?.text ?? "").trim(),
            })
          }
          return Task.succeed(items)
        }),
      ),
    ),
  )
}
export const pickers = () =>
  component("pickers", () => {
    const files = picker({
      title: "Files",
      items: fileList,
      key: (file) => file.path,
      label: (file) => file.label,
      preview: previewFile,
      accept: (file) => editor.openFile(file.path),
    })
    const buffers = picker({
      title: "Buffers",
      items: Task.sync(() =>
        vim.api
          .nvim_list_bufs()
          .filter((buffer) => vim.api.nvim_get_option_value("buflisted", { buf: buffer }))
          .map((buffer) => ({ id: buffer, name: vim.api.nvim_buf_get_name(buffer) })),
      ),
      key: (buffer) => tostring(buffer.id),
      label: (buffer) =>
        buffer.name === "" ? "[No Name]" : vim.fn.fnamemodify(buffer.name, ":~:."),
      preview: (buffer) =>
        Task.sync(() =>
          vim.api.nvim_buf_get_lines(buffer.id, 0, 200, false).map((row) => line(text(row))),
        ),
      accept: (buffer) =>
        editor.native((scope) => vim.api.nvim_win_set_buf(scope.window ?? 0, buffer.id)),
    })
    const grep = picker({
      title: "Search text",
      items: (query: string) => findText(query),
      filter: false,
      key: (location) => `${location.path}:${location.row}:${location.column}`,
      label: (location) => `${location.label}:${location.row + 1}  ${location.content}`,
      preview: (location) =>
        Task.sync(() => {
          const rows = vim.fn.readfile(location.path)
          const first = Math.max(0, location.row - 8)
          return rows
            .slice(first, location.row + 18)
            .map((row, index) =>
              line(
                text(
                  `${first + index + 1}  ${row}`,
                  first + index === location.row ? "Search" : "Normal",
                ),
              ),
            )
        }),
      accept: (location) =>
        pipe(
          editor.openFile(location.path),
          Task.andThen(editor.move({ line: location.row, col: location.column })),
        ),
    })
    const regex = picker({
      title: "Live grep",
      items: (query: string) => findText(query, false),
      filter: false,
      key: (item) => `${item.path}:${item.row}:${item.column}`,
      label: (item) => `${item.label}:${item.row + 1}  ${item.content}`,
      accept: (item) =>
        pipe(
          editor.openFile(item.path),
          Task.andThen(editor.move({ line: item.row, col: item.column })),
        ),
    })
    const word = picker({
      title: "Grep word or selection",
      initialQuery: () =>
        ["v", "V"].includes(vim.fn.mode())
          ? vim.fn
              .getregion(vim.fn.getpos("v"), vim.fn.getpos("."), { type: vim.fn.mode() })
              .join(" ")
          : vim.fn.expand("<cword>"),
      items: (query: string) => findText(query),
      filter: false,
      key: (item) => `${item.path}:${item.row}:${item.column}`,
      label: (item) => `${item.label}:${item.row + 1}  ${item.content}`,
      accept: (item) =>
        pipe(
          editor.openFile(item.path),
          Task.andThen(editor.move({ line: item.row, col: item.column })),
        ),
    })
    const help = picker({
      title: "Help",
      items: Task.sync(() => vim.fn.getcompletion("", "help")),
      key: (tag) => tag,
      label: (tag) => tag,
      accept: (tag) => editor.native(() => vim.cmd({ cmd: "help", args: [tag] })),
    })
    const recent = picker({
      title: "Recent files",
      items: Task.sync(() =>
        ((vim.v.oldfiles ?? []) as string[])
          .filter((path) => vim.fn.filereadable(path) === 1)
          .map((path) => ({ path, label: vim.fn.fnamemodify(path, ":~:.") })),
      ),
      key: (file) => file.path,
      label: (file) => file.label,
      preview: previewFile,
      accept: (file) => editor.openFile(file.path),
    })
    const symbols = picker({
      title: "Document symbols",
      items: language.symbols,
      key: (symbol) =>
        `${symbol.path}:${symbol.position.line}:${symbol.position.col}:${symbol.name}`,
      label: (symbol) => symbol.name,
      accept: (symbol) =>
        pipe(editor.openFile(symbol.path), Task.andThen(editor.move(symbol.position))),
    })
    return [
      files,
      regex,
      word,
      buffers,
      grep,
      help,
      recent,
      symbols,
      keys.normal({
        ff: action("Files", files.open),
        fg: action("Live grep", regex.open),
        fz: action("Literal grep", grep.open),
        fw: action("Grep word", word.open),
      }),
      keys.in(["x"], {
        fw: action("Grep selection", word.open),
        "<leader>fw": action("Grep selection", word.open),
      }),
      keys.leader({
        f: {
          f: action("Files", files.open),
          b: action("Buffers", buffers.open),
          g: action("Search text", grep.open),
          t: action("Live grep", regex.open),
          w: action("Grep word", word.open),
          R: action("Resume file search", files.resume),
          h: action("Help", help.open),
          r: action("Recent files", recent.open),
          s: action("Document symbols", symbols.open),
        },
      }),
    ]
  })
