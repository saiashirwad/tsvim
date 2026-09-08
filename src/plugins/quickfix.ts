import {
  action,
  component,
  events,
  filetypes,
  floating,
  keys,
  line,
  native,
  pipe,
  State,
  Task,
  text,
  view,
} from "../nvim"
const identity = (entry: LuaDict): string =>
  `${entry.bufnr}:${entry.lnum}:${entry.col}:${entry.text}`
export const quickfix = () =>
  component("quickfix", () => [
    keys.leader({
      qc: action(
        "Clear quickfix",
        Task.sync(() => {
          vim.fn.setqflist([])
          vim.cmd("cclose")
        }),
      ),
      qq: action(
        "Toggle quickfix",
        Task.sync(() => {
          const open = vim.fn.getqflist({ winid: 0 }).winid as number
          vim.cmd(open === 0 ? "copen" : "cclose")
        }),
      ),
    }),
    filetypes(
      "qf",
      component("quickfix-buffer", () => {
        const marked = new Set<string>()
        const previewText = State.cell<readonly string[]>([])
        const preview = floating(
          view(() => previewText.get().map((row) => line(text(row)))),
          { title: "Quickfix preview", size: { width: 0.6, height: 0.4 }, enter: false },
        )
        const auto = State.cell(true)
        let window = 0
        const list = (): LuaDict[] =>
          vim.api.nvim_win_is_valid(window) && vim.fn.getwininfo(window)[0]?.loclist === 1
            ? vim.fn.getloclist(window)
            : vim.fn.getqflist()
        const selected = (): LuaDict | undefined => list()[vim.api.nvim_win_get_cursor(0)[0] - 1]
        const show = Task.defer(() => {
          const entry = selected()
          if (!entry?.bufnr || !vim.api.nvim_buf_is_valid(entry.bufnr as number))
            return preview.close
          vim.fn.bufload(entry.bufnr as number)
          const row = Math.max(0, (entry.lnum as number) - 1)
          previewText.set(
            vim.api
              .nvim_buf_get_lines(entry.bufnr as number, Math.max(0, row - 5), row + 12, false)
              .map((line) => line.split("\n").join("\\0")),
          )
          return preview.open
        })
        const open = (vertical: boolean) =>
          Task.sync(() => {
            const entry = selected()
            if (!entry) return
            vim.cmd(vertical ? "wincmd p | vsplit" : "wincmd p | split")
            vim.api.nvim_win_set_buf(0, entry.bufnr as number)
            vim.api.nvim_win_set_cursor(0, [
              Math.max(1, entry.lnum as number),
              Math.max(0, ((entry.col as number) ?? 1) - 1),
            ])
          })
        const filter = (keep: boolean) =>
          Task.sync(() => {
            const items = list().filter((entry) => marked.has(identity(entry)) === keep)
            if (vim.fn.getwininfo(window)[0]?.loclist === 1) vim.fn.setloclist(window, items, "r")
            else vim.fn.setqflist(items, "r")
            marked.clear()
          })
        return [
          preview,
          native((scope) => {
            const id = scope.buffer!
            window = vim.api.nvim_get_current_win()
            const namespace = vim.api.nvim_create_namespace(`neots.qf.${id}`)
            const paint = () => {
              vim.api.nvim_buf_clear_namespace(id, namespace, 0, -1)
              list().forEach((entry, row) => {
                if (marked.has(identity(entry)))
                  vim.api.nvim_buf_set_extmark(id, namespace, row, 0, {
                    sign_text: "●",
                    sign_hl_group: "DiagnosticInfo",
                  })
              })
            }
            const toggle = (delta: number) =>
              Task.sync(() => {
                const entry = selected()
                if (!entry) return
                const key = identity(entry)
                if (marked.has(key)) marked.delete(key)
                else marked.add(key)
                paint()
                const row = vim.api.nvim_win_get_cursor(0)[0]
                vim.api.nvim_win_set_cursor(0, [
                  Math.max(1, Math.min(list().length, row + delta)),
                  0,
                ])
              })
            keys
              .normal({
                s: action("Open in split", open(false)),
                v: action("Open in vertical split", open(true)),
                m: action("Mark and next", toggle(1)),
                M: action("Mark and previous", toggle(-1)),
                c: action(
                  "Clear marks",
                  Task.sync(() => {
                    marked.clear()
                    paint()
                  }),
                ),
                F: action("Keep marked", filter(true)),
                f: action("Exclude marked", filter(false)),
                a: action(
                  "Toggle automatic preview",
                  pipe(
                    State.update(auto, (value) => !value),
                    Task.andThen(Task.defer(() => (auto.get() ? show : preview.close))),
                  ),
                ),
                P: action("Preview", show),
              })
              .install(scope)
            scope.own(
              events("CursorMoved", { buffer: id }).subscribe(() => {
                if (auto.get()) Task.run(scope, show)
              }),
            )
            scope.own(
              events("BufLeave", { buffer: id }).subscribe(() => {
                Task.run(scope, preview.close)
              }),
            )
            scope.own(() => {
              if (vim.api.nvim_buf_is_valid(id))
                vim.api.nvim_buf_clear_namespace(id, namespace, 0, -1)
            })
          }),
        ]
      }),
    ),
  ])
