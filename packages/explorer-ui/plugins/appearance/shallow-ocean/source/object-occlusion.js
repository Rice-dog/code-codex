export function install(root, document, window, matchMedia) {
/* Ordered object-level depth encoding for underwater and surface layer occlusion. */
(function(root){
'use strict';
const CAPACITY=256,SPAN=3.2,BANDS=CAPACITY*16, EPS=.08;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function assignLayers(items){
 const ordered=[...items].sort((a,b)=>a.z!==b.z?a.z-b.z:(a.order??0)-(b.order??0));
 return ordered.map((item,layer)=>({...item,layer}));
}
function encodeDepth(layer,localOffset=0,capacity=CAPACITY,span=SPAN){
 const slice=clamp(layer,0,capacity-1),within=clamp(.5-localOffset/span,EPS,1-EPS);
 return (slice+within)/(capacity*16);
}
function decodeHeight(raw,centers,cameraZ=35,near=.1,far=80,capacity=CAPACITY,span=SPAN){
 const packed=raw*capacity*16,index=Math.floor(packed);
 if(index>=0&&index<centers.length)return centers[index]-(packed-index-.5)*span;
 return cameraZ-(near+(far-near)*raw);
}
function createRenderer(T,capacity=CAPACITY){
 const scenes=Array.from({length:capacity},()=>new T.Scene()),proxyRoot=new T.Group(),instancedRoot=new T.Group();
 const centers=new Float32Array(capacity),centerBytes=new Uint8Array(capacity*4);
 const centerTex=new T.DataTexture(centerBytes,capacity,1,T.RGBAFormat,T.UnsignedByteType);
 centerTex.minFilter=centerTex.magFilter=T.NearestFilter;centerTex.generateMipmaps=false;centerTex.needsUpdate=true;
 const depthMat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{layer:{value:0},centerZ:{value:0},span:{value:SPAN},bands:{value:BANDS}},
  vertexShader:'varying float worldZ;void main(){vec4 w=modelMatrix*vec4(position,1.);worldZ=w.z;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`precision highp float;varying float worldZ;uniform float layer,centerZ,span,bands;
  void main(){float within=clamp(.5-(worldZ-centerZ)/span,${EPS},${1-EPS});gl_FragColor=vec4((layer+within)/bands,0.,0.,1.);}`});
 const instancedMat=new T.ShaderMaterial({side:T.DoubleSide,
  vertexShader:`attribute vec4 motion;attribute vec3 bonePivot;attribute float part,layer,centerZ;varying float vLayer,vCenterZ,worldZ;uniform float clock;
  vec3 rx(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
  vec3 ry(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
  vec3 rz(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
  void main(){vec3 v=position;float ax=0.,ay=0.,az=0.,stroke=motion.x,seed=motion.y,response=motion.z,effort=motion.w;
  if(part>.5&&part<2.5){float side=part<1.5?-1.:1.,beat=stroke+side*.35;az=side*(.08+sin(beat)*(.16+effort*.22));ax=cos(beat-.5)*(.12+effort*.20);ay=side*sin(beat+.7)*.12;if(side>0.){ax+=response*.65;ay+=response*sin(clock*7.+seed)*.36;}}
  else if(part>2.5&&part<4.5){float side=part<3.5?-1.:1.;az=sin(stroke*.63+side*1.5)*.13;ax=sin(stroke*.63+side*1.5-.6)*.12;}
  else if(part>4.5){float phase=mod(clock+seed*1.7,6.7),blink=phase<.20?sin(phase/.20*3.14159265):0.;v.y=bonePivot.y+(v.y-bonePivot.y)*(1.-blink*.92);}
  if(part>.5&&part<4.5)v=bonePivot+rz(ry(rx(v-bonePivot,ax),ay),az);
  vec4 w=modelMatrix*instanceMatrix*vec4(v,1.);worldZ=w.z;vLayer=layer;vCenterZ=centerZ;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`precision highp float;varying float vLayer,vCenterZ,worldZ;
  void main(){float within=clamp(.5-(worldZ-vCenterZ)/${SPAN},${EPS},${1-EPS});gl_FragColor=vec4((vLayer+within)/${BANDS}.,0.,0.,1.);}`});
 scenes[0].add(proxyRoot,instancedRoot);
 const proxies=new WeakMap(),batchProxies=new WeakMap(),used=[],activeBatches=[];
 function proxyFor(source){
  let clone=proxies.get(source);if(clone)return clone;
  clone=new T.Group();clone.matrixAutoUpdate=false;const pairs=[];
  source.traverse(node=>{if(!node.isMesh)return;const m=new T.Mesh(node.geometry,depthMat);m.matrixAutoUpdate=false;m.frustumCulled=false;clone.add(m);pairs.push([node,m]);});
  clone.userData.pairs=pairs;proxies.set(source,clone);proxyRoot.add(clone);return clone;
 }
 function batchProxyFor(mesh){
  let proxy=batchProxies.get(mesh);if(proxy)return proxy;
  const g=mesh.geometry.clone();
  if(!g.getAttribute('motion'))g.setAttribute('motion',new T.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count*4),4));
  if(!g.getAttribute('bonePivot'))g.setAttribute('bonePivot',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3),3));
  if(!g.getAttribute('part'))g.setAttribute('part',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count),1));
  const layer=new T.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count),1).setUsage(T.DynamicDrawUsage);
  const centerZ=new T.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count),1).setUsage(T.DynamicDrawUsage);
  g.setAttribute('layer',layer);g.setAttribute('centerZ',centerZ);
  proxy=new T.InstancedMesh(g,instancedMat,mesh.instanceMatrix.count);proxy.instanceMatrix=mesh.instanceMatrix;proxy.frustumCulled=false;proxy.visible=false;
  proxy.userData={layer,centerZ,motion:mesh.geometry.getAttribute('motion')};batchProxies.set(mesh,proxy);instancedRoot.add(proxy);return proxy;
 }
 function sync(source,clone){
  source.updateWorldMatrix(true,true);clone.visible=true;
  for(const [node,mesh] of clone.userData.pairs){mesh.visible=node.visible;mesh.matrixWorld.copy(node.matrixWorld);}
 }
 function render(renderer,target,camera,items,batches=[],solidIceOnly=false){
  for(const c of used)c.visible=false;used.length=0;
  for(const b of activeBatches)b.visible=false;activeBatches.length=0;
  centers.fill(-999);centerBytes.fill(0);
  const entries=[];let order=0;
  for(const item of items){if(solidIceOnly&&!item.solidIce)continue;if(item?.group?.visible)entries.push({...item,order:order++});}
  if(!solidIceOnly)for(const batch of batches){if(!batch?.mesh?.visible||!batch.mesh.count)continue;for(let slot=0;slot<batch.mesh.count;slot++){const a=batch.actors[slot];if(a)entries.push({batch,slot,z:a.z,order:order++});}}
  const assigned=assignLayers(entries).slice(0,capacity);
  const prevTarget=renderer.getRenderTarget(),prevClear=renderer.autoClear,clearColor=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
  renderer.setRenderTarget(target);renderer.setClearColor(0xffffff,1);renderer.clear(true,true,false);renderer.autoClear=false;
  try{
   for(const item of assigned){
    const i=item.layer;centers[i]=item.z;
    const encoded=Math.round(clamp((item.z+12)/48)*255);centerBytes[i*4]=encoded;centerBytes[i*4+1]=encoded;centerBytes[i*4+2]=encoded;centerBytes[i*4+3]=255;
    if(item.batch){
     const proxy=batchProxyFor(item.batch.mesh);proxy.count=item.batch.mesh.count;proxy.visible=true;
     proxy.userData.layer.setX(item.slot,i);proxy.userData.centerZ.setX(item.slot,item.z);
     if(!activeBatches.includes(proxy))activeBatches.push(proxy);continue;
    }
    const clone=proxyFor(item.group);sync(item.group,clone);used.push(clone);
    depthMat.uniforms.layer.value=i;depthMat.uniforms.centerZ.value=item.z;
    renderer.render(scenes[0],camera);clone.visible=false;
   }
   if(activeBatches.length){
    for(const proxy of activeBatches){proxy.userData.layer.needsUpdate=true;proxy.userData.centerZ.needsUpdate=true;if(proxy.userData.motion)proxy.geometry.attributes.motion.needsUpdate=true;}
    instancedMat.uniforms.clock={value:performance.now()*.001};
    renderer.render(scenes[0],camera);
   }
   centerTex.needsUpdate=true;
  }finally{
   renderer.autoClear=prevClear;renderer.setClearColor(clearColor,clearAlpha);renderer.setRenderTarget(prevTarget);
  }
  return assigned;
 }
 return {render,centers,centerTexture:centerTex,texture:centerTex,capacity,span:SPAN};
}
root.OceanObjectOcclusion={CAPACITY,SPAN,BANDS,assignLayers,encodeDepth,decodeHeight,createRenderer,create:createRenderer};
})(root);

}
