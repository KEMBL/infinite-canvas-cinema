import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_PENDING = 512;
const ALLOWED_FIELDS = new Set([
    'scope', 'target', 'eventType', 'types', 'typeLengths', 'itemTypes', 'itemKinds', 'fileTypes', 'fileSizes', 'fileNameLengths', 'filePathFlags', 'fileCount', 'itemCount', 'eventId', 'source', 'line', 'column', 'dropCount', 'errorMessage',
    'shift', 'ctrl', 'alt', 'meta', 'defaultPrevented', 'effectAllowed', 'dropEffect', 'x', 'y',
    'revision', 'requestId', 'pathCount', 'candidateCount', 'matchCount', 'selected', 'reason',
    'version', 'baseVersion', 'saveId', 'afterSaveId', 'dirty', 'interacting', 'nodeCount', 'tagged',
    'errorName', 'errorCode', 'relativePath', 'available', 'initialized', 'extensionPath', 'extensionVersion', 'vscodeVersion',
    'mode', 'hostHash', 'mainHash', 'canvasHash', 'panelId', 'uriPresent', 'textPresent', 'hasPath'
]);

// Restrict webview-supplied data to bounded metadata; never log paths, names or payload text.
function clean(value: unknown): unknown {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[A-Za-z0-9._/+:-]{0,160}$/.test(value)) return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(clean).filter(item => item !== undefined);
    return undefined;
}

export class DragDiagnostics {
    private queue = Promise.resolve();
    private pending = 0;
    private dropped = 0;
    private reportedFailure = false;
    private readonly session = `${Date.now()}-${process.pid}`;
    constructor(private readonly logPath: string) {}
    record(event: string, fields: Record<string, unknown> = {}): void {
        if (!/^[a-z0-9_.-]{1,80}$/.test(event)) return;
        if (this.pending >= MAX_PENDING) { this.dropped++; return; }
        const safe: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
            if (!ALLOWED_FIELDS.has(key)) continue;
            const trustedPath = key === 'extensionPath' && event === 'activation' && typeof value === 'string';
            const relativePath = key === 'relativePath' && typeof value === 'string' && value.length <= 240 &&
                !value.startsWith('/') && !value.includes('..') && !/[\\\r\n\x00-\x1f]/.test(value) && !/^[A-Za-z]:/.test(value);
            const source = key === 'source' && typeof value === 'string' && ['main.js', 'InfiniteCanvasSimple.js', 'inline', 'unknown'].includes(value);
            const safeError = key === 'errorMessage' && typeof value === 'string' && [
                'Cannot read properties', 'is not defined', 'is not a function', 'Unexpected token',
                'Failed to fetch dynamically imported module', 'Failed to load module script',
                'No matching image was found in the canvas workspace', 'Invalid dropped image details',
                'No workspace folder found', 'VS Code rejected the canvas edit'
            ].includes(value);
            const cleaned = trustedPath ? (value as string).slice(0, 400) : relativePath ? value :
                source || safeError ? value : ['relativePath', 'source', 'errorMessage'].includes(key) ? undefined : clean(value);
            if (cleaned !== undefined) safe[key] = cleaned;
        }
        const line = JSON.stringify({time: new Date().toISOString(), session: this.session, event, ...safe}) + '\n';
        this.pending++;
        this.queue = this.queue.then(async () => {
            await fs.promises.mkdir(path.dirname(this.logPath), {recursive: true});
            let size = 0;
            try { size = (await fs.promises.stat(this.logPath)).size; }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            if (size + Buffer.byteLength(line) > MAX_LOG_BYTES) await fs.promises.writeFile(this.logPath, '');
            await fs.promises.appendFile(this.logPath, line, 'utf8');
        }).catch(error => {
            if (!this.reportedFailure) console.error('Canvas diagnostics log failed:', error);
            this.reportedFailure = true;
        }).then(() => {
            this.pending--;
            if (this.dropped && this.pending < MAX_PENDING) {
                const dropCount = this.dropped;
                this.dropped = 0;
                this.record('diagnostics.dropped', {dropCount});
            }
        });
    }
    async flush(): Promise<void> {
        let current: Promise<void>;
        do { current = this.queue; await current; } while (current !== this.queue);
    }
}
