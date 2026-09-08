/** Common editing policies compose as behaviors; options remain the precision escape hatch. */
import { options } from "./options"
import { events, on, forBuffers } from "./events"
import { buffer } from "./buffer"
import { behavior, mount, type Node } from "./spec"
import { lease } from "./lease"
import * as Text from "./text"
import * as Task from "./task"
export const editing = {
  indent: (width: number, kind: "spaces" | "tabs" = "spaces") =>
    options({
      tabstop: width,
      shiftwidth: width,
      softtabstop: width,
      expandtab: kind === "spaces",
      smartindent: true,
    }),
  trimWhitespace: (options: { readonly except?: readonly string[] } = {}) =>
    forBuffers(
      (id) =>
        !(options.except ?? []).includes(
          vim.api.nvim_get_option_value("filetype", { buf: id }) as string,
        ),
      () =>
        on(
          "BufWritePre",
          buffer.transform((lines) =>
            Text.findAll(lines, "%s+$").map((range) => Text.remove(range)),
          ),
        ),
    ),
  rememberPosition: () =>
    on(
      "BufReadPost",
      Task.sync((scope) => {
        const buffer = scope.buffer!
        const [line, col] = vim.api.nvim_buf_get_mark(buffer, '"')
        if (line > 0 && line <= vim.api.nvim_buf_line_count(buffer))
          pcall(vim.api.nvim_win_set_cursor, scope.window ?? 0, [line, col])
      }),
    ),
  highlightYank: (group = "IncSearch", timeout = 120) =>
    on(
      "TextYankPost",
      Task.sync(() => vim.highlight.on_yank({ higroup: group, timeout })),
    ),
}
export const search = (
  options_: { readonly case?: "smart" | "ignore" | "sensitive"; readonly preview?: boolean } = {},
) =>
  options({
    ignorecase: options_.case !== "sensitive",
    smartcase: (options_.case ?? "smart") === "smart",
    incsearch: true,
    inccommand: options_.preview === false ? "" : "split",
  })
export const leaders = (global = " ", local = ","): Node =>
  behavior((scope) => {
    for (const [name, value] of [
      ["mapleader", global],
      ["maplocalleader", local],
    ]) {
      const previous = vim.g[name!]
      scope.own(
        lease(
          `global:${name}`,
          () => {
            vim.g[name!] = previous
          },
          () => {
            vim.g[name!] = value
          },
        ),
      )
    }
  })
export const syntax = (): Node =>
  forBuffers(
    () => true,
    (buffer) =>
      behavior((scope) => {
        let started = false
        const restart = () => {
          if (started) vim.treesitter.stop(buffer)
          const [ok] = pcall(() => vim.treesitter.start(buffer))
          started = ok
        }
        scope.own(() => {
          if (started && vim.api.nvim_buf_is_valid(buffer)) vim.treesitter.stop(buffer)
        })
        scope.own(events("FileType", { buffer }).subscribe(restart))
        restart()
        mount(options({ foldmethod: "expr", foldexpr: "v:lua.vim.treesitter.foldexpr()" }), scope)
      }),
  )
