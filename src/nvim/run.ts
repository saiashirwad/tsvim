import { mountRoot, type Behavior } from "./spec"
import * as Task from "./task"
interface Live {
  close: () => void
  source: string
}
const KEY = "__pureluanvim"
const live = (): Live | undefined => (_G as LuaDict)[KEY] as Live | undefined
export const run = (body: Behavior): void => {
  live()?.close()
  const source = string.gsub(debug.getinfo(1, "S")?.source ?? "", "^@", "")[0]
  const scope = mountRoot(body)
  const instance: Live = {
    source,
    close: () => {
      scope.close()
      if (live() === instance) (_G as LuaDict)[KEY] = undefined
    },
  }
  ;(_G as LuaDict)[KEY] = instance
}
export const stop = Task.sync(() => live()?.close())
export const reload = Task.sync(() => {
  const previous = live()
  if (!previous) return
  previous.close()
  dofile(previous.source)
})
