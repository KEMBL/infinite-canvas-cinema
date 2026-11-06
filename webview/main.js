// VS Code Infinite Canvas - Main Entry Point
// Simplified version that integrates with VS Code extension

import { InfiniteCanvas } from './src/InfiniteCanvasSimple.js';

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
            this.dirty = true;
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
        if (!this.dirty || this.documentVersion === undefined) return;
        this.dirty = false;
        this.saveToVSCode();
    }

    saveToVSCode() {
        if (!this.canvas || !this.canvas.canvasState) return;
        
        try {
            const canvasData = this.canvas.canvasState.exportCanvasData();
            const content = JSON.stringify(canvasData, null, 2);
            
            if (window.vsCodeAPI) {
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
            return;
        }
        
        if (afterSaveId !== undefined && afterSaveId < this.lastSaveId) return;
        if (this.documentVersion !== undefined && version < this.documentVersion) return;
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
            console.log('✅ Loaded canvas content from VS Code');
        } catch (error) {
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
            window.canvasApp.documentVersion = Math.max(window.canvasApp.documentVersion ?? 0, message.version);
            if (!window.canvasApp.isUserInteracting) window.canvasApp.flushSave();
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
