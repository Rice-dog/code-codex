import assert from 'node:assert/strict';
import {createPerformancePolicy,PERFORMANCE_PROFILES} from '../packages/explorer-ui/plugins/appearance/shallow-ocean/performance.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const checks=[];
function test(name,fn){fn();checks.push(name);}
test('All explicit quality modes target60FPS on60,120 and144Hz displays',()=>{for(const mode of [1,2,3])for(const hz of [60,120,144]){const p=createPerformancePolicy(mode);let n=0;for(let i=0;i<hz*10;i++)n+=Number(p.shouldRender(i*1000/hz));assert.equal(p.snapshot().targetFps,60);assert(Math.abs(n-600)<=1);}});

test('Automatic quality transitions keep60FPS at every level',()=>{const p=createPerformancePolicy();for(let i=0;i<135;i++)p.observe(.065);assert.equal(p.profile.name,'low');assert.equal(p.profile.fps,60);for(let i=0;i<4400;i++)p.observe(1/60);assert.equal(p.profile.name,'high');assert.equal(p.profile.fps,60);});

test('Pixel budgets cap4K/highDPI buffers and retain lowDPI sharpness',()=>{for(const mode of [1,2,3]){const p=createPerformancePolicy(mode),q=p.pixelRatio(3,3840,2160);assert(q*q*3840*2160<=p.profile.maxPixels+.001);assert.equal(p.pixelRatio(.75,800,600),.75);}});
test('All profiles preserve nonzero particles, shadows and migration visuals',()=>{for(const p of PERFORMANCE_PROFILES){assert(p.particles>0&&p.shadows>=16&&p.migration>=360);}});
test('Explicit modes never silently change under sustained load',()=>{for(const mode of [1,2,3]){const p=createPerformancePolicy(mode);for(let i=0;i<24000;i++)assert.equal(p.observe(.1),false);assert.equal(p.snapshot().mode,mode);}});
test('Auto only lowers after sustained slowdown, not a transient hitch',()=>{const p=createPerformancePolicy();for(let i=0;i<65;i++)p.observe(.065);assert.equal(p.profile.name,'medium');for(let i=0;i<70;i++)p.observe(.065);assert.equal(p.profile.name,'low');});
test('Auto ignores pauses and has a cooldown before raising quality',()=>{const p=createPerformancePolicy();for(let i=0;i<135;i++)p.observe(.065);assert.equal(p.profile.name,'low');for(let i=0;i<20;i++)assert.equal(p.observe(60),false);for(let i=0;i<360;i++)p.observe(1/60);assert.equal(p.profile.name,'low');let recovered=false;for(let i=0;i<2400;i++){p.observe(1/60);if(p.profile.name==='medium')recovered=true;}assert(recovered);});
test('Mode changes reset frame gates and invalid modes normalize safely',()=>{const p=createPerformancePolicy(1);p.shouldRender(10);assert(!p.shouldRender(11));p.setMode(3);assert(p.shouldRender(11));p.setMode(NaN);assert.equal(p.snapshot().mode,0);p.setMode(99);assert.equal(p.snapshot().mode,3);});
test('Visibility resume drops missed deadlines without queued bursts',()=>{const p=createPerformancePolicy(1);p.shouldRender(0);p.resetClock();assert(p.shouldRender(600000));assert(!p.shouldRender(600001));});
mkdirSync('artifacts/ocean-performance',{recursive:true});writeFileSync('artifacts/ocean-performance/policy.json',JSON.stringify({passed:true,checks},null,2));console.log(`Ocean performance: ${checks.length} policy checks passed`);
