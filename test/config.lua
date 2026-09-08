-- Exercise the shipped config offline; external packages and language servers
-- are integration boundaries, not prerequisites for the test suite.
package.path = vim.fn.getcwd() .. "/dist/?.lua;" .. package.path
local function check()
  local setup = { setup = function() end }
  for _, name in ipairs({ "oil", "gitsigns", "which-key", "mini.pairs", "mini.surround" }) do
    package.preload[name] = function() return setup end
  end
  vim.pack.add = function() end
  vim.lsp.enable = function() end
  dofile("dist/init.lua")
  local function eq(a, b, message) assert(vim.deep_equal(a, b), message .. ": " .. vim.inspect(a)) end
  local function key(lhs) local mapping = vim.fn.maparg(lhs, "n", false, true); assert(mapping.callback, "missing " .. lhs); mapping.callback() end
  local function floats()
    return vim.tbl_filter(function(win) return vim.api.nvim_win_get_config(win).relative ~= "" end, vim.api.nvim_list_wins())
  end
  eq(vim.o.scrolloff, 8, "scrolloff")
  eq(vim.o.clipboard, "unnamedplus", "list options")
  eq(vim.fn.exists(":Reload"), 2, "Reload command")
  eq(vim.fn.exists(":Rename"), 2, "Rename command")
  eq(vim.fn.maparg("<", "v", false, true).desc, "Dedent selection", "visual action")
  assert(vim.o.statusline:find("pureluanvim_statusline"), "statusbar mounted")
  vim.cmd("enew"); vim.bo.filetype = "help"
  eq(vim.fn.maparg("q", "n", false, true).buffer, 1, "existing buffer scoping")
  vim.cmd("enew"); vim.bo.filetype = "markdown"
  eq(vim.wo.wrap, true, "local wrap")
  eq(vim.api.nvim_get_option_value("wrap", { scope = "global" }), false, "global wrap")
  vim.cmd("enew"); vim.bo.filetype = "text"
  vim.api.nvim_buf_set_lines(0, 0, -1, false, { "hello  ", "world\t" })
  vim.api.nvim_exec_autocmds("BufWritePre", { buffer = 0 })
  eq(vim.api.nvim_buf_get_lines(0, 0, -1, false), { "hello", "world" }, "trim synchronous before write")
  vim.bo.modified = false
  key(" ff")
  assert(#floats() >= 2, "built-in file picker opens")
  local buffers = vim.api.nvim_list_bufs()
  vim.cmd("Reload")
  eq(#floats(), 0, "reload closes picker")
  eq(vim.o.scrolloff, 8, "reload reapplies options")
  eq(vim.fn.exists(":Reload"), 2, "reload remounts commands")
  key(" gg")
  eq(#floats(), 1, "git panel opens")
  local panel_buffer = vim.api.nvim_get_current_buf()
  eq(vim.bo.filetype, "gitstatus", "git view filetype")
  eq(vim.bo.modifiable, false, "git read-only")
  key("q"); eq(#floats(), 0, "git panel closes")
  vim.cmd("Reload")
  eq(vim.api.nvim_buf_is_valid(panel_buffer), false, "reload removes hidden git buffer")
  eq(#vim.api.nvim_get_autocmds({ event = "TextYankPost" }), 1, "no duplicate yank callbacks")
  _G.__pureluanvim.close()
  eq(vim.o.scrolloff, 0, "unmount restores defaults")
  eq(vim.fn.exists(":Reload"), 0, "unmount removes commands")
  eq(_G.nv, nil, "unmount restores native global")
  print("CONFIG CHECKS PASSED")
end
local ok, err = xpcall(check, debug.traceback)
if not ok then io.stderr:write(tostring(err) .. "\n"); vim.cmd("cquit 1") end
vim.cmd("qa!")
