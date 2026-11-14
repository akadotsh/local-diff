-- Copy this file into your Rex config directory, then require it from init.lua.
local shortcut = "shift+cmd+g"
local split_direction = "right"

rex.action{
  name = "open_pierre_diffs",
  title = "Open Pierre Diffs",
  description = "Review Git changes beside the active terminal pane.",
  category = "Code Review",
  keywords = "git diff review",
  run = function(ctx)
    if not ctx.session_id or not ctx.block_id then
      error("Open Pierre Diffs from an active Rex terminal pane", 0)
    end

    local terminal = "com.superlogical.terminal"
    local location, err = rex.block.call(terminal, "pwd", { block_id = ctx.block_id })
    if not location then error(err or "Could not read the active terminal directory", 0) end

    local cwd = location.pwd or location.cwd
    if type(cwd) ~= "string" or cwd == "" then
      error("The active terminal has not reported its working directory", 0)
    end
    local url_path = cwd:match("^file://[^/]*/(.*)$")
    if url_path then
      cwd = "/" .. url_path:gsub("%%(%x%x)", function(hex) return string.char(tonumber(hex, 16)) end)
    end

    local result, run_error = rex.exec(
      { "rpd", "--cwd", cwd, "--session", ctx.session_id, "--block", ctx.block_id, "--split", split_direction },
      { cwd = cwd, timeout = 25 }
    )
    if not result then error(run_error or "Could not start rpd; check that rex-pierre-diffs is installed", 0) end
    if not result.ok then
      error(result.stderr ~= "" and result.stderr or ("rpd exited with code " .. result.code), 0)
    end
    return result.stdout
  end,
}

rex.bind(shortcut, "open_pierre_diffs")
