const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const assert=require('node:assert/strict'), crypto=require('node:crypto');
const sent=[];
const ui=vm.createContext({URL,crypto:crypto.webcrypto,Uint8Array,console:{log(){},warn(){},error(){}},setTimeout(){},window:{workspaceRoot:'C:/workspace',vsCodeAPI:{postMessage:m=>sent.push(m)}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../webview/src/InfiniteCanvasSimple.js'),'utf8').replace('export class InfiniteCanvas','class InfiniteCanvas')+'\nglobalThis.audit={CanvasState,InputHandler};',ui);
const {CanvasState,InputHandler}=ui.audit;
const state=new CanvasState(); state.offsetX=10;state.offsetY=20;state.scale=2;
const handler=Object.create(InputHandler.prototype); handler.canvasState=state;
handler.canvas={getBoundingClientRect:()=>({left:100,top:200})};
function drop(file, text='') {handler.handleDrop({preventDefault(){},clientX:170,clientY:300,shiftKey:true,dataTransfer:{getData:type=>type==='text/plain'?text:'',files:[file]}});}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
  const bytes=Buffer.from('an image');
  const file={name:'cat.png',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  drop(file); for(let i=0;i<8;i++)await tick();
  let request=sent.find(m=>m.type==='resolveDroppedImage');
  assert.ok(request);assert.equal(request.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(request.x,30);assert.equal(request.y,40);assert.equal(state.nodes.length,0);
  handler.acceptResolvedDrop({...request,filePath:'assets/cat.png'});
  assert.equal(state.nodes[0].file,'assets/cat.png');assert.equal(state.nodes[0].tag,'cat');
  assert.equal(state.nodes[0].x,30);assert.equal(state.nodes[0].y,40);
  handler.createFileNodeFromPath('assets/cat.png',10,10);
  assert.equal(state.nodes[1].tag,undefined);assert.ok(sent.some(m=>m.type==='showWarning'&&m.text.includes('already used')));
  assert.throws(()=>handler.convertToRelativePath('file://other-host/C:/workspace/cat.png'));
  assert.throws(()=>handler.convertToRelativePath('https://example.test/cat.png'));
  sent.length=0; handler.dropRevision=0;drop(file);for(let i=0;i<8;i++)await tick();
  request=sent.find(m=>m.type==='resolveDroppedImage');handler.invalidatePendingDrops();
  handler.acceptResolvedDrop({...request,filePath:'assets/cat.png'});
  assert.equal(state.nodes.length,2);assert.ok(sent.some(m=>m.type==='showWarning'&&m.text.includes('changed')));
  // Valid stems are exact tags, including repeated and edge underscores.
  const exactState=new CanvasState(), exactHandler=Object.create(InputHandler.prototype);
  exactHandler.canvasState=exactState; sent.length=0;
  const exact=exactHandler.createFileNodeFromPath('assets/_cat__v1_.png',1,2);
  assert.equal(exact.tag,'_cat__v1_');
  assert.equal(sent.some(m=>m.type==='showWarning'),false);
  const duplicate=exactHandler.createFileNodeFromPath('assets/_cat__v1_.png',1,2);
  assert.equal(duplicate.tag,undefined);
  assert.ok(sent.some(m=>m.type==='showWarning' && m.text.includes('already used')));
  const spaces=exactHandler.createFileNodeFromPath('assets/hello cat.png',1,2);
  assert.equal(spaces.tag,'hello_cat');
  const cyrillic=exactHandler.createFileNodeFromPath('assets/кот.png',1,2);
  assert.equal(cyrillic.tag,undefined);
  assert.ok(sent.some(m=>m.type==='showWarning' && m.text.includes('no tag')));
  // Two pathless files in a single drop survive either resolution order.
  for (const reverse of [false,true]) {
    const batchState=new CanvasState(), batchHandler=Object.create(InputHandler.prototype);
    batchHandler.canvasState=batchState; batchHandler.canvas=handler.canvas;
    batchState.onStateChange=()=>batchHandler.invalidatePendingDrops();
    sent.length=0;
    const other={name:'dog.png',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
    batchHandler.handleDrop({preventDefault(){},clientX:170,clientY:300,shiftKey:true,
      dataTransfer:{getData(){return '';},files:[file,other]}});
    for(let i=0;i<8;i++) await tick();
    const requests=sent.filter(m=>m.type==='resolveDroppedImage');assert.equal(requests.length,2);
    if(reverse) requests.reverse();
    for(const item of requests) batchHandler.acceptResolvedDrop({...item,filePath:`assets/${item.name}`});
    assert.deepEqual(Array.from(batchState.nodes,n=>n.file).sort(),['assets/cat.png','assets/dog.png']);
  }
  console.log('Pathless image drop and tag checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
