/* Tyrano Lyrics Studio - shared pixel renderer for editor and game */
(function(root){
'use strict';
var DEFAULTS = {
  x: 960, y: 845, fontFamily: '"Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
  fontSize: 66, fontWeight: '700', color: '#FFF8E9', align: 'center',
  letterSpacing: 2, lineHeight: 1.38, maxWidth: 90, angle: 0,
  stroke: true, strokeColor: '#4D281E', strokeWidth: 5,
  shadow: true, shadowColor: '#21100E', shadowBlur: 10,
  fadeIn: true, fadeOut: true, fadeInDuration: 0.34, fadeOutDuration: 0.34,
  animation: 'none', animationDuration: 0.52, speed: 16, intensity: 28
};
function clamp(n,a,b){ return Math.max(a,Math.min(b,Number(n)||0)); }
function ease(n){ n=clamp(n,0,1); return 1-Math.pow(1-n,3); }
function graphemes(s){
  if(typeof Intl!=='undefined' && Intl.Segmenter){
    if(!graphemes.segmenter) graphemes.segmenter = new Intl.Segmenter('ja',{granularity:'grapheme'});
    return Array.from(graphemes.segmenter.segment(String(s||'')),x=>x.segment);
  }
  return Array.from(String(s||''));
}
function styleFor(cue){ return Object.assign({},DEFAULTS, cue && cue.style || {}); }
function paint(ctx,s,stageWidth){
  ctx.font = s.fontWeight+' '+s.fontSize+'px '+s.fontFamily;
  ctx.fillStyle=s.color;
  ctx.strokeStyle=s.strokeColor;
  ctx.lineWidth=Math.max(0,Number(s.strokeWidth)||0);
  ctx.lineJoin='round';
  ctx.miterLimit=2;
  ctx.textBaseline='middle';
  ctx.textAlign='left';
}
function textWidth(ctx,txt,space){
  var chunks=graphemes(txt); var w=0;
  for(var i=0;i<chunks.length;i++) w+=ctx.measureText(chunks[i]).width + (i?space:0);
  return w;
}
function wrapText(ctx,text,maxWidth,space){
  var out=[];
  String(text||'').split('\n').forEach(function(block){
    var line='',width=0;
    graphemes(block).forEach(function(ch){
      var charWidth=ctx.measureText(ch).width+(line?space:0);
      if(line && width+charWidth>maxWidth){out.push(line);line=ch;width=ctx.measureText(ch).width;}
      else {line+=ch; width+=charWidth;}
    });
    out.push(line);
  });
  return out.length?out:[''];
}
function drawGlyph(ctx,g,x,y,s,alpha,scale){
  if(alpha<=0 || !g)return;
  ctx.save();ctx.globalAlpha*=clamp(alpha,0,1);ctx.translate(x,y);
  if(scale!==1) ctx.scale(scale,scale);
  if(s.shadow){
    ctx.shadowColor=s.shadowColor;
    ctx.shadowBlur=s.shadowBlur;
    ctx.shadowOffsetY=2;
  }
  if(s.stroke && s.strokeWidth>0)ctx.strokeText(g,0,0);
  ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.fillText(g,0,0);ctx.restore();
}
function getOpacity(cue,s,time){
  var alpha=1;
  if(s.fadeIn) alpha*=clamp((time-cue.start)/Math.max(0.01,s.fadeInDuration),0,1);
  if(s.fadeOut) alpha*=clamp((cue.end-time)/Math.max(0.01,s.fadeOutDuration),0,1);
  return alpha;
}
function drawCue(ctx,cue,time,opts){
  opts=opts||{};
  if(!cue || !cue.text || !opts.force && (time<cue.start || time>=cue.end))return null;
  var s=styleFor(cue);
  var sec=Math.max(0,time-cue.start), total=Math.max(0.05,cue.end-cue.start);
  if(opts.force && (time<cue.start || time>=cue.end))sec=Math.min(total/2,Math.max(0.55,s.animationDuration));
  var alpha=opts.force?1:getOpacity(cue,s,time);
  if(alpha<0.001)return null;
  var anim=s.animation||'none', stageW=opts.width||1920;
  var revealText=String(cue.text);
  if(anim==='typewriter'||anim==='jumpTypewriter'){
    var count=Math.floor(sec*Math.max(1,s.speed));
    var chars=graphemes(revealText), str='',seen=0;
    for(var v=0;v<chars.length;v++){
      if(chars[v]==='\n'){str+='\n';continue;}
      if(seen>=count)break;
      str+=chars[v];seen++;
    }
    revealText=str;
  }
  ctx.save();paint(ctx,s,stageW);
  var textMax=stageW*clamp(s.maxWidth,15,100)/100;
  var lines=wrapText(ctx,revealText,textMax,s.letterSpacing);
  var height=s.fontSize*s.lineHeight, allHeight=height*lines.length;
  var movement=1-ease(sec/Math.max(0.05,s.animationDuration));
  var offsetX=0, offsetY=0, scale=1;
  if(anim==='float'){offsetY=s.intensity*movement;alpha*=1-movement;}
  if(anim==='slide'){offsetX=s.intensity*4*movement;alpha*=1-movement;}
  if(anim==='zoom'){scale=1-0.42*movement;alpha*=1-movement;}
  if(anim==='pop'){scale=1+0.2*Math.sin(Math.min(1,sec/Math.max(0.05,s.animationDuration))*Math.PI)*movement;}
  ctx.globalAlpha=alpha;
  var x=Number(s.x)||0,y=Number(s.y)||0;
  ctx.translate(x+offsetX,y+offsetY);ctx.rotate((Number(s.angle)||0)*Math.PI/180);ctx.scale(scale,scale);
  var charOffset=0, boundWidth=0;
  lines.forEach(function(line,li){
    var w=textWidth(ctx,line,s.letterSpacing);boundWidth=Math.max(boundWidth,w);
    var startX=s.align==='left'?0:s.align==='right'?-w:-w/2;
    var ly=(li-(lines.length-1)/2)*height;
    var gx=startX;
    graphemes(line).forEach(function(ch){
      var cw=ctx.measureText(ch).width;
      var cy=ly,gscale=1,gAlpha=1;
      if(anim==='wave' || anim==='jump'){
        var phase=sec*(Number(s.speed)||16)*0.55+charOffset*0.63;
        cy-=(anim==='jump'?Math.abs(Math.sin(phase)):Math.sin(phase))*s.intensity*0.6;
      } else if(anim==='jumpTypewriter'){
        var e=sec-(charOffset+1)/Math.max(1,s.speed);
        if(e>=0 && e<0.35)cy-=Math.sin(e/0.35*Math.PI)*s.intensity;
      } else if(anim==='scaleReveal'){
        var st=sec-charOffset/Math.max(1,s.speed);
        var p=ease(st/0.19);
        gAlpha=p;gscale=0.22+0.78*p;
      } else if(anim==='jumpInOut'){
        var q=Math.max(0,Math.min(1,sec/(s.animationDuration||0.5)));
        var r=Math.max(0,Math.min(1,(total-sec)/(s.animationDuration||0.5)));
        var power=Math.max(0,1-q,1-r);
        cy-=Math.abs(Math.sin(sec*(Number(s.speed)||16)*0.55+charOffset*.72))*s.intensity*power;
      }
      drawGlyph(ctx,ch,gx,cy,s,gAlpha,gscale);
      gx+=cw+s.letterSpacing;charOffset++;
    });
    charOffset++;
  });
  ctx.restore();
  return {x:x,y:y,width:boundWidth,height:allHeight};
}
function draw(ctx,cues,time,options){
  options=options||{};
  var sorted=(cues||[]).slice().sort((a,b)=>(a.layer||0)-(b.layer||0) || a.start-b.start);
  sorted.forEach(function(cue){drawCue(ctx,cue,time,options);});
}
root.LyricsPainter={defaults:DEFAULTS,draw:draw,drawCue:drawCue,styleFor:styleFor,clamp:clamp,graphemes:graphemes};
})(typeof window!=='undefined'?window:globalThis);
