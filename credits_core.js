/* ChocoLyric Credits - shared timeline and transition logic (editor + Tyrano) */
(function(root){
'use strict';
function safeNumber(v, fallback){var n=Number(v);return isFinite(n)?n:fallback;}
function sorted(clips){return (Array.isArray(clips)?clips:[]).filter(function(c){return c && c.assetId;}).slice().sort(function(a,b){return safeNumber(a.start,0)-safeNumber(b.start,0);});}
function active(clips,time){
  var ordered=sorted(clips),t=Math.max(0,safeNumber(time,0)),out=[];
  for(var i=0;i<ordered.length;i++){
    var c=ordered[i],next=ordered[i+1],previous=ordered[i-1];
    var begin=Math.max(0,safeNumber(c.start,0));
    var end=Math.max(begin+0.03,safeNumber(c.end,begin+5));
    var fadeNext=next&&next.crossfade?Math.max(0,safeNumber(next.fade,1)):0;
    if(next){
      var switchEnd=Math.max(0,safeNumber(next.start,0))+fadeNext;
      end=Math.min(c.autoEnd===false?end:switchEnd,switchEnd);
    }
    if(t<begin||t>=end)continue;
    var opacity=1;
    if(previous && c.crossfade){
      var fade=Math.max(0,safeNumber(c.fade,1));
      if(fade>0 && t<begin+fade){opacity=Math.max(0,Math.min(1,(t-begin)/fade));}
    }
    if(next&&next.crossfade){
      var nStart=Math.max(0,safeNumber(next.start,0));
      var f=Math.max(0,safeNumber(next.fade,1));
      if(f>0&&t>=nStart&&t<nStart+f){opacity*=Math.max(0,Math.min(1,1-(t-nStart)/f));}
    }
    if(opacity>0.0001)out.push({clip:c,alpha:opacity,index:i,localTime:Math.max(0,t-begin)});
  }
  return out;
}
root.ChocoCreditsCore={active:active,sorted:sorted};
})(window);
