# Canvas undo and redo fix

**Status:** Fixed and verified  
**Date:** 2026-11-06

## Problem

After a canvas block was moved, Ctrl+Z did not reliably restore its previous position. Canvas changes were sent to the VS Code document after a delay, document updates could be suppressed during saving, and loading an updated document did not always redraw the canvas.

## Fix

- Connected canvas undo and redo to the VS Code document history and ordered pending saves before history operations.
- Synchronized document updates with the canvas and requested a redraw after loading changes. Text fields retain their normal undo behavior.
- Added version and save ordering checks, with recovery of conflicting or rejected changes, to avoid losing edits during synchronization.

The changes are in `src/extension.ts`, `webview/main.js`, and `webview/src/InfiniteCanvasSimple.js`. Regression coverage was added in `test/history.cjs` and `test/history-host.cjs` and included in `npm test`.

## Verification

- `npm test` passed: TypeScript compilation, 19 existing regression checks, and the new history and synchronization tests.
- Independent implementation review passed after corrections (9.5/10).
- The user confirmed in VS Code that Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y work.
- Automated tests simulate concurrent edits and save-failure recovery. These scenarios and multiple real editors were not separately verified in a live VS Code session.
