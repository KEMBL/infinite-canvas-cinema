const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../webview/main.js'), 'utf8')
  .replace("import { InfiniteCanvas } from './src/InfiniteCanvasSimple.js';", '')
  .replace(/\/\/ Initialize the app[\s\S]*$/, 'globalThis.VSCodeCanvasApp = VSCodeCanvasApp;');
const sent = [], keys = [], canvasListeners = {}, windowListeners = {};
let nextTimer = 0; const timers = new Map();
const context = vm.createContext({console: {log() {}, error() {}},
  setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); },
  document: {readyState:'loading', addEventListener(type, fn) { if (type === 'keydown') keys.push(fn); }},
  window: {vsCodeAPI: {postMessage(message) { sent.push(message); }}, addEventListener(type, fn) {windowListeners[type] = fn;}}
});
vm.runInContext(source, context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../webview/src/InfiniteCanvasSimple.js'), 'utf8')
  .replace('export class InfiniteCanvas', 'class InfiniteCanvas') + '\nglobalThis.CanvasState = CanvasState; globalThis.InputHandler = InputHandler;', context);
const app = new context.VSCodeCanvasApp();
let data = {nodes:[{id:'a',x:0}],edges:[]}, renders = 0;
app.canvas = {canvas:{addEventListener(type, fn) {canvasListeners[type] = fn;}},
  canvasState:{onStateChange() {renders++;}, exportCanvasData() {return data;}, loadCanvasData(next) {data = next;},
    notifyStateChange: context.CanvasState.prototype.notifyStateChange, saveCanvasState: context.CanvasState.prototype.saveCanvasState},
  inputHandler:{handleMouseDown(){}, handleMouseUp(){}, resetDragState(){}}, requestRender(){renders++;}};
app.isInitialized = true;
app.setupVSCodeIntegration();
app.loadCanvasContent(JSON.stringify(data), 1);
// An immediate text edit before any prior canvas save must carry the loaded version.
data.nodes[0].x = 5;
app.canvas.canvasState.saveCanvasState();
assert.equal(sent.length, 1);
assert.equal(sent[0].type, 'save');
assert.equal(sent[0].baseVersion, 1);
assert.equal(JSON.parse(sent[0].content).nodes[0].x, 5);
sent.length = 0;
function key(key, options = {}) {
  const e = {key, ctrlKey:true, metaKey:false, altKey:false, shiftKey:false, target:{tagName:'CANVAS'},
    preventDefault() {this.defaultPrevented = true;}, ...options};
  for (const fn of keys) fn(e);
  return e;
}
app.canvas.inputHandler.handleMouseDown({});
data.nodes[0].x = 50; app.canvas.canvasState.onStateChange();
assert.equal(sent.length, 0);
assert.equal(key('z').defaultPrevented, true);
assert.deepEqual(sent.map(x => x.type), ['save','undo']);
assert.equal(JSON.parse(sent[0].content).nodes[0].x, 50);
key('z'); key('z', {shiftKey:true}); key('y');
assert.deepEqual(sent.map(x => x.type), ['save','undo','undo','redo','redo']);
for (const target of [{tagName:'INPUT'}, {tagName:'TEXTAREA'}, {tagName:'DIV',isContentEditable:true}]) {
  const event = key('z', {target}); assert.equal(event.defaultPrevented, undefined);
}
assert.equal(sent.length, 5);
app.loadCanvasContent(JSON.stringify({nodes:[{id:'a',x:0}],edges:[]}), 2);
assert.equal(data.nodes[0].x, 0); assert.ok(renders > 0);
for (const callback of timers.values()) callback();
assert.equal(sent.length, 5);
app.canvas.inputHandler.handleMouseDown({}); data.nodes[0].x = 70; app.canvas.canvasState.onStateChange();
canvasListeners.mouseleave();
assert.equal(sent.at(-1).type, 'save');
app.canvas.inputHandler.handleMouseDown({}); data.nodes[0].x = 80; app.canvas.canvasState.onStateChange();
windowListeners.blur();
assert.equal(sent.at(-1).type, 'save');
// An earlier save acknowledgement arriving during a new drag must not split it.
app.canvas.inputHandler.handleMouseDown({}); data.nodes[0].x = 90; app.canvas.canvasState.onStateChange();
const beforeAck = sent.length;
context.window.canvasApp = app;
windowListeners.message({data:{type:'saveAcknowledged',version:3}});
assert.equal(sent.length, beforeAck);
data.nodes[0].x = 100; app.canvas.canvasState.onStateChange();
app.canvas.inputHandler.handleMouseUp({});
assert.equal(sent.length, beforeAck + 1);
assert.equal(JSON.parse(sent.at(-1).content).nodes[0].x, 100);
assert.equal(sent.at(-1).baseVersion, 3);
// Open a real node editor, change its DOM value, then deliver an external update.
const elements = new Set();
context.document.body = {appendChild(el) {elements.add(el);}, contains(el) {return elements.has(el);}, removeChild(el) {elements.delete(el);}};
context.document.createElement = () => ({dataset:{}, style:{}, listeners:{}, value:'', scrollHeight:20,
  focus(){}, select(){}, addEventListener(type, fn) {this.listeners[type] = fn;}, remove(){elements.delete(this);}});
const node = {id:'a',text:'old',x:0,y:0,width:200,height:100};
data = {nodes:[node],edges:[]};
const handler = Object.create(context.InputHandler.prototype);
handler.canvas = {style:{}, getBoundingClientRect(){return {left:0,top:0};}};
handler.canvasState = app.canvas.canvasState;
Object.assign(handler.canvasState, {scale:1,offsetX:0,offsetY:0});
app.canvas.inputHandler = handler;
handler.editNodeText(node);
const editor = [...elements][0]; editor.value = 'unsaved text';
const beforeRecovery = sent.length;
app.loadCanvasContent(JSON.stringify({nodes:[{id:'a',text:'external'}],edges:[]}), 4);
assert.equal(sent.length, beforeRecovery + 1);
assert.equal(sent.at(-1).type, 'recoverCanvas');
assert.equal(JSON.parse(sent.at(-1).content).nodes[0].text, 'unsaved text');
assert.equal(data.nodes[0].text, 'external');
assert.equal(elements.has(editor), false);
editor.listeners.blur();
assert.equal(sent.length, beforeRecovery + 1);
assert.equal(data.nodes[0].text, 'external');
console.log('Canvas history shortcut and synchronization checks passed');

