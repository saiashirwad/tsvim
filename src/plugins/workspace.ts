import {
  action,
  component,
  document,
  editor,
  floating,
  keys,
  line,
  native,
  options,
  picker,
  pipe,
  Task,
  text,
} from "../nvim"
import { createView } from "../nvim/view"
import { mount } from "../nvim/spec"
import { type Scope } from "../nvim/scope"
export const workspace = () =>
  component("workspace", () => {
    const terminal = createView(
      (scope, buffer) => {
        const job = vim.api.nvim_buf_call(buffer, () =>
          vim.fn.jobstart([vim.o.shell as string], { term: true }),
        )
        if (job <= 0) throw new Error("Could not start terminal")
        scope.own(() => {
          pcall(vim.fn.jobstop, job)
        })
      },
      { name: "terminal" },
    )
    const panel = floating(terminal, { title: "Terminal", size: { width: 0.8, height: 0.7 } })
    let zen: Scope | undefined
    let zoomTab: number | undefined
    let originalTab: number | undefined
    const notes = document(`${vim.fn.stdpath("data")}/scratchpad.md`, {
      filetype: "markdown",
      initial: ["# scratchpad", ""],
    })
    const scratch = floating(notes, { title: "Scratch", size: { width: 0.7, height: 0.7 } })
    const undo = picker({
      title: "Undo history",
      items: Task.sync(() => {
        const entries: Array<{ seq: number; time: number }> = []
        const visit = (nodes: LuaDict[]) => {
          for (const node of nodes) {
            entries.push({ seq: node.seq as number, time: node.time as number })
            if (node.alt) visit(node.alt as LuaDict[])
          }
        }
        visit((vim.fn.undotree().entries as LuaDict[]) ?? [])
        return entries.sort((a, b) => b.seq - a.seq)
      }),
      key: (entry) => tostring(entry.seq),
      label: (entry) => `Change ${entry.seq}  ${vim.fn.strftime("%Y-%m-%d %H:%M", entry.time)}`,
      accept: (entry) => editor.ex(`undo ${entry.seq}`),
    })
    return [
      panel,
      scratch,
      undo,
      notes.bind(
        keys.normal({
          q: action("Close scratch", scratch.close),
          "<C-s>": action("Save scratch", notes.save),
        }),
      ),
      native((scope) => {
        const leaveZoom = () => {
          if (zoomTab && vim.api.nvim_tabpage_is_valid(zoomTab)) {
            vim.api.nvim_set_current_tabpage(zoomTab)
            vim.cmd("tabclose")
          }
          zoomTab = undefined
          if (originalTab && vim.api.nvim_tabpage_is_valid(originalTab))
            vim.api.nvim_set_current_tabpage(originalTab)
        }
        scope.own(leaveZoom)
        keys
          .leader({
            tT: action(
              "Toggle terminal",
              pipe(
                panel.toggle,
                Task.andThen(
                  Task.sync(() => {
                    if (panel.visible.get()) vim.cmd("startinsert")
                  }),
                ),
              ),
            ),
            z: action(
              "Zen mode",
              Task.sync(() => {
                if (zen?.alive()) {
                  zen.close()
                  zen = undefined
                } else {
                  const window = vim.api.nvim_get_current_win()
                  zen = scope.child("zen", { window, buffer: vim.api.nvim_win_get_buf(window) })
                  mount(
                    options({
                      number: false,
                      relativenumber: false,
                      signcolumn: "no",
                      foldcolumn: "0",
                      colorcolumn: [],
                      cursorline: false,
                      wrap: true,
                    }),
                    zen,
                  )
                }
              }),
            ),
            Z: action(
              "Zoom window",
              Task.sync(() => {
                if (zoomTab) leaveZoom()
                else {
                  originalTab = vim.api.nvim_get_current_tabpage()
                  vim.cmd("tab split")
                  zoomTab = vim.api.nvim_get_current_tabpage()
                }
              }),
            ),
            n: action("Scratch buffer", scratch.toggle),
            ".": action("Scratch buffer", scratch.toggle),
            S: action("Scratch buffer", scratch.open),
            fu: action("Undo history", undo.open),
            bd: action(
              "Delete buffer, keep layout",
              Task.sync(() => {
                const buffer = vim.api.nvim_get_current_buf()
                if (vim.bo.modified) throw new Error("Save changes before deleting this buffer")
                const replacement =
                  vim.api
                    .nvim_list_bufs()
                    .find(
                      (id) =>
                        id !== buffer && vim.api.nvim_get_option_value("buflisted", { buf: id }),
                    ) ?? vim.api.nvim_create_buf(true, false)
                for (const win of vim.api.nvim_list_wins())
                  if (vim.api.nvim_win_get_buf(win) === buffer)
                    vim.api.nvim_win_set_buf(win, replacement)
                vim.api.nvim_buf_delete(buffer, {})
              }),
            ),
          })
          .install(scope)
      }),
    ]
  })
