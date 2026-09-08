import { component, forBuffers, native, events, process, pipe, Task } from "../nvim"
interface Shellcheck {
  readonly line: number
  readonly endLine: number
  readonly column: number
  readonly endColumn: number
  readonly level: string
  readonly code: number
  readonly message: string
}
export const shellcheckDiagnostics = (
  comments: readonly Shellcheck[],
  lines: readonly string[],
): LuaDict[] =>
  comments.map((comment) => {
    const row = Math.max(0, comment.line - 1),
      end = Math.max(row, comment.endLine - 1)
    const column = (row: number, col: number) =>
      vim.str_byteindex(lines[row] ?? "", "utf-32", Math.max(0, col - 1), false)
    return {
      lnum: row,
      end_lnum: end,
      col: column(row, comment.column),
      end_col: column(end, comment.endColumn),
      message: comment.message,
      code: `SC${comment.code}`,
      source: "shellcheck",
      severity:
        ({ error: 1, warning: 2, info: 3, style: 4 } as Record<string, number>)[comment.level] ?? 3,
    }
  })
export const shellLint = () =>
  component("shellcheck", () => [
    forBuffers(
      (id) =>
        ["sh", "bash"].includes(vim.api.nvim_get_option_value("filetype", { buf: id }) as string),
      (id) =>
        native((scope) => {
          if (vim.fn.executable("shellcheck") !== 1) return
          const namespace = vim.api.nvim_create_namespace(`neots.shellcheck.${id}`)
          let cancel = () => {}
          const lint = () => {
            cancel()
            const tick = vim.api.nvim_buf_get_changedtick(id)
            const lines = vim.api.nvim_buf_get_lines(id, 0, -1, false)
            cancel = Task.run(
              scope,
              pipe(
                process(["shellcheck", "--format=json1", "-"], {
                  stdin: lines.join("\n"),
                  cwd: vim.fs.dirname(vim.api.nvim_buf_get_name(id)),
                  timeout: 3000,
                }),
                Task.flatMap((result) =>
                  Task.sync(() => {
                    if (
                      !vim.api.nvim_buf_is_valid(id) ||
                      tick !== vim.api.nvim_buf_get_changedtick(id)
                    )
                      return
                    if (result.code > 1) throw new Error(result.stderr)
                    const data = vim.json.decode(result.stdout) as { comments: Shellcheck[] }
                    vim.diagnostic.set(
                      namespace,
                      id,
                      shellcheckDiagnostics(data.comments, lines),
                      {},
                    )
                  }),
                ),
              ),
            )
          }
          scope.own(() => vim.diagnostic.reset(namespace, id))
          scope.own(events("BufWritePost", { buffer: id }).subscribe(lint))
          lint()
        }),
    ),
  ])
