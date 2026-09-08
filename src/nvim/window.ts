import { behavior, type Node } from "./spec"
import { type Scope } from "./scope"
import { effect, cell, type Readable } from "./state"
import { events } from "./events"
import { type View, type MountedView } from "./view"
import * as Task from "./task"
export type Border = "none" | "single" | "double" | "rounded" | "solid" | "shadow" | "bold"
export interface FloatOptions {
  readonly enter?: boolean
  readonly caption?: Readable<string>
  readonly title?: string
  readonly footer?: string
  readonly size?: { readonly width?: number; readonly height?: number }
  readonly border?: Border
  readonly position?: "center" | "cursor"
  readonly options?: Readonly<Record<string, string | number | boolean>>
}
export interface SplitOptions {
  readonly side: "left" | "right" | "above" | "below"
  readonly size?: number
  readonly options?: Readonly<Record<string, string | number | boolean>>
}
/** A mounted placement starts hidden. Hiding retains content; unmounting disposes it. @noSelf */
export interface Panel extends Node {
  readonly open: Task.Task<void>
  readonly close: Task.Task<void>
  readonly toggle: Task.Task<void>
  readonly visible: Readable<boolean>
  readonly inOrigin: <A>(task: Task.Task<A>) => Task.Task<A>
}
const layout = (options: FloatOptions): LuaDict => {
  const width = Math.max(1, (vim.o.columns as number) - 2)
  const height = Math.max(1, (vim.o.lines as number) - (vim.o.cmdheight as number) - 3)
  const size = (value: number | undefined, total: number): number =>
    Math.max(1, Math.min(total, Math.floor((value ?? 0.6) <= 1 ? total * (value ?? 0.6) : value!)))
  const w = size(options.size?.width, width)
  const h = size(options.size?.height, height)
  const out: LuaDict = {
    relative: options.position === "cursor" ? "cursor" : "editor",
    width: w,
    height: h,
    row: options.position === "cursor" ? 1 : Math.floor((height - h) / 2),
    col: options.position === "cursor" ? 0 : Math.floor((width - w) / 2),
    border: options.border ?? "rounded",
    style: "minimal",
  }
  if (options.title !== undefined) {
    out.title = ` ${options.title} `
    out.title_pos = "center"
  }
  if (options.footer !== undefined) {
    out.footer = ` ${options.footer} `
    out.footer_pos = "center"
  }
  return out
}
const placement = (
  content: View,
  openWindow: (buffer: number) => number,
  options: Readonly<Record<string, string | number | boolean>> = {},
  relayout?: (window: number) => void,
  caption?: Readable<string>,
  enter = true,
): Panel => {
  let lifetime: Scope | undefined
  let mounted: MountedView | undefined
  let window: number | undefined
  let windowScope: Scope | undefined
  let origin: number | undefined
  const visible = cell(false)
  const hide = () => {
    const win = window
    window = undefined
    visible.set(false)
    windowScope?.close()
    windowScope = undefined
    if (win !== undefined && vim.api.nvim_win_is_valid(win)) vim.api.nvim_win_close(win, true)
  }
  const open = Task.sync(() => {
    if (!lifetime?.alive()) throw new Error("Mount the panel before opening it")
    if (window !== undefined && vim.api.nvim_win_is_valid(window)) {
      if (enter) vim.api.nvim_set_current_win(window)
      return
    }
    origin = vim.api.nvim_get_current_win()
    if (!mounted?.scope.alive()) mounted = content.attach(lifetime)
    windowScope = mounted.scope.child("window")
    try {
      window = openWindow(mounted.buffer)
      const win = window
      windowScope.own(() => {
        if (vim.api.nvim_win_is_valid(win)) vim.api.nvim_win_close(win, true)
        if (window === win) window = undefined
        visible.set(false)
      })
      for (const name in options)
        vim.api.nvim_set_option_value(name, options[name], { win, scope: "local" })
      windowScope.own(
        events("WinClosed", { pattern: tostring(win) }).subscribe(() => {
          window = undefined
          visible.set(false)
          windowScope?.close()
        }),
      )
      if (relayout)
        windowScope.own(
          events("VimResized").subscribe(() => {
            if (vim.api.nvim_win_is_valid(win)) relayout(win)
          }),
        )
      if (caption)
        effect(
          () =>
            vim.api.nvim_set_option_value(
              "winbar",
              caption.get().split("%").join("%%").split("\n").join(" "),
              { win, scope: "local" },
            ),
          windowScope,
        )
      visible.set(true)
    } catch (error) {
      windowScope.close()
      throw error
    }
  })
  return {
    ...behavior((scope) => {
      if (lifetime?.alive()) throw new Error("Panel already mounted")
      lifetime = scope.child("panel")
      lifetime.own(() => {
        hide()
        mounted = undefined
        lifetime = undefined
      })
    }),
    open,
    close: Task.sync(hide),
    toggle: Task.defer(() => (visible.get() ? Task.sync(hide) : open)),
    visible: { get: visible.get },
    inOrigin: (task) =>
      Task.make((scope, done) => {
        if (origin === undefined || !vim.api.nvim_win_is_valid(origin))
          return done({ tag: "failure", error: "The originating window has closed" })
        const context = scope.child("origin", {
          window: origin,
          buffer: vim.api.nvim_win_get_buf(origin),
        })
        Task.execute(context, task, done)
      }),
  }
}
export const floating = (content: View, options: FloatOptions = {}): Panel =>
  placement(
    content,
    (buffer) => vim.api.nvim_open_win(buffer, options.enter ?? true, layout(options)),
    options.options,
    (window) => vim.api.nvim_win_set_config(window, layout(options)),
    options.caption,
    options.enter ?? true,
  )
export const split = (content: View, options: SplitOptions): Panel =>
  placement(
    content,
    (buffer) => {
      const vertical = options.side === "left" || options.side === "right"
      const command: LuaDict = {
        cmd: vertical ? "vsplit" : "split",
        mods: {
          split: options.side === "left" || options.side === "above" ? "aboveleft" : "belowright",
        },
      }
      if (options.size !== undefined) command.count = options.size
      vim.cmd(command)
      const win = vim.api.nvim_get_current_win()
      vim.api.nvim_win_set_buf(win, buffer)
      return win
    },
    options.options,
  )
