/** Private single-frame renderer for the basic cinema fill backdrop. No timeline or clip model. */
const vertex=`#version 300 es
in vec2 position;out vec2 uv;void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}`;
const blurFragment=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;uniform sampler2D source;uniform vec2 stepSize;
void main(){vec4 sum=vec4(0.);float w=0.;for(int i=-4;i<=4;i++){float v=exp(-.5*float(i*i));sum+=texture(source,clamp(uv+float(i)*stepSize,vec2(0.),vec2(1.)))*v;w+=v;}color=sum/w;}`;
const layerFragment=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;uniform sampler2D source;uniform vec2 viewport;uniform vec2 fitted;uniform float brightness;
void main(){vec2 q=(uv-.5)*viewport/fitted+.5;color=vec4(clamp(texture(source,clamp(q,vec2(0.),vec2(1.))).rgb*brightness,0.,1.),1.);}`;
export function createStartupCinemaRenderer(canvas:HTMLCanvasElement){
  const gl=canvas.getContext('webgl2',{alpha:false,preserveDrawingBuffer:true,antialias:false,premultipliedAlpha:false});
  if(!gl)throw Error('CINEMA_RENDER: WebGL2 is unavailable.');
  const programs:WebGLProgram[]=[],buffers:WebGLBuffer[]=[],scratch:WebGLTexture[]=[];
  let disposed=false,lastRevision=NaN,lastSource='',lastWidth=0,lastHeight=0;
  function program(fragment:string){
    const shaders=[gl!.VERTEX_SHADER,gl!.FRAGMENT_SHADER].map((kind,i)=>{const shader=gl!.createShader(kind)!;gl!.shaderSource(shader,i?fragment:vertex);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS)){const reason=gl!.getShaderInfoLog(shader);gl!.deleteShader(shader);throw new Error('CINEMA_RENDER: '+reason);}return shader;});
    const p=gl!.createProgram()!;shaders.forEach(s=>gl!.attachShader(p,s));gl!.linkProgram(p);shaders.forEach(s=>gl!.deleteShader(s));if(!gl!.getProgramParameter(p,gl!.LINK_STATUS))throw new Error('CINEMA_RENDER: shader linking failed');programs.push(p);return p;
  }
  const blur=program(blurFragment),layer=program(layerFragment),quad=gl.createBuffer()!;buffers.push(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const framebuffer=gl.createFramebuffer()!;
  function texture(){const t=gl!.createTexture()!;gl!.bindTexture(gl!.TEXTURE_2D,t);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);return t;}
  const work=[texture(),texture()];scratch.push(...work);
  const workSizes=work.map(()=>({width:0,height:0}));
  function bind(p:WebGLProgram,t:WebGLTexture){gl!.useProgram(p);gl!.bindBuffer(gl!.ARRAY_BUFFER,quad);const loc=gl!.getAttribLocation(p,'position');gl!.enableVertexAttribArray(loc);gl!.vertexAttribPointer(loc,2,gl!.FLOAT,false,0,0);gl!.activeTexture(gl!.TEXTURE0);gl!.bindTexture(gl!.TEXTURE_2D,t);gl!.uniform1i(gl!.getUniformLocation(p,'source'),0);}
  const sourceTexture=texture();
  return {
    paint(width:number,height:number,video:HTMLVideoElement,brightness:number){
      if(disposed||gl.isContextLost())throw Error('CINEMA_RENDER: graphics context lost.');
      if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
      const sw=video.videoWidth,sh=video.videoHeight,fit=Math.max(width/sw,height/sh);
      if(lastRevision!==video.currentTime||lastSource!==video.currentSrc||lastWidth!==sw||lastHeight!==sh){gl.bindTexture(gl.TEXTURE_2D,sourceTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);lastRevision=video.currentTime;lastSource=video.currentSrc;lastWidth=sw;lastHeight=sh;}
      const blurWidth=Math.max(2,Math.min(sw,960)),blurHeight=Math.max(2,Math.round(sh*blurWidth/sw));
      let source=sourceTexture;gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,blurWidth,blurHeight);
      for(let i=0;i<2;i++){
        gl.bindTexture(gl.TEXTURE_2D,work[i]!);if(workSizes[i]!.width!==blurWidth||workSizes[i]!.height!==blurHeight){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,blurWidth,blurHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);workSizes[i]={width:blurWidth,height:blurHeight};}gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,work[i]!,0);
        bind(blur,source);const sigma=30*width/1280/fit;gl.uniform2f(gl.getUniformLocation(blur,'stepSize'),i?0:sigma/sw,i?sigma/sh:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);source=work[i]!;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);bind(layer,source);gl.uniform2f(gl.getUniformLocation(layer,'viewport'),width,height);gl.uniform2f(gl.getUniformLocation(layer,'fitted'),sw*fit*1.12,sh*fit*1.12);gl.uniform1f(gl.getUniformLocation(layer,'brightness'),brightness);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if(gl.getError()!==gl.NO_ERROR)throw Error('CINEMA_RENDER: graphics operation failed.');
    },
    pixels(x:number,y:number){const b=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;},
    dispose(){if(disposed)return;disposed=true;gl.deleteTexture(sourceTexture);scratch.forEach(t=>gl.deleteTexture(t));programs.forEach(p=>gl.deleteProgram(p));buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteFramebuffer(framebuffer);gl.getExtension('WEBGL_lose_context')?.loseContext();},
  };
}
