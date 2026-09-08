import * as Task from "./task"
import type { Scope } from "./scope"
export interface Action {
  readonly label: string
  readonly task: Task.Task<unknown>
}
export const action = (label: string, task: Task.Task<unknown>): Action => ({ label, task })
export const invoke = (scope: Scope, task: Task.Task<unknown>): void => {
  if (!scope.alive()) return
  const target = scope.child("action", {
    buffer: scope.buffer ?? vim.api.nvim_get_current_buf(),
    window: scope.window ?? vim.api.nvim_get_current_win(),
  })
  Task.execute(target, task, (exit) => {
    target.close()
    if (exit.tag === "failure") scope.report(exit.error)
  })
}
