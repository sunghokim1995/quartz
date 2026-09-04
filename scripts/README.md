# Research OS viewer operations

Quartz serves the ResearchOS production Vault on `http://127.0.0.1:8080`. The content root is resolved through the core repository's `scripts/resolve-research-os-paths.mjs`, never hard-coded. `RESEARCHOS_ROOT` (alias `RESEARCH_OS_ROOT`) is auto-detected from the `<ROOT>/repos/quartz` layout when unset, and Node.js is discovered the same way as in the core repository (`RESEARCHOS_NODE`, PATH, Homebrew `node@22`/`node`, volta, fnm, nvm).

The whole system (web, HTTP MCP, Quartz, Litestream) is started from the core repository: `repos/core/scripts/start-research-os.sh` / `.ps1` (see `docs/CROSS_PLATFORM.md` there). The scripts below manage the Quartz process alone; `scripts/start-research-os.sh` here is the Quartz process itself, not the system launcher of the same name in the core repository.

## Windows

```powershell
.\scripts\manage-research-os.ps1 Start
.\scripts\manage-research-os.ps1 Status
.\scripts\manage-research-os.ps1 Stop
```

Auto-start uses the Windows logon Scheduled Task `Personal LLM Wiki - Research OS` (`.\scripts\install-research-os-autostart.ps1`).

## macOS

```bash
scripts/manage-research-os.sh start
scripts/manage-research-os.sh status
scripts/manage-research-os.sh stop
```

Linux uses the same scripts with the background-process fallback (state under `$XDG_DATA_HOME/PersonalLLMWiki`, logs under `$XDG_STATE_HOME/ResearchOS/logs`). On macOS, auto-start uses the LaunchAgent `com.researchos.quartz`, installed from the core repository:

```bash
cd ~/ResearchOS/repos/core
scripts/manage-launchd.sh install quartz
```

`scripts/start-research-os.sh` is the process the LaunchAgent runs. Without the LaunchAgent, `manage-research-os.sh start` runs it in the background for the current session. Logs: `~/Library/Logs/ResearchOS/quartz.log` (LaunchAgent) or `quartz.manual.log`.

`status` prints `Listening : True|False`; the core repository's `mcp-server/quartz-maintenance.mjs` parses that line before a maintenance window on either platform.
