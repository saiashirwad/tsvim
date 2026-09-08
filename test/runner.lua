package.path = vim.fn.getcwd() .. "/dist/?.lua;" .. package.path
local ok, err = xpcall(function() dofile("dist/tests.lua") end, debug.traceback)
if not ok then
  io.stderr:write(tostring(err) .. "\n")
  vim.cmd("cquit 1")
end
vim.cmd("qa!")
