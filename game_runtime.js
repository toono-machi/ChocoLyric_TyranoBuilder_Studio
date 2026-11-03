/* Tyrano Lyrics Studio runtime, bundled with the same renderer used in the preview */
(function(root){
'use strict';
var player=null;
function stop(){
  if(!player)return;
  var p=player;player=null;
  cancelAnimationFrame(p.raf);
  if(p.audio){p.audio.pause();p.audio.removeAttribute('src');p.audio.load();}
  if(p.host && p.host.parentNode)p.host.parentNode.removeChild(p.host);
}
function stage(){
  return document.querySelector('.tyrano_base') || document.querySelector('#tyrano_base') || document.body;
}
function start(data){
  stop();
  data=data||{};
  var width=Math.max(1,Number(data.width)||1920),height=Math.max(1,Number(data.height)||1080);
  var parent=stage(), host=document.createElement('div');
  host.id='tyrano-lyrics-overlay';
  Object.assign(host.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',zIndex:'99996',pointerEvents:'none',overflow:'hidden'});
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  var canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  Object.assign(canvas.style,{width:'100%',height:'100%',display:'block',pointerEvents:'none'});
  host.appendChild(canvas);parent.appendChild(host);
  var ctx=canvas.getContext('2d'), audio=new Audio();
  audio.preload='auto';audio.loop=false;audio.src=data.audio||'';
  var p={host:host,audio:audio,raf:0,ctx:ctx};player=p;
  var cues=Array.isArray(data.cues)?data.cues:[];
  var drawing=function(){
    if(player!==p)return;
    ctx.clearRect(0,0,width,height);
    if(root.LyricsPainter)root.LyricsPainter.draw(ctx,cues,audio.currentTime||0,{width:width,height:height});
    p.raf=requestAnimationFrame(drawing);
  };
  p.raf=requestAnimationFrame(drawing);
  function showUnlock(){
    if(player!==p || p.unlock)return;
    var btn=document.createElement('button');btn.type='button';btn.textContent='▶ 歌詞付き音声を再生';
    Object.assign(btn.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',padding:'18px 28px',background:'#4d281e',color:'#fff9ee',fontSize:'22px',borderRadius:'16px',border:'2px solid #fff1cf',cursor:'pointer',pointerEvents:'auto',boxShadow:'0 15px 40px #21100e77'});
    host.appendChild(btn);p.unlock=btn;
    btn.addEventListener('click',function(){audio.play().then(function(){btn.remove();p.unlock=null;}).catch(function(e){console.warn('[TyranoLyrics] 再生失敗',e);});});
  }
  audio.addEventListener('ended',function(){
    if(player!==p)return;
    if(typeof data.onEnd==='function'){try{data.onEnd();}catch(e){console.error(e);}}
    if(data.removeOnEnd!==false)stop();
  });
  audio.addEventListener('error',function(){console.error('[TyranoLyrics] 音声ファイルを開けません:',data.audio);showUnlock();});
  audio.play().catch(function(){showUnlock();});
  return {stop:stop,pause:function(){audio.pause();},play:function(){return audio.play();},audio:audio};
}
root.TyranoLyrics={start:start,stop:stop,getAudio:function(){return player&&player.audio;}};
})(window);
