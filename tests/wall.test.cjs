// Run with: node --test tests/wall.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');
function section(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
const source = section('function wallMat(tex)', '// ---- construction fences') + section('class Board {', 'const wallGuides');
function setup(length, maxTextureSize = 8192) {
  const meshes = [];
  class Geometry { constructor(){this.attributes={};} setAttribute(n,v){this.attributes[n]=v;} setIndex(v){this.index=v;} dispose(){} translate(){} }
  class Attribute {constructor(a,n){this.array=a;this.itemSize=n;}}
  const context = vm.createContext({
    THREE: {ShaderMaterial: class {constructor(o){Object.assign(this,o);}}, DoubleSide:2, BufferGeometry: Geometry, Float32BufferAttribute:Attribute, Mesh:class{constructor(g,m){this.geometry=g;this.material=m;}}, BoxGeometry:Geometry},
    WL:{bay_m:2,row_h:.5,rows:6}, LIGHT:'', common:()=>({}),
    $:()=>({value:0}), scene:{remove(){},add(m){meshes.push(m);}},
    WALLS:{1:[[80,80+length]],'-1':[[80,80+length]]}, Y_WALL:30.5,
    Geo:class{mesh(){return {geometry:new Geometry()};}}, fr:m=>({rx:1,rz:0,p:0,h:0}), P:(f,y,h)=>[y,h,0], gnd:()=>0,
    mtx:v=>v, sweep(){}, range:()=>[], inst:()=>({geometry:new Geometry()}), lam:()=>({}), MATS:{concrete:{}},
    renderer:{capabilities:{maxTextureSize}},PXM:50,meshes,
  });
  vm.runInContext(source+'; buildWalls();',context);
  return {context,meshes};
}
for(const length of [100,250,700,247]) test(`${length} m: exact geometry, both driving directions, local UV and 3 m height`,()=>{
  const {context,meshes}=setup(length);
  assert.equal(meshes.length,2);
  for(const mesh of meshes){
    const g=mesh.geometry;
    assert.equal(g.attributes.aBay.array.length/4,Math.ceil(length/2));
    assert.equal(mesh.userData.end-mesh.userData.start,length);
    assert.equal(mesh.material.uniforms.uLength.value,length);
    assert.equal(Math.min(...g.attributes.aAlong.array),0);
    assert.equal(Math.max(...g.attributes.aAlong.array),length);
    assert.equal(Math.max(...g.attributes.aH.array),3);
    // Last panel in travel direction always reaches the wall end, including a 1 m remainder.
    const last=g.attributes.aAlong.array.slice(-4);
    assert.equal(Math.min(...last),Math.floor((length-1)/2)*2);
    assert.equal(Math.max(...last),length);
  }
  assert.equal(vm.runInContext('WALL_GEOM.len',context),length*2);
  assert.equal(vm.runInContext('WALL_GEOM.area',context),length*2*3);
});
for(const max of [4096,8192]) test(`resize composition and cap long-wall canvas on ${max}px GPU`,()=>{
  const {context}=setup(250,max);
  vm.runInContext(`var board = Object.create(Board.prototype); board.key="wall"; board.out={width:2000,height:150}; board.layers=[{x:0,y:0,w:2000,h:150},{x:500,y:30,w:400,h:60}];`,context);
  for(const length of [100,250,700,40,250]){
    vm.runInContext(`board.setSize(${length},3)`,context);
    const result=vm.runInContext('JSON.stringify({out:board.out,layers:board.layers})',context);
    const {out,layers}=JSON.parse(result);
    assert.ok(out.width<=max && out.height<=max);
    assert.ok(Math.abs(layers[0].w-out.width)<1e-8);
    assert.ok(Math.abs(layers[0].h-out.height)<1e-8);
    assert.ok(Math.abs(layers[1].x/out.width-.25)<1e-8);
    assert.ok(Math.abs(layers[1].y/out.height-.2)<1e-8);
  }
});
