# Canvas image drag and drop

**Status:** Closed at user request with known issue: Shift-drag remains unresolved; the Explorer workaround was confirmed working by the user.  
**Date:** 2026-11-06

## Request

Dragging an image with Shift from VS Code onto the canvas should create a file node at the drop position and set its tag from the filename without the extension. The user supplied `examples/kittten-product.canvas` as a reference and authorized the update in chat.

## Implementation

- Existing file paths are converted to workspace-relative references. If VS Code exposes a dropped image without its path, the extension searches the canvas workspace for files with the same name, size, and SHA-256 content. A single match is used; multiple matching copies prompt for a choice. Content matching identifies an identical workspace copy, not necessarily the original file's identity. An unmatched or unreadable image produces a warning rather than a fabricated path.
- Valid tag stems are preserved exactly, including repeated and leading/trailing underscores. The user confirmed that names with unsupported characters should follow the existing normalization rules. If the resulting tag is empty or already in use, the image node is created without a tag and a warning is shown.
- Multiple dropped images can resolve independently. A pending lookup is cancelled if a subsequent canvas edit, synchronization, undo, or redo makes the result stale. Existing image files are not copied or modified.
- Changed files: `src/extension.ts`, `webview/main.js`, `webview/src/InfiniteCanvasSimple.js`, `package.json`, `test/drop.cjs`, and `test/drop-host.cjs`.

## Verification and review

- `npm test` passed after the final changes, including compilation, existing regressions, history tests, and new drop and host matching tests. `git diff --check` passed.
- Independent review: initial 7/10 identified an issue with multiple simultaneous drops; the next 8.5/10 identified altered underscores in otherwise valid tags. Both were corrected and rechecked; final verdict 9.5/10.
- An isolated VS Code Extension Development Host and disposable canvas were opened, but UI automation could not obtain control of the window to perform a Shift-drag. The real Explorer drag payload, dropped-file readability and Web Crypto in the live webview, native undo, and remote workspace behavior were not established. The user should validate the gesture in their running extension.
- The example canvas and images, and unrelated concurrent changes, were not modified by this task. No commit or release was performed.

## Session record

No separate session-memory capture is needed: this ledger records the request, changes, verification, limitations, and next action.

## User-reported live failure

The user reported that dragging an Explorer image onto the canvas with Shift shows a prohibited cursor and does not create a node; without Shift VS Code opens the image preview. The previous automated checks did not establish end-to-end success. VS Code issue #339036 describes similar blocked Explorer-to-webview events; its applicability to this specific failure is plausible but not confirmed. At that point an Explorer context-menu workaround was under investigation; it is not a fix for Shift-drag.

## Follow-up: comparison with the previous extension

The user identified `agentic-cinema-project/temp/infinite-canvas-patched` as the prior working copy. Read-only comparison found the same canvas `dragover` and `drop` registration and the same drop payload handling in that copy and the installed extension. Path conversion differs after receipt of a drop: the older copy uses heuristic workspace-name matching, while the installed version uses the actual workspace root and rejects paths outside it. No packaging difference was identified that explains a prohibited cursor before a drop reaches the webview.

The project `.vscode/settings.json` still associated `.canvas` with the old `infinite-canvas.canvasEditor` and `canvas` language; it was corrected to the new IDs defined in `package.json`. The `.code-workspace` already selected the new editor. The active provider in the user's actual window remains unverified. The installed `kembl.infinite-canvas-cinema` 0.1.9 copy does not contain the current working-tree changes, so these changes require a development host or an updated installation before live testing. No installed extension or global setting was changed.

The open VS Code issue https://github.com/microsoft/vscode/issues/339036 describes a similar regression in which Explorer Shift-drag can be blocked before webview code receives events. The installed VS Code is 1.145.2, but the issue's applicability to this exact failure is not established by a local event trace or version bisect.

## Explorer workaround

An `Add Image to Canvas` Explorer context action now passes selected image URIs to a canvas in the current extension. The action uses the visible canvas or asks the user to select one, reveals the selected canvas, and adds images near the viewport center. It uses the existing tag rules. Deferred requests are cancelled on a superseding edit, undo, or reload; separate pending additions are preserved. This is an alternative workflow, not a fix for Shift-drag.

`npm test` passed, including existing regression/history tests and added drag, host, and Explorer-action checks. Independent review of the workaround passed at 9.5/10 after fixes for hidden canvas layout, stale pending additions, and independent queued additions. `git diff --check` passed. At the time of this review, actual Explorer context-menu invocation, placement, native undo, and Shift-drag were unverified in a running VS Code window. See Known Issues for subsequent user validation and closure. No release or commit was performed.
## Development-host workspace

The F5 `Run Extension` configuration now passes `${workspaceFolder}` as the folder to open as well as `--extensionDevelopmentPath=${workspaceFolder}`. The test window should therefore show the repository files, including the examples, while loading the extension from this project. JSON/argument checks and scoped whitespace validation passed; a new live launch has not been observed for this change.

## Drag diagnostics

After the development host began opening the repository, the user reported that dragging shows a carrying cursor but releasing the image still creates no node. This observation does not establish whether the webview receives a drop event.

Development-only diagnostics now write to `.logs/canvas-drag-drop.jsonl` under the extension source folder. The journal records the extension/source identity and build hashes, webview bootstrap and script errors, capture-phase drag events, payload type and size metadata, image lookup, node creation, and save/load outcomes. Arbitrary dropped text, image bytes, full canvas content, and API keys are excluded. The file is ignored by Git and capped at 2 MiB; overflow is marked rather than silently treated as missing activity.

`Run Extension` now has a `compile-extension` prelaunch task so F5 builds the current host code. The implementation and automated checks are complete. Independent diagnostic review passed at 9.5/10; the reviewer ran `npm test` and `git diff --check` successfully. Subsequent F5 reproductions produced the journal evidence below. This diagnostic addition does not establish that drag-and-drop is fixed.

## First recorded development-host reproduction

The user restarted the development host and reproduced the failure. The JSONL session at `2026-11-06T19:09:23Z` identifies VS Code 1.145.2 and the development extension source directory. All three logged SHA-256 hashes match the current host/main/canvas files. Bootstrap, module initialization, canvas readiness, and loading four nodes were recorded; no drag capture, canvas drop, or payload-resolution records were present. The small log had no saturation marker.

This is evidence of no recorded drag inside the webview, not yet proof of host-side suppression: the original capture collector could silently suppress an event if metadata inspection threw. Diagnostics were corrected to emit an entry before reading event properties, emit a capture error on failure, and record listener readiness. A distinct custom diagnostic event verifies both collectors; it does not simulate or prove native drag delivery. Dragover remains throttled and drop is unthrottled.

Independent review of this correction passed at 9.5/10, and the reviewer ran the full `npm test` successfully. The corrected collectors were subsequently exercised in the second reproduction below. The gesture remains unresolved.

## Second recorded reproduction: event-delivery boundary established

The user restarted debugging and reported two failed image-drag attempts. Session `1793993532588-48652` began at `2026-11-06T19:32:12Z` on VS Code 1.145.2 in development mode. Its host/main/canvas hashes match the current files. Both opened panels recorded listener readiness, successful custom-probe entry and capture at both window and document, module/canvas readiness, and loading four nodes. There were zero real `dragenter`, `dragover`, or `drop` entry records, no capture/script/promise errors, and no dropped-log marker. The entire journal was only 6,687 bytes, below the cap.

A separate reviewer independently checked these facts. For the user's reported attempts, the established observation is that no native drag event reached the instrumented inner webview; payload parsing, image lookup, and node creation were never entered. The custom probe validates the listener/logging path, not delivery of native drag events. The exact outer layer responsible is not established, nor is the specific applicability of VS Code issue #339036. Repeating the same reproduction with more inner-webview payload changes is not needed to establish this boundary.

The original Shift-drag requirement remains unresolved. The implemented Explorer `Add Image to Canvas` action bypasses this event route and is a separate workflow. The user subsequently confirmed that adding through the context menu works; see Known Issues. Identifying the exact platform cause would require a controlled comparison of VS Code runtimes or observation of its outer workbench; no installed VS Code files, user profile, or runtime version was changed.
## Known Issues

**Shift-drag from VS Code Explorer onto the canvas remains unresolved.** In the user's VS Code 1.145.2 development session, two attempts produced no native drag events in either instrumented canvas webview. Listener registration and a synthetic diagnostic probe succeeded, so the observed failure occurs before the canvas can process the dropped file. The exact outer layer responsible has not been proven. [VS Code issue #339036](https://github.com/microsoft/vscode/issues/339036) describes a similar Explorer-to-webview regression and is a plausible explanation, not a confirmed diagnosis of this particular installation.

**Workaround:** Open the canvas, right-click an image in the VS Code Explorer, and choose **Add Image to Canvas**. The user confirmed that adding an image through the right-click menu works and explicitly accepted this workaround for now. This confirmation does not establish live coverage of multi-selection, native undo, or remote workspaces.

**Closure:** Closed at the user's request with Shift-drag deferred as a known issue; do not describe drag-and-drop as fixed. Revisit when the upstream issue or a supported host-level solution changes, and validate the actual Explorer-to-canvas gesture before marking it resolved. No commit or release was performed.