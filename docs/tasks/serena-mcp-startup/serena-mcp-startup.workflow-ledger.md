# Serena MCP startup

**Owner:** PM (main thread)  
**Date:** 2026-11-06  
**Track:** Investigation, followed by a bounded correction if supported by evidence.  
**Status:** Initial startup correction and lifecycle investigation independently accepted.

## Authority and scope

The user requested diagnosis of the Serena startup error from `.vscode/mcp.json`,
authorized autonomous work, and explicitly requested GPT-6.1 Terra with high
reasoning effort as the engineering worker and a persistent project preference.
Scope includes the failing launch chain, proportionate configuration/script fixes,
runtime verification and explanation. Preserve unrelated working-tree changes;
no commits, branch changes or unrelated process/service restarts.

The persistent routing policy already exists in
[Agents Orchestration](../../../.github/docs/agents-orchestration.guide.md#engineering-model-routing):
the main thread coordinates and engineering workers use `gpt-6.1-terra` with
`reasoning_effort = high`. Reuse this canonical policy without duplicating it.

## Acceptance and delta contract

- Identify the observed failing boundary and distinguish it from hypotheses.
- Apply the smallest supported fix while preserving memory-tool exclusions.
- Exercise the actual configured launch command, MCP initialization, tool discovery
  and a representative navigation query where runtime access permits.
- Keep protocol stdout clean and expose startup errors on stderr.
- Obtain focused independent review of the final changed delta; scored closure
  requires at least 9.5/10 and no unresolved blocking/high/medium findings.
- Report any remaining VS Code UI, Docker or client verification limits explicitly.

## Dispatch and gates

| Work | Owner | State | Evidence |
| --- | --- | --- | --- |
| Investigation and implementation | Bach, `/root/bach_serena` | Implemented and validated | Spawn requested `gpt-6.1-terra`, `high`, isolated context; terminal result received and dispositioned. |
| Persistent worker policy | PM | Verified existing | Canonical policy linked above; no change required. |
| Focused independent review | Gilbert, `/root/gilbert_serena_review` | Accepted, 9.7/10 | First independent verdict PASS; no blocking/high/medium findings. Terminal result received and dispositioned. |
| Close-out | PM | Completed | Runtime checks passed; local-only changes and native UI limit retained below. |

## Resume and capture

### Investigation checkpoint

The latest VS Code session has empty Serena-specific output files, matching the
user's observation. Its `agenthost.log` lines 163, 172 and 176-179 record Serena
exiting before MCP initialization because `dockerDesktopLinuxEngine` did not
exist at the time. These host-level records identify Serena but do not conclusively
identify this workspace. Docker Desktop is currently available outside the agent
sandbox; sandbox pipe denial is a separate environment limit.

Bach found the configured image absent locally and is downloading it. The cold
download has already exceeded the 30-second Codex startup window observed in
separate client logs. Planned bounded correction: remove fixed container names
from the three Serena client definitions and increase the Codex startup timeout.
These hardening changes do not repair an unavailable Docker daemon; startup must
also be exercised after the download completes.

The downloaded image starts successfully. Its current default interface exposes
`serena_repl`, including a memory facade that the previous tool-only exclusions
did not remove. Bach therefore also added `excluded_apis: [mem]` to the existing
project configuration and missing-config bootstrap, preserving the canonical
memory-disabled navigation contract. Repeated initialization and tool discovery
passed at this checkpoint; later semantic results are recorded below.

### Runtime qualification

Qualified Docker image ID:
`sha256:e1954608a1a3a3571e790ba806718987ab4b51700a15973d186b3bb26affcb14`.
Repository digest:
`ghcr.io/oraios/serena@sha256:0b0ff857c2eca5094aa3b4f406e58ba3cacf647b20d237adcfbbeadffc14cd65`.
The reported Serena version is `2.1.1.dev0-ede329aa-dirty`.

Bach used a Python subprocess to exercise the expanded VS Code Docker command
against this workspace and cache, then sent JSON-RPC `initialize` (protocol
`2025-03-26`), `notifications/initialized`, `tools/list`, `initial_instructions`
and `serena_repl` calls. Initialization and discovery passed. A direct `s.mem`
access raised `AttributeError`, and
`s.lsp.get_symbols_overview('src/extension.ts')` returned `activate`, `deactivate`,
`CanvasEditorProvider` and other real symbols. All stdout lines were valid JSON;
diagnostic output was on stderr. JSON/TOML parse checks and the guide's four local
link targets passed.

Cold image download took several minutes but was not precisely timed; warm
startup was not separately measured. The actual inline PowerShell command was
read from `.codex/config.toml` and exercised successfully: initialization,
discovery, `s.mem` denial and TypeScript overview passed, with JSON stdout and
exit code 0. An isolated missing-config probe first failed at the Docker bind
mount of a Windows Local Temp directory (`Access is denied`), before bootstrap
execution. The bounded retry in an owned project `temp/` directory created with
PowerShell `New-Item` and inherited Windows ACLs passed: the missing `project.yml`
was created and migrated successfully, retaining all six excluded tools, the
ignored memory pattern and `excluded_apis: [mem]`. Initialization, discovery,
REPL-description inspection and direct `s.mem` denial passed with exit code 0.
The owned scratch directory was removed after resolved-path containment checking;
the live project configuration remained untouched. Native VS Code Start-button
state has not been exercised by this task. The six edited configuration/script/
guide paths are ignored by Git in this checkout; these are local workspace
changes, not a committed or published repository update.

### Final disposition and next action

The changed local files are `.vscode/mcp.json`, `.mcp.json`,
`.codex/config.toml`, `.serena/project.yml`, `scripts/serena-bootstrap.sh` and
`.github/docs/serena-mcp-guide.md`. No commit, branch change or unrelated service
restart was performed. The persistent worker preference was verified in its
existing canonical policy and applied to both dispatched contexts.

PM received and dispositioned Bach's terminal result and Gilbert's independent
PASS verdict of 9.7/10. The reviewed scope was the six final files, the bounded
contract and supplied runtime evidence. No blocking/high/medium findings remain;
no review-driven file correction was required. This task qualifies the current
local command chain, not an observed native UI state or future `latest` image.
The original click's precise workspace attribution remains unconfirmed. On the
next VS Code attempt, ensure Docker Desktop's Linux engine is ready and retry
Serena Start. If it still errors, inspect that fresh event in `agenthost.log`
alongside the Serena output rather than assuming the historical cause recurred.

PM owns this ledger. All delegated terminal results have been received and
dispositioned.
No session-memory path has been allocated for this logical session. Capture verdict:
`not needed` because this ledger and the canonical Serena guide preserve the
motivation, changes, runtime evidence, limits, current state and next action.
Team token/cost accounting is unavailable; do not estimate it.

## Follow-up: orphan container lifecycle

The user reported having seen accumulated Serena instances and questioned whether
removing fixed container names would worsen that behavior. The follow-up scope
is to establish the actual disconnect behavior and, where justified, implement
the smallest automatic cleanup correction. `--rm` removes an exited container;
it is not evidence that the server exits when a client disappears.

PM dispatched the same Terra/high Bach worker to test normal stdin EOF and abrupt
loss of an owned Docker client. Acceptance: disconnected owned instances exit
and are removed; a connected but quiet client remains usable; active clients and
other projects are never inferred idle merely from lack of tool calls. No broad
pruning or termination of pre-existing containers is authorized. Retain protocol
stdout hygiene, memory exclusions and client portability. If robust cleanup needs
a new launcher/lease contract rather than a bounded change, review that design
before implementation. Independent review of the lifecycle documentation delta
passed after wording corrections; prior startup acceptance remains evidence for
its own scope.

### Follow-up evidence checkpoint

Bach tested the unchanged configured command on the qualified image with unique
ownership labels. After initialization, a client held quiet for six seconds
remained usable (`tools/list` passed). Closing stdin produced Docker client exit
code 0 and container removal in approximately three seconds. Force-killing the
owned `docker.exe` client produced container removal in approximately four
seconds. Final test-owned container inventory was empty. These are measured
smoke-test observations, not a guarantee across every Docker/VS Code failure.
The earlier-startup death test subsequently passed: immediately after container
creation and before initialization, force-killing its owned Docker client led to
container removal in approximately seven seconds, with final owned inventory
empty. Container inspection confirmed `OpenStdin=true`, `StdinOnce=true` and no
configured init process. The optional `HostConfig.Init` field was absent; an
initial probe that treated it as mandatory failed its inspection step and
cleaned up only its own labelled instance before the corrected probe passed.

One pre-existing `serena-mcp-container-studio1` was observed and left untouched;
its name alone does not establish that it is orphaned. Independent critic
`/root/gilbert_serena_review` reviewed the follow-up conclusion in a separate
context. All three disconnect checks passed; retain the existing cleanup behavior
and keep connected sessions alive while quiet.
No lifecycle code/configuration change is justified by these successful current
runtime probes. Bach documented behavior and limits in the existing guide.
The first focused review scored 9.3/10 and reported one low-severity wording ambiguity: the guide
could be read as claiming four tested scenarios rather than the three actually
run. PM also requested correction of the apparent Docker Engine version being
labelled as the Desktop application's version. Bach corrected both; the focused
independent recheck passed at 9.7/10 with no remaining blocking/high/medium
findings. Docker version evidence identifies Engine client/server 29.8.2 and
Docker Desktop 4.95.0 (242831). Both delegated terminal results have been received
and dispositioned. Scoped whitespace checks and all four guide local links pass.
The [Docker run reference](https://docs.docker.com/reference/cli/docker/container/run)
documents removal on exit separately from stdin and signal handling.

Final lifecycle state: the tested current configuration automatically exited and
removed its owned containers after the three disconnect scenarios. These results
do not explain or disprove the user's past accumulated instances, do not qualify
every native VS Code crash mode, and do not promise cleanup during daemon
failures or server hangs. A persistent connected-but-idle client remains a valid
owner. No watchdog, idle timeout, global-name lock or pre-existing-container
cleanup was added. If accumulation recurs, inspect the affected container's
workspace, image, state and actual attached-client ownership before deciding on
cleanup. Session capture remains `not needed`: this updated ledger and guide
preserve the follow-up motivation, measurements, decision, review and next action.
