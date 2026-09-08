import {
  action,
  buffer,
  command,
  component,
  editor,
  keys,
  on,
  pipe,
  Task,
  Text,
  type Snapshot,
} from "../nvim"
export interface Formatter {
  readonly name: string
  readonly args: (this: void, path: string) => readonly string[]
  readonly root?: readonly string[]
}
const formatter = (name: string, args: Formatter["args"], root?: readonly string[]): Formatter =>
  root ? { name, args, root } : { name, args }
const dprint = formatter("dprint", (path) => ["fmt", "--stdin", path], [
  "dprint.json",
  "dprint.jsonc",
  ".dprint.json",
  ".dprint.jsonc",
])
const oxfmt = formatter("oxfmt", (path) => ["--stdin-filepath", path])
const prettier = formatter("prettier", (path) => ["--stdin-filepath", path])
export interface FormatRule {
  readonly tools: readonly Formatter[]
  readonly firstAvailable?: boolean
}
export const formatRules: Readonly<Record<string, FormatRule>> = {
  lua: { tools: [formatter("stylua", (path) => ["--stdin-filepath", path, "-"])] },
  rust: { tools: [formatter("rustfmt", () => ["--emit", "stdout", "--edition", "2021"])] },
  haskell: { tools: [formatter("fourmolu", (path) => ["--stdin-input-file", path])] },
  purescript: { tools: [formatter("purs-tidy", () => ["format"])] },
  ...Object.fromEntries(
    [
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
      "json",
      "jsonc",
      "markdown",
    ].map((ft) => [ft, { tools: [dprint, oxfmt], firstAvailable: true }]),
  ),
  css: { tools: [oxfmt] },
  graphql: { tools: [oxfmt] },
  mdx: { tools: [prettier] },
  html: { tools: [prettier] },
  yaml: { tools: [dprint, prettier], firstAvailable: true },
  python: {
    tools: [
      formatter("isort", (path) => ["--stdout", "--filename", path, "-"]),
      formatter("black", (path) => ["--quiet", "--stdin-filename", path, "-"]),
    ],
  },
  go: { tools: [formatter("gofmt", () => []), formatter("goimports", () => [])] },
  ...Object.fromEntries(
    ["sh", "bash", "zsh"].map((ft) => [ft, { tools: [formatter("shfmt", () => ["-i", "2"])] }]),
  ),
  toml: { tools: [formatter("taplo", () => ["format", "-"])] },
  typst: { tools: [formatter("typstyle", () => ["--line-width", "80", "--wrap-text"])] },
}
export const executable = (name: string, path: string): string | undefined => {
  let directory = vim.fs.dirname(path)
  for (;;) {
    const candidate = vim.fs.joinpath(directory, "node_modules", ".bin", name)
    if (vim.fn.executable(candidate) === 1) return candidate
    const parent = vim.fs.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return vim.fn.executable(name) === 1 ? name : undefined
}
export const selectFormatters = (
  path: string,
  rule?: FormatRule,
): Array<{ tool: Formatter; executable: string; cwd: string }> => {
  const selected: Array<{ tool: Formatter; executable: string; cwd: string }> = []
  for (const tool of rule?.tools ?? []) {
    const bin = executable(tool.name, path)
    const root = tool.root ? vim.fs.root(path, [...tool.root]) : vim.fs.dirname(path)
    if (!bin || !root) continue
    selected.push({ tool, executable: bin, cwd: root })
    if (rule?.firstAvailable) break
  }
  return selected
}
/** Compute one bounded edit so formatting preserves surrounding extmarks and undo. */
export const diffLines = (
  before: readonly string[],
  after: readonly string[],
): readonly Text.Edit[] => {
  let start = 0,
    oldEnd = before.length,
    newEnd = after.length
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  return start === oldEnd && start === newEnd
    ? []
    : [Text.replace(Text.lineRange(start, oldEnd - start), [...after.slice(start, newEnd), ""])]
}
export const formatSnapshot = (
  snapshot: Snapshot,
  rules = formatRules,
  range?: readonly [number, number],
): Task.Task<void> =>
  Task.defer(() => {
    const path =
      snapshot.name === ""
        ? vim.fs.joinpath(vim.fn.getcwd(), `untitled.${snapshot.filetype}`)
        : snapshot.name
    const selected = selectFormatters(path, rules[snapshot.filetype])
    const timeout = ["haskell", "scala", "sbt"].includes(snapshot.filetype) ? 5000 : 1000
    if (selected.length === 0)
      return Task.sync(() => {
        const config: LuaDict = { bufnr: snapshot.id, timeout_ms: timeout }
        if (range)
          config.range = {
            start: [range[0] + 1, 0],
            end: [range[1] + 1, (snapshot.lines[range[1]] ?? "").length],
          }
        if (
          vim.lsp
            .get_clients({ bufnr: snapshot.id })
            .some((client) =>
              client.supports_method(
                range ? "textDocument/rangeFormatting" : "textDocument/formatting",
                snapshot.id,
              ),
            )
        )
          vim.lsp.buf.format(config)
      })
    return Task.defer(() => {
      const first = range?.[0] ?? 0,
        last = range?.[1] ?? snapshot.lines.length - 1
      let input = snapshot.lines.slice(first, last + 1).join("\n") + "\n"
      const deadline = vim.uv.now() + timeout
      for (const choice of selected) {
        const remaining = deadline - vim.uv.now()
        if (remaining <= 0) return Task.fail("Formatting timed out")
        const result = vim
          .system([choice.executable, ...choice.tool.args(path)], {
            stdin: input,
            text: true,
            cwd: choice.cwd,
            timeout: remaining,
          })
          .wait(remaining)
        if (result.code !== 0)
          return Task.fail(`${choice.tool.name}: ${result.stderr ?? `exit ${result.code}`}`)
        input = result.stdout ?? ""
      }
      const output = input.endsWith("\n") ? input.slice(0, -1).split("\n") : input.split("\n")
      const next = [...snapshot.lines.slice(0, first), ...output, ...snapshot.lines.slice(last + 1)]
      return buffer.commit(snapshot, diffLines(snapshot.lines, next))
    })
  })
export const formatting = (rules = formatRules) =>
  component("formatting", () => {
    const format = pipe(
      buffer.read,
      Task.flatMap((snapshot) => formatSnapshot(snapshot, rules)),
    )
    return [
      on("BufWritePre", format),
      keys.normal({ "<leader>lf": action("Format file", format) }),
      keys.in(["x"], {
        "<leader>lf": action(
          "Format selection",
          pipe(
            editor.selection,
            Task.flatMap((range) =>
              pipe(
                buffer.read,
                Task.flatMap((snapshot) =>
                  formatSnapshot(snapshot, rules, [
                    range.start.line,
                    Math.max(range.start.line, range.end.line - (range.end.col === 0 ? 1 : 0)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      }),
      command("Format", { range: "%" }, (args) =>
        pipe(
          buffer.read,
          Task.flatMap((snapshot) =>
            formatSnapshot(snapshot, rules, [args.line1 - 1, args.line2 - 1]),
          ),
        ),
      ),
      command(
        "FormatInfo",
        action(
          "Configured formatters",
          pipe(
            buffer.read,
            Task.flatMap((snapshot) =>
              editor.notify(
                selectFormatters(snapshot.name, rules[snapshot.filetype])
                  .map((item) => item.tool.name)
                  .join(" → ") || "LSP fallback",
              ),
            ),
          ),
        ),
      ),
    ]
  })
