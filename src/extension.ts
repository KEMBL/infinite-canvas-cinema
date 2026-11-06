import * as vscode from 'vscode';
import * as path from 'path';
import { createHash } from 'crypto';
import * as fs from 'fs';
import { DragDiagnostics } from './dragDiagnostics';

interface CanvasFileNode {
    id?: unknown;
    type?: string;
    file?: string;
    tag?: unknown;
    [key: string]: unknown;
}
type TagCatalog = Record<string, { path: string; canvas: string; nodeId: string }>;
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const TAG_CHAR_RE = /^[A-Za-z0-9_-]+$/;
export function activate(context: vscode.ExtensionContext): void {
    console.log('Infinite Canvas Cinema extension is now active!');
    const diagnosticsEnabled = context.extensionMode === vscode.ExtensionMode.Development || process.env.CANVAS_DRAG_DIAGNOSTICS === '1';
    const diagnostics = diagnosticsEnabled ? new DragDiagnostics(path.join(context.extensionPath, '.logs', 'canvas-drag-drop.jsonl')) : undefined;
    if (diagnostics) {
        const hash = (relative: string): string => {
            try { return createHash('sha256').update(fs.readFileSync(path.join(context.extensionPath, relative))).digest('hex'); }
            catch { return 'unavailable'; }
        };
        diagnostics.record('activation', {extensionPath: context.extensionPath, extensionVersion: context.extension.packageJSON.version,
            vscodeVersion: vscode.version, mode: context.extensionMode === vscode.ExtensionMode.Development ? 'development' : 'explicit',
            hostHash: hash('out/extension.js'), mainHash: hash('webview/main.js'), canvasHash: hash('webview/src/InfiniteCanvasSimple.js')});
    }
    const provider = new CanvasEditorProvider(context.extensionUri, diagnostics);
    const registration = vscode.window.registerCustomEditorProvider('infinite-canvas-cinema.canvasEditor', provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
    });
    const newCanvasCommand = vscode.commands.registerCommand('infinite-canvas-cinema.newCanvas', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace to create a new canvas');
            return;
        }
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter canvas file name',
            value: 'untitled.canvas',
            validateInput: (value) => {
                if (!value.endsWith('.canvas')) {
                    return 'File must have .canvas extension';
                }
                return null;
            }
        });
        if (fileName) {
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
            const initialContent = JSON.stringify({
                nodes: [],
                edges: []
            }, null, 2);
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(initialContent));
            await vscode.commands.executeCommand('vscode.open', filePath);
        }
    });
    const setTagCommand = vscode.commands.registerCommand('infinite-canvas-cinema.setTag', async () => {
        const tag = await vscode.window.showInputBox({
            prompt: 'Tag for the selected file node (stored without @)',
            placeHolder: 'character_A_v1',
            validateInput: (value) => {
                const normalized = normalizeTag(value);
                if (!normalized) {
                    return null;
                }
                if (!TAG_CHAR_RE.test(normalized)) {
                    return 'Use only letters, numbers, underscore and hyphen';
                }
                return null;
            }
        });
        if (tag === undefined) {
            return;
        }
        if (!provider.postToActiveWebview({ type: 'setTag', tag: normalizeTag(tag) })) {
            vscode.window.showWarningMessage('Open a canvas to set a tag');
        }
    });
    const copyTagCommand = vscode.commands.registerCommand('infinite-canvas-cinema.copyTag', async () => {
        if (!provider.postToActiveWebview({ type: 'copyTag' })) {
            vscode.window.showWarningMessage('Open a canvas to copy a tag');
        }
    });
    const addImagesCommand = vscode.commands.registerCommand('infinite-canvas-cinema.addImagesToCanvas', async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
        await provider.addImagesToCanvas(uris?.length ? uris : uri ? [uri] : []);
    });
    const exportTagsCommand = vscode.commands.registerCommand('infinite-canvas-cinema.exportTags', async () => {
        const document = provider.getActiveDocument() || getActiveCanvasTextDocument();
        if (!document) {
            vscode.window.showWarningMessage('Open a .canvas file to export tags');
            return;
        }
        await exportTagsForDocument(document);
    });
    context.subscriptions.push(registration, newCanvasCommand, setTagCommand, copyTagCommand, exportTagsCommand, addImagesCommand);
}
export function deactivate(): void { }
function normalizeTag(raw: unknown): string {
    if (!raw) {
        return '';
    }
    return String(raw).replace(/^@+/, '').trim();
}
function toPosixPath(filePath: unknown): string {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
function getActiveCanvasTextDocument(): vscode.TextDocument | undefined {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.fileName.toLowerCase().endsWith('.canvas')) {
        return active;
    }
    return vscode.workspace.textDocuments.find(doc => doc.fileName.toLowerCase().endsWith('.canvas'));
}
function yamlQuote(value: string): string {
    // JSON string quoting is valid YAML and preserves string types.
    return JSON.stringify(value);
}
function catalogToYaml(catalog: TagCatalog): string {
    const tags = Object.keys(catalog);
    if (tags.length === 0) {
        return '{}\n';
    }
    const lines = [];
    for (const tag of tags) {
        const info = catalog[tag];
        lines.push(`${yamlQuote(tag)}:`);
        lines.push(`  path: ${yamlQuote(info.path)}`);
        lines.push(`  canvas: ${yamlQuote(info.canvas)}`);
        lines.push(`  nodeId: ${yamlQuote(info.nodeId)}`);
    }
    return lines.join('\n') + '\n';
}
async function exportTagsForDocument(document: vscode.TextDocument): Promise<void> {
    let data: { nodes?: CanvasFileNode[] };
    try { data = JSON.parse(document.getText() || '{"nodes":[],"edges":[]}'); }
    catch { vscode.window.showErrorMessage('Canvas JSON is invalid; cannot export tags'); return; }
    const catalog: TagCatalog = Object.create(null);
    const canvasRel = toPosixPath(vscode.workspace.asRelativePath(document.uri));
    for (const node of Array.isArray(data?.nodes) ? data.nodes : []) {
        if (node?.type !== 'file') continue;
        const tag = normalizeTag(node.tag);
        if (!tag) continue;
        if (!TAG_CHAR_RE.test(tag) || Object.prototype.hasOwnProperty.call(catalog, tag)) {
            vscode.window.showWarningMessage('Cannot export invalid or duplicate tag: ' + tag);
            return;
        }
        if (typeof node.file !== 'string' || !node.file || typeof node.id !== 'string') {
            vscode.window.showWarningMessage('Tagged file nodes must have a source path and string node ID');
            return;
        }
        catalog[tag] = {path: toPosixPath(node.file), canvas: canvasRel, nodeId: node.id};
    }
    const dir = vscode.Uri.joinPath(document.uri, '..');
    const basename = path.basename(document.uri.fsPath).replace(/\.canvas$/i, '');
    const legacy = vscode.workspace.getConfiguration('infinite-canvas-cinema').get<boolean>('useLegacyTagExportNames', false);
    const exportBase = legacy ? 'tags' : basename + '.tags';
    const jsonUri = vscode.Uri.joinPath(dir, exportBase + '.json');
    const yamlUri = vscode.Uri.joinPath(dir, exportBase + '.yaml');
    let exists = false;
    for (const uri of [jsonUri, yamlUri]) {
        try { await vscode.workspace.fs.stat(uri); exists = true; }
        catch (error) {
            if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
                vscode.window.showErrorMessage('Cannot check tag export destination: ' + String(error));
                return;
            }
        }
    }
    if (exists) {
        const choice = await vscode.window.showWarningMessage('Tag export files already exist. Overwrite both JSON and YAML outputs?', {modal: true}, 'Overwrite');
        if (choice !== 'Overwrite') return;
    }
    try {
        await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8'));
        await vscode.workspace.fs.writeFile(yamlUri, Buffer.from(catalogToYaml(catalog), 'utf8'));
    } catch (error) {
        vscode.window.showErrorMessage('Tag export failed: ' + String(error)); return;
    }
    vscode.window.showInformationMessage('Exported ' + Object.keys(catalog).length + ' tags to ' + vscode.workspace.asRelativePath(jsonUri));
}
class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'infinite-canvas-cinema.canvasEditor';
    private readonly extensionUri: vscode.Uri;
    private webviews: Map<string, { panel: vscode.WebviewPanel; document: vscode.TextDocument }>;
    private lastDocument?: vscode.TextDocument;
    private panelCounter = 0;
    constructor(extensionUri: vscode.Uri, private readonly diagnostics?: DragDiagnostics) {
        this.extensionUri = extensionUri;
        this.webviews = new Map();
    }
    getActiveDocument(): vscode.TextDocument | undefined {
        for (const entry of this.webviews.values()) {
            if (entry.panel.active) {
                return entry.document;
            }
        }
        return this.lastDocument;
    }
    postToActiveWebview(message: Record<string, unknown>): boolean {
        for (const entry of this.webviews.values()) {
            if (entry.panel.active) {
                entry.panel.webview.postMessage(message);
                return true;
            }
        }
        const first = this.webviews.values().next().value;
        if (first) {
            first.panel.webview.postMessage(message);
            return true;
        }
        return false;
    }
    async addImagesToCanvas(uris: vscode.Uri[]): Promise<void> {
        const entries = [...this.webviews.values()];
        let target = entries.find(entry => entry.panel.active);
        if (!target && entries.length === 1) target = entries[0];
        if (!target && entries.length > 1) {
            const selected = await vscode.window.showQuickPick(entries.map(entry => ({
                label: vscode.workspace.asRelativePath(entry.document.uri), entry
            })), { placeHolder: 'Choose the canvas for these images' });
            target = selected?.entry;
        }
        if (!target) {
            if (!entries.length) vscode.window.showWarningMessage('Open a canvas before adding images');
            return;
        }
        const folder = vscode.workspace.getWorkspaceFolder(target.document.uri);
        if (!folder) {
            vscode.window.showWarningMessage('The canvas must belong to a workspace folder');
            return;
        }
        const paths: string[] = [];
        for (const uri of uris) {
            try {
                if (!uri || uri.scheme !== folder.uri.scheme || uri.authority !== folder.uri.authority || !IMAGE_FILE_RE.test(uri.path)) {
                    throw new Error('Select an image in the canvas workspace folder');
                }
                const relative = this.normalizeToRelativePath(uri.fsPath, folder.uri.fsPath);
                const stat = await vscode.workspace.fs.stat(uri);
                if (!(stat.type & vscode.FileType.File)) throw new Error('The selected item is not a file');
                if (!paths.includes(relative)) paths.push(relative);
            } catch (error) {
                vscode.window.showWarningMessage('Could not add image: ' + String(error));
            }
        }
        if (paths.length) {
            if (!target.panel.active) target.panel.reveal(target.panel.viewColumn, false);
            if (!await target.panel.webview.postMessage({type: 'addImagesToCanvas', paths})) {
                vscode.window.showWarningMessage('Could not reach the selected canvas');
            }
        }
    }
    async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        this.lastDocument = document;
        const panelId = ++this.panelCounter;
        const trace = (event: string, fields: Record<string, unknown> = {}) => this.diagnostics?.record(event, {panelId, ...fields});
        trace('host.panel_open', {version: document.version});
        this.webviews.set(document.uri.toString(), { panel: webviewPanel, document });
        const localResourceRoots = [
            vscode.Uri.joinPath(this.extensionUri, 'webview'),
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'src'),
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'public')
        ];
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder) {
            localResourceRoots.push(folder.uri);
        }
        for (const ws of vscode.workspace.workspaceFolders || []) {
            if (!localResourceRoots.some(root => root.toString() === ws.uri.toString())) {
                localResourceRoots.push(ws.uri);
            }
        }
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
        // Serialize document edits and history commands from this panel.
        let documentOperations = Promise.resolve();
        let ownChange: { version: number; content: string } | undefined;
        let lastAcceptedVersion: number | undefined;
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'diagnostic') {
                if (typeof message.event === 'string' && /^webview\.[a-z0-9_.-]+$/.test(message.event)) trace(message.event, message.fields || {});
                return;
            }
            if (message.type === 'save' || message.type === 'undo' || message.type === 'redo') {
                trace('host.operation_queued', {eventType: message.type, saveId: message.saveId, baseVersion: message.baseVersion, version: document.version});
                documentOperations = documentOperations.then(async () => {
                    if (message.type === 'save') {
                        if (message.baseVersion !== document.version && document.version !== lastAcceptedVersion) {
                            trace('host.save_conflict', {saveId: message.saveId, baseVersion: message.baseVersion, version: document.version});
                            await this.recoverCanvas(message.content);
                            webviewPanel.webview.postMessage({ type: 'loadContent', content: document.getText(), version: document.version, afterSaveId: message.saveId });
                            return;
                        }
                        if (document.getText() !== message.content) {
                            const expectedVersion = document.version + 1;
                            ownChange = { version: expectedVersion, content: message.content };
                            try {
                                await this.saveDocument(document, message.content);
                            } finally {
                                ownChange = undefined;
                            }
                            if (document.version !== expectedVersion || document.getText() !== message.content) {
                                lastAcceptedVersion = undefined;
                                return;
                            }
                        }
                        lastAcceptedVersion = document.version;
                        trace('host.save_ack', {saveId: message.saveId, version: document.version});
                        webviewPanel.webview.postMessage({ type: 'saveAcknowledged', version: document.version });
                    } else {
                        if (!webviewPanel.active) throw new Error('Canvas is no longer the active editor');
                        await vscode.commands.executeCommand(message.type);
                        lastAcceptedVersion = undefined;
                    }
                }).catch(async error => {
                    lastAcceptedVersion = undefined;
                    trace('host.operation_error', {eventType: message.type, saveId: message.saveId, errorName: error instanceof Error ? error.name : 'unknown', errorMessage: error instanceof Error ? error.message : undefined});
                    console.error('Canvas document operation failed:', error);
                    vscode.window.showErrorMessage('Canvas document operation failed: ' + String(error));
                    if (message.type === 'save') {
                        try {
                            await this.recoverCanvas(message.content);
                        } catch (recoveryError) {
                            console.error('Canvas recovery failed:', recoveryError);
                            vscode.window.showErrorMessage('Could not open the canvas recovery snapshot: ' + String(recoveryError));
                            return;
                        }
                    }
                    webviewPanel.webview.postMessage({ type: 'loadContent', content: document.getText(), version: document.version, afterSaveId: message.type === 'save' ? message.saveId : undefined });
                });
                return;
            }
            switch (message.type) {
                case 'recoverCanvas':
                    await this.recoverCanvas(message.content);
                    break;
                case 'ready':
                    trace('host.ready', {version: document.version});
                    webviewPanel.webview.postMessage({
                        type: 'loadContent',
                        content: document.getText(),
                        version: document.version
                    });
                    break;
                case 'loadFile':
                    await this.loadFileContent(webviewPanel, message.filePath, message.nodeId, document);
                    break;
                case 'resolveDroppedImage':
                    trace('host.lookup_request', {eventId: message.eventId, requestId: message.requestId, revision: message.revision, fileSizes: [message.size]});
                    await this.resolveDroppedImage(webviewPanel, document, message, trace);
                    break;
                case 'resolveResourceUri':
                    await this.resolveResourceUri(webviewPanel, message.filePath, message.nodeId, document);
                    break;
                case 'saveFile':
                    await this.saveFileContent(message.filePath, message.content, webviewPanel, message.nodeId, document);
                    break;
                case 'createFile':
                    await this.createFile(message.filePath, message.content, webviewPanel, document);
                    break;
                case 'copyToClipboard':
                    await vscode.env.clipboard.writeText(message.text || '');
                    if (message.text) {
                        vscode.window.showInformationMessage(`Copied ${message.text}`);
                    }
                    break;
                case 'showWarning':
                    vscode.window.showWarningMessage(String(message.text || 'Warning'));
                    break;
                case 'showInfo':
                    vscode.window.showInformationMessage(String(message.text || ''));
                    break;
                case 'getGroqApiKey': {
                    const groqApiKey = await this.getGroqApiKey();
                    if (groqApiKey) {
                        webviewPanel.webview.postMessage({
                            type: 'groqApiKey',
                            apiKey: groqApiKey
                        });
                    }
                    break;
                }
            }
        });
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                if (ownChange && !e.reason && e.document.version === ownChange.version && e.document.getText() === ownChange.content) {
                    trace('host.own_change', {version: e.document.version});
                    return;
                }
                trace('host.document_update', {version: e.document.version, reason: e.reason === undefined ? 'external' : e.reason === vscode.TextDocumentChangeReason.Undo ? 'undo' : 'redo'});
                lastAcceptedVersion = undefined;
                webviewPanel.webview.postMessage({
                    type: 'loadContent',
                    content: document.getText(),
                    version: document.version
                });
            }
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            this.webviews.delete(document.uri.toString());
        });
    }
    private async recoverCanvas(content: string): Promise<void> {
        const recovery = await vscode.workspace.openTextDocument({ content, language: 'json' });
        await vscode.window.showTextDocument(recovery, { preview: false });
        vscode.window.showWarningMessage('A canvas change conflicted with a document update. Its unsaved state is open in a separate editor for recovery.');
    }
    private async saveDocument(document: vscode.TextDocument, content: string): Promise<void> {
        if (document.getText() === content) return;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the canvas edit');
    }
    private workspaceFolderFor(document: vscode.TextDocument): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(document.uri) || vscode.workspace.workspaceFolders?.[0];
    }
    private async loadFileContent(webviewPanel: vscode.WebviewPanel, filePath: string, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            if (IMAGE_FILE_RE.test(filePath || '')) {
                await this.resolveResourceUri(webviewPanel, filePath, nodeId, document);
                return;
            }
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');
            webviewPanel.webview.postMessage({
                type: 'fileContentLoaded',
                nodeId: nodeId,
                content: content,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error loading file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId: nodeId,
                error: `Failed to load file: ${filePath}`
            });
        }
    }
    private async resolveDroppedImage(panel: vscode.WebviewPanel, document: vscode.TextDocument, message: {
        name: string; size: number; sha256: string; x: number; y: number; revision: number; requestId?: number; eventId?: number;
    }, trace: (event: string, fields?: Record<string, unknown>) => void = () => {}): Promise<void> {
        try {
            const folder = this.workspaceFolderFor(document);
            if (!folder) throw new Error('No workspace folder found');
            if (typeof message.name !== 'string' || /[\\/]/.test(message.name) || !IMAGE_FILE_RE.test(message.name) ||
                !Number.isSafeInteger(message.size) || message.size < 0 || !/^[a-f0-9]{64}$/.test(message.sha256)) {
                throw new Error('Invalid dropped image details');
            }
            // Metacharacters require a broad search followed by an exact basename check.
            const safeName = /^[A-Za-z0-9 _.-]+$/.test(message.name);
            const pattern = new vscode.RelativePattern(folder, safeName ? `**/${message.name}` : '**/*');
            const candidates = await vscode.workspace.findFiles(pattern, null);
            const matches: { label: string; uri: vscode.Uri }[] = [];
            for (const uri of candidates) {
                if (path.basename(uri.fsPath) !== message.name) continue;
                const relative = this.normalizeToRelativePath(uri.fsPath, folder.uri.fsPath);
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.size !== message.size || !(stat.type & vscode.FileType.File)) continue;
                const bytes = await vscode.workspace.fs.readFile(uri);
                if (createHash('sha256').update(bytes).digest('hex') === message.sha256) {
                    matches.push({label: relative, uri});
                    trace('host.lookup_candidate', {eventId: message.eventId, requestId: message.requestId, relativePath: relative});
                }
            }
            trace('host.lookup_matches', {eventId: message.eventId, requestId: message.requestId, candidateCount: candidates.length, matchCount: matches.length});
            if (!matches.length) throw new Error('No matching image was found in the canvas workspace');
            const selected = matches.length === 1 ? matches[0] : await vscode.window.showQuickPick(matches, {
                placeHolder: 'Choose the image to reference on the canvas'
            });
            trace('host.lookup_result', {eventId: message.eventId, requestId: message.requestId, selected: Boolean(selected), relativePath: selected?.label});
            if (!selected) return;
            panel.webview.postMessage({type: 'droppedImageResolved', filePath: selected.label, x: message.x, y: message.y, revision: message.revision, requestId: message.requestId, eventId: message.eventId});
        } catch (error) {
            trace('host.lookup_error', {eventId: message.eventId, requestId: message.requestId, errorName: error instanceof Error ? error.name : 'unknown', errorCode: error instanceof Error && 'code' in error ? error.code : undefined, errorMessage: error instanceof Error ? error.message : undefined, reason: error instanceof Error && error.message === 'No matching image was found in the canvas workspace' ? 'no_match' : error instanceof Error && error.message === 'Invalid dropped image details' ? 'invalid_details' : error instanceof Error && error.message === 'No workspace folder found' ? 'no_workspace' : 'other'});
            console.error('Failed to resolve dropped image:', error);
            vscode.window.showWarningMessage('Could not add the dropped image: ' + String(error));
        }
    }
    private async resolveResourceUri(webviewPanel: vscode.WebviewPanel, filePath: string, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            await vscode.workspace.fs.stat(fileUri);
            const uri = webviewPanel.webview.asWebviewUri(fileUri).toString();
            webviewPanel.webview.postMessage({
                type: 'resourceUriResolved',
                nodeId,
                uri,
                filePath: normalizedPath
            });
        }
        catch (error) {
            console.error('Error resolving resource URI:', error);
            webviewPanel.webview.postMessage({
                type: 'resourceUriResolved',
                nodeId,
                missing: true,
                filePath
            });
        }
    }
    private normalizeToRelativePath(filePath: string, workspacePath: string): string {
        const input = filePath.startsWith('file:') ? vscode.Uri.parse(filePath).fsPath : filePath;
        const absolute = path.resolve(workspacePath, input);
        const relative = path.relative(workspacePath, absolute);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            throw new Error('Image and file references must be inside the canvas workspace folder');
        }
        return toPosixPath(relative);
    }
    private async saveFileContent(filePath: string, content: string, webviewPanel: vscode.WebviewPanel, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const fileContent = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, fileContent);
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            webviewPanel.webview.postMessage({
                type: 'fileContentSaved',
                nodeId: nodeId,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error saving file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId: nodeId,
                error: `Failed to save file: ${filePath}`
            });
        }
    }
    private async createFile(filePath: string, content: string, webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument): Promise<void> {
        try {
            // Image drops must never copy/rename the source file.
            if (IMAGE_FILE_RE.test(filePath || '')) {
                console.log('Skipping createFile for image path (R1):', filePath);
                return;
            }
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try {
                await vscode.workspace.fs.stat(dirUri);
            }
            catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
            const fileContent = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, fileContent);
            console.log('✅ File created successfully:', normalizedPath);
        }
        catch (error) {
            console.error('Error creating file:', error);
            vscode.window.showErrorMessage(`Failed to create file: ${filePath}`);
        }
    }
    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'webview');
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'style.css'));
        const nonce = this.getNonce();
        const workspaceRoot = JSON.stringify(this.workspaceFolderFor(document)?.uri.fsPath || '').replace(/</g, '\\u003c');
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline'; connect-src https:; img-src ${webview.cspSource} https: data: vscode-file: vscode-webview:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Infinite Canvas</title>
    
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            background: #1e1e1e;
        }
        
        #canvas-container {
            width: 100%;
            height: 100%;
            position: relative;
        }
        
        canvas {
            display: block;
            cursor: grab;
            background: #1e1e1e;
        }
        
        canvas:active {
            cursor: grabbing;
        }
    </style>
</head>
<body>
    <div id="canvas-container">
        <canvas id="canvas"></canvas>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        window.workspaceRoot = ${workspaceRoot};
        
        window.vsCodeAPI = {
            postMessage: (message) => vscode.postMessage(message),
            setState: (state) => vscode.setState(state),
            getState: () => vscode.getState()
        };

        ${this.diagnostics ? `
        window.canvasDiagnostics = (event, fields = {}) => {
            try { vscode.postMessage({type: 'diagnostic', event, fields}); } catch (_) { /* diagnostics must not affect editing */ }
        };
        window.canvasDiagnostics('webview.bootstrap', {available: true});
        const dragEvents = new WeakMap();
        let nextDragEvent = 0;
        window.canvasDropEventId = event => {
            if (!dragEvents.has(event)) dragEvents.set(event, ++nextDragEvent);
            return dragEvents.get(event);
        };
        window.addEventListener('error', event => {
            const file = String(event.filename || event.target?.src || '').split('?')[0].split('/').pop();
            const source = ['main.js', 'InfiniteCanvasSimple.js'].includes(file) ? file : 'unknown';
            const message = String(event.message || '');
            const errorMessage = ['Cannot read properties', 'is not defined', 'is not a function', 'Unexpected token',
                'Failed to fetch dynamically imported module', 'Failed to load module script'].find(part => message.includes(part));
            window.canvasDiagnostics('webview.script_error', {target: event.target?.tagName || 'window',
                errorName: event.error?.name || 'resource_error', errorMessage, source, line: event.lineno, column: event.colno});
        }, true);
        window.addEventListener('unhandledrejection', event => window.canvasDiagnostics('webview.promise_error', {
            errorName: event.reason?.name || 'unknown'
        }));
        for (const [scope, surface] of [['window', window], ['document', document]]) {
            let lastOver = 0;
            for (const name of ['dragenter', 'dragover', 'drop', 'canvas-diagnostic-probe']) {
                const eventType = name === 'canvas-diagnostic-probe' ? 'diagnostic_probe' : name;
                surface.addEventListener(name, event => {
                    if (eventType === 'dragover' && Date.now() - lastOver < 750) return;
                    if (eventType === 'dragover') lastOver = Date.now();
                    window.canvasDiagnostics('webview.capture_entry', {scope, eventType});
                    try {
                        const transfer = event.dataTransfer;
                        const files = transfer ? Array.from(transfer.files || []) : [];
                        const items = transfer ? Array.from(transfer.items || []) : [];
                        const types = transfer ? Array.from(transfer.types || []).slice(0, 20) : [];
                        const typeLengths = eventType === 'drop' ? types.map(type => {
                            try { return type + ':' + transfer.getData(type).length; } catch (_) { return type + ':error'; }
                        }) : [];
                        window.canvasDiagnostics('webview.capture', {
                            scope, eventType, eventId: window.canvasDropEventId(event), target: event.target?.id === 'canvas' ? 'canvas' : (event.target?.tagName || 'other'),
                            shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey,
                            defaultPrevented: event.defaultPrevented, effectAllowed: transfer?.effectAllowed,
                            dropEffect: transfer?.dropEffect, types, typeLengths,
                            itemCount: items.length, itemTypes: items.map(item => item.type), itemKinds: items.map(item => item.kind), fileCount: files.length,
                            fileTypes: files.map(file => file.type), fileSizes: files.map(file => file.size),
                            fileNameLengths: files.map(file => file.name.length), filePathFlags: files.map(file => Boolean(file.path)),
                            x: event.clientX, y: event.clientY
                        });
                    } catch (error) {
                        window.canvasDiagnostics('webview.capture_error', {scope, eventType, errorName: error?.name || 'unknown'});
                    }
                }, true);
            }
        }
        window.canvasDiagnostics('webview.capture_listeners_ready', {available: true});
        try { document.dispatchEvent(new Event('canvas-diagnostic-probe', {bubbles: true})); }
        catch (error) { window.canvasDiagnostics('webview.probe_error', {errorName: error?.name || 'unknown'}); }
        ` : ''}
        
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'loadContent':
                    if (window.loadCanvasContent) {
                        window.loadCanvasContent(message.content, message.version, message.afterSaveId);
                    }
                    break;
            }
        });
        
    </script>
    
    <script nonce="${nonce}" type="module" src="${mainScriptUri}"></script>
</body>
</html>`;
    }
    private async getGroqApiKey(): Promise<string | null> {
        try {
            const config = vscode.workspace.getConfiguration('infinite-canvas-cinema');
            const configApiKey = config.get<string>('groqApiKey');
            if (configApiKey && configApiKey.trim()) {
                return configApiKey.trim();
            }
            const envApiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
            if (envApiKey && envApiKey.trim()) {
                return envApiKey.trim();
            }
            return null;
        }
        catch (error) {
            console.error('Error getting Groq API key:', error);
            return null;
        }
    }
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
