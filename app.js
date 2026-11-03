/* ChocoLyric Studio | vanilla JS - no external libraries */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const P=window.LyricsPainter;
let nextId=0;
const clone=o=>JSON.parse(JSON.stringify(o));
const clamp=P.clamp;
const ENDROLL_STYLE_DEFAULTS={
  sameStyle:false,
  title:{fontFamily:'"Yu Mincho", "Hiragino Mincho ProN", serif',fontWeight:'700',fontSize:42,color:'#FFF7EC',strokeColor:'#20120E',strokeWidth:6},
  body:{fontFamily:'"Yu Gothic", Meiryo, sans-serif',fontWeight:'500',fontSize:30,color:'#FFF7EC',strokeColor:'#20120E',strokeWidth:5},
  background:{enabled:true,color:'#22140F',opacity:56}
};
const state={width:1920,height:1080,bgColor:'#38241e',bgImage:null,bgObjectURL:null,bgFile:null,
  cues:[],tapLines:[],fonts:[],selectedId:null,time:0,duration:120,
  audio:null,audioFile:null,audioUrl:null,audioPlaying:false,virtualPlaying:false,virtualAt:0,virtualStart:0,
  loop:false,force:false,needUi:true,mode:"lyrics",mediaAssets:[],creditClips:[],selectedAssetId:null,selectedClipId:null,endroll:{start:0,end:20,direction:'bottomToTop',positionX:50,textAlign:'center',bodyOffsetX:0,cards:[],style:clone(ENDROLL_STYLE_DEFAULTS)},selectedEndrollCardId:null};
const canvas=$('previewCanvas'),ctx=canvas.getContext('2d');
const editorFields=['cueText','cueStart','cueEnd','posX','posY','fontFamily','fontWeight','fontSize','align','letterSpacing','stroke','strokeWidth','shadow','animation','animSpeed','animIntensity','fadeIn','fadeOut','fadeInDuration','fadeOutDuration'];
let toastTimer=null;
function toast(msg){let t=$('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),2900);}
function uid(){return 'cl_'+Date.now().toString(36)+'_'+(++nextId);}
function num(n,d=0){let v=Number(n);return Number.isFinite(v)?v:d;}
function two(n){return String(n).padStart(2,'0');}
function fmt(sec){sec=Math.max(0,num(sec));return `${two(Math.floor(sec/60))}:${two(Math.floor(sec%60))}.${two(Math.floor((sec%1)*100))}`;}
function srtStamp(sec){let ms=Math.round(Math.max(0,num(sec))*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${two(h)}:${two(m)}:${two(s)},${String(ms%1000).padStart(3,'0')}`;}
function parseStamp(s){let match=String(s||'').trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);if(!match)return null;let h=num(match[1]),m=num(match[2]),sec=num(match[3]),ms=num((match[4]||'').padEnd(3,'0'));if(m>59||sec>59)return null;return h*3600+m*60+sec+ms/1000;}
function parseSRT(input){let out=[],blocks=String(input).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/);for(let block of blocks){let lines=block.split('\n').map(l=>l.trimEnd());if(/^\s*\d+\s*$/.test(lines[0]))lines.shift();let row=lines.shift()||'';let m=row.match(/^\s*(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/);if(!m)continue;let start=parseStamp(m[1]),end=parseStamp(m[2]);let text=lines.join('\n').trim();if(start===null||end===null||end<=start||!text)continue;out.push({id:uid(),start,end,text,layer:0,style:null});}return out.sort((a,b)=>a.start-b.start||a.end-b.end);}
function cue(){return state.cues.find(c=>c.id===state.selectedId)||null;}
function cueById(id){return state.cues.find(c=>c.id===id)||null;}
function duration(){let last=Math.max(10,...state.cues.map(c=>c.end+2),...state.creditClips.map(c=>c.end+2),state.endroll.end+2,0);return Math.max(last,Number.isFinite(state.audio?.duration)?state.audio.duration:0);}
function refreshDuration(){state.duration=duration();$('totalTime').textContent=fmt(state.duration);$('timelineRange').textContent=`00:00 — ${fmt(state.duration)}`;}
function emptyStyle(x=state.width/2,y=state.height*.79){return {...clone(P.defaults),x,y,fontSize:Math.round(state.height*.061),strokeWidth:Math.max(2,Math.round(state.height*.0048)),intensity:Math.round(state.height*.026)};}
function freshCue(text,start,end,style){return {id:uid(),text:String(text||''),start:Math.max(0,start),end:Math.max(start+.06,end),layer:0,style:clone(style||emptyStyle())};}
function defaultSelectCue(){if(!cue())state.selectedId=state.cues[0]?.id||null;}
function selectCue(id,seek=true){if(!cueById(id))return;state.selectedId=id;let c=cue();if(seek){let t=c.start+Math.min(.48,Math.max(.02,(c.end-c.start)*.35));setTime(t,true);}renderUI();}
function updateCanvasSize(){canvas.width=state.width;canvas.height=state.height;canvas.style.aspectRatio=`${state.width}/${state.height}`;$('screenInfo').textContent=`${state.width} × ${state.height} px`;$('posX').max=state.width;$('posY').max=state.height;renderPreview();}
function setSize(w,h){w=Math.round(clamp(w,320,3840));h=Math.round(clamp(h,240,2160));let rx=w/state.width,ry=h/state.height;state.cues.forEach(c=>{c.style.x=Math.round(c.style.x*rx);c.style.y=Math.round(c.style.y*ry);c.style.fontSize=Math.max(12,Math.round(c.style.fontSize*ry));c.style.strokeWidth=Math.max(0,Math.round(c.style.strokeWidth*ry));c.style.intensity=Math.round(c.style.intensity*ry);});for(const part of ['title','body']){let st=state.endroll.style[part];st.fontSize=Math.max(12,Math.round(st.fontSize*ry));st.strokeWidth=Math.max(0,Math.round(st.strokeWidth*ry));}state.width=w;state.height=h;updateCanvasSize();renderUI();}
function timeUpdate(){let t=state.audio && !state.audio.paused ? state.audio.currentTime:state.time;if(state.virtualPlaying){t=state.virtualStart+(performance.now()-state.virtualAt)/1000;if(t>=state.duration){if(state.loop){state.virtualStart=0;state.virtualAt=performance.now();t=0;}else{t=state.duration;state.virtualPlaying=false;}}}state.time=clamp(t,0,Math.max(1,state.duration));}
function setTime(t,seekMedia=true){state.time=clamp(t,0,Math.max(1,state.duration));if(seekMedia && state.audio){try{state.audio.currentTime=state.time;}catch(e){}}if(state.virtualPlaying){state.virtualStart=state.time;state.virtualAt=performance.now();}updateTimeUI();renderPreview();}
function updateTimeUI(){$('currentTime').textContent=fmt(state.time);$('playhead').style.left=`${clamp(state.time/state.duration*100,0,100)}%`;$('playBtn').textContent=(state.audio && !state.audio.paused)||state.virtualPlaying?'❚❚':'▶';}
function playPause(){if(state.audio){if(state.audio.paused){let promise=state.audio.play();promise&&promise.catch(()=>toast('音声を再生できません。形式を確認してください。'));}else state.audio.pause();}else{if(state.virtualPlaying){state.virtualPlaying=false;}else{if(state.time>=state.duration-.02)state.time=0;state.virtualPlaying=true;state.virtualStart=state.time;state.virtualAt=performance.now();}}updateTimeUI();}
function audioChanged(file){if(state.audio){state.audio.pause();state.audio.remove();state.audio=null;}if(state.audioUrl){URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;}state.audioFile=file||null;state.virtualPlaying=false;
  if(!file){$('audioTitle').textContent='音声ファイルを選ぶ';$('exportAudioName').readOnly=false;$('exportAudioName').value='';$('importStatus').textContent='まだ素材を読み込んでいません';refreshDuration();return;}
  state.audioUrl=URL.createObjectURL(file);let a=new Audio();a.preload='metadata';a.src=state.audioUrl;state.audio=a;
  a.addEventListener('loadedmetadata',()=>{refreshDuration();renderTimeline();toast(`音声を読み込みました：${fmt(a.duration)}`);});
  a.addEventListener('ended',()=>{if(state.loop){a.currentTime=0;a.play().catch(()=>{});}updateTimeUI();});
  a.addEventListener('play',updateTimeUI);a.addEventListener('pause',updateTimeUI);
  $('audioTitle').textContent=file.name;$('exportAudioName').value=file.name;$('exportAudioName').readOnly=true;$('importStatus').textContent='音声：'+file.name;
  refreshDuration();renderUI();
}
function drawBackground(){const w=state.width,h=state.height;ctx.fillStyle=state.bgColor;ctx.fillRect(0,0,w,h);
  if(state.bgImage){let iw=state.bgImage.width,ih=state.bgImage.height,scale=Math.max(w/iw,h/ih);let rw=iw*scale,rh=ih*scale;ctx.drawImage(state.bgImage,(w-rw)/2,(h-rh)/2,rw,rh);return;}
  ctx.save();let a=ctx.createRadialGradient(w*.5,h*.24,w*.05,w*.5,h*.45,w*.88);a.addColorStop(0,'#f3d6a31d');a.addColorStop(1,'#13080600');ctx.fillStyle=a;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#f3e0ba0e';ctx.lineWidth=Math.max(1,w/1600);ctx.strokeRect(w*.04,h*.07,w*.92,h*.86);
  ctx.restore();
}
function renderPreview(){ctx.clearRect(0,0,state.width,state.height);drawBackground();drawCreditMedia(ctx,state.time);drawEndroll(ctx,state.time);if(state.mode!=="credits"&&state.mode!=="endroll"||$("previewLyricsWithCredits").checked)P.draw(ctx,state.cues,state.time,{width:state.width,height:state.height});let c=cue();if(c && state.mode==="lyrics" && state.force && (state.time<c.start||state.time>=c.end))P.drawCue(ctx,c,state.time,{width:state.width,force:true});
  if(c && state.mode==="lyrics" && !(state.audio&&!state.audio.paused) && !state.virtualPlaying){ctx.save();let x=c.style.x,y=c.style.y,len=Math.max(10,state.width*.007);ctx.strokeStyle='#f6cb807f';ctx.lineWidth=Math.max(1,state.width/1900);ctx.beginPath();ctx.moveTo(x-len,y);ctx.lineTo(x+len,y);ctx.moveTo(x,y-len);ctx.lineTo(x,y+len);ctx.stroke();ctx.beginPath();ctx.arc(x,y,len*.37,0,Math.PI*2);ctx.stroke();ctx.restore();}
}
function frame(){timeUpdate();if((state.audio&&!state.audio.paused)||state.virtualPlaying)renderPreview();updateTimeUI();requestAnimationFrame(frame);}
function el(tag,cl,txt){const node=document.createElement(tag);if(cl)node.className=cl;if(txt!=null)node.textContent=txt;return node;}
function renderCueList(){const container=$('cueList'),previousScroll=container.scrollTop;container.textContent='';let cues=state.cues.slice().sort((a,b)=>a.start-b.start||a.end-b.end);$('cueCount').textContent=cues.length;
  if(!cues.length){container.append(el('div','empty-list','まだ歌詞はありません。SRTを読み込むか、＋ボタンで追加してください。'));return;}
  cues.forEach((c,index)=>{let row=el('div','cue-item'+(c.id===state.selectedId?' selected':''));row.tabIndex=0;row.dataset.id=c.id;
    row.append(el('div','cue-index',two(index+1)));
    let content=el('div','cue-line');content.append(el('div','cue-name',c.text?c.text.replace(/\n/g,' / '):'（歌詞を入力）'));
    let when=el('div','cue-time');when.append(document.createTextNode(fmt(c.start)));
    when.append(el('span','', '→'));when.append(document.createTextNode(fmt(c.end)));content.append(when);row.append(content);
    let buttons=el('div','cue-actions');let dup=el('button','cue-more','⧉');dup.title='複製';dup.addEventListener('click',e=>{e.stopPropagation();let nc=freshCue(c.text,c.end,c.end+(c.end-c.start),c.style);state.cues.push(nc);refreshDuration();selectCue(nc.id);});buttons.append(dup);
    let del=el('button','cue-more','×');del.title='削除';del.addEventListener('click',e=>{e.stopPropagation();removeCue(c.id);});buttons.append(del);row.append(buttons);
    row.addEventListener('click',()=>selectCue(c.id));row.addEventListener('keydown',e=>{if(e.key==='Enter')selectCue(c.id);});container.append(row);
  });
  container.scrollTop=previousScroll;
  if(cue())$('previewCueInfo').textContent=`選択中： ${cue().text.replace(/\n/g,' / ').slice(0,42)}`;
}
function renderTapList(){const c=$('tapList');c.textContent='';let pending=state.tapLines.filter(x=>!x.usedId).length;$('unplacedCount').textContent=pending?`(${pending})`:'';
  if(!state.tapLines.length){c.append(el('div','empty-list','歌詞TXTの各行を読み込み、再生中にクリックするとその時刻に配置されます。'));return;}
  let hint=el('p','tap-hint','▶ 再生しながら下の歌詞を押すと、その時点が開始時刻になります。もう一度押すと配置を解除します。');c.append(hint);
  state.tapLines.forEach((line,i)=>{let b=el('button','tap-item'+(line.usedId?' used':''));b.append(el('span','tap-icon',line.usedId?'✓':'＋'));b.append(el('span','',line.text));b.title=line.usedId?'クリックで配置を解除':'現在の再生位置に配置';b.addEventListener('click',()=>tapLine(i));c.append(b);});
}
function renderTimeline(){refreshDuration();let container=$('timelineCues');container.textContent='';let d=state.duration||1;state.cues.slice().sort((a,b)=>a.start-b.start).forEach(c=>{let b=el('div','cue-bar'+(c.id===state.selectedId?' active':''));b.style.left=(100*c.start/d)+'%';b.style.width=(100*Math.max(0,c.end-c.start)/d)+'%';b.title=`${c.text}\n${fmt(c.start)}～${fmt(c.end)}`;b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',e=>{e.stopPropagation();selectCue(c.id);});container.append(b);});
  renderCreditTimeline();
}
function updateDependent(){for(const name of ['stroke','shadow'])document.querySelectorAll('[data-dependent="'+name+'"]').forEach(elm=>elm.classList.toggle('is-disabled',!$(name).checked));$('fadeInDuration').disabled=!$('fadeIn').checked;$('fadeOutDuration').disabled=!$('fadeOut').checked;}
const fieldMap={cueText:'text',cueStart:'start',cueEnd:'end',posX:'x',posY:'y',fontFamily:'fontFamily',fontWeight:'fontWeight',fontSize:'fontSize',align:'align',letterSpacing:'letterSpacing',stroke:'stroke',strokeWidth:'strokeWidth',shadow:'shadow',animation:'animation',animSpeed:'speed',animIntensity:'intensity',fadeIn:'fadeIn',fadeOut:'fadeOut',fadeInDuration:'fadeInDuration',fadeOutDuration:'fadeOutDuration'};
const fieldsBoolean=new Set(['stroke','shadow','fadeIn','fadeOut']);
const fieldsText=new Set(['cueText','fontFamily','fontWeight','align','animation']);
const ENDROLL_COLORS={endrollBgColor:['background','color'],endrollTitleColor:['title','color'],endrollTitleStrokeColor:['title','strokeColor'],endrollBodyColor:['body','color'],endrollBodyStrokeColor:['body','strokeColor']};
function colorValue(key){if(ENDROLL_COLORS[key]){const [part,prop]=ENDROLL_COLORS[key];return state.endroll.style[part][prop];}return key==='background'?state.bgColor:cue()?.style[key]||P.defaults[key];}
function syncColorInputs(){document.querySelectorAll('[data-color]').forEach(b=>{b.style.background=colorValue(b.dataset.color);});document.querySelectorAll('[data-hex]').forEach(inp=>{inp.value=colorValue(inp.dataset.hex);});}
function syncEditor(){let c=cue();editorFields.forEach(id=>{$(id).disabled=!c;});if(!c){$('cueText').value='';$('selectedNumber').textContent='— / '+state.cues.length;syncColorInputs();return;}
  let sorted=state.cues.slice().sort((a,b)=>a.start-b.start);$('selectedNumber').textContent=`${two(sorted.findIndex(x=>x.id===c.id)+1)} / ${two(sorted.length)}`;
  editorFields.forEach(id=>{let key=fieldMap[id];let val=id==='cueText'?c.text:(['cueStart','cueEnd'].includes(id)?c[key]:c.style[key]);if(fieldsBoolean.has(id))$(id).checked=!!val;else $(id).value=val??'';});
  const out=[['posX','px'],['posY','px'],['fontSize','px'],['strokeWidth','px'],['animSpeed',''],['animIntensity','px'],['fadeInDuration','s'],['fadeOutDuration','s']];out.forEach(([id,suffix])=>{$(id+'Output').textContent=`${$(id).value}${suffix}`;});syncColorInputs();updateDependent();}
function renderUI(){defaultSelectCue();renderCueList();renderTapList();renderTimeline();syncEditor();renderEndrollUI();renderCreditsUI();updateTimeUI();renderPreview();}
function removeCue(id){state.cues=state.cues.filter(x=>x.id!==id);state.tapLines.forEach(x=>{if(x.usedId===id)x.usedId=null;});if(state.selectedId===id)state.selectedId=state.cues[0]?.id||null;renderUI();}
function tapLine(i){let line=state.tapLines[i];if(!line)return;if(line.usedId){removeCue(line.usedId);toast('配置を解除しました');return;}
  let now=state.audio?state.audio.currentTime:state.time;
  let style=cue()?clone(cue().style):emptyStyle();
  let prev=state.cues.slice().filter(x=>x.start<now).sort((a,b)=>b.start-a.start)[0];
  if(prev && prev.end>now && now>prev.start+.05)prev.end=now;
  let newCue=freshCue(line.text,now,now+3.6,style);line.usedId=newCue.id;state.cues.push(newCue);state.selectedId=newCue.id;
  refreshDuration();renderUI();toast(`歌詞を配置しました　${fmt(now)}`);
}
function setActiveTab(tab){document.querySelectorAll('.switch-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('cueList').classList.toggle('hidden',tab!=='cues');$('tapList').classList.toggle('hidden',tab!=='tap');}
function parseHex(value){let m=String(value||'').trim().toUpperCase().match(/^#?([0-9A-F]{6})$/);return m?'#'+m[1]:null;}
function applyColor(key,value){let hex=parseHex(value);if(!hex)return;
  if(ENDROLL_COLORS[key]){let [part,prop]=ENDROLL_COLORS[key];state.endroll.style[part][prop]=hex;if(state.endroll.style.sameStyle&&part==='title')state.endroll.style.body[prop]=hex;}
  else if(key==='background')state.bgColor=hex;else if(cue())cue().style[key]=hex;
  syncColorInputs();renderPreview();}
// Custom circular HSV picker with a rectangular saturation/value patch in its centre.
let cp={target:null,h:30,s:.3,v:1,active:null};const wheel=$('colorWheel'),wctx=wheel.getContext('2d');
function hsvToRgb(h,s,v){h=((h%360)+360)%360;let c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c,r=0,g=0,b=0;if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}return [r,g,b].map(n=>Math.round((n+m)*255));}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;let max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0;if(d){switch(max){case r:h=(g-b)/d%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return {h,s:max===0?0:d/max,v:max};}
function rgbToHex(a){return '#'+a.map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();}
function hexToHsv(value){let h=parseHex(value)||'#FFFFFF';return rgbToHsv(parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16));}
function drawColorWheel(){const W=230,cx=115,cy=115,r=100,inner=83,sq=63;wctx.clearRect(0,0,W,W);for(let deg=0;deg<360;deg+=1){wctx.beginPath();wctx.arc(cx,cy,r,deg*Math.PI/180,(deg+2)*Math.PI/180);wctx.arc(cx,cy,inner,(deg+2)*Math.PI/180,deg*Math.PI/180,true);wctx.closePath();wctx.fillStyle=rgbToHex(hsvToRgb(deg,1,1));wctx.fill();}
  let bx=cx-sq,by=cy-sq,ss=sq*2;wctx.fillStyle=rgbToHex(hsvToRgb(cp.h,1,1));wctx.fillRect(bx,by,ss,ss);
  let grad=wctx.createLinearGradient(bx,0,bx+ss,0);grad.addColorStop(0,'#FFFFFF');grad.addColorStop(1,'#FFFFFF00');wctx.fillStyle=grad;wctx.fillRect(bx,by,ss,ss);
  grad=wctx.createLinearGradient(0,by,0,by+ss);grad.addColorStop(0,'#00000000');grad.addColorStop(1,'#000000');wctx.fillStyle=grad;wctx.fillRect(bx,by,ss,ss);
  wctx.strokeStyle='#FFFFFF';wctx.lineWidth=3;let theta=cp.h*Math.PI/180;wctx.beginPath();wctx.arc(cx+((r+inner)/2)*Math.cos(theta),cy+((r+inner)/2)*Math.sin(theta),7,0,Math.PI*2);wctx.stroke();wctx.strokeStyle='#372019';wctx.lineWidth=1;wctx.strokeRect(bx,by,ss,ss);
  let xx=bx+cp.s*ss,yy=by+(1-cp.v)*ss;wctx.beginPath();wctx.arc(xx,yy,5.5,0,Math.PI*2);wctx.strokeStyle=cp.v>.5?'#3f271a':'#fff';wctx.lineWidth=2;wctx.stroke();let result=rgbToHex(hsvToRgb(cp.h,cp.s,cp.v));$('colorPreviewDot').style.background=result;$('colorCurrent').textContent=result;$('nativePicker').value=result;
}
function openColor(target,b){if(!ENDROLL_COLORS[target]&&target!=='background'&&!cue())return;cp.target=target;Object.assign(cp,hexToHsv(colorValue(target)));drawColorWheel();let p=$('colorPopover'),rect=b.getBoundingClientRect();p.classList.remove('hidden');const left=Math.min(window.innerWidth-270,Math.max(8,rect.left-170)),top=rect.top+36;const above=top+340>window.innerHeight; p.style.left=left+'px';p.style.top=(above?Math.max(8,rect.top-339):top)+'px';}
function colorPoint(e){let r=wheel.getBoundingClientRect();return {x:(e.clientX-r.left)*230/r.width-115,y:(e.clientY-r.top)*230/r.height-115};}
function wheelChange(e){if(!cp.target)return;let p=colorPoint(e),rad=Math.hypot(p.x,p.y);if(cp.active==='ring'){cp.h=((Math.atan2(p.y,p.x)*180/Math.PI)%360+360)%360;}else{cp.s=clamp((p.x+63)/126,0,1);cp.v=clamp(1-(p.y+63)/126,0,1);}drawColorWheel();applyColor(cp.target,rgbToHex(hsvToRgb(cp.h,cp.s,cp.v)));}
// A file's displayed name and ZIP member basename must stay unchanged.
// Reject unsafe names rather than silently replacing characters.
function originalName(name){
  const result=String(name||'').replace(/\\/g,'/').split('/').pop();
  if(!result||result==='.'||result==='..'||/[\x00-\x1f/:*?"<>|]/.test(result))
    throw new Error('使用できない素材ファイル名です：'+String(name));
  return result;
}
// Encode each URL segment (not the path separators) so #, %, Japanese and
// other user-supplied characters remain literal ZIP names but resolve as URLs.
function resourceURL(path){return String(path).split('/').map(encodeURIComponent).join('/');}
// Font faces are loaded from user files for canvas preview. Imported font binaries
// are included in both game ZIP and self-contained project JSON.
function fontValue(font){return '"'+font.family+'", "Yu Gothic", sans-serif';}
function fontExportName(font){return originalName(font.name);}
function fontExportPath(font){return 'data/others/font/'+fontExportName(font);}
function renderFontManager(){
  const select=$('fontFamily');const fontSelects=[select,$('endrollTitleFont'),$('endrollBodyFont')];fontSelects.forEach(sel=>sel.querySelectorAll('option[data-custom-font]').forEach(x=>x.remove()));
  for(const font of state.fonts){let opt=document.createElement('option');opt.dataset.customFont=font.id;opt.value=fontValue(font);opt.textContent=(font.file?'✦ ':'⚠ ')+font.name+(font.file?'':'（再読み込みが必要）');fontSelects.forEach(sel=>sel.append(opt.cloneNode(true)));}
  const list=$('fontList');list.replaceChildren();
  for(const font of state.fonts){
    const row=el('div','font-resource'+(font.file?'':' missing'));
    const labels=el('div');labels.append(el('strong','',font.name));labels.append(el('small','',font.file?'読み込み済み・ZIPに自動同梱':'ファイル未接続・同名ファイルを再選択'));
    const button=el('button','', '×');button.type='button';button.title=font.name+' を削除';button.setAttribute('aria-label',font.name+' を削除');
    button.addEventListener('click',()=>removeFont(font.id));row.append(labels,button);list.append(row);
  }
  let ready=state.fonts.filter(f=>f.file).length,missing=state.fonts.filter(f=>!f.file).length;
  const preview=$('exportFontsPreview');preview.classList.toggle('hidden',!(ready||missing));
  preview.textContent=ready?'data/others/font/（'+ready+' ファイル）':'data/others/font/（再読み込みが必要）';
}
function discardFontFace(font){if(font.face){try{document.fonts.delete(font.face);}catch(_){}}if(font.url){URL.revokeObjectURL(font.url);}font.face=null;font.url=null;font.file=null;}
function removeFont(id){
  const font=state.fonts.find(f=>f.id===id);if(!font)return;
  const replacement=P.defaults.fontFamily;state.cues.forEach(c=>{if(c.style.fontFamily===fontValue(font))c.style.fontFamily=replacement;});for(const part of ['title','body']){if(state.endroll.style[part].fontFamily===fontValue(font))state.endroll.style[part].fontFamily=ENDROLL_STYLE_DEFAULTS[part].fontFamily;}
  discardFontFace(font);state.fonts=state.fonts.filter(f=>f.id!==id);
  renderFontManager();renderUI();toast('フォントを削除しました');
}
function resetFonts(){state.fonts.forEach(discardFontFace);state.fonts=[];renderFontManager();}
async function importFont(file,selectForCue=true){
  if(!file||!(/\.(ttf|otf|woff2?)$/i).test(file.name))throw new Error('TTF / OTF / WOFF / WOFF2 のみ対応しています');
  if(file.size===0||file.size>100*1024*1024)throw new Error('フォントのファイルサイズを確認してください（最大100MB）');
  const old=state.fonts.find(f=>f.name.toLowerCase()===file.name.toLowerCase());
  const id=old?.id||uid().replace('cl_','clfont_');
  const family=old?.family||('ChocoLyric_'+id);
  const url=URL.createObjectURL(file);
  let face=null;
  try{
    face=new FontFace(family,'url('+JSON.stringify(url)+')');
    await face.load();document.fonts.add(face);
  }catch(err){URL.revokeObjectURL(url);throw new Error('フォントを開けません：'+file.name);}
  if(old){discardFontFace(old);Object.assign(old,{file,url,face,name:file.name,family});}
  else state.fonts.push({id,name:file.name,family,file,url,face});
  if(selectForCue&&cue())cue().style.fontFamily=fontValue(old||state.fonts[state.fonts.length-1]);
  renderFontManager();renderUI();renderPreview();
}
async function importFonts(files,selectForCue=true){
  let count=0,errors=[];
  for(const file of files){try{await importFont(file,selectForCue);count++;}catch(err){errors.push(err.message);}}
  if(errors.length)toast(errors[0]+(errors.length>1?' ほか'+(errors.length-1)+'件':''));
  else if(count)toast(count+'件のフォントを追加しました。書き出しZIPに自動同梱されます');
}
function missingUsedFonts(){return state.fonts.filter(f=>!f.file&&(state.cues.some(c=>c.style?.fontFamily===fontValue(f))||['title','body'].some(part=>state.endroll.style[part].fontFamily===fontValue(f))));}
function download(blob,filename){let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportSRT(){let cues=state.cues.slice().sort((a,b)=>a.start-b.start);if(!cues.length){toast('書き出す歌詞がありません');return;}
  let contents='\uFEFF'+cues.map((c,i)=>`${i+1}\r\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\r\n${c.text.trim()}`).join('\r\n\r\n')+'\r\n';download(new Blob([contents],{type:'text/plain;charset=utf-8'}),'lyrics.srt');toast('SRTを書き出しました');}
// Project JSON v4+: original user media is embedded as data: URLs (Base64).
// This makes a single JSON portable, including audio, images, videos and fonts.
function fileAsDataURL(file){return new Promise((resolve,reject)=>{
  if(!file){resolve(null);return;}
  let reader=new FileReader();reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error||new Error(file.name+' の読み込みに失敗しました'));
  reader.readAsDataURL(file);
});}
async function fileFromDataURL(dataURL,name,type){
  if(typeof dataURL!=='string'||!/^data:[^,]*;base64,/i.test(dataURL))throw new Error('素材データが破損しています：'+name);
  // fetch(data:) only decodes locally; there is no server upload or network request.
  const response=await fetch(dataURL);
  if(!response.ok)throw new Error('素材を復元できません：'+name);
  const blob=await response.blob();
  return new File([blob],name,{type:type||blob.type||'application/octet-stream'});
}
function withProjectButton(button,working,text){
  button.disabled=working;
  const label=button.querySelector('span');
  if(label)label.textContent=working?text:(button.id==='saveProjectBtn'?'素材込みJSON保存':'プロジェクトを開く');
}
async function saveProject(){
  const button=$('saveProjectBtn');if(button.disabled)return;
  const sources=[state.audioFile,state.bgFile,...state.fonts.map(f=>f.file),...state.mediaAssets.map(a=>a.file)].filter(Boolean);
  const totalBytes=sources.reduce((sum,f)=>sum+f.size,0);
  if(totalBytes>200*1024*1024&&!confirm('素材の合計が約'+(totalBytes/1048576).toFixed(1)+'MBあります。JSONは約'+(totalBytes*4/3/1048576).toFixed(1)+'MB以上になり、保存・読み込み時にメモリを多く使用します。続けますか？'))return;
  withProjectButton(button,true,'素材を保存中…');
  try{
    let done=0;
    async function encoded(file){
      if(!file)return null;
      const dataURL=await fileAsDataURL(file);
      const label=button.querySelector('span');if(label)label.textContent='素材を保存中… '+(++done)+'/'+sources.length;
      // Yield between large files so the UI can repaint.
      await new Promise(r=>setTimeout(r,0));
      return dataURL;
    }
    const data={version:5,app:'ChocoLyric',embeddedAssets:true,width:state.width,height:state.height,
      bgColor:state.bgColor,cues:state.cues,tapLines:state.tapLines,creditClips:state.creditClips,endroll:state.endroll,
      audioFileName:state.audioFile?.name||null,
      audio:state.audioFile?{name:state.audioFile.name,type:state.audioFile.type,dataURL:await encoded(state.audioFile)}:null,
      background:state.bgFile?{name:state.bgFile.name,type:state.bgFile.type,dataURL:await encoded(state.bgFile)}:null,
      fonts:[],mediaAssets:[]};
    for(const font of state.fonts){data.fonts.push({id:font.id,name:font.name,family:font.family,
      type:font.file?.type||'',dataURL:await encoded(font.file)});}
    for(const asset of state.mediaAssets){data.mediaAssets.push({id:asset.id,name:asset.name,type:asset.type,
      mimeType:asset.file?.type||'',size:asset.size,dataURL:await encoded(asset.file)});}
    const out=new Blob([JSON.stringify(data)],{type:'application/json;charset=utf-8'});
    download(out,'chocolyric_project_full.json');
    toast('素材を含むプロジェクトJSONを保存しました（'+(out.size/1048576).toFixed(1)+'MB）');
  }catch(err){console.error(err);toast('JSON保存失敗：'+err.message);}
  finally{withProjectButton(button,false);}
}
function attachBackground(file){
  if(state.bgObjectURL)URL.revokeObjectURL(state.bgObjectURL);
  state.bgFile=file||null;state.bgObjectURL=null;state.bgImage=null;
  if(!file){renderPreview();return;}
  const url=URL.createObjectURL(file);state.bgObjectURL=url;
  const im=new Image();im.onload=()=>{if(state.bgObjectURL===url){state.bgImage=im;renderPreview();}};
  im.onerror=()=>toast('背景画像を復元できません：'+file.name);
  im.src=url;
}
async function loadProject(data){
  if(!data||!Array.isArray(data.cues))throw new Error('ChocoLyric JSONの形式が正しくありません');
  pauseAll();audioChanged(null);resetFonts();resetAssets();attachBackground(null);
  state.mediaAssets=(Array.isArray(data.mediaAssets)?data.mediaAssets:[])
    .filter(a=>a&&typeof a.name==='string'&&['video','image'].includes(a.type))
    .map(a=>({id:String(a.id||uid()),name:a.name,size:num(a.size),type:a.type,file:null,objectUrl:null,element:null}));
  state.creditClips=(Array.isArray(data.creditClips)?data.creditClips:[])
    .filter(c=>c&&state.mediaAssets.some(a=>a.id===c.assetId))
    .map(c=>({id:String(c.id||uid()),assetId:c.assetId,start:Math.max(0,num(c.start)),
      end:Math.max(num(c.start)+.05,num(c.end,num(c.start)+6)),autoEnd:c.autoEnd!==false,
      crossfade:!!c.crossfade,fade:clamp(num(c.fade,1),.1,5),fit:c.fit==='contain'?'contain':'cover',loop:c.loop===true}));
  state.endroll=normalizeEndroll(data.endroll);
  state.selectedEndrollCardId=state.endroll.cards[0]?.id||null;
  state.selectedAssetId=state.mediaAssets[0]?.id||null;state.selectedClipId=sortedClips()[0]?.id||null;
  $('exportAudioName').value=data.audioFileName||data.audio?.name||'';
  state.width=Math.round(clamp(data.width||1920,320,3840));state.height=Math.round(clamp(data.height||1080,240,2160));
  state.cues=data.cues.map(c=>({id:c.id||uid(),text:String(c.text||''),start:num(c.start),
    end:Math.max(num(c.start)+.06,num(c.end)),layer:num(c.layer),style:{...emptyStyle(),...c.style}}));
  state.tapLines=Array.isArray(data.tapLines)?data.tapLines:[];
  const savedFonts=(Array.isArray(data.fonts)?data.fonts:[]).filter(f=>f&&typeof f.name==='string'
    &&/\.(ttf|otf|woff2?)$/i.test(f.name)&&typeof f.family==='string'
    &&/^ChocoLyric_[a-z0-9_-]+$/i.test(f.family));
  state.fonts=savedFonts.map(f=>({id:String(f.id||uid()),name:f.name,family:f.family,file:null,url:null,face:null}));
  state.bgColor=parseHex(data.bgColor)||'#38241E';state.selectedId=state.cues[0]?.id||null;state.time=0;
  let size=state.width+'x'+state.height;
  $('screenSize').value=[...$('screenSize').options].some(o=>o.value===size)?size:'custom';
  $('customSize').classList.toggle('hidden',$('screenSize').value!=='custom');
  $('customWidth').value=state.width;$('customHeight').value=state.height;
  updateCanvasSize();renderUI();renderFontManager();
  const issues=[];
  if(data.audio?.dataURL){try{audioChanged(await fileFromDataURL(data.audio.dataURL,data.audio.name||'audio.mp3',data.audio.type));}
    catch(e){issues.push(e.message);}}
  if(data.background?.dataURL){try{attachBackground(await fileFromDataURL(data.background.dataURL,data.background.name||'preview.png',data.background.type));}
    catch(e){issues.push(e.message);}}
  for(const f of savedFonts){
    if(!f.dataURL)continue;
    try{await importFont(await fileFromDataURL(f.dataURL,f.name,f.type),false);}
    catch(e){issues.push(e.message);}
  }
  const savedAssets=Array.isArray(data.mediaAssets)?data.mediaAssets:[];
  for(const original of savedAssets){
    if(!original.dataURL)continue;
    try{
      const file=await fileFromDataURL(original.dataURL,original.name,original.mimeType);
      // Reconnect to the same asset id so all existing credits clips stay valid.
      const asset=state.mediaAssets.find(a=>a.id===original.id);
      if(!asset)continue;
      asset.file=file;asset.size=file.size;asset.objectUrl=URL.createObjectURL(file);
      if(asset.type==='image'){
        const img=new Image();img.src=asset.objectUrl;img.onload=renderPreview;
        img.onerror=()=>toast('画像の復元に失敗：'+asset.name);asset.element=img;
      }else{
        const video=document.createElement('video');video.muted=true;video.defaultMuted=true;
        video.playsInline=true;video.preload='auto';video.src=asset.objectUrl;asset.element=video;
        video.addEventListener('seeked',renderPreview);video.addEventListener('loadeddata',renderPreview);
        video.addEventListener('error',()=>toast('動画を再生できません：'+asset.name));
      }
    }catch(e){issues.push(e.message);}
  }
  refreshDuration();renderFontManager();renderUI();renderPreview();
  if(issues.length)toast('一部の素材を復元できません：'+issues[0]);
  else if(data.version>=4)toast('JSONから歌詞・音声・画像・動画・フォントを復元しました');
  else toast('旧形式JSONを開きました。素材は必要に応じて再読み込みしてください');
}
function pauseAll(){state.virtualPlaying=false;if(state.audio)state.audio.pause();}
function makeSrtText(){let cues=state.cues.slice().sort((a,b)=>a.start-b.start);return '\uFEFF'+cues.map((c,i)=>`${i+1}\r\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\r\n${c.text}`).join('\r\n\r\n')+'\r\n';}
function txt(str){return new TextEncoder().encode(str);}
function zipStore(files){let chunks=[],central=[],offset=0,now=new Date(),dosTime=((now.getHours()&31)<<11)|((now.getMinutes()&63)<<5)|((now.getSeconds()/2|0)&31),dosDate=(((now.getFullYear()-1980)&127)<<9)|(((now.getMonth()+1)&15)<<5)|(now.getDate()&31);
  const table=(()=>{let t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
  const seenNames=new Set();
  for(const file of files){if(seenNames.has(file.path.toLowerCase()))throw new Error('ZIP内のファイル名が重複しています：'+file.path);seenNames.add(file.path.toLowerCase());let name=txt(file.path.replace(/\\/g,'/')),data=file.data instanceof Uint8Array?file.data:new Uint8Array(file.data),sum=crc(data);if(data.byteLength>0xFFFFFFFF)throw new Error('ZIP上限サイズを超えています');
    let head=new Uint8Array(30+name.length),v=view(head);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint16(10,dosTime,true);v.setUint16(12,dosDate,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);head.set(name,30);chunks.push(head,data);
    let cHead=new Uint8Array(46+name.length),cv=view(cHead);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);cv.setUint32(16,sum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);cHead.set(name,46);central.push(cHead);offset+=head.length+data.length;
  }
  let centLen=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),e=view(end);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centLen,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
function scriptShow(audioName){const config={width:state.width,height:state.height,audio:resourceURL('data/bgm/'+audioName),removeOnEnd:true,fonts:state.fonts.filter(f=>f.file).map(f=>({family:f.family,path:fontExportPath(f)})),cues:state.cues.map(c=>({start:Number(c.start.toFixed(3)),end:Number(c.end.toFixed(3)),text:c.text,style:c.style,layer:c.layer||0}))};
  // JSON.stringify escapes all text safely, including quotes and newlines.
  // Keep the runtime in the .ks script. This avoids Windows download tools
  // quarantining a separately generated executable .js file.
  const runtime=window.TYRANO_LYRICS_RUNTIME_SOURCE;
  if(!runtime)throw new Error('歌詞描画エンジンが読み込まれていません');
  return `; ChocoLyric Studio / self-contained lyric scene\r\n; 追加のJavaScriptファイルは不要です。\r\n[iscript]\r\nif (!window.TyranoLyrics || !window.LyricsPainter) {\r\n${runtime}\r\n}\r\nwindow.TyranoLyrics.start(${JSON.stringify(config,null,2)});\r\n[endscript]\r\n[return]\r\n`;
}
function scriptStop(){return `; ChocoLyric Studio / playback stop\r\n[iscript]\r\nif (window.TyranoLyrics) window.TyranoLyrics.stop();\r\n[endscript]\r\n[return]\r\n`;}
function exportReadme(audioName){
  const lyrics=!!state.cues.length, endroll=!!state.endroll.cards.length, credits=!!state.creditClips.length;
  const modes=[lyrics?'歌詞':null,endroll?'エンドロール':null,credits?'映像':null].filter(Boolean).join(' + ')||'なし';
  const display='[call storage="choco_start.ks"]';
  const endAll='[call storage="choco_stop.ks"]';
  const fontList=state.fonts.filter(f=>f.file).map(f=>'  '+fontExportPath(f)).join('\r\n');
  const mediaList=state.mediaAssets.filter(a=>a.file).map(a=>'  '+mediaPath(a)).join('\r\n');
  return `ChocoLyric Studio v2.9 - ティラノビルダー導入手順\r\n`+
    `=========================================\r\n\r\n【収録モード】${modes}\r\n`+
    `【画面サイズ】${state.width} × ${state.height} / ゲーム設定の解像度と揃えてください\r\n\r\n`+
    `1. ZIPの data フォルダをゲームプロジェクトの data フォルダへ統合します。\r\n`+
    `2. ゲームの冒頭で（任意）\r\n   [call storage="choco_setup.ks"]\r\n`+
    `3. 再生開始したいKSに以下を挿入します。\r\n   ${display}\r\n`+
    `4. 停止したい【別の場面】で以下を挿入します。\r\n   ${endAll}\r\n\r\n`+
    (lyrics?`・歌詞のみ [call storage=\"lyrics_show.ks\"] / 停止 [call storage=\"lyrics_stop.ks\"]\r\n`:``)+
    (endroll?`・エンドロールのみ [call storage=\"endroll_show.ks\"] / 停止 [call storage=\"endroll_stop.ks\"]\r\n`:``)+
    (credits?`・映像のみ [call storage=\"credits_show.ks\"] / 停止 [call storage=\"credits_stop.ks\"]\r\n`:``)+
    ((lyrics||endroll)&&credits?`・歌詞/エンドロールの再生中に[call storage=\"credits_show.ks\"]を実行しても、音声は二重再生されません。\r\n`:``)+
    `\r\n【重要：開始と停止を続けて書かないでください】\r\n`+
    `初期化は冒頭（任意）： [call storage="choco_setup.ks"]\r\n`+
    `開始する場面： [call storage="choco_start.ks"]\r\n`+
    `停止する別の場面： [call storage="choco_stop.ks"]\r\n`+
    `※ [call]は音声終了まで待たずに処理が進むので、開始直後に停止を置くと音が聞こえません。\r\n\r\n`+
    `【動作確認・最初はこれだけ】\r\n`+
    `[call storage="choco_quick_test.ks"]\r\n`+
    `この1行で初期化→開始→15秒待機→停止を実行します。\r\n`+
    `音声は data/bgm/${audioName} に実際に存在する必要があります。\r\n`+
    `\r\n【書き出し素材】\r\n`+
    `音声 data/bgm/${audioName}（ZIPにない場合は手動配置）\r\n`+
    (fontList?`ユーザーフォント\r\n${fontList}\r\n`:``)+
    (mediaList?`画像・動画（元のファイルをそのまま同梱）\r\n${mediaList}\r\n`:``)+
    `\r\n【重要】\r\n`+
    `・描画優先順は 映像（z-index:99994） → エンドロール（99995） → 歌詞（99996） です。\r\n`+
    `・両方の描画は同一のHTML5 Audio再生時計に同期します。動画内の音声はミュートします。\r\n`+
    `・動画のループ設定は表示クリップごとに個別指定。ONは表示中に繰り返し、OFFは再生終了後も最後のフレームを保持します。\r\n`+
    `・既存の[playbgm]で同じ曲を再生中の場合は音が重なります。必要に応じて[stopbgm]してください。\r\n`+
    `・[call]は再生終了まで待たずに戻ります。シナリオのジャンプや停止は任意のタイミングで実行してください。\r\n`+
    `・動画形式は使用するティラノビルダー/NW.jsのコーデック対応に依存します（MP4 H.264 / WebM推奨）。\r\n`+
    `・OSやブラウザによってはクリックしないと音声の再生が許可されず、再生用ボタンが表示されます。\r\n`+
    `・音声が再生できないときはゲーム画面にファイルパスとエラーを表示します。\r\n`+
    `・外部JavaScriptファイルは不要です。ゲーム内で起動するコードはKSに組み込み済みです。\r\n`+
    `・ユーザー追加フォント・素材のゲームへの同梱や再配布の利用許諾を確認してください。\r\n`+
    `・プロジェクトJSON（v2.4以降）は音声・フォント・画像・動画・プレビュー背景の実ファイルをBase64として含み、次回の読み込みで自動復元します。\r\n`+
    `・実ゲームのセーブ/ロードやジャンプをまたぐ動作は、お使いのティラノビルダーでテストしてください。\r\n`+
    endrollReadme()+creditsReadme(audioName)+
    `\r\n【開発元の区別】\r\n`+
    `ChocoLyric Studioはティラノビルダー／ティラノスクリプトの公式製品ではなく、独立した非公式の制作補助アプリです。\r\n`+
    `ティラノ公式開発者のメール・SNSはこのアプリの問い合わせ先ではありません。\r\n`;
}
async function exportZip(){
  if(!state.cues.length&&!state.creditClips.length&&!state.endroll.cards.length){toast('歌詞・エンドロール・映像のいずれかを配置してください');return;}
  const missing=missingUsedFonts();if(missing.length){toast('使用中のフォント「'+missing[0].name+'」を再読み込みしてください');return;}
  const missingMedia=missingUsedMedia();if(missingMedia.length){toast('使用中の画像・動画「'+missingMedia[0].name+'」を再読み込みしてください');return;}
  if($('bundleAudio').checked&&!state.audioFile){toast('音声ファイルが未登録です。音声を読み込むか、同梱チェックを外してdata/bgmへ手動配置してください');return;}
  const audioName=originalName(state.audioFile?.name||$('exportAudioName').value||'your_song.mp3');
  const b=$('confirmExportBtn');b.disabled=true;b.textContent='ZIPを作成中…';
  try{
    const files=[{path:'data/scenario/choco_setup.ks',data:txt(setupScript())},
      {path:'data/scenario/choco_stop.ks',data:txt(comboStopScript())},
      {path:'README_導入手順.txt',data:txt(exportReadme(audioName))}];
    if(state.cues.length){
      files.push({path:'data/scenario/lyrics_show.ks',data:txt(scriptShow(audioName))});
      files.push({path:'data/scenario/lyrics_stop.ks',data:txt(scriptStop())});
      files.push({path:'lyrics_export.srt',data:txt(makeSrtText())});
    }
    if(state.endroll.cards.length){
      files.push({path:'data/scenario/endroll_show.ks',data:txt(showEndrollScript(audioName))});
      files.push({path:'data/scenario/endroll_stop.ks',data:txt(endrollStopScript())});
      files.push({path:'endroll_timeline.json',data:txt(JSON.stringify(state.endroll,null,2))});
    }
    if(state.creditClips.length){
      files.push({path:'data/scenario/credits_show.ks',data:txt(showCreditsScript(audioName))});
      files.push({path:'data/scenario/credits_stop.ks',data:txt(creditsStopScript())});
      files.push({path:'credits_timeline.json',data:txt(JSON.stringify({clips:state.creditClips,assets:state.mediaAssets.map(a=>({id:a.id,type:a.type,name:a.name,path:mediaPath(a)}))},null,2))});
    }
    files.push({path:'data/scenario/choco_start.ks',data:txt(comboStartScript())});
    files.push({path:'data/scenario/choco_quick_test.ks',data:txt(quickTestScript())});
    for(const font of state.fonts){if(font.file)files.push({path:fontExportPath(font),data:new Uint8Array(await font.file.arrayBuffer())});}
    // Preserve original image and video file bytes. No recompression / transcoding.
    for(const asset of state.mediaAssets){if(asset.file)files.push({path:mediaPath(asset),data:new Uint8Array(await asset.file.arrayBuffer())});}
    if($('bundleAudio').checked&&state.audioFile)files.push({path:'data/bgm/'+audioName,data:new Uint8Array(await state.audioFile.arrayBuffer())});
    let blob=zipStore(files);download(blob,'ChocoLyric_TyranoBuilder_Credits_v2.8.zip');$('exportDialog').close();toast('ティラノビルダー用ZIPを保存しました');
  }catch(err){console.error(err);toast('書き出しに失敗しました：'+err.message);}
  finally{b.disabled=false;b.textContent='ZIPをダウンロード ⇩';}
}
async function downloadFontsOnly(){
  const fonts=state.fonts.filter(f=>f.file);
  if(!fonts.length){toast('ダウンロードできるフォントがありません。先にフォントを追加してください');return;}
  const button=$('downloadFontsOnlyBtn');button.disabled=true;
  try{
    const files=[{path:'README_フォント.txt',data:txt('ChocoLyric Studio v2.6\r\nZIP内の data/others/font フォルダを、ゲームの同名フォルダへコピーしてください。\r\n※ 歌詞用スクリプトは「ティラノ用に書き出す」から別途出力してください。\r\n')}];
    for(const font of fonts)files.push({path:fontExportPath(font),data:new Uint8Array(await font.file.arrayBuffer())});
    download(zipStore(files),'ChocoLyric_Fonts_Only.zip');
    toast(fonts.length+'件のフォントをZIPで保存しました');
  }catch(err){console.error(err);toast('フォントのZIP保存に失敗しました：'+err.message);}
  finally{button.disabled=false;}
}
function importSrtText(data,name,silent=false){let cues=parseSRT(data);if(!cues.length){toast('SRTのタイムコードを読み取れませんでした');return;}pauseAll();state.cues=cues.map(c=>({...c,style:emptyStyle()}));state.tapLines=[];state.selectedId=cues[0].id;setTime(cues[0].start+Math.min(.65,(cues[0].end-cues[0].start)*.5));$('importStatus').textContent='SRT：'+name;renderUI();if(!silent)toast(`SRTを読み込みました：${cues.length}フレーズ`);}
function importTxtText(data,name){let lines=String(data||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.replace(/^\d{3}[\s　:：.．)）_-]*/, '').trim()).filter(Boolean);if(!lines.length){toast('歌詞が空です');return;}state.tapLines=lines.map(t=>({text:t,usedId:null}));renderUI();setActiveTab('tap');$('importStatus').textContent='TXT：'+name;toast(`${lines.length}フレーズ。音声再生中に歌詞ボタンをクリックしてください`);}
function bindInputs(){for(const id of editorFields){$(id).addEventListener('input',()=>{let c=cue();if(!c)return;let key=fieldMap[id];let v=fieldsBoolean.has(id)?$(id).checked:fieldsText.has(id)?$(id).value:num($(id).value);
      if(id==='cueText')c.text=v;else if(id==='cueStart'){c.start=Math.max(0,v);c.end=Math.max(c.start+.06,c.end);if(!state.audio||state.audio.paused)state.time=c.start+.05;}
      else if(id==='cueEnd')c.end=Math.max(c.start+.06,v);else c.style[key]=v;
      if(id==='cueStart'||id==='cueEnd')refreshDuration();renderCueList();renderTimeline();
      if(id==='cueText')renderCueList();
      if(id==='cueStart'||id==='cueEnd'){let active=document.activeElement;let index=id==='cueStart'?'cueEnd':'cueStart';$(index).value=c[index==='cueStart'?'start':'end'];}
      if(id==='posX'||id==='posY'||id==='fontSize'||id==='strokeWidth'||id==='animSpeed'||id==='animIntensity'||id==='fadeInDuration'||id==='fadeOutDuration')$(id+'Output').textContent=$(id).value+(['posX','posY','fontSize','strokeWidth','animIntensity'].includes(id)?' px':['fadeInDuration','fadeOutDuration'].includes(id)?'s':'');
      if(fieldsBoolean.has(id))updateDependent();renderPreview();
    });}
}

// ---- Scrolling endroll cards editor ----
const ENDROLL_TEMPLATES={
  custom:{label:'任意',kind:'lines',customLabel:true},idea:{label:'原案',kind:'lines'},scenario:{label:'シナリオ',kind:'lines'},bg:{label:'イラスト/背景',kind:'lines'},standing:{label:'イラスト/立ち絵',kind:'lines'},otherart:{label:'イラスト/他素材',kind:'lines'},
  cast:{label:'CAST',kind:'cast'},bgm:{label:'BGM',kind:'bgm'},song:{label:'主題歌',kind:'song'},se:{label:'効果音',kind:'lines'},script:{label:'スクリプト',kind:'lines'},modeling:{label:'２Dモデリング',kind:'lines'},supporter:{label:'サポーター',kind:'lines'},testplay:{label:'テストプレイ',kind:'lines'}
};
function normalizeEndrollStyle(saved){
  saved=saved&&typeof saved==='object'?saved:{};
  const style=clone(ENDROLL_STYLE_DEFAULTS);style.sameStyle=!!saved.sameStyle;
  for(const part of ['title','body']){
    const val=saved[part]&&typeof saved[part]==='object'?saved[part]:{};
    if(typeof val.fontFamily==='string'&&val.fontFamily.length<250)style[part].fontFamily=val.fontFamily;
    if(['400','500','600','700','900'].includes(String(val.fontWeight)))style[part].fontWeight=String(val.fontWeight);
    style[part].fontSize=clamp(num(val.fontSize,style[part].fontSize),12,200);
    style[part].strokeWidth=clamp(num(val.strokeWidth,style[part].strokeWidth),0,24);
    style[part].color=parseHex(val.color)||style[part].color;
    style[part].strokeColor=parseHex(val.strokeColor)||style[part].strokeColor;
  }
  const bg=saved.background||{};
  style.background.enabled=bg.enabled!==false;
  style.background.color=parseHex(bg.color)||style.background.color;
  style.background.opacity=clamp(num(bg.opacity,style.background.opacity),0,100);
  if(style.sameStyle)style.body=clone(style.title);
  return style;
}
function normalizeEndroll(data){
  data=data&&typeof data==='object'?data:{};
  const cards=Array.isArray(data.cards)?data.cards.map(c=>normalizeEndrollCard(c)).filter(Boolean):[];
  return {start:Math.max(0,num(data.start,0)),end:Math.max(num(data.start,0)+0.1,num(data.end,cards.length?20:10)),direction:data.direction==='topToBottom'?'topToBottom':'bottomToTop',positionX:clamp(num(data.positionX,50),0,100),textAlign:['left','center','right'].includes(data.textAlign)?data.textAlign:'center',bodyOffsetX:clamp(num(data.bodyOffsetX,0),-40,40),cards,style:normalizeEndrollStyle(data.style)};
}
function normalizeEndrollCard(card){
  if(!card||!card.type||!ENDROLL_TEMPLATES[card.type])return null;
  const temp=ENDROLL_TEMPLATES[card.type];
  const out={id:String(card.id||uid()),type:card.type,label:card.label==null?String(temp.label||'クレジット'):String(card.label)};
  if(temp.kind==='lines'){out.lines=String(card.lines||'').replace(/\r/g,'');}
  else if(temp.kind==='bgm'){out.composer=String(card.composer||'');out.arranger=String(card.arranger||'');}
  else if(temp.kind==='song'){out.composer=String(card.composer||'');out.arranger=String(card.arranger||'');out.singer=String(card.singer||'');}
  else if(temp.kind==='cast'){out.entries=Array.isArray(card.entries)?card.entries.map(e=>({role:String(e.role||''),actor:String(e.actor||'')})):[{role:'',actor:''}];if(!out.entries.length)out.entries=[{role:'',actor:''}];}
  return out;
}
function createEndrollCard(type){
  const t=ENDROLL_TEMPLATES[type]||ENDROLL_TEMPLATES.custom;
  return normalizeEndrollCard({id:uid().replace('cl_','er_'),type,label:type==='custom'?'':t.label,lines:''});
}
function selectedEndrollCard(){return state.endroll.cards.find(c=>c.id===state.selectedEndrollCardId)||null;}
function endrollDuration(){return Math.max(0.1,state.endroll.end-state.endroll.start);}
function addEndrollCard(type){const c=createEndrollCard(type);state.endroll.cards.push(c);state.selectedEndrollCardId=c.id;if(state.endroll.end<=state.endroll.start+.1)state.endroll.end=state.endroll.start+20;renderUI();}
function removeEndrollCard(id){state.endroll.cards=state.endroll.cards.filter(c=>c.id!==id);if(state.selectedEndrollCardId===id)state.selectedEndrollCardId=state.endroll.cards[0]?.id||null;renderUI();}
function duplicateEndrollCard(id){const src=state.endroll.cards.find(c=>c.id===id);if(!src)return;const dup=JSON.parse(JSON.stringify(src));dup.id=uid().replace('cl_','er_');state.endroll.cards.splice(state.endroll.cards.indexOf(src)+1,0,dup);state.selectedEndrollCardId=dup.id;renderUI();}
function endrollCardSummary(card){const t=ENDROLL_TEMPLATES[card.type];if(!card)return '';if(t.kind==='lines')return (card.lines||'').split(/\n+/).filter(Boolean).slice(0,2).join(' / ')||'内容を入力';if(t.kind==='bgm')return ['作曲：'+(card.composer||'—'),'編曲：'+(card.arranger||'—')].join(' / ');if(t.kind==='song')return ['作曲：'+(card.composer||'—'),'編曲：'+(card.arranger||'—'),'歌唱：'+(card.singer||'—')].join(' / ');if(t.kind==='cast')return (card.entries||[]).slice(0,2).map(e=>(e.role||'役')+' / '+(e.actor||'—')).join(' / ')||'配役を入力';return '';}
function renderEndrollCardList(){const list=$('endrollCardList'); if(!list) return; const prev=list.scrollTop; list.replaceChildren(); $('endrollCount').textContent=state.endroll.cards.length; if(!state.endroll.cards.length){list.append(el('div','empty-list','追加する項目を選んで「＋」を押すと、エンドロール用のカードを作成できます。')); return;} state.endroll.cards.forEach((card,idx)=>{const row=el('div','cue-item'+(card.id===state.selectedEndrollCardId?' selected':'')); row.append(el('div','cue-index',two(idx+1))); const body=el('div','cue-line'); const chip=el('div','endroll-card-chip',card.label||ENDROLL_TEMPLATES[card.type].label); body.append(chip); body.append(el('div','cue-name',endrollCardSummary(card))); row.append(body); const actions=el('div','cue-actions'); const dup=el('button','cue-more','⧉'); dup.title='複製'; dup.addEventListener('click',e=>{e.stopPropagation();duplicateEndrollCard(card.id);}); actions.append(dup); const del=el('button','cue-more','×'); del.title='削除'; del.addEventListener('click',e=>{e.stopPropagation();removeEndrollCard(card.id);}); actions.append(del); row.append(actions); row.addEventListener('click',()=>{state.selectedEndrollCardId=card.id;renderEndrollUI();renderTimeline();renderPreview();}); list.append(row);}); list.scrollTop=prev; }
function renderEndrollEditor(){const target=$('endrollCardEditor'); const card=selectedEndrollCard(); const title=$('endrollSelectedTitle'); if(!target||!title) return; if(!card){title.textContent='カードを選択してください'; target.classList.add('microcopy'); target.textContent='左の一覧からカードを選択すると、ここで内容を編集できます。'; return;} title.textContent=(card.label||'クレジット')+' を編集'; const t=ENDROLL_TEMPLATES[card.type]; target.className='endroll-card-editor'; let html='<label class="form-field">見出し<input type="text" id="endrollLabel" placeholder="例：原案・制作・CAST" value="'+escapeHtml(card.label||'')+'"></label>'; if(t.customLabel||card.type==='custom') html+='<p class="micro-note">任意カードでは見出し名を自由に変更できます。</p>'; if(t.kind==='lines'){ html+='<label class="form-field">内容（改行で複数行）<textarea id="endrollLines" placeholder="例：山田 太郎\n佐藤 花子">'+escapeHtml(card.lines||'')+'</textarea></label><p class="micro-note">表示例：<br>【'+escapeHtml(card.label||'項目')+'】<br>名前<br>名前</p>'; }
  else if(t.kind==='bgm'){ html+='<label class="form-field">作曲<input type="text" id="endrollComposer" placeholder="例：山田 太郎" value="'+escapeHtml(card.composer||'')+'"></label><label class="form-field">編曲<input type="text" id="endrollArranger" placeholder="例：佐藤 花子" value="'+escapeHtml(card.arranger||'')+'"></label><p class="micro-note">表示例：<br>【BGM】<br>作曲：＊＊＊<br>編曲：＊＊＊</p>'; }
  else if(t.kind==='song'){ html+='<label class="form-field">作曲<input type="text" id="endrollComposer" placeholder="例：山田 太郎" value="'+escapeHtml(card.composer||'')+'"></label><label class="form-field">編曲<input type="text" id="endrollArranger" placeholder="例：佐藤 花子" value="'+escapeHtml(card.arranger||'')+'"></label><label class="form-field">歌唱<input type="text" id="endrollSinger" placeholder="例：歌い手名" value="'+escapeHtml(card.singer||'')+'"></label><p class="micro-note">表示例：<br>【主題歌】<br>作曲：＊＊＊<br>編曲：＊＊＊<br>歌唱：＊＊＊</p>'; }
  else if(t.kind==='cast'){ html+='<div id="endrollCastRows"></div><div class="editor-actions"><button type="button" class="mini-button full" id="addCastRowBtn">＋ 配役を追加</button></div><p class="micro-note">表示例：<br>【CAST】<br>＊＊＊ 役 / ＊＊＊</p>'; }
  target.innerHTML=html; const label=$('endrollLabel'); if(label) label.addEventListener('input',e=>{card.label=e.target.value; renderEndrollCardList(); renderPreview();}); const lines=$('endrollLines'); if(lines) lines.addEventListener('input',e=>{card.lines=e.target.value; renderEndrollCardList(); renderPreview();}); const comp=$('endrollComposer'); if(comp) comp.addEventListener('input',e=>{card.composer=e.target.value; renderEndrollCardList(); renderPreview();}); const arr=$('endrollArranger'); if(arr) arr.addEventListener('input',e=>{card.arranger=e.target.value; renderEndrollCardList(); renderPreview();}); const sing=$('endrollSinger'); if(sing) sing.addEventListener('input',e=>{card.singer=e.target.value; renderEndrollCardList(); renderPreview();}); if(t.kind==='cast') renderCastRows(card);
}
function renderCastRows(card){const host=$('endrollCastRows'); if(!host) return; host.replaceChildren(); (card.entries||[]).forEach((entry,idx)=>{const row=el('div','entry-row'); row.innerHTML='<label class="form-field"><span>キャラ名</span><input type="text" placeholder="例：主人公" value="'+escapeHtml(entry.role||'')+'"></label><label class="form-field"><span>声優名</span><input type="text" placeholder="例：声優名" value="'+escapeHtml(entry.actor||'')+'"></label>'; const del=el('button','', '×'); del.type='button'; del.addEventListener('click',()=>{card.entries.splice(idx,1); if(!card.entries.length) card.entries.push({role:'',actor:''}); renderCastRows(card); renderEndrollCardList(); renderPreview();}); row.append(del); const [roleInp,actorInp]=row.querySelectorAll('input'); roleInp.addEventListener('input',e=>{entry.role=e.target.value; renderEndrollCardList(); renderPreview();}); actorInp.addEventListener('input',e=>{entry.actor=e.target.value; renderEndrollCardList(); renderPreview();}); host.append(row);}); const add=$('addCastRowBtn'); if(add) add.onclick=()=>{card.entries.push({role:'',actor:''}); renderCastRows(card); renderEndrollCardList(); renderPreview();}; }
function renderEndrollStyleUI(){
  const style=state.endroll.style;
  $('endrollSameStyle').checked=!!style.sameStyle;
  for(const part of ['title','body']){
    const name=part==='title'?'endrollTitle':'endrollBody';const st=style[part];
    $(name+'Font').value=st.fontFamily;
    $(name+'Size').value=st.fontSize;$(name+'SizeOutput').textContent=st.fontSize+' px';
    $(name+'StrokeWidth').value=st.strokeWidth;$(name+'StrokeWidthOutput').textContent=st.strokeWidth+' px';
  }
  const controls=$('endrollBodySettings').querySelectorAll('input,select,button');
  controls.forEach(c=>c.disabled=style.sameStyle);
  $('endrollBodySettings').classList.toggle('is-disabled',style.sameStyle);
  $('endrollBgEnabled').checked=style.background.enabled;
  $('endrollBgOpacity').value=style.background.opacity;
  $('endrollBgOpacityOutput').textContent=style.background.opacity+' %';
  $('endrollBgOptions').classList.toggle('is-disabled',!style.background.enabled);
  $('endrollBgOptions').querySelectorAll('input,button').forEach(c=>c.disabled=!style.background.enabled);
  syncColorInputs();
}
function renderEndrollPositionUI(){
  const p=Math.round(clamp(num(state.endroll.positionX,50),0,100));
  const a=['left','center','right'].includes(state.endroll.textAlign)?state.endroll.textAlign:'center';
  $('endrollPositionX').value=p;
  $('endrollPositionXOutput').textContent=p+'%'+(p===0?'（左端）':p===50?'（中央）':p===100?'（右端）':'');
  $('endrollTextAlign').value=a;
  const bodyOffset=Math.round(clamp(num(state.endroll.bodyOffsetX,0),-40,40));
  $('endrollBodyOffsetX').value=bodyOffset;
  $('endrollBodyOffsetXOutput').textContent=bodyOffset===0?'0%（調整なし）':(bodyOffset>0?'+':'')+bodyOffset+'%（'+(bodyOffset<0?'左':'右')+'へ）';
  $('endrollBodyOffsetReset').disabled=bodyOffset===0;
  for(const button of document.querySelectorAll('[data-endroll-preset]')){
    const active=button.dataset.endrollPreset===a && p===({left:0,center:50,right:100}[a]);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}
function renderEndrollUI(){if(!$('endrollCardList')) return; renderEndrollCardList(); renderEndrollEditor(); $('endrollStart').value=state.endroll.start.toFixed(2).replace(/\.00$/,''); $('endrollEnd').value=state.endroll.end.toFixed(2).replace(/\.00$/,''); $('endrollDirection').value=state.endroll.direction;renderEndrollPositionUI();renderEndrollStyleUI();}
function renderEndrollTimeline(){const container=$('timelineEndroll'); if(!container) return; container.textContent=''; if(!state.endroll.cards.length) return; const d=state.duration||1; const b=el('div','cue-bar'+(state.mode==='endroll'?' active':'')); b.style.left=(100*state.endroll.start/d)+'%'; b.style.width=(100*Math.max(.05,state.endroll.end-state.endroll.start)/d)+'%'; b.title='エンドロール\n'+fmt(state.endroll.start)+'～'+fmt(state.endroll.end); b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{e.stopPropagation(); setMode('endroll'); state.selectedEndrollCardId=state.endroll.cards[0]?.id||null; setTime(state.endroll.start+0.1); renderUI();}); container.append(b); }
function drawEndroll(ctx,t){if(window.ChocoEndrollPainter)window.ChocoEndrollPainter(ctx,state.endroll,t,state.width,state.height);}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function initEndrollFontSelects(){
  const options=[
    ['"Yu Mincho", "Hiragino Mincho ProN", serif','明朝体 / 日本語'],
    ['"Yu Gothic", Meiryo, sans-serif','游ゴシック / 日本語'],
    ['Meiryo, sans-serif','メイリオ'],['"Noto Sans JP", sans-serif','Noto Sans JP'],
    ['"Noto Serif JP", serif','Noto Serif JP'],['Arial, sans-serif','Arial'],
    ['Georgia, serif','Georgia'],['"Times New Roman", serif','Times New Roman']
  ];
  for(const id of ['endrollTitleFont','endrollBodyFont']){
    const select=$(id);select.replaceChildren();
    options.forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.append(opt);});
  }
}
function bindEndrollStyleEvents(){
  $('endrollSameStyle').addEventListener('change',e=>{
    state.endroll.style.sameStyle=e.target.checked;
    if(e.target.checked)state.endroll.style.body=clone(state.endroll.style.title);
    renderEndrollStyleUI();renderPreview();
  });
  for(const part of ['title','body']){
    const prefix=part==='title'?'endrollTitle':'endrollBody';
    for(const [suffix,prop] of [['Font','fontFamily'],['Size','fontSize'],['StrokeWidth','strokeWidth']]){
      $(prefix+suffix).addEventListener('input',e=>{
        const v=prop==='fontFamily'?e.target.value:num(e.target.value);
        state.endroll.style[part][prop]=v;
        if(part==='title'&&state.endroll.style.sameStyle)state.endroll.style.body[prop]=v;
        renderEndrollStyleUI();renderPreview();
      });
    }
  }
  $('endrollBgEnabled').addEventListener('change',e=>{state.endroll.style.background.enabled=e.target.checked;renderEndrollStyleUI();renderPreview();});
  $('endrollBgOpacity').addEventListener('input',e=>{state.endroll.style.background.opacity=num(e.target.value);renderEndrollStyleUI();renderPreview();});
}
function bindEndrollEvents(){
  $('addEndrollCardBtn').addEventListener('click',()=>addEndrollCard($('endrollTemplate').value));
  $('clearEndrollCardsBtn').addEventListener('click',()=>{if(state.endroll.cards.length&&confirm('エンドロールカードをすべて削除しますか？')){state.endroll.cards=[];state.selectedEndrollCardId=null;renderUI();}});
  $('endrollStart').addEventListener('input',e=>{state.endroll.start=Math.max(0,num(e.target.value,state.endroll.start)); state.endroll.end=Math.max(state.endroll.start+.1,state.endroll.end); refreshDuration(); renderTimeline(); renderPreview();});
  $('endrollEnd').addEventListener('input',e=>{state.endroll.end=Math.max(state.endroll.start+.1,num(e.target.value,state.endroll.end)); refreshDuration(); renderTimeline(); renderPreview();});
  $('endrollDirection').addEventListener('input',e=>{state.endroll.direction=e.target.value==='topToBottom'?'topToBottom':'bottomToTop'; renderPreview();});
  $('endrollPositionX').addEventListener('input',e=>{state.endroll.positionX=clamp(num(e.target.value,50),0,100);renderEndrollPositionUI();renderPreview();});
  $('endrollTextAlign').addEventListener('change',e=>{state.endroll.textAlign=['left','center','right'].includes(e.target.value)?e.target.value:'center';renderEndrollPositionUI();renderPreview();});
  $('endrollBodyOffsetX').addEventListener('input',e=>{state.endroll.bodyOffsetX=clamp(num(e.target.value,0),-40,40);renderEndrollPositionUI();renderPreview();});
  $('endrollBodyOffsetReset').addEventListener('click',()=>{state.endroll.bodyOffsetX=0;renderEndrollPositionUI();renderPreview();});
  document.querySelectorAll('[data-endroll-preset]').forEach(button=>button.addEventListener('click',()=>{
    const align=button.dataset.endrollPreset;
    state.endroll.positionX=({left:0,center:50,right:100})[align];
    state.endroll.textAlign=align;
    renderEndrollPositionUI();renderPreview();
  }));
  $('endrollNowStart').addEventListener('click',()=>{state.endroll.start=Math.max(0,state.time); state.endroll.end=Math.max(state.endroll.start+.1,state.endroll.end); renderEndrollUI(); renderTimeline(); renderPreview();});
  $('endrollNowEnd').addEventListener('click',()=>{state.endroll.end=Math.max(state.endroll.start+.1,state.time); renderEndrollUI(); renderTimeline(); renderPreview();});
}
function endrollRuntimeSource(){const painterSource='('+window.ChocoEndrollPainter.toString()+')'; return `/* ChocoLyric Endroll - same canvas painter as editor preview. */
(function(root){
'use strict';
var session=null,paint=${painterSource},fontCache={};
function stage(){return document.querySelector('.tyrano_base')||document.querySelector('#tyrano_base')||document.body;}
function audioRef(){return root.TyranoLyrics&&root.TyranoLyrics.getAudio&&root.TyranoLyrics.getAudio()||root.ChocoCredits&&root.ChocoCredits.getAudio&&root.ChocoCredits.getAudio();}
function resourceURL(path){return String(path||'').split('/').map(function(x){try{return encodeURIComponent(decodeURIComponent(x));}catch(_){return encodeURIComponent(x);}}).join('/');}
function loadFonts(fonts){if(!root.FontFace||!document.fonts||!Array.isArray(fonts))return Promise.resolve();return Promise.all(fonts.map(function(font){
 if(!font||!/^ChocoLyric_[a-z0-9_-]+$/i.test(font.family)||!/^data\\/others\\/font\\/[^/]+\\.(ttf|otf|woff2?)$/i.test(font.path))return Promise.resolve();
 var key=font.family+'|'+font.path;if(fontCache[key])return fontCache[key];
 try{var face=new FontFace(font.family,'url('+JSON.stringify(new URL(resourceURL(font.path),document.baseURI).href)+')');
 fontCache[key]=face.load().then(function(){document.fonts.add(face);}).catch(function(err){console.warn('[ChocoEndroll] カスタムフォントを読み込めません',err);delete fontCache[key];});return fontCache[key];}
 catch(err){console.warn('[ChocoEndroll] フォントの初期化に失敗しました',err);return Promise.resolve();}
 }));}
function stop(){var s=session;session=null;if(!s)return;cancelAnimationFrame(s.raf);if(s.audio&&s.ownsAudio){s.audio.pause();s.audio.removeAttribute('src');s.audio.load();}if(s.host.parentNode)s.host.parentNode.removeChild(s.host);}
function start(data){
 stop();data=data||{};
 var parent=stage(),host=document.createElement('div');host.id='choco-endroll-overlay';
 Object.assign(host.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',overflow:'hidden',pointerEvents:'none',zIndex:'99995'});
 if(getComputedStyle(parent).position==='static')parent.style.position='relative';parent.appendChild(host);
 var canvas=document.createElement('canvas'),width=Math.max(1,Number(data.width)||1920),height=Math.max(1,Number(data.height)||1080);
 canvas.width=width;canvas.height=height;Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',pointerEvents:'none'});host.appendChild(canvas);
 var ctx=canvas.getContext('2d'),shared=audioRef(),owns=!shared,audio=shared||new Audio();
 if(owns){audio.preload='auto';audio.src=data.audio||'';}
 var s={host:host,audio:audio,ownsAudio:owns,raf:0};session=s;
 function tick(){if(session!==s)return;ctx.clearRect(0,0,width,height);paint(ctx,data,audio.currentTime||0,width,height);if(audio.ended&&owns){stop();return;}s.raf=requestAnimationFrame(tick);}
 s.raf=requestAnimationFrame(tick);
 if(owns){audio.addEventListener('ended',function(){if(session===s)stop();});}
 loadFonts(data.fonts).then(function(){if(session!==s||!owns)return;audio.play().catch(function(){
 var btn=document.createElement('button');btn.textContent='▶ エンドロールを再生';
 Object.assign(btn.style,{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'#563525',color:'#fff8eb',border:'2px solid #f9e4cc',padding:'18px 26px',borderRadius:'12px',pointerEvents:'auto',cursor:'pointer',zIndex:'10000',fontSize:'22px'});
 host.appendChild(btn);btn.onclick=function(){audio.play().then(function(){btn.remove();});};
 });});
 return {stop:stop,audio:audio};
}
root.ChocoEndroll={start:start,stop:stop,getAudio:function(){return session&&session.audio;}};
})(window);`;}
function showEndrollScript(audioName){const config={audio:resourceURL('data/bgm/'+audioName),width:state.width,height:state.height,start:Number(state.endroll.start.toFixed(3)),end:Number(state.endroll.end.toFixed(3)),direction:state.endroll.direction,positionX:state.endroll.positionX,textAlign:state.endroll.textAlign,bodyOffsetX:state.endroll.bodyOffsetX,style:state.endroll.style,cards:state.endroll.cards,fonts:state.fonts.filter(f=>f.file).map(f=>({family:f.family,path:fontExportPath(f)}))};return '; ChocoLyric Endroll / self-contained\r\n[iscript]\r\nif (!window.ChocoEndroll) {\r\n'+endrollRuntimeSource()+'\r\n}\r\nwindow.ChocoEndroll.start('+JSON.stringify(config,null,2)+');\r\n[endscript]\r\n[return]\r\n';}
function endrollStopScript(){ return '; ChocoLyric Endroll - stop\r\n[iscript]\r\nif (window.ChocoEndroll) window.ChocoEndroll.stop();\r\n[endscript]\r\n[return]\r\n'; }

// ---- Endroll image/video editor (shared music timeline) ----
const CreditsCore=window.ChocoCreditsCore;
function creditsAsset(){return state.mediaAssets.find(a=>a.id===state.selectedAssetId)||null;}
function creditsClip(){return state.creditClips.find(c=>c.id===state.selectedClipId)||null;}
function sortedClips(){return CreditsCore.sorted(state.creditClips);}
function effectiveClipEnd(c){const list=sortedClips(),i=list.findIndex(a=>a.id===c.id),next=list[i+1];if(!next)return c.end;const switchEnd=next.start+(next.crossfade?next.fade:0);return Math.min(c.autoEnd?switchEnd:c.end,switchEnd);}
function mediaPath(a){
  const base=a.type==='video'?'data/video/choco_credits/':'data/fgimage/choco_credits/';
  const name=originalName(a.name);
  // Separate only colliding media into ID-named folders. The basename never changes.
  const duplicates=state.mediaAssets.filter(other=>other.type===a.type && other.name.toLowerCase()===a.name.toLowerCase());
  const subdir=duplicates.length>1 ? String(a.id).replace(/[^a-z0-9_-]/gi,'_')+'/' : '';
  return base+subdir+name;
}
function clearAssetResources(a){if(a.objectUrl)URL.revokeObjectURL(a.objectUrl);if(a.element&&a.type==='video'){a.element.pause();a.element.removeAttribute('src');a.element.load();}a.objectUrl=null;a.element=null;a.file=null;a.playPending=false;}
function resetAssets(){state.mediaAssets.forEach(clearAssetResources);state.mediaAssets=[];state.creditClips=[];state.selectedAssetId=null;state.selectedClipId=null;}
function addMediaFiles(files){let added=0;
  for(const file of files){
    const type=/\.(mp4|webm|ogv)$/i.test(file.name)||/^video\//.test(file.type)?'video':(/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)||/^image\//.test(file.type)?'image':null);
    if(!type||!file.size){toast('対応していない素材があります：'+file.name);continue;}
    let a=state.mediaAssets.find(x=>!x.file&&x.name===file.name&&x.type===type&&(!x.size||x.size===file.size));
    if(!a){a={id:uid().replace('cl_','media_'),name:file.name,type,size:file.size,file:null,objectUrl:null,element:null};state.mediaAssets.push(a);}
    else clearAssetResources(a);
    a.file=file;a.size=file.size;a.objectUrl=URL.createObjectURL(file);
    if(type==='image'){
      const image=new Image();image.onload=()=>{renderPreview();};image.onerror=()=>toast('画像を表示できません：'+file.name);image.src=a.objectUrl;a.element=image;
    }else{
      const video=document.createElement('video');video.muted=true;video.defaultMuted=true;video.playsInline=true;video.preload='auto';video.src=a.objectUrl;a.element=video;
      video.addEventListener('seeked',renderPreview);video.addEventListener('loadeddata',renderPreview);video.addEventListener('error',()=>toast('動画の形式を再生できない可能性があります：'+file.name));
    }
    state.selectedAssetId=a.id;added++;
  }
  renderCreditsUI();renderTimeline();renderPreview();if(added)toast(added+'件の画像・動画を読み込みました');
}
function addClip(assetId,time=state.time){let a=state.mediaAssets.find(x=>x.id===assetId);if(!a){toast('左の素材一覧から画像・動画を選んでください');return;}
  const begin=Number(Math.max(0,time).toFixed(2));const c={id:uid().replace('cl_','clip_'),assetId:a.id,start:begin,end:begin+6,autoEnd:true,crossfade:true,fade:1,fit:'cover',loop:false};
  if(!state.creditClips.length)c.crossfade=false;
  state.creditClips.push(c);state.selectedClipId=c.id;state.selectedAssetId=a.id;
  refreshDuration();renderCreditsUI();renderTimeline();renderPreview();toast(fmt(begin)+' に素材を配置しました');
}
function selectClip(id,seek=true){let c=state.creditClips.find(v=>v.id===id);if(!c)return;state.selectedClipId=id;state.selectedAssetId=c.assetId;if(seek)setTime(c.start+Math.min(.3,(c.end-c.start)/4));renderCreditsUI();renderTimeline();renderPreview();}
function removeClip(id){state.creditClips=state.creditClips.filter(c=>c.id!==id);if(state.selectedClipId===id)state.selectedClipId=sortedClips()[0]?.id||null;renderCreditsUI();renderTimeline();renderPreview();}
function removeMedia(id){let a=state.mediaAssets.find(v=>v.id===id);if(!a)return;
  if(state.creditClips.some(c=>c.assetId===id)&&!confirm('この素材が使われている表示区間も削除します。よろしいですか？'))return;
  clearAssetResources(a);state.mediaAssets=state.mediaAssets.filter(v=>v.id!==id);state.creditClips=state.creditClips.filter(v=>v.assetId!==id);
  if(state.selectedClipId&&!creditsClip())state.selectedClipId=sortedClips()[0]?.id||null;
  if(state.selectedAssetId===id)state.selectedAssetId=state.mediaAssets[0]?.id||null;
  renderCreditsUI();renderTimeline();renderPreview();
}
function renderMediaLibrary(){const panel=$('mediaLibrary');panel.replaceChildren();
  $('exportMediaPreview').classList.toggle('hidden',!state.mediaAssets.length);
  if(!state.mediaAssets.length){panel.append(el('div','empty-list','まだ素材がありません。PNGやMP4を追加してください。'));return;}
  state.mediaAssets.forEach(a=>{
    const row=el('div','media-resource'+(a.id===state.selectedAssetId?' active':''));row.title='クリックして選択';
    let thumb=el('div','media-thumb');if(a.element&&a.type==='image'){let img=el('img');img.src=a.objectUrl;thumb.append(img);}else thumb.textContent=a.type==='video'?'▶':'▧';
    let info=el('div','media-meta');info.append(el('strong','',a.name),el('small','',(a.type==='video'?'動画':'画像')+' / '+(a.file?(a.size/1048576).toFixed(1)+' MB':'⚠ 再読み込みが必要')));
    let add=el('button','media-add','＋');add.type='button';add.title='現在時刻へ挿入';add.addEventListener('click',e=>{e.stopPropagation();addClip(a.id);});
    let del=el('button','media-remove','×');del.type='button';del.title='素材削除';del.addEventListener('click',e=>{e.stopPropagation();removeMedia(a.id);});
    row.append(thumb,info,add,del);row.addEventListener('click',()=>{state.selectedAssetId=a.id;renderMediaLibrary();});panel.append(row);
  });
  const preview=$('exportMediaPreview');preview.classList.toggle('hidden',!state.mediaAssets.length);preview.textContent='data/fgimage・data/video / 素材 '+state.mediaAssets.filter(a=>a.file).length+' ファイル';
}
function renderClipList(){let cont=$('clipList'),scroll=cont.scrollTop;cont.replaceChildren();$('clipCount').textContent=state.creditClips.length;
  if(!state.creditClips.length){cont.append(el('div','empty-list','音声を聴きながら、素材一覧の「＋」で表示時刻に配置します。'));return;}
  sortedClips().forEach((c,i)=>{let a=state.mediaAssets.find(x=>x.id===c.assetId),r=el('div','cue-item clip-item'+(c.id===state.selectedClipId?' selected':''));
    r.append(el('div','cue-index',two(i+1)));let info=el('div','cue-line');info.append(el('div','cue-name',a?.name||'素材がありません'));let t=el('div','cue-time',fmt(c.start)+' → '+fmt(effectiveClipEnd(c))+(c.crossfade?'　◌':'　│')+(a?.type==='video'&&c.loop?'　↻ ループ':''));info.append(t);r.append(info);
    let actions=el('div','cue-actions');let dup=el('button','cue-more','⧉');dup.title='後ろに複製';dup.addEventListener('click',e=>{e.stopPropagation();addClip(c.assetId,effectiveClipEnd(c));});
    let del=el('button','cue-more','×');del.title='削除';del.addEventListener('click',e=>{e.stopPropagation();removeClip(c.id);});actions.append(dup,del);r.append(actions);
    r.addEventListener('click',()=>selectClip(c.id));cont.append(r);
  });cont.scrollTop=scroll;
}
function syncClipEditor(){let c=creditsClip();const ids=['clipStart','clipEnd','clipAutoEnd','clipCrossfade','clipFade','clipFit','clipVideoLoop'];ids.forEach(id=>$(id).disabled=!c);
  $('clipSelectedName').textContent=c?state.mediaAssets.find(a=>a.id===c.assetId)?.name||'素材がありません':'映像を選択してください';
  $('clipSelectedInfo').textContent=c?'表示区間 '+fmt(c.start)+' ～ '+fmt(effectiveClipEnd(c)):'左側から素材を挿入できます';
  const selectedAsset=c?state.mediaAssets.find(a=>a.id===c.assetId):null;
  $('clipVideoLoopGroup').classList.toggle('hidden',!c||selectedAsset?.type!=='video');
  $('clipVideoLoop').disabled=!c||selectedAsset?.type!=='video';
  if(!c)return;
  $('clipVideoLoop').checked=!!c.loop;
  $('clipStart').value=c.start.toFixed(2);$('clipEnd').value=c.end.toFixed(2);$('clipAutoEnd').checked=!!c.autoEnd;$('clipCrossfade').checked=!!c.crossfade;$('clipFade').value=c.fade;$('clipFadeOutput').textContent=c.fade.toFixed(2)+' 秒';$('clipFit').value=c.fit;
  $('clipFade').disabled=!c.crossfade;$('clipEnd').disabled=c.autoEnd&&!!sortedClips().find((x,i,all)=>x.id===c.id&&i<all.length-1);
}
function renderCreditsUI(){renderMediaLibrary();renderClipList();syncClipEditor();}
function renderCreditTimeline(){let cont=$('timelineCredits');cont.replaceChildren();let d=Math.max(1,state.duration);
  sortedClips().forEach(c=>{let a=state.mediaAssets.find(x=>x.id===c.assetId);const end=effectiveClipEnd(c);
    let bar=el('div','cue-bar'+(c.id===state.selectedClipId?' active':'')+(c.crossfade?' has-fade':''));bar.style.left=(100*c.start/d)+'%';bar.style.width=(100*Math.max(.05,end-c.start)/d)+'%';bar.title=(a?.name||'素材')+' / '+fmt(c.start)+' → '+fmt(end);bar.addEventListener('pointerdown',e=>e.stopPropagation());bar.addEventListener('click',e=>{e.stopPropagation();selectClip(c.id);});cont.append(bar);
  });
}
function drawCreditMedia(ctx,t){let active=CreditsCore.active(state.creditClips,t),showing=new Set(),isPlaying=!!((state.audio&&!state.audio.paused)||state.virtualPlaying);
  for(const item of active){const a=state.mediaAssets.find(x=>x.id===item.clip.assetId);if(!a?.element)continue;const media=a.element;showing.add(a.id);
    if(a.type==='video'){
      media.loop=!!item.clip.loop;
      const duration=Number(media.duration),hasDuration=Number.isFinite(duration)&&duration>0;
      const endFrame=hasDuration?Math.max(0,duration-0.04):0;
      const finished=hasDuration&&!item.clip.loop&&item.localTime>=endFrame;
      if(hasDuration){
        const target=item.clip.loop?(item.localTime%duration):Math.min(Math.max(0,item.localTime),endFrame);
        if(!media.seeking&&Math.abs((media.currentTime||0)-target)>(finished?.035:isPlaying?.32:.08)){try{media.currentTime=target;}catch(_){}}
      }
      if(finished){if(!media.paused)media.pause();}
      else if(isPlaying&&media.paused&&!media.ended&&!a.playPending){a.playPending=true;let p=media.play();if(p&&p.then)p.then(()=>a.playPending=false,()=>a.playPending=false);else a.playPending=false;}
      if(!isPlaying&&!media.paused)media.pause();
    }
    const w=a.type==='video'?media.videoWidth:media.naturalWidth,h=a.type==='video'?media.videoHeight:media.naturalHeight;
    if(!w||!h)continue;
    ctx.save();ctx.globalAlpha=item.alpha;const W=state.width,H=state.height;
    if(item.clip.fit==='contain'){
      const sc=Math.min(W/w,H/h),ww=w*sc,hh=h*sc;try{ctx.drawImage(media,(W-ww)/2,(H-hh)/2,ww,hh);}catch(_){}}
    else{const sc=Math.max(W/w,H/h),ww=W/sc,hh=H/sc;try{ctx.drawImage(media,(w-ww)/2,(h-hh)/2,ww,hh,0,0,W,H);}catch(_){}}
    ctx.restore();
  }
  for(const a of state.mediaAssets){if(a.type==='video'&&!showing.has(a.id)&&a.element&&!a.element.paused)a.element.pause();}
}
function setMode(mode){state.mode=['lyrics','endroll','credits'].includes(mode)?mode:'lyrics';document.body.dataset.mode=state.mode;
  document.querySelector('.stage-hint').textContent=state.mode==='credits'?'読み込んだ素材が歌詞とエンドロールの背面に音声同期で表示されます':state.mode==='endroll'?'クレジットカード全体が指定区間の中で流れます':'プレビュー上をクリック・ドラッグして位置を変更できます';
  document.querySelector('.support-panel p').textContent=state.mode==='credits'?'音声を再生しながら左の素材を現在位置に挿入。前後の画像・動画をクロスフェードで切り替えられます。ゲーム用ZIPには元の素材も同梱します。':state.mode==='endroll'?'原案・CAST・主題歌などのカードを追加して、音声に合わせて流れるエンドロールを作成できます。方向は上向き・下向きから選べます。':'SRTを使えば歌詞の表示タイミングを一括設定。再生を聴きながら細かい秒数を調整して、ティラノビルダーでそのまま使える演出ファイルを出力できます。';$('modeLyrics').classList.toggle('active',state.mode==='lyrics');$('modeEndroll').classList.toggle('active',state.mode==='endroll');$('modeCredits').classList.toggle('active',state.mode==='credits');
  $('previewCueInfo').textContent=state.mode==='credits'?'映像を選択し、音声に合わせて表示タイミングを調整':state.mode==='endroll'?'エンドロール全体の流れとカード内容を確認':'歌詞を選択して位置・色・演出を調整';renderPreview();}
function bindCreditsEvents(){
  $('modeLyrics').addEventListener('click',()=>setMode('lyrics'));$('modeEndroll').addEventListener('click',()=>setMode('endroll'));$('modeCredits').addEventListener('click',()=>setMode('credits'));
  $('mediaInput').addEventListener('change',e=>{const list=Array.from(e.target.files||[]);e.target.value='';if(list.length)addMediaFiles(list);});
  const drop=$('mediaDrop');for(const ev of ['dragover','dragenter'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragover');});for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragover');});
  drop.addEventListener('drop',e=>{const list=Array.from(e.dataTransfer?.files||[]);if(list.length)addMediaFiles(list);});
  $('addClipBtn').addEventListener('click',()=>addClip(state.selectedAssetId));
  $('clearClipsBtn').addEventListener('click',()=>{if(state.creditClips.length&&confirm('エンドロールの配置をすべて削除しますか？')){state.creditClips=[];state.selectedClipId=null;renderCreditsUI();renderTimeline();renderPreview();}});
  function changeClip(id){let c=creditsClip();if(!c)return;let val=$(id).value;
    if(id==='clipStart'){const old=c.start;c.start=Math.max(0,num(val));c.end=Math.max(c.start+.05,c.end+(c.start-old));}
    if(id==='clipEnd')c.end=Math.max(c.start+.05,num(val));
    if(id==='clipAutoEnd')c.autoEnd=$('clipAutoEnd').checked;
    if(id==='clipCrossfade')c.crossfade=$('clipCrossfade').checked;
    if(id==='clipFade')c.fade=Math.max(.1,num(val,1));
    if(id==='clipFit')c.fit=val==='contain'?'contain':'cover';
    if(id==='clipVideoLoop')c.loop=$('clipVideoLoop').checked;
    renderTimeline();renderClipList();if(id==='clipFade')$('clipFadeOutput').textContent=c.fade.toFixed(2)+' 秒';
    if(id==='clipStart'||id==='clipEnd'||id==='clipAutoEnd'||id==='clipCrossfade')syncClipEditor();
    renderPreview();
  }
  for(const id of ['clipStart','clipEnd','clipAutoEnd','clipCrossfade','clipFade','clipFit','clipVideoLoop'])$(id).addEventListener('input',()=>changeClip(id));
  $('clipNowStart').addEventListener('click',()=>{let c=creditsClip();if(!c)return;const old=c.start;c.start=state.time;c.end=Math.max(c.start+.05,c.end+(c.start-old));renderCreditsUI();renderTimeline();renderPreview();});
  $('clipNowEnd').addEventListener('click',()=>{let c=creditsClip();if(!c)return;c.autoEnd=false;c.end=Math.max(c.start+.05,state.time);renderCreditsUI();renderTimeline();renderPreview();});
  $('previewLyricsWithCredits').addEventListener('change',renderPreview);
}
function missingUsedMedia(){return state.mediaAssets.filter(a=>!a.file&&state.creditClips.some(c=>c.assetId===a.id));}
function showCreditsScript(audioName){
  let assets=state.mediaAssets.filter(a=>state.creditClips.some(c=>c.assetId===a.id)).map(a=>({id:a.id,type:a.type,path:mediaPath(a)}));
  let config={width:state.width,height:state.height,audio:resourceURL('data/bgm/'+audioName),assets:assets,clips:state.creditClips.map(c=>({assetId:c.assetId,start:Number(c.start.toFixed(3)),end:Number(c.end.toFixed(3)),crossfade:!!c.crossfade,fade:Number(c.fade.toFixed(3)),autoEnd:!!c.autoEnd,fit:c.fit,loop:!!c.loop}))};
  let core=window.TYRANO_CREDITS_CORE_SOURCE,runtime=window.TYRANO_CREDITS_RUNTIME_SOURCE;
  if(!core||!runtime)throw new Error('エンドロールの描画エンジンが読み込まれていません');
  return '; ChocoLyric Credits / self-contained / image + video\r\n[iscript]\r\nif (!window.ChocoCreditsCore) {\r\n'+core+'\r\n}\r\nif (!window.ChocoCredits) {\r\n'+runtime+'\r\n}\r\nwindow.ChocoCredits.start('+JSON.stringify(config,null,2)+');\r\n[endscript]\r\n[return]\r\n';
}
function setupScript(){let modules=[];if(state.cues.length){modules.push('if (!window.TyranoLyrics || !window.LyricsPainter) {\n'+window.TYRANO_LYRICS_RUNTIME_SOURCE+'\n}');}if(state.creditClips.length){modules.push('if (!window.ChocoCreditsCore) {\n'+window.TYRANO_CREDITS_CORE_SOURCE+'\n}');modules.push('if (!window.ChocoCredits) {\n'+window.TYRANO_CREDITS_RUNTIME_SOURCE+'\n}');}
  return '; Call once at the beginning of your story (optional)\r\n[iscript]\r\n'+modules.join('\r\n')+'\r\n[endscript]\r\n[return]\r\n';
}
function creditsStopScript(){return '; ChocoLyric Credits - stop\r\n[iscript]\r\nif (window.ChocoCredits) window.ChocoCredits.stop();\r\n[endscript]\r\n[return]\r\n';}
function comboStartScript(){return '; ChocoLyric: start enabled tracks\r\n'+(state.cues.length?'[call storage=\"lyrics_show.ks\"]\r\n':'')+(state.endroll.cards.length?'[call storage=\"endroll_show.ks\"]\r\n':'')+(state.creditClips.length?'[call storage=\"credits_show.ks\"]\r\n':'')+'[return]\r\n';}
function quickTestScript(){return '; ChocoLyric: simple 15 second playback test\r\n'+
  '[call storage="choco_setup.ks"]\r\n[call storage="choco_start.ks"]\r\n[wait time=15000]\r\n[call storage="choco_stop.ks"]\r\n[return]\r\n';}
function comboStopScript(){return '; Stop overlays without page reload\r\n[iscript]\r\nif (window.ChocoCredits) window.ChocoCredits.stop();\r\nif (window.ChocoEndroll) window.ChocoEndroll.stop();\r\nif (window.TyranoLyrics) window.TyranoLyrics.stop();\r\n[endscript]\r\n[return]\r\n';}
function creditsReadme(audioName){return `\r\n\r\n【エンドロール（画像・動画）】\r\n`+
  `data/scenario/credits_show.ks / credits_stop.ks / choco_setup.ks / choco_stop.ks\r\n`+
  `画像: data/fgimage/choco_credits/、動画: data/video/choco_credits/\r\n`+
  `\r\n・先に[call storage="choco_setup.ks"]を冒頭で実行すると、描画エンジンを初期化できます（任意）。\r\n`+
  `・歌詞と映像をまとめて再生: [call storage="choco_start.ks"]\r\n`+
  `・歌詞と映像をまとめて停止: [call storage="choco_stop.ks"]\r\n`+
  `・映像単体を再生: [call storage="credits_show.ks"]\r\n`+
  `・映像だけ停止: [call storage="credits_stop.ks"]\r\n`+
  `・既に[call storage="lyrics_show.ks"]が動いているときは、続けて[call storage="credits_show.ks"]で同時再生できます。\r\n`+
  `・映像のZ-indexは99995、歌詞は99996。通常の画像より上・歌詞より下に表示されます。\r\n`+
  `・音声は同じ再生時計を共有します。映像の動画音声は常にミュート。\r\n`+
  `・動画クリップの「動画をループ再生する」ONなら表示区間内で繰り返し、OFFなら最終フレームを保持します。\r\n`+
  `・動画の実再生可否はWindows/NW.js/Chromiumのコーデックに依存します。MP4(H.264)とWebMを推奨します。\r\n`+
  `・GIFはアニメーション画像のままファイルを同梱します。Canvasプレビューは静止画として表示される場合があります。\r\n`+
  `・画像・動画の形式や最大サイズはティラノビルダー実機で検証してください。\r\n`+
  `・JSONプロジェクト（v2.4以降）は素材を含むため、再読み込み時に自動復元します。大容量の素材はJSONファイルが大きくなります。\r\n`;
}


function endrollReadme(){return `

【エンドロール（流れるクレジット）】
`+
  `data/scenario/endroll_show.ks / endroll_stop.ks / choco_setup.ks / choco_stop.ks
`+
  `
・歌詞とクレジットをまとめて再生: [call storage="choco_start.ks"]
`+
  `・クレジット単体を再生: [call storage="endroll_show.ks"]
`+
  `・クレジットだけ停止: [call storage="endroll_stop.ks"]
`+
  `・描画優先順は 映像(99994) → エンドロール(99995) → 歌詞(99996) です。
`+
  `・クレジット全体が start ～ end の間で一定速度で流れます。流れる方向は下→上 / 上→下から選択できます。
`;}

function initEvents(){
  $('audioInput').addEventListener('change',e=>{if(e.target.files[0])audioChanged(e.target.files[0]);e.target.value='';});
  const drop=$('audioDrop');for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragover');});for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragover');});drop.addEventListener('drop',e=>{let file=e.dataTransfer.files[0];if(file)audioChanged(file);});
  $('srtInput').addEventListener('change',async e=>{let f=e.target.files[0];if(f)importSrtText(await f.text(),f.name);e.target.value='';});
  $('txtInput').addEventListener('change',async e=>{let f=e.target.files[0];if(f)importTxtText(await f.text(),f.name);e.target.value='';});
  $('fontInput').addEventListener('change',async e=>{let files=Array.from(e.target.files||[]);e.target.value='';if(files.length)await importFonts(files);});
  $('endrollFontInput').addEventListener('change',async e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)await importFonts(files,false);});
  $('downloadFontsOnlyBtn').addEventListener('click',downloadFontsOnly);
  $('applyAllStyleBtn').addEventListener('click',()=>{let c=cue();if(!c)return;state.cues.forEach(o=>{if(o.id!==c.id)o.style=clone(c.style);});renderUI();toast(`スタイルを${state.cues.length}フレーズに反映しました`);});
  $('addCueBtn').addEventListener('click',()=>{let now=state.audio?state.audio.currentTime:state.time;let nc=freshCue('',now,now+3.5,cue()?.style||emptyStyle());state.cues.push(nc);state.selectedId=nc.id;renderUI();$('cueText').focus();$('cueText').select();});
  $('clearCuesBtn').addEventListener('click',()=>{if(!state.cues.length)return;if(confirm(`${state.cues.length}件の歌詞をすべて消去しますか？`)){state.cues=[];state.tapLines.forEach(x=>x.usedId=null);state.selectedId=null;renderUI();}});
  document.querySelectorAll('.switch-tab').forEach(b=>b.addEventListener('click',()=>setActiveTab(b.dataset.tab)));
  $('playBtn').addEventListener('click',playPause);$('back1Btn').addEventListener('click',()=>setTime(state.time-1));$('forward1Btn').addEventListener('click',()=>setTime(state.time+1));$('backFrameBtn').addEventListener('click',()=>setTime(state.time-.1));$('forwardFrameBtn').addEventListener('click',()=>setTime(state.time+.1));
  $('loopPreview').addEventListener('change',e=>state.loop=e.target.checked);
  $('setStartBtn').addEventListener('click',()=>{let c=cue();if(!c)return;c.start=Math.max(0,Math.min(state.time,c.end-.06));renderUI();});$('setEndBtn').addEventListener('click',()=>{let c=cue();if(!c)return;c.end=Math.max(c.start+.06,state.time);renderUI();});
  $('copyStartBtn').addEventListener('click',()=>{let c=cue();if(!c)return;c.start=Math.min(state.time,c.end-.06);c.start=Math.max(0,c.start);renderUI();});$('copyEndBtn').addEventListener('click',()=>{let c=cue();if(!c)return;c.end=Math.max(state.time,c.start+.06);renderUI();});
  let dragTimeline=false;const seekPointer=e=>{let r=$('timeline').getBoundingClientRect();setTime((e.clientX-r.left)/r.width*state.duration);};
  $('timeline').addEventListener('pointerdown',e=>{if(e.target.closest('.cue-bar'))return;dragTimeline=true;$('timeline').setPointerCapture(e.pointerId);seekPointer(e);});
  $('timeline').addEventListener('pointermove',e=>{if(dragTimeline)seekPointer(e);});$('timeline').addEventListener('pointerup',()=>dragTimeline=false);$('timeline').addEventListener('pointercancel',()=>dragTimeline=false);
  let dragStage=false;const positionPointer=e=>{let c=cue();if(!c)return;let r=canvas.getBoundingClientRect();c.style.x=Math.round(clamp((e.clientX-r.left)/r.width*state.width,0,state.width));c.style.y=Math.round(clamp((e.clientY-r.top)/r.height*state.height,0,state.height));$('posX').value=c.style.x;$('posY').value=c.style.y;$('posXOutput').textContent=c.style.x+' px';$('posYOutput').textContent=c.style.y+' px';renderPreview();};
  $('canvasWrap').addEventListener('pointerdown',e=>{if(state.mode!=='lyrics'||!cue())return;dragStage=true;$('canvasWrap').setPointerCapture(e.pointerId);positionPointer(e);});$('canvasWrap').addEventListener('pointermove',e=>{if(dragStage)positionPointer(e);});$('canvasWrap').addEventListener('pointerup',()=>dragStage=false);$('canvasWrap').addEventListener('pointercancel',()=>dragStage=false);
  $('forceSelected').addEventListener('change',e=>{state.force=e.target.checked;renderPreview();});$('fitBtn').addEventListener('click',()=>{$('previewPanel')?.scrollIntoView({block:'nearest'});renderPreview();});
  $('screenSize').addEventListener('change',e=>{let v=e.target.value;$('customSize').classList.toggle('hidden',v!=='custom');if(v!=='custom'){let [w,h]=v.split('x').map(Number);setSize(w,h);}else{$('customWidth').value=state.width;$('customHeight').value=state.height;}});
  for(const id of ['customWidth','customHeight'])$(id).addEventListener('change',()=>setSize(num($('customWidth').value,state.width),num($('customHeight').value,state.height)));
  $('bgImageInput').addEventListener('change',e=>{let file=e.target.files[0];if(file){attachBackground(file);toast('プレビュー背景画像を追加しました');}e.target.value='';});
  $('removeBgBtn').addEventListener('click',()=>attachBackground(null));
  bindInputs();
  for(let b of document.querySelectorAll('[data-color]'))b.addEventListener('click',()=>openColor(b.dataset.color,b));
  document.querySelectorAll('[data-hex]').forEach(e=>e.addEventListener('change',()=>{let hex=parseHex(e.value);if(hex)applyColor(e.dataset.hex,hex);else syncColorInputs();}));
  $('closeColor').addEventListener('click',()=>$('colorPopover').classList.add('hidden'));
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#colorPopover')&&!e.target.closest('.color-control'))$('colorPopover').classList.add('hidden');});
  wheel.addEventListener('pointerdown',e=>{let pt=colorPoint(e),rr=Math.hypot(pt.x,pt.y);cp.active=rr>74?'ring':'square';wheel.setPointerCapture(e.pointerId);wheelChange(e);});wheel.addEventListener('pointermove',e=>{if(cp.active)wheelChange(e);});wheel.addEventListener('pointerup',()=>cp.active=null);wheel.addEventListener('pointercancel',()=>cp.active=null);
  $('nativePicker').addEventListener('input',e=>{Object.assign(cp,hexToHsv(e.target.value));drawColorWheel();applyColor(cp.target,e.target.value);});
  $('saveProjectBtn').addEventListener('click',saveProject);$('loadProjectBtn').addEventListener('click',()=>$('projectInput').click());$('projectInput').addEventListener('change',async e=>{let f=e.target.files[0];e.target.value='';if(!f)return;const button=$('loadProjectBtn');withProjectButton(button,true,'素材を復元中…');try{await loadProject(JSON.parse(await f.text()));}catch(err){console.error(err);toast('読み込み失敗：'+err.message);}finally{withProjectButton(button,false);}});
  $('exportSrtBtn').addEventListener('click',exportSRT);
  $('exportBtn').addEventListener('click',()=>{let n=$('exportAudioName');if(!n.value)n.value=state.audioFile?.name||'your_song.mp3';$('exportAudioPreview').textContent='data/bgm/'+originalName(n.value);$('exportDialog').showModal();});
  $('exportAudioName').addEventListener('input',e=>$('exportAudioPreview').textContent='data/bgm/'+(e.target.value?originalName(e.target.value):'your_song.mp3'));$('closeExportBtn').addEventListener('click',()=>$('exportDialog').close());$('confirmExportBtn').addEventListener('click',exportZip);
  $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelpBtn').addEventListener('click',()=>$('helpDialog').close());
  document.addEventListener('keydown',e=>{let tag=document.activeElement?.tagName||'';let edit=['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable;if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}if(edit)return;if(e.code==='Space'){e.preventDefault();playPause();}if(e.key==='ArrowLeft'){e.preventDefault();setTime(state.time-(e.shiftKey?1:.1));}if(e.key==='ArrowRight'){e.preventDefault();setTime(state.time+(e.shiftKey?1:.1));}if(e.key==='Enter'&&!e.repeat){let pending=state.tapLines.findIndex(x=>!x.usedId);if(pending>=0){e.preventDefault();tapLine(pending);}}});
}
function init(){initEndrollFontSelects();bindCreditsEvents();bindEndrollEvents();bindEndrollStyleEvents();initEvents();renderFontManager();updateCanvasSize();refreshDuration();renderUI();setActiveTab('cues');requestAnimationFrame(frame);}
init();
})();
