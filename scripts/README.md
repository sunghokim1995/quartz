# Research OS viewer operations

Quartz serves the ResearchOS production Vault on `http://127.0.0.1:8080`. The content root is resolved through the core repository's `scripts/resolve-research-os-paths.mjs`, never hard-coded.

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

Auto-start uses the LaunchAgent `com.researchos.quartz`, installed from the core repository:

```bash
cd ~/ResearchOS/repos/core
scripts/manage-launchd.sh install quartz
```

`scripts/start-research-os.sh` is the process the LaunchAgent runs. Without the LaunchAgent, `manage-research-os.sh start` runs it in the background for the current session. Logs: `~/Library/Logs/ResearchOS/quartz.log` (LaunchAgent) or `quartz.manual.log`.

`status` prints `Listening : True|False`; the core repository's `mcp-server/quartz-maintenance.mjs` parses that line before a maintenance window on either platform.
