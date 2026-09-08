import {
  action,
  component,
  editor,
  events,
  floating,
  keys,
  line,
  list,
  pipe,
  resource,
  State,
  Task,
  text,
} from "../nvim"
export interface Issue {
  readonly id: string
  readonly path: string
  readonly buffer: number
  readonly line: number
  readonly col: number
  readonly message: string
  readonly severity?: number
}
export const diagnosticItems = (buffer?: number): readonly Issue[] =>
  vim.diagnostic
    .get(buffer)
    .map((entry, index) => ({
      id: `${entry.namespace}:${entry.bufnr}:${entry.lnum}:${entry.col}:${index}`,
      path: vim.api.nvim_buf_get_name(entry.bufnr as number),
      buffer: entry.bufnr as number,
      line: entry.lnum as number,
      col: entry.col as number,
      message: entry.message as string,
      severity: entry.severity as number,
    }))
    .sort(
      (a, b) =>
        (a.severity ?? 4) - (b.severity ?? 4) ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line),
    )
export const quickfixItems = (location = false): readonly Issue[] =>
  (location ? vim.fn.getloclist(0) : vim.fn.getqflist()).map((entry, index) => ({
    id: tostring(index),
    path: entry.bufnr
      ? vim.api.nvim_buf_get_name(entry.bufnr as number)
      : ((entry.filename as string) ?? ""),
    buffer: (entry.bufnr as number) ?? 0,
    line: Math.max(0, ((entry.lnum as number) ?? 1) - 1),
    col: Math.max(0, ((entry.col as number) ?? 1) - 1),
    message: (entry.text as string) ?? "",
  }))
export const issues = () =>
  component("issues", () => {
    let selectedBuffer: number | undefined
    let locationWindow = 0
    const source = State.cell<"diagnostics" | "quickfix" | "locations" | "symbols">("diagnostics")
    const load = Task.defer(() => {
      if (source.get() === "symbols")
        return Task.map(
          (symbols: readonly import("../nvim/lsp").SymbolLocation[]): readonly Issue[] =>
            symbols.map((symbol, i) => ({
              id: tostring(i),
              path: symbol.path,
              buffer: selectedBuffer ?? 0,
              line: symbol.position.line,
              col: symbol.position.col,
              message: symbol.name,
            })),
        )(importSymbols(selectedBuffer ?? 0))
      return Task.sync(() =>
        source.get() === "diagnostics"
          ? diagnosticItems(selectedBuffer)
          : source.get() === "locations" && vim.api.nvim_win_is_valid(locationWindow)
            ? vim.api.nvim_win_call(locationWindow, () => quickfixItems(true))
            : quickfixItems(),
      )
    })
    const data = resource(load, {
      initial: [],
      refresh: events(["DiagnosticChanged", "QuickFixCmdPost", "BufWritePost"]),
    })
    const content = list(data.value, {
      name: "issues",
      filetype: "neots-issues",
      key: (issue) => issue.id,
      row: (issue) =>
        line(
          text(`${vim.fn.fnamemodify(issue.path, ":~:.")}:${issue.line + 1} `, "Directory"),
          text(
            issue.message.split("\n").join(" "),
            issue.severity === 1
              ? "DiagnosticError"
              : issue.severity === 2
                ? "DiagnosticWarn"
                : "Normal",
          ),
        ),
      empty: line(text("No items", "Comment")),
    })
    const panel = floating(content, {
      title: "Diagnostics & locations",
      size: { width: 0.8, height: 0.5 },
      caption: State.derive(() => source.get()),
    })
    const choose = (kind: typeof source extends State.Cell<infer T> ? T : never, local = false) =>
      pipe(
        Task.sync(() => {
          source.set(kind)
          selectedBuffer = local || kind === "symbols" ? vim.api.nvim_get_current_buf() : undefined
          locationWindow = vim.api.nvim_get_current_win()
        }),
        Task.andThen(data.refresh),
        Task.andThen(panel.toggle),
      )
    const open = content.withSelection((issue) =>
      pipe(
        panel.close,
        Task.andThen(
          panel.inOrigin(
            pipe(
              issue.path === ""
                ? editor.native((scope) =>
                    vim.api.nvim_win_set_buf(scope.window ?? 0, issue.buffer),
                  )
                : editor.openFile(issue.path),
              Task.andThen(editor.move({ line: issue.line, col: issue.col })),
            ),
          ),
        ),
      ),
    )
    const workspace = choose("diagnostics"),
      local = choose("diagnostics", true)
    return [
      panel,
      content.bind(
        keys.normal({
          "<CR>": action("Open location", open),
          q: action("Close issues", panel.close),
          r: action("Refresh", data.refresh),
        }),
      ),
      keys.leader({
        xx: action("Workspace diagnostics", workspace),
        xX: action("Buffer diagnostics", local),
        xs: action("Document symbols", choose("symbols")),
        xl: action("LSP locations", choose("quickfix")),
        xQ: action("Quickfix", choose("quickfix")),
        xL: action("Location list", choose("locations")),
        fd: action("Buffer diagnostics", local),
        fD: action("Workspace diagnostics", workspace),
        dd: action("Buffer diagnostics", local),
        dw: action("Workspace diagnostics", workspace),
      }),
    ]
  })
import { language } from "../nvim"
import { buffer } from "../nvim"
const importSymbols = (id: number) => pipe(language.symbols, buffer.at(id))
