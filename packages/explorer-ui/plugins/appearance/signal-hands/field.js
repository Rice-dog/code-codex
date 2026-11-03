/* Original ASCII field for Signal Between. All coordinates use CSS pixels. */
const BACKGROUND = '#050610';
const CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ:+=*-.';
const LEVELS = 32;
const WHEEL_WAVE_MS = 680;
const FLOW_LIFE_MS = 800;
const DEFAULT_FLOW_STRENGTH = .65;
const IDLE_FRAME_MS = 170;
const THREAD_LIFE_MS = 850;
const POINTER_MODES = new Set(['brush','magnet','threads']);
const DEFAULT_POINTER_STRENGTH = .75;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, amount) => a + (b - a) * amount;

function hash(x, y, salt = 0) {
  let n = Math.imul(x + 13, 374761393) ^ Math.imul(y + 37, 668265263) ^ Math.imul(salt + 3, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function canvasOf(width, height) {
  return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

const ramp = [[0, 11, 14, 36], [.20, 24, 34, 103], [.43, 53, 61, 186],
  [.64, 91, 102, 222], [.83, 157, 157, 245], [1, 226, 224, 255]];
const hotRamp = [[0, 17, 33, 62], [.20, 38, 67, 125], [.43, 67, 103, 198],
  [.64, 115, 150, 236], [.83, 171, 217, 255], [1, 240, 250, 255]];

function color(stops, t) {
  const index = stops.findIndex(stop => stop[0] >= t);
  const high = stops[index < 0 ? stops.length - 1 : index];
  const low = stops[Math.max(0, index - 1)];
  const blend = (t - low[0]) / Math.max(.0001, high[0] - low[0]);
  return 'rgb(' + [1, 2, 3].map(i => Math.round(mix(low[i], high[i], blend))).join(',') + ')';
}

function glyphAtlas(font, ratio) {
  // One atlas for both the ambient indigo and the illuminated finger/stroke palette.
  const side = Math.ceil(font * ratio * 1.6) + 2;
  const sheet = canvasOf(side * CHARS.length, side * LEVELS * 2);
  const ctx = sheet.getContext('2d');
  ctx.font = '600 ' + (font * ratio).toFixed(2) + 'px Consolas, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let level = 0; level < LEVELS * 2; level++) {
    ctx.fillStyle = color(level >= LEVELS ? hotRamp : ramp, (level % LEVELS) / (LEVELS - 1));
    for (let char = 0; char < CHARS.length; char++) {
      ctx.fillText(CHARS[char], (char + .5) * side, (level + .5) * side);
    }
  }
  const span = side / ratio;
  return (target, char, level, x, y, hot = false) => {
    const row = clamp(Math.round(level), 0, LEVELS - 1) + (hot ? LEVELS : 0);
    target.drawImage(sheet, char * side, row * side, side, side, x - span / 2, y - span / 2, span, span);
  };
}

function quantile(hist, fraction, total) {
  let count = 0;
  for (let i = 0; i < hist.length; i++) {
    count += hist[i];
    if (count >= fraction * total) return i;
  }
  return 255;
}

function fieldFor(image, width, height, ratio, options) {
  // Keep both fingertips in frame. Small screens use smaller glyphs instead of cropping the pose.
  const dx = clamp(width / 214, 2.35, 9.2) * (options.spacing || 1);
  const dy = dx * 1.48;
  const cols = Math.ceil(width / dx), rows = Math.ceil(height / dy);
  const sample = canvasOf(cols, rows);
  const stepWidth = width / cols, stepHeight = height / rows;
  const sampleCtx = sample.getContext('2d', {willReadFrequently:true});
  sampleCtx.fillStyle = '#000';
  sampleCtx.fillRect(0,0,cols,rows);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!(imageWidth > 0 && imageHeight > 0)) throw new Error('Hand artwork is not loaded.');
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale, h = imageHeight * scale;
  const left = (width - w) / 2, top = (height - h) * (options.anchorY ?? .5);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(image, left / stepWidth, top / stepHeight, w / stepWidth, h / stepHeight);
  const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;
  const count = rows * cols;
  const luminance = new Uint8Array(count), hist = new Uint32Array(256);
  for (let i=0; i<count; i++) {
    const j = i * 4;
    const light = Math.round(pixels[j]*.21 + pixels[j+1]*.715 + pixels[j+2]*.075);
    luminance[i] = light;
    hist[light]++;
  }
  const floor = Math.min(29, quantile(hist,.52,count) + 3);
  const ceil = Math.max(floor + 55, quantile(hist,.997,count));
  const drawGlyph = glyphAtlas(dx * 1.47, ratio);
  const plate = canvasOf(width * ratio, height * ratio);
  const hands = canvasOf(width * ratio, height * ratio);
  const ctx = plate.getContext('2d'), handsCtx = hands.getContext('2d');
  for (const target of [ctx,handsCtx]) target.setTransform(ratio,0,0,ratio,0,0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0,0,width,height);
  const levels = new Int8Array(count).fill(-1);
  const chars = new Uint8Array(count);
  const ink = new Uint8Array(count);
  const ambient = new Int8Array(count).fill(-1), ambientChars = new Uint8Array(count);
  const seeds = new Float32Array(count);
  const glints = [];
  for (let row=0; row<rows; row++) {
    for (let col=0; col<cols; col++) {
      const i = row * cols + col, value = luminance[i];
      const seed = hash(col,row);
      const random = hash(col,row,8);
      seeds[i] = seed;
      const x = (col+.5)*stepWidth, y = (row+.5)*stepHeight;
      if (random < .022) {
        ambient[i]=Math.round((.012+.12*seed)*(LEVELS-1));
        ambientChars[i]=Math.floor(hash(col,row,71)*(CHARS.length-6));
        drawGlyph(ctx,ambientChars[i],ambient[i],x,y);
      }
      if (value <= floor+2) continue;
      const t = clamp((value - floor) / (ceil - floor), 0, 1);
      const edge = (value - luminance[row*cols + Math.max(0,col-1)]
        + value - luminance[Math.max(0,row-1)*cols + col]) / 255;
      const light = clamp(.080 + .89 * Math.pow(t,.78) + edge*.23 + (seed-.5)*.10, .065, 1);
      ink[i] = 1;
      if (t < .10 && random < .13) continue;
      const alphabet = light < .12 && seed < .30 ? CHARS.slice(-6) : CHARS.slice(0,-6);
      const glyph = CHARS.indexOf(alphabet[Math.floor(hash(col,row,26)*alphabet.length)]);
      const level = Math.round(light*(LEVELS-1));
      levels[i] = level;
      chars[i] = glyph;
      drawGlyph(handsCtx,glyph,level,x,y);
      if (hash(col,row,90) < .09) glints.push({i,x,y});
    }
  }
  return {
    width, height, ratio, cols, rows, dx:stepWidth, dy:stepHeight, levels, chars, ink, seeds, glints, plate, hands, drawGlyph,
    ambient, ambientChars, lens:makeLens(), handWidth:w, focusX:left+w*(options.focusX ?? .509), focusY:top+h*(options.focusY ?? .474),
    radius:clamp(width*.091,43,176),
  };
}

function halo(ctx, x, y, r, gain, tint = '111,116,255') {
  if (gain < .01 || r < 1) return;
  const grad = ctx.createRadialGradient(x,y,0,x,y,r);
  grad.addColorStop(0,'rgba('+tint+','+(.50*gain)+')');
  grad.addColorStop(.18,'rgba('+tint+','+(.32*gain)+')');
  grad.addColorStop(.54,'rgba('+tint+','+(.13*gain)+')');
  grad.addColorStop(1,'rgba('+tint+',0)');
  ctx.fillStyle=grad;
  ctx.fillRect(x-r,y-r,2*r,2*r);
}

function offsetsFor(f, stage) {
  const away=Math.min(1,Math.abs(2*stage-1));
  const ease=away*away*(3-2*away);
  return stage < .5
    ? {lx:-f.width*.15*ease,ly:f.height*.064*ease,rx:f.width*.092*ease,ry:-f.height*.049*ease}
    : {lx:-f.width*.115*ease,ly:f.height*.038*ease,rx:f.width*.175*ease,ry:-f.height*.091*ease};
}
function makeLens() {
  const sample=canvasOf(34,34), tint=canvasOf(34,34);
  return {sample,tint,read:sample.getContext('2d'),color:tint.getContext('2d')};
}
function drawLens(ctx,f,cursor,stage,gain=1) {
  if (!cursor || stage >= .022) return;
  const alpha=clamp((.022-stage)/.010,0,1)*Math.min(gain,1);
  const radius=clamp(f.width*.043,27,72);
  const span=radius*1.32;
  const {sample,tint,read,color}=f.lens;
  const {x,y}=cursor;
  read.fillStyle=BACKGROUND;read.fillRect(0,0,sample.width,sample.height);
  read.imageSmoothingEnabled=false;
  read.drawImage(ctx.canvas,(x-span/2)*f.ratio,(y-span/2)*f.ratio,span*f.ratio,span*f.ratio,0,0,sample.width,sample.height);
  ctx.save();
  ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.clip();
  ctx.globalAlpha=alpha;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sample,x-radius,y-radius,radius*2,radius*2);
  // Channel-colored edges at opposite subpixel offsets keep the enlarged texture legible.
  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=.33*alpha;
  for(const [offset,ink] of [[-1.75,'#f06080'],[1.75,'#56bdf2']]){
    color.globalCompositeOperation='source-over';
    color.drawImage(sample,0,0);
    color.globalCompositeOperation='multiply';
    color.fillStyle=ink;color.fillRect(0,0,tint.width,tint.height);
    ctx.drawImage(tint,x-radius+offset,y-radius,radius*2,radius*2);
  }
  ctx.restore();
}
function drawPosedHands(ctx,f,pose) {
  const split=Math.round(f.focusX*f.ratio);
  const {width:w,height:h}=f.hands;
  ctx.drawImage(f.hands,0,0,split,h,pose.lx,pose.ly,split/f.ratio,f.height);
  ctx.drawImage(f.hands,split,0,w-split,h,split/f.ratio+pose.rx,pose.ry,(w-split)/f.ratio,f.height);
}
function drawFilaments(ctx,f,pose,effect) {
  const {knots,cursor,strength,now} = effect;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#b39aff';
  ctx.fillStyle = '#f2e8ff';
  const segment = (a,b,alpha) => {
    ctx.globalAlpha = clamp(alpha * strength,0,1);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  };
  const star = (point,alpha,r) => {
    ctx.globalAlpha = clamp(alpha * strength,0,1);
    ctx.fillRect(point.x-r,point.y-1,2*r,2);
    ctx.fillRect(point.x-1,point.y-r,2,2*r);
  };
  let prev = null;
  for (const knot of knots) {
    const life = clamp(1-(now-knot.time)/THREAD_LIFE_MS,0,1);
    if (!life) continue;
    if (prev && Math.hypot(knot.x-prev.x,knot.y-prev.y)<f.radius) {
      ctx.lineWidth = .9 + strength;
      segment(prev,knot,life*.90);
      if (knot.branch) {
        const side = {x:knot.x+knot.dy*f.dx*1.5, y:knot.y-knot.dx*f.dx*1.5};
        ctx.lineWidth = .8;
        segment(prev,side,life*.65); segment(side,knot,life*.65);
        star(side,life*.90,1.7);
      }
    }
    star(knot,life,2.4);
    prev = knot;
  }

  // Tether the latest point to a real lit glyph on either side, taking the current hand pose into account.
  const head = cursor || prev;
  if (head) {
    const life = cursor ? 1 : clamp(1-(now-head.time)/THREAD_LIFE_MS,0,1);
    const anchors = [null,null];
    const reach = f.radius * (1.2+.65*strength);
    for (const g of f.glints) {
      const left = g.x<f.focusX;
      const x=g.x+(left?pose.lx:pose.rx), y=g.y+(left?pose.ly:pose.ry);
      const distance=Math.hypot(x-head.x,y-head.y);
      if (distance < f.dx*2 || distance > reach) continue;
      const side=x<head.x ? 0 : 1;
      // Prefer longer filaments over a cluster of almost-coincident endpoints.
      const score=Math.abs(distance-reach*.48) + (1-f.seeds[g.i])*f.dx*2;
      if (!anchors[side] || score<anchors[side].score) anchors[side]={x,y,i:g.i,score};
    }
    ctx.lineWidth = 1.1;
    for (const anchor of anchors) {
      if (!anchor) continue;
      segment(head,anchor,life*.72);
      star(anchor,life*.8,2.5);
      ctx.globalAlpha=life*strength*.9;
      f.drawGlyph(ctx,f.chars[anchor.i],30,anchor.x,anchor.y,true);
    }
    star(head,life,2.8);
  }
  ctx.restore();
}

// Integrate signed wheel travel so a direction change keeps the current position.
function advanceFlow(flow, now) {
  const dt=Math.max(0, now-flow.time);
  const decay=Math.exp(-dt/320);
  flow.rows+=flow.direction*(dt*.014+flow.energy*13*(1-decay));
  flow.energy*=decay;
  flow.time=now;
}
// A stream is a narrow slice of the actual hand, with a few nearby ambient
// characters folded into its fringe. Sample the resting artwork; streams live
// in background coordinates even while a hand opens, bends, or moves away.
function makeGlyphStream(f,col,first,end) {
  function fringe(row,step) {
    const glyphs=[];
    const reach=Math.min(end-first,6+Math.floor(hash(col,row,219)*7));
    for(let n=0;n<reach;n++,row+=step){
      if(row<0 || row>=f.rows || f.ink[row*f.cols+col]) break;
      let source=-1;
      for(let d=0;d<=6 && source<0;d++){
        for(const c of d ? [col-d,col+d] : [col]){
          if(c<0 || c>=f.cols) continue;
          const i=row*f.cols+c;
          if(!f.ink[i] && f.ambient[i]>=0){source=i;break;}
        }
      }
      glyphs.push(source);
    }
    while(glyphs.length && glyphs[glyphs.length-1]<0) glyphs.pop();
    return glyphs;
  }
  const before=fringe(first-1,-1).reverse();
  const after=fringe(end,1);
  const count=before.length+end-first+after.length;
  const width=Math.ceil(f.dx*f.ratio), height=Math.ceil(count*f.dy*f.ratio);
  const strip=canvasOf(width,height*2);
  const pen=strip.getContext('2d');
  pen.save();
  pen.scale(width/f.dx,height/(count*f.dy));
  let remaining=0, packetLength=0;
  for(let n=0;n<count;n++){
    // Give each little group of letters its own length and breathing space.
    if(remaining===0){
      packetLength=2+Math.floor(5*hash(col,first+n,302));
      remaining=packetLength+1+Math.floor(4*hash(col,first+n,303));
    }
    remaining--;
    const within=packetLength-1-remaining;
    pen.globalAlpha=within<0 ? .09 : .55+.45*Math.sin(Math.PI*(within+.5)/packetLength);
    const row=first+n-before.length;
    const onHand=row>=first && row<end;
    const i=onHand ? row*f.cols+col : row<first ? before[n] : after[row-end];
    if(i<0) continue;
    const glyph=onHand ? f.chars[i] : f.ambientChars[i];
    const level=onHand ? clamp(f.levels[i]*.48+13,13,27) : 8;
    f.drawGlyph(pen,glyph,level,f.dx/2,(n+.5)*f.dy,true);
  }
  pen.restore();
  // Keep the gaps transparent so a moving finger can pass behind a stream.
  pen.globalCompositeOperation='source-atop';
  pen.fillStyle='rgba(96,177,161,.58)';
  pen.fillRect(0,0,width,height);
  pen.globalCompositeOperation='source-over';
  pen.drawImage(strip,0,0,width,height,0,height,width,height);
  return {strip,count,top:first-before.length,before:before.length,body:end-first,
    after:after.length,x:col*f.dx,
    phase:hash(col,first,217)*TAU,speed:.28+.52*hash(col,end,218),
    delay:100*hash(col,first,304), period:5+8*hash(col,end,305)};
}

function handStreams(f,gesture) {
  const streams=[];
  const previous=f.streamColumns;
  const columns=new Map();
  // Keep the broader clusters, but pick fresh lanes as each gesture begins.
  // Reuse strips on shared lanes; retain only the current selection.
  let paired=false;
  for(let start=1;start<f.cols;){
    const nextToPrevious=!paired && hash(start,f.cols,306)<.42;
    const stride=nextToPrevious ? 3+Math.floor(3*hash(start,1,307)) : 8+Math.floor(10*hash(start,1,308));
    paired=nextToPrevious;
    let bestCol=start,bestScore=0;
    const endCol=Math.min(f.cols,start+Math.min(7,stride-1));
    const fixed=hash(start,f.cols,309)<.25;
    for(let col=start;col<endCol;col++){
      let occupied=0;
      for(let row=0;row<f.rows;row++) if(f.levels[row*f.cols+col]>=0) occupied++;
      const weight=fixed ? .80+.20*hash(col,1,217) : .45+.55*hash(col,gesture,310);
      const score=occupied*weight*(!fixed && previous?.has(col) ? .55 : 1);
      if(score>bestScore){bestScore=score;bestCol=col;}
    }
    start+=stride;
    if(!bestScore) continue;
    let strips=previous?.get(bestCol);
    if(!strips){
      strips=[];
      let first=0;
      for(let row=0;row<=f.rows;row++){
        if(row<f.rows && f.levels[row*f.cols+bestCol]>=0) continue;
        if(row-first>=3) strips.push(makeGlyphStream(f,bestCol,first,row));
        first=row+1;
      }
    }
    if(strips.length){columns.set(bestCol,strips);streams.push(...strips);}
  }
  f.streamColumns=columns;
  return streams;
}

function drawScrollFlow(ctx,f,flow,strength) {
  const age=clamp((flow.time-flow.lastInput)/FLOW_LIFE_MS,0,1);
  const gain=.96*strength*(1-age*age)*Math.min(1,Math.sqrt(flow.energy)*1.7);
  if(gain<.006) return;
  if(f.streamGesture!==flow.gesture){
    f.scrollStreams=handStreams(f,flow.gesture);
    f.streamGesture=flow.gesture;
  }
  const streams=f.scrollStreams;
  ctx.save();
  for(const s of streams){
    const x=s.x, y=s.top*f.dy;
    const enter=clamp((flow.time-flow.started-s.delay)/120,0,1);
    if(!enter) continue;
    const distance=flow.rows*s.speed;
    // Modulate the speed without reversing it mid-gesture. The derivative
    // stays positive, so reversing the wheel retraces the current sequence.
    const travel=distance+.26*s.period*(Math.sin(s.phase+distance/s.period)-Math.sin(s.phase));
    const offset=(((-travel)%s.count)+s.count)%s.count;
    const texel=s.strip.height/(2*s.count);
    const pulse=enter*(.72+.28*Math.sin(s.phase+travel*.22+flow.started*.002));
    function band(row,rows,weight) {
      if(!rows) return;
      const sourceRow=(offset+row)%s.count;
      ctx.globalAlpha=gain*pulse*weight;
      ctx.drawImage(s.strip,0,sourceRow*texel,s.strip.width,rows*texel,
        x,y+row*f.dy,f.dx,rows*f.dy);
    }
    const upper=Math.floor(s.before/2), lower=Math.ceil(s.after/2);
    band(0,upper,.16);
    band(upper,s.before-upper,.40);
    band(s.before,s.body,1);
    band(s.before+s.body,lower,.40);
    band(s.before+s.body+lower,s.after-lower,.16);
  }
  ctx.restore();
}

function drawField(ctx, field, phase, wakes, rings, reading, stage, cursor=null, wheelBend=0, filaments=null, lensGain=1, flow=null, flowStrength=0) {
  const f = field, width = f.width, height = f.height;
  const pose=offsetsFor(f,stage);
  if (wheelBend) {
    // Leave each index finger on its own side even when the selected pose is already touching.
    const inwardRoom = f.handWidth * .005 + (pose.rx - pose.lx) / 2;
    const travel = Math.max(-inwardRoom, wheelBend * Math.min(f.handWidth * .032, 46));
    pose.lx -= travel;
    pose.rx += travel;
  }
  ctx.setTransform(f.ratio,0,0,f.ratio,0,0);
  ctx.globalAlpha = 1;
  ctx.drawImage(f.plate,0,0,width,height);
  drawPosedHands(ctx,f,pose);
  const theta = TAU * phase;
  // Additive marks use the same deterministic phase during real time and offline export.
  for (const g of f.glints) {
    const seed=f.seeds[g.i],cycles=2+Math.floor(seed*4);
    const time=cycles*phase+seed*7, beat=time-Math.floor(time);
    if(beat>.40) continue;
    const fade=Math.min(1,beat/.10,(.40-beat)/.10);
    const left=g.x<f.focusX, x=g.x+(left?pose.lx:pose.rx), y=g.y+(left?pose.ly:pose.ry);
    const offset=1+Math.floor(hash(g.i,Math.floor(time)%cycles,56)*(CHARS.length-7));
    const glyph=(f.chars[g.i]+offset)%(CHARS.length-6);
    ctx.globalAlpha=fade;
    ctx.fillStyle=BACKGROUND;ctx.fillRect(x-.50*f.dx,y-.47*f.dy,f.dx,f.dy*.94);
    f.drawGlyph(ctx,glyph,Math.min(31,f.levels[g.i]+3),x,y);
  }
  ctx.globalAlpha=1;

  if (wakes.length) drawDisturbedRegion(ctx,f,pose,phase,wakes);
  for (const ring of rings) drawRing(ctx,f,pose,phase,ring);
  if (flow) drawScrollFlow(ctx,f,flow,flowStrength);
  const radius = clamp(width*.042, 19, 68);
  const contact = Math.exp(-2.7*Math.abs(stage-.5));
  const breath = contact*(.76 + .16*Math.sin(theta))*(1 - wheelBend*.48);
  // The spark belongs to the scene, always midway between the two posed tips.
  const cx=f.focusX+(pose.lx+pose.rx)/2, cy=f.focusY+(pose.ly+pose.ry)/2;
  halo(ctx,cx,cy,radius*(1 + .09*Math.sin(theta)),breath);
  halo(ctx,cx,cy,radius*.21,.71*contact,'201,200,255');
  const dot=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(2,radius*.09));
  dot.addColorStop(0,'rgba(248,248,255,.98)');dot.addColorStop(.22,'rgba(227,227,255,.9)');dot.addColorStop(1,'rgba(227,227,255,0)');
  ctx.globalAlpha=contact*contact;
  ctx.fillStyle=dot;ctx.fillRect(cx-radius*.1,cy-radius*.1,radius*.2,radius*.2);
  ctx.globalAlpha=1;
  if (filaments) drawFilaments(ctx,f,pose,filaments);
  drawLens(ctx,f,cursor,stage,lensGain);
  if (reading) {
    ctx.fillStyle='rgba(5,6,16,.55)';
    ctx.fillRect(0,0,width,height);
  }
}

// Light only the two short spans where a wave crosses a grid row. The core
// and the area outside the wave already have the correct hand and sky pixels.
function drawRing(ctx,f,pose,phase,ring) {
  if (ring.strength<.035) return;
  const thickness=Math.max(9,f.dx*2.9);
  const outer=ring.band+thickness;
  const inner=Math.max(0,ring.band-thickness);
  const direction=ring.direction ?? 1;
  const split=clamp(Math.ceil(f.focusX/f.dx-.5),0,f.cols);

  function lightLayer(shiftX,shiftY,startCol,endCol,hand) {
    const centerX=ring.x-shiftX, centerY=ring.y-shiftY;
    const firstRow=Math.max(0,Math.ceil((centerY-outer)/f.dy-.5));
    const lastRow=Math.min(f.rows-1,Math.floor((centerY+outer)/f.dy-.5));
    for(let row=firstRow;row<=lastRow;row++){
      const y=(row+.5)*f.dy, vy=y-centerY;
      const outerWidth=Math.sqrt(Math.max(0,outer*outer-vy*vy));
      const innerWidth=Math.sqrt(Math.max(0,inner*inner-vy*vy));
      const first=Math.max(startCol,Math.ceil((centerX-outerWidth)/f.dx-.5));
      const last=Math.min(endCol-1,Math.floor((centerX+outerWidth)/f.dx-.5));
      const gapStart=Math.ceil((centerX-innerWidth)/f.dx-.5);
      const gapEnd=Math.floor((centerX+innerWidth)/f.dx-.5);
      for(let col=first;col<=last;col++){
        if (innerWidth>0 && col>=gapStart && col<=gapEnd) { col=gapEnd; continue; }
        const i=row*f.cols+col;
        if(hand && !f.ink[i]) continue;
        const x=(col+.5)*f.dx, vx=x-centerX;
        const distance=Math.sqrt(vx*vx+vy*vy);
        const gain=clamp((1-Math.abs(distance-ring.band)/thickness)*ring.strength,0,1);
        const base=hand ? f.levels[i] : f.ambient[i];
        if(gain<.045 || (base<0 && (gain<.155 || f.seeds[i]<(hand ? .26 : .80-gain*.38)))) continue;
        const tick=Math.floor(phase*34+f.seeds[i]*11);
        const glyph=base<0 ? Math.floor(hash(col+tick,row,54)*(CHARS.length-4)) : hand ? f.chars[i] : f.ambientChars[i];
        const shift=gain*f.dx*2*direction/(distance+.001);
        ctx.globalAlpha=Math.min(1,gain*1.8);
        f.drawGlyph(ctx,glyph,Math.min(31,Math.max(1,base)+gain*24),
          x+shiftX+vx*shift,y+shiftY+vy*shift,gain>.30);
      }
    }
  }
  lightLayer(0,0,0,f.cols,false);
  lightLayer(pose.lx,pose.ly,0,split,true);
  lightLayer(pose.rx,pose.ry,split,f.cols,true);
  ctx.globalAlpha=1;
}

function drawDisturbedRegion(ctx, f, pose, phase, wakes) {
  let loX=f.width, loY=f.height, hiX=0, hiY=0;
  ctx.save();
  ctx.beginPath();
  for (const p of wakes) {
    const bound = p.radius + f.dx*2;
    ctx.moveTo(p.x+bound,p.y);
    ctx.arc(p.x,p.y,bound,0,TAU);
    loX=Math.min(loX,p.x-bound);hiX=Math.max(hiX,p.x+bound);
    loY=Math.min(loY,p.y-bound);hiY=Math.max(hiY,p.y+bound);
  }
  const c1=clamp(Math.floor(loX/f.dx)-2,0,f.cols), c2=clamp(Math.ceil(hiX/f.dx)+2,0,f.cols);
  const r1=clamp(Math.floor(loY/f.dy)-2,0,f.rows), r2=clamp(Math.ceil(hiY/f.dy)+2,0,f.rows);
  const x0=c1*f.dx,y0=r1*f.dy,x1=c2*f.dx,y1=r2*f.dy;
  ctx.clip();
  ctx.fillStyle=BACKGROUND;ctx.fillRect(x0,y0,x1-x0,y1-y0);
  for (const p of wakes) {
    if (!p.magnetic) halo(ctx,p.x,p.y,p.radius*.82,p.strength*.48,'91,108,232');
  }
  function paintCells(layer,shiftX,shiftY) {
    const minCol=clamp(Math.floor((x0-shiftX)/f.dx)-1,0,f.cols);
    const maxCol=clamp(Math.ceil((x1-shiftX)/f.dx)+1,0,f.cols);
    const minRow=clamp(Math.floor((y0-shiftY)/f.dy)-1,0,f.rows);
    const maxRow=clamp(Math.ceil((y1-shiftY)/f.dy)+1,0,f.rows);
    for (let row = minRow; row < maxRow; row++) {
      const y=(row+.5)*f.dy+shiftY;
      let rowMin=maxCol, rowMax=minCol;
      for(const p of wakes){
        const bound=p.radius+3*f.dx, deltaY=y-p.y;
        if(Math.abs(deltaY)>bound) continue;
        const half=Math.sqrt(bound*bound-deltaY*deltaY);
        rowMin=Math.min(rowMin,Math.floor((p.x-shiftX-half)/f.dx));
        rowMax=Math.max(rowMax,Math.ceil((p.x-shiftX+half)/f.dx));
      }
      const first=Math.max(minCol,rowMin), end=Math.min(maxCol,rowMax);
      for (let col = first; col < end; col++) {
      const i=row*f.cols+col, seed=f.seeds[i];
      const originalX=(col+.5)*f.dx;
      if(layer && (!f.ink[i] || (layer===1) !== (originalX<f.focusX))) continue;
      const base=layer ? f.levels[i] : f.ambient[i];
      const x=originalX+shiftX;
      let force=0, sx=0,sy=0,swarm=0, attraction=0;
      for (const p of wakes) {
        const vx=x-p.x,vy=y-p.y,dd=vx*vx+vy*vy;
        if(dd>p.radius*p.radius) continue;
        const d=Math.sqrt(dd)+.001;
        if (p.magnetic) {
          // Move the actual sampled glyph toward the cursor. Preserve its character and local tone.
          const edge=1-d/p.radius;
          const pull=edge*edge*(3-2*edge)*p.strength;
          sx-=vx*pull;
          sy-=vy*pull;
          attraction=Math.max(attraction,pull);
          force=Math.max(force,pull*.65);
          continue;
        }
        const v = Math.max(0,1-d/p.radius)**2 * p.strength;
        const offset = v * (p.speed * .13 + f.dx*1.65);
        force=Math.max(force,v);
        sx+= (vx/d*.90-vy/d*.36+p.vx*.23) * offset;
        sy+= (vy/d*.90+vx/d*.36+p.vy*.23) * offset;
        swarm+=v;
      }
      if (base < 0 && (force < .155 || seed < (layer ? .26 : .80-force*.38))) continue;
      const strength=clamp(force,0,1);
      const flicker = Math.floor(phase*34+seed*11);
      const flips = !attraction && force>.17 && hash(col + flicker,row,7)<.18+strength*.50;
      const char = flips || base<0 ? Math.floor(hash(col+(attraction?0:flicker),row,54)*(CHARS.length-4)) : layer ? f.chars[i] : f.ambientChars[i];
      const level = clamp((base<0 ? 1 : base) + strength*(base<0?24:16) + swarm*1.4, 0,31);
      const limit=f.radius*.32;
      f.drawGlyph(ctx,char,level,x+clamp(sx,-limit,limit),y+clamp(sy,-limit,limit),strength>.30);
      }
    }
  }
  paintCells(0,0,0);
  paintCells(1,pose.lx,pose.ly);
  paintCells(2,pose.rx,pose.ry);
  ctx.restore();
}

export function mount(canvas, image, options = {}) {
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('A 2D canvas is required.');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let field, frame=0, lastDraw=-Infinity, elapsed=0, previous=0, visible=true, disposed=false;
  let idleTimer=0, lastPointerMove=-Infinity;
  let paused = options.paused ?? false, reading=options.reading ?? false;
  let stage=clamp(options.stage ?? .5,0,1), stageTarget=stage;
  const eventTarget=options.eventTarget || window;
  let pointer=null;
  let pointerMode = POINTER_MODES.has(options.pointerMode) ? options.pointerMode : 'brush';
  let pointerStrength = Number.isFinite(options.pointerStrength) ? clamp(options.pointerStrength,0,1) : DEFAULT_POINTER_STRENGTH;
  let flowStrength = Number.isFinite(options.flowStrength) ? clamp(options.flowStrength,0,1) : DEFAULT_FLOW_STRENGTH;
  let flow=null, gestureSequence=0;
  let magnet = null;
  const knots = [];
  const trails=[], ripples=[];
  const wheelWaves=[];
  const period = (options.period || 12) * 1000;
  const motionAllowed = () => !paused && !media.matches;
  function requestFrame() {
    if (!frame && field && visible && !document.hidden && !disposed && motionAllowed()) {
      frame=requestAnimationFrame(tick);
    }
  }
  function resumeInteraction() {
    clearTimeout(idleTimer);
    idleTimer=0;
    requestFrame();
  }
  function isAnimating(now) {
    return ripples.length || wheelWaves.length || flow || Math.abs(stageTarget-stage)>.0005 ||
      (pointerStrength && (now-lastPointerMove<420 || trails.length || knots.length || (magnet && !pointer)));
  }
  const tick = now => {
    frame=0;
    if (!field || disposed || !visible || document.hidden) return;
    if (now-lastDraw >= 28) {
      const dt=previous ? Math.min(now-previous,250) : 33;
      if (previous) elapsed += dt;
      stage+= (stageTarget-stage)*(1-Math.exp(-dt/90));
      previous=now;lastDraw=now;
      paint(elapsed / period);
    }
    if (!motionAllowed()) return;
    if (isAnimating(now)) requestFrame();
    else idleTimer=setTimeout(() => {idleTimer=0;requestFrame();},IDLE_FRAME_MS);
  };

  function scrollImpulse(deltaCssPixels) {
    if (!Number.isFinite(deltaCssPixels) || !deltaCssPixels || !motionAllowed() ||
        disposed || !field || !visible || document.hidden || options.interactive === false) return;
    resumeInteraction();
    const now = performance.now();
    const direction = Math.sign(deltaCssPixels);
    const amount = Math.min(Math.abs(deltaCssPixels)/120, 1);
    if (flowStrength>0) {
      if (!flow || now-flow.lastInput>=FLOW_LIFE_MS) {
        flow={gesture:++gestureSequence,rows:0,direction,energy:0,time:now,started:now,lastInput:now};
      } else {
        advanceFlow(flow,now);
      }
      flow.direction=direction;
      flow.lastInput=now;
      flow.energy=Math.min(1,flow.energy+amount*.8);
    }
    const last = wheelWaves[wheelWaves.length-1];
    // Accumulate fine trackpad deltas into the moving wave without restarting it on each event.
    if (last && last.direction === direction && now-last.started < WHEEL_WAVE_MS*.55) {
      last.strength = Math.min(1, last.strength+amount);
    } else {
      wheelWaves.push({started:now, direction, strength:amount});
      if (wheelWaves.length > 2) wheelWaves.shift();
    }
  }

  function magneticWake(now) {
    if (!pointer && !magnet) return null;
    if (!magnet) magnet = {x:pointer.x,y:pointer.y,gain:0,time:now-16};
    const dt = Math.min(150,Math.max(0,now-magnet.time));
    magnet.time=now;
    const blend = 1-Math.exp(-dt/64);
    if (pointer) {
      magnet.x=mix(magnet.x,pointer.x,blend);
      magnet.y=mix(magnet.y,pointer.y,blend);
    }
    magnet.gain=mix(magnet.gain,pointer?1:0,1-Math.exp(-dt/(pointer?78:115)));
    if (!pointer && magnet.gain<.012) {magnet=null;return null;}
    return {x:magnet.x,y:magnet.y,radius:field.radius*(1+.34*pointerStrength),
      strength:magnet.gain*pointerStrength,magnetic:true};
  }

  function paint(phase) {
    const wakes=[];
    const now=performance.now();
    let filaments=null;
    if (motionAllowed() && pointerStrength && pointerMode==='brush') {
      const gain=pointerStrength/DEFAULT_POINTER_STRENGTH;
      // Store up to several mouse locations and let them cool independently. A stationary cursor stays softly visible.
      for (let i=trails.length-1; i>=0; i--) {
        const p=trails[i], age=(now-p.time)/690;
        if(age>=1){trails.splice(i,1);continue;}
        wakes.push({...p,radius:field.radius*(.57+age*.12),strength:(1-age)**2*.67*gain});
      }
      if (pointer) wakes.push({...pointer,radius:field.radius,strength:.95*gain});
    } else if (motionAllowed() && pointerStrength && pointerMode==='magnet') {
      const wake=magneticWake(now);
      if(wake) wakes.push(wake);
    } else if (motionAllowed() && pointerStrength && pointerMode==='threads') {
      while (knots.length && now-knots[0].time >= THREAD_LIFE_MS) knots.shift();
      if(pointer || knots.length) filaments={knots,cursor:pointer,strength:pointerStrength,now};
    }
    const rings=[];
    for(let i=ripples.length-1;i>=0;i--){
      const p=ripples[i], t=(now-p.time)/710;
      if(t>=1){ripples.splice(i,1);continue;}
      const span=field.radius*1.45;
      rings.push({...p,radius:span,band:span*(.1+.90*t),strength:motionAllowed()?(1-t)*1.18:0});
    }
    const wave=clamp((stage-.505)/.47,0,1);
    if(wave>0 && wave<1 && motionAllowed()){
      const band=field.width*.64*wave;
      rings.push({x:field.focusX,y:field.focusY,radius:band+field.dx*3,band,
        strength:.78*Math.sin(Math.PI*Math.min(1,wave*4))*(1-wave)**1.4+
          .23*Math.sin(Math.PI*wave)});
    }
    let bend=0;
    const span=Math.min(field.handWidth*.32, 320);
    for (let i=wheelWaves.length-1; i>=0; i--) {
      const wave=wheelWaves[i];
      const t=(now-wave.started)/WHEEL_WAVE_MS;
      if (t>=1 || !motionAllowed()) {wheelWaves.splice(i,1);continue;}
      const envelope=Math.sin(Math.PI*t)*(1-.48*t)*wave.strength;
      bend+=wave.direction*envelope;
      const travel=1-(1-t)*(1-t);
      const band=span*(wave.direction>0 ? travel : 1-travel);
      rings.push({x:field.focusX,y:field.focusY,radius:band+field.dx*3,band,
        strength:.56*envelope,direction:wave.direction});
    }
    const lensPointer = pointerMode==='brush' && pointerStrength>0 ? pointer : null;
    if (flow) {
      if (now-flow.lastInput>=FLOW_LIFE_MS || !motionAllowed()) flow=null;
      else advanceFlow(flow,now);
    }
    drawField(ctx,field,phase%1,wakes,rings,reading,stage,lensPointer,clamp(bend,-1,1),filaments,pointerStrength/DEFAULT_POINTER_STRENGTH,flow,flowStrength);
    canvas.presentFrame();
  }

  function clearPointerHistory() {
    trails.length=0;
    knots.length=0;
    magnet=null;
  }
  function setPointerEffect(mode,strength=pointerStrength) {
    if(disposed || !POINTER_MODES.has(mode)) return;
    const gain=Number.isFinite(strength) ? clamp(strength,0,1) : pointerStrength;
    if(pointerMode===mode && pointerStrength===gain) return;
    if(pointerMode!==mode || !gain) clearPointerHistory();
    pointerMode=mode;
    pointerStrength=gain;
    if(field && visible && !document.hidden) paint(elapsed/period);
  }
  function setFlowStrength(value) {
    if (disposed || !Number.isFinite(value)) return;
    flowStrength=clamp(value,0,1);
    if (!flowStrength) flow=null;
    if (field && visible && !document.hidden) paint(elapsed/period);
  }
  const wake = () => {
    clearTimeout(idleTimer);idleTimer=0;
    cancelAnimationFrame(frame);frame=0;previous=0;lastDraw=-Infinity;
    if (!visible || document.hidden || !motionAllowed()) {
      wheelWaves.length=0;ripples.length=0;flow=null;clearPointerHistory();pointer=null;
    }
    if(!field || disposed || !visible || document.hidden)return;
    if(motionAllowed()) frame=requestAnimationFrame(tick);
    else paint(elapsed/period);
  };
  function resize() {
    if(disposed) return;
    const box=canvas.getBoundingClientRect();
    const width=box.width || options.width, height=box.height || options.height;
    if(!width || !height)return;
    // Keep text in the app at native resolution. Only the decorative canvas
    // has a pixel budget, so a maximized high-DPI window stays inexpensive.
    const ratio=Number.isFinite(options.pixelRatio) ? clamp(options.pixelRatio,1,1.7) :
      Math.min(window.devicePixelRatio || 1,1.25,Math.sqrt(2300000/(width*height)));
    if(field && field.width===width && field.height===height && field.ratio===ratio)return;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    field=fieldFor(image,width,height,ratio,options);
    paint(elapsed/period);wake();
  }

  function position(event) {
    const box=canvas.getBoundingClientRect();
    const x=event.clientX-box.left,y=event.clientY-box.top;
    return x>=0&&x<=box.width&&y>=0&&y<=box.height ? {x,y} : null;
  }
  function addThreadPoint(pos,velocityX,velocityY) {
    const now = performance.now();
    const last = knots[knots.length-1];
    const distance = last ? Math.hypot(pos.x-last.x,pos.y-last.y) : 0;
    if (last && now-last.time<THREAD_LIFE_MS && distance<Math.max(9,field.dx*2)) return;
    if (last && (now-last.time>=THREAD_LIFE_MS || distance>field.radius*2)) knots.length=0;
    knots.push({x:pos.x,y:pos.y,time:now,dx:velocityX,dy:velocityY,
      branch:hash(Math.round(pos.x/field.dx),Math.round(pos.y/field.dy),321)>.35});
    if (knots.length>20) knots.shift();
  }
  function move(event) {
    if(!field || !motionAllowed() || !visible || options.interactive===false)return;
    const pos=position(event);
    if(!pos) {pointer=null;return;}
    if (pointerStrength) {
      lastPointerMove=performance.now();
      resumeInteraction();
    }
    const vx=pointer ? pos.x-pointer.x : 0, vy=pointer ? pos.y-pointer.y : 0;
    const dist=Math.hypot(vx,vy);
    if(pointerStrength && pointerMode==='brush' && pointer && dist>field.dx*.80){
      const steps=Math.min(5,Math.max(1,Math.ceil(dist/(field.radius*.37))));
      for(let i=0;i<steps;i++) trails.push({x:pointer.x+vx*i/steps,y:pointer.y+vy*i/steps,
          vx:vx/(dist||1),vy:vy/(dist||1),speed:Math.min(85,dist),time:lastPointerMove});
      if(trails.length>10)trails.splice(0,trails.length-10);
    }
    if(pointerStrength && pointerMode==='threads') addThreadPoint(pos,vx/(dist||1),vy/(dist||1));
    pointer={...pos,vx:vx/(dist||1),vy:vy/(dist||1),speed:Math.min(85,dist)};
  }
  function click(event) {
    if(!field || !motionAllowed() || !visible || options.interactive===false)return;
    const pos=position(event);
    if(!pos)return;
    move(event);ripples.push({...pos,time:performance.now()});if(ripples.length>3)ripples.shift();
    resumeInteraction();
  }
  function leave(){
    if (!pointer) return;
    if(pointerMode==='brush' && pointerStrength)trails.push({...pointer,time:performance.now()});
    pointer=null;
    resumeInteraction();
  }
  function touchEnd(event){if(event.pointerType !== 'mouse')leave();}
  const sizeWatch=new ResizeObserver(resize);
  const inView=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;wake();});
  sizeWatch.observe(canvas);inView.observe(canvas);
  const passive={passive:true,capture:true};
  eventTarget.addEventListener('pointermove',move,passive);
  eventTarget.addEventListener('pointerdown',click,passive);
  eventTarget.addEventListener('pointerleave',leave,passive);
  eventTarget.addEventListener('pointerup',touchEnd,passive);
  eventTarget.addEventListener('pointercancel',leave,passive);
  window.addEventListener('blur',leave);
  document.addEventListener('visibilitychange',wake);
  media.addEventListener('change',wake);
  resize();
  return {
    scrollImpulse,
    setFlowStrength,
    setPointerEffect,
    setPaused(value){paused=Boolean(value);wake();},
    setStage(value){
      if(!Number.isFinite(value))return;
      stageTarget=clamp(value,0,1);
      if(!motionAllowed()){stage=stageTarget;if(field)paint(elapsed/period);}
      else resumeInteraction();
    },
    dispose(){
      disposed=true;wheelWaves.length=0;flow=null;clearPointerHistory();pointer=null;cancelAnimationFrame(frame);clearTimeout(idleTimer);sizeWatch.disconnect();inView.disconnect();
      eventTarget.removeEventListener('pointermove',move,true);eventTarget.removeEventListener('pointerdown',click,true);
      eventTarget.removeEventListener('pointerleave',leave,true);eventTarget.removeEventListener('pointerup',touchEnd,true);
      eventTarget.removeEventListener('pointercancel',leave,true);window.removeEventListener('blur',leave);
      document.removeEventListener('visibilitychange',wake);media.removeEventListener('change',wake);
      field=null;
    },
  };
}
