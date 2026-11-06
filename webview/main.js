// VS Code Infinite Canvas - Main Entry Point
// Simplified version that integrates with VS Code extension

import { InfiniteCanvas } from './src/InfiniteCanvasSimple.js';

window.canvasDiagnostics?.('webview.module_ready', {available: true});

class VSCodeCanvasApp {
    constructor() {
        this.canvas = null;
        this.isInitialized = false;
        this.pendingContent = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('🎨 Initializing VS Code Canvas App');
        
        // Check if canvas element exists
        const canvasElement = document.getElementById('canvas');
        console.log('📍 Canvas element found:', canvasElement);
        
        if (!canvasElement) {
            console.error('❌ Canvas element not found! Check HTML');
            return;
        }
        
        try {
            // Initialize the canvas
            this.canvas = new InfiniteCanvas('canvas');
            this.isInitialized = true;
            window.canvasDiagnostics?.('webview.canvas_ready', {initialized: true});
            
            console.log('🎯 Canvas object created:', this.canvas);
            
            // Set up VS Code integration
            this.setupVSCodeIntegration();
            
            // Load any pending content
            if (this.pendingContent) {
                this.loadCanvasContent(this.pendingContent.content, this.pendingContent.version);
                this.pendingContent = null;
            }
            
            console.log('✅ Canvas app initialized successfully');
            
            // Test interaction
            console.log('📝 Canvas ready for interaction - try double-clicking!');
            
        } catch (error) {
            console.error('❌ Error initializing canvas:', error);
        }
    }

    setupVSCodeIntegration() {
        if (!this.canvas || !this.canvas.canvasState) return;
        this.isUserInteracting = false;
        this.dirty = false;
        this.documentVersion = undefined;
        this.saveTimer = null;
        this.lastSaveId = 0;
        const inputHandler = this.canvas.inputHandler;
        if (inputHandler) {
            const down = inputHandler.handleMouseDown.bind(inputHandler);
            const up = inputHandler.handleMouseUp.bind(inputHandler);
            inputHandler.handleMouseDown = e => {
                this.isUserInteracting = true;
                return down(e);
            };
            inputHandler.handleMouseUp = e => {
                const result = up(e);
                this.finishInteraction();
                return result;
            };
            this.canvas.canvas.addEventListener('mouseleave', () => this.finishInteraction());
            window.addEventListener('blur', () => this.finishInteraction());
        }
        const renderOnChange = this.canvas.canvasState.onStateChange;
        this.canvas.canvasState.onStateChange = () => {
            renderOnChange?.();
            inputHandler?.invalidatePendingDrops?.();
            this.dirty = true;
            window.canvasDiagnostics?.('webview.state_dirty', {dirty: true, interacting: this.isUserInteracting});
            clearTimeout(this.saveTimer);
            if (!this.isUserInteracting) {
                this.saveTimer = setTimeout(() => this.flushSave(), 500);
            }
        };
        this.canvas.canvasState.requestSaveNow = () => {
            this.canvas.canvasState.notifyStateChange();
            if (!this.isUserInteracting) this.flushSave();
        };
        document.addEventListener('keydown', e => {
            const target = e.target;
            if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey) ||
                (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))) return;
            const key = e.key.toLowerCase();
            const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
            if (key !== 'z' && !redo) return;
            e.preventDefault();
            inputHandler?.invalidatePendingDrops?.();
            this.finishInteraction();
            this.flushSave();
            window.vsCodeAPI?.postMessage({ type: redo ? 'redo' : 'undo' });
        });
    }

    finishInteraction() {
        this.isUserInteracting = false;
        this.flushSave();
    }

    flushSave() {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (!this.dirty || this.documentVersion === undefined) {
            window.canvasDiagnostics?.('webview.save_deferred', {dirty: this.dirty, reason: this.documentVersion === undefined ? 'no_version' : 'clean'});
            return;
        }
        this.dirty = false;
        this.saveToVSCode();
    }

    saveToVSCode() {
        if (!this.canvas || !this.canvas.canvasState) return;
        
        try {
            const canvasData = this.canvas.canvasState.exportCanvasData();
            const content = JSON.stringify(canvasData, null, 2);
            
            if (window.vsCodeAPI) {
                window.canvasDiagnostics?.('webview.save_post', {saveId: this.lastSaveId + 1, baseVersion: this.documentVersion, nodeCount: canvasData.nodes.length});
                window.vsCodeAPI.postMessage({
                    type: 'save',
                    content: content,
                    baseVersion: this.documentVersion,
                    saveId: ++this.lastSaveId
                });
            }
        } catch (error) {
            console.error('❌ Error saving to VS Code:', error);
        }
    }

    loadCanvasContent(content, version, afterSaveId) {
        if (!this.isInitialized) {
            // Store content to load after initialization
            this.pendingContent = { content, version };
            window.canvasDiagnostics?.('webview.load_pending', {version});
            return;
        }
        
        if (afterSaveId !== undefined && afterSaveId < this.lastSaveId) { window.canvasDiagnostics?.('webview.load_ignored', {reason: 'superseded', afterSaveId, saveId: this.lastSaveId}); return; }
        if (this.documentVersion !== undefined && version < this.documentVersion) { window.canvasDiagnostics?.('webview.load_ignored', {reason: 'old_version', version}); return; }
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        const editor = this.canvas.inputHandler?.activeCanvasEditor;
        const recovery = (this.dirty || editor) ? this.canvas.canvasState.exportCanvasData() : null;
        const editorChanged = editor ? editor.capture(recovery) : false;
        if (editor) {
            this.canvas.inputHandler.activeCanvasEditor = null;
            editor.close();
        }
        if (this.dirty || editorChanged) {
            window.vsCodeAPI?.postMessage({ type: 'recoverCanvas', content: JSON.stringify(recovery, null, 2) });
        }
        this.dirty = false;
        this.isUserInteracting = false;
        this.canvas.inputHandler?.invalidatePendingDrops?.();
        this.canvas.inputHandler?.resetDragState();
        this.documentVersion = version;

        try {
            const canvasData = content && content.trim() ? JSON.parse(content) : { nodes: [], edges: [] };
            const originalOnStateChange = this.canvas.canvasState.onStateChange;
            this.canvas.canvasState.onStateChange = null;
            try {
                this.canvas.canvasState.loadCanvasData(canvasData);
            } finally {
                this.canvas.canvasState.onStateChange = originalOnStateChange;
            }
            this.canvas.requestRender?.();
            window.canvasDiagnostics?.('webview.load_applied', {version, nodeCount: canvasData.nodes?.length || 0});
            console.log('✅ Loaded canvas content from VS Code');
        } catch (error) {
            window.canvasDiagnostics?.('webview.load_error', {version, errorName: error?.name || 'unknown'});
            console.error('❌ Error loading canvas content:', error);
            // Start with empty canvas on error
        }
    }

}

// Make loadCanvasContent globally available for the extension
window.loadCanvasContent = (content, version, afterSaveId) => {
    if (window.canvasApp) {
        window.canvasApp.loadCanvasContent(content, version, afterSaveId);
    }
};

// Handle file-related messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    if (!window.canvasApp || !window.canvasApp.canvas) return;
    
    const canvasState = window.canvasApp.canvas.canvasState;
    if (!canvasState) return;
    
    switch (message.type) {
        case 'saveAcknowledged':
            window.canvasDiagnostics?.('webview.save_ack', {version: message.version});
            window.canvasApp.documentVersion = Math.max(window.canvasApp.documentVersion ?? 0, message.version);
            if (!window.canvasApp.isUserInteracting) window.canvasApp.flushSave();
            break;
        case 'addImagesToCanvas': {
            const handler = window.canvasApp.canvas.inputHandler;
            const canvas = window.canvasApp.canvas.canvas;
            const pending = handler.pendingCanvasAdds ||= new Set();
            let observer;
            let cancelled = false;
            const cancel = () => {
                cancelled = true;
                observer?.disconnect();
                pending.delete(cancel);
            };
            pending.add(cancel);
            const addWhenVisible = () => {
                if (cancelled || !canvas.clientWidth || !canvas.clientHeight) return false;
                pending.delete(cancel);
                observer?.disconnect();
                const x = (canvas.clientWidth / 2 - canvasState.offsetX) / canvasState.scale;
                const y = (canvas.clientHeight / 2 - canvasState.offsetY) / canvasState.scale;
                handler.acceptingCanvasAdd = true;
                try {
                    message.paths.forEach((filePath, index) => handler.createFileNodeFromPath(filePath, x + index * 40, y + index * 40));
                } finally {
                    handler.acceptingCanvasAdd = false;
                }
                return true;
            };
            requestAnimationFrame(() => {
                if (cancelled || addWhenVisible()) return;
                observer = new ResizeObserver(() => {
                    if (!cancelled) addWhenVisible();
                });
                observer.observe(canvas);
            });
            break;
        }
        case 'droppedImageResolved':
            window.canvasApp.canvas.inputHandler?.acceptResolvedDrop(message);
            break;
        case 'fileContentLoaded':
            canvasState.updateFileContent(
                message.nodeId, 
                message.content, 
                message.lastModified
            );
            if (canvasState.requestRender) {
                canvasState.requestRender();
            }
            break;
        case 'fileContentSaved':
            console.log('✅ File saved successfully:', message.nodeId);
            break;
        case 'fileContentError':
            console.error('❌ File operation error:', message.error);
            canvasState.updateFileContent(
                message.nodeId, 
                message.error, 
                null
            );
            break;
        case 'resourceUriResolved':
            canvasState.setImageUri(message.nodeId, message.uri, Boolean(message.missing));
            break;
        case 'setTag':
            if (window.canvasApp.canvas.inputHandler) {
                window.canvasApp.canvas.inputHandler.applyCommandSetTag(message.tag);
            }
            break;
        case 'copyTag':
            if (window.canvasApp.canvas.inputHandler) {
                window.canvasApp.canvas.inputHandler.applyCommandCopyTag();
            }
            break;
    }
});

// Initialize the app
window.canvasApp = new VSCodeCanvasApp();
// Request content after the module has registered its load handler.
window.vsCodeAPI?.postMessage({ type: 'ready' });
