/* Endroll canvas painter: identical code in editor preview and exported KS runtime. */
window.ChocoEndrollPainter = function paintEndroll(ctx, config, time, width, height) {
  config=config||{};
  var cards=Array.isArray(config.cards)?config.cards:[];
  var start=Number(config.start)||0;
  var end=Math.max(start+0.1,Number(config.end)||20);
  if(!cards.length || time<start || time>end) return;
  width=Math.max(1,Number(width)||1920);height=Math.max(1,Number(height)||1080);
  var defaults={
    title:{fontFamily:'"Yu Mincho", "Hiragino Mincho ProN", serif',fontWeight:'700',fontSize:42,color:'#FFF7EC',strokeColor:'#20120E',strokeWidth:6},
    body:{fontFamily:'"Yu Gothic", Meiryo, sans-serif',fontWeight:'500',fontSize:30,color:'#FFF7EC',strokeColor:'#20120E',strokeWidth:5},
    background:{enabled:true,color:'#22140F',opacity:56}
  };
  var all=config.style||{}, style={
    title:Object.assign({},defaults.title,all.title||{}),
    body:Object.assign({},defaults.body,all.body||{}),
    background:Object.assign({},defaults.background,all.background||{})
  };
  if(all.sameStyle)style.body=Object.assign({},style.title);
  var blocks=[];
  function wrapLine(line,txtStyle,maxWidth){
    ctx.save();ctx.font=String(txtStyle.fontWeight||'500')+' '+(Number(txtStyle.fontSize)||30)+'px '+txtStyle.fontFamily;
    var pieces=[],segment='',chars=Array.from(String(line||''));
    chars.forEach(function(c){var next=segment+c;
      if(segment && ctx.measureText(next).width>maxWidth){pieces.push(segment);segment=c;}else segment=next;
    });
    pieces.push(segment);ctx.restore();return pieces;
  }
  function textLines(card){
    var lines=[];
    if(card.type==='bgm'||card.type==='song'){
      if(card.composer)lines.push('作曲：'+card.composer);
      if(card.arranger)lines.push('編曲：'+card.arranger);
      if(card.type==='song'&&card.singer)lines.push('歌唱：'+card.singer);
    }else if(card.type==='cast'){
      lines=(card.entries||[]).filter(function(e){return e.role||e.actor;}).map(function(e){return (e.role||'')+' 役 / '+(e.actor||'');});
    }else lines=String(card.lines||'').replace(/\r/g,'').split(/\n+/).map(function(x){return x.trim();}).filter(Boolean);
    return lines.length?lines:[''];
  }
  var titleFont=style.title,bodyFont=style.body;
  var tSize=Math.max(8,Number(titleFont.fontSize)||42), bSize=Math.max(8,Number(bodyFont.fontSize)||30);
  var tH=tSize*1.35,bH=bSize*1.45;
  var padX=Math.max(18,Math.round(width*.04)),padY=Math.max(10,Math.round(height*.02));
  var maxW=width*.78, textMax=Math.max(20,maxW-padX*2);
  var cardGap=Math.round(height*.04),titleGap=Math.round(height*.017);
  cards.forEach(function(card){
    var title='【'+(card.label || '任意')+'】';
    var titleLines=wrapLine(title,titleFont,textMax);
    var lines=[];textLines(card).forEach(function(line){lines.push.apply(lines,wrapLine(line,bodyFont,textMax));});
    var widest=width*.12;
    ctx.save();
    ctx.font=String(titleFont.fontWeight)+' '+tSize+'px '+titleFont.fontFamily;
    titleLines.forEach(function(line){widest=Math.max(widest,ctx.measureText(line).width);});
    ctx.font=String(bodyFont.fontWeight)+' '+bSize+'px '+bodyFont.fontFamily;
    lines.forEach(function(line){widest=Math.max(widest,ctx.measureText(line).width);});
    ctx.restore();
    var boxW=Math.min(maxW,widest+padX*2);
    var boxH=padY*2+titleLines.length*tH+titleGap+lines.length*bH;
    blocks.push({title:titleLines,body:lines,boxW:boxW,boxH:boxH});
  });
  // The whole group shares a common horizontal column. Aligning each variable-width
  // card inside it keeps all titles and names on one visual left/center/right axis.
  // A percentage of 0/50/100 means left edge/center/right edge of the available area.
  var columnW=blocks.reduce(function(w,b){return Math.max(w,b.boxW);},0);
  var positionX=Math.max(0,Math.min(100,Number(config.positionX==null?50:config.positionX)||0))/100;
  var textAlign=['left','center','right'].indexOf(config.textAlign)>=0?config.textAlign:'center';
  // Relative horizontal displacement is always applied to body text only.
  // Percent of canvas width preserves positioning across resolution settings.
  // Default 0 reproduces the original v2.8 coordinates exactly.
  var bodyOffsetX=Math.max(-40,Math.min(40,Number(config.bodyOffsetX)||0))*width/100;
  var columnX=(width-columnW)*positionX;
  var totalH=blocks.reduce(function(v,b){return v+b.boxH;},0)+Math.max(0,blocks.length-1)*cardGap;
  var progress=Math.max(0,Math.min(1,(time-start)/(end-start)));
  var up=config.direction!=='topToBottom',fromY=up?height+40:-totalH-40,toY=up?-totalH-40:height+40;
  var y=fromY+(toY-fromY)*progress;
  function roundRect(x,yy,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,yy);ctx.arcTo(x+w,yy,x+w,yy+h,r);
    ctx.arcTo(x+w,yy+h,x,yy+h,r);ctx.arcTo(x,yy+h,x,yy,r);ctx.arcTo(x,yy,x+w,yy,r);ctx.closePath();
  }
  function drawText(line,txtStyle,x,yy,fs,align){
    if(!line)return;
    ctx.save();
    ctx.font=String(txtStyle.fontWeight||'500')+' '+fs+'px '+txtStyle.fontFamily;
    ctx.fillStyle=txtStyle.color||'#FFF7EC';ctx.textAlign=align;ctx.textBaseline='top';
    ctx.lineJoin='round';ctx.miterLimit=2;
    var stroke=Number(txtStyle.strokeWidth)||0;
    if(stroke>0){ctx.strokeStyle=txtStyle.strokeColor||'#20120E';ctx.lineWidth=stroke;ctx.strokeText(line,x,yy);}
    ctx.fillText(line,x,yy);
    ctx.restore();
  }
  blocks.forEach(function(block){
    var x=columnX+(textAlign==='left'?0:textAlign==='right'?columnW-block.boxW:(columnW-block.boxW)/2),cy=y+padY;
    var textX=textAlign==='left'?x+padX:textAlign==='right'?x+block.boxW-padX:x+block.boxW/2;
    var bodyX=textX+bodyOffsetX;
    ctx.save();
    if(style.background.enabled!==false){
      var rgb=String(style.background.color||'#22140F');
      var alpha=Math.max(0,Math.min(100,style.background.opacity==null?56:Number(style.background.opacity)))/100;
      // Keep heading at its original coordinate, while extending the backdrop
      // whenever the independently positioned body would otherwise escape it.
      var bgLeft=x,bgRight=x+block.boxW;
      if(bodyOffsetX!==0){
        ctx.font=String(bodyFont.fontWeight||'500')+' '+bSize+'px '+bodyFont.fontFamily;
        block.body.forEach(function(line){
          if(!line)return;
          var w=ctx.measureText(line).width;
          var left=textAlign==='left'?bodyX:textAlign==='right'?bodyX-w:bodyX-w/2;
          bgLeft=Math.min(bgLeft,left-padX);
          bgRight=Math.max(bgRight,left+w+padX);
        });
      }
      roundRect(bgLeft,y,bgRight-bgLeft,block.boxH,Math.min(22,(bgRight-bgLeft)/3,block.boxH/3));
      ctx.globalAlpha=alpha;ctx.fillStyle=rgb;ctx.fill();ctx.globalAlpha=1;
    }
    block.title.forEach(function(line){drawText(line,titleFont,textX,cy,tSize,textAlign);cy+=tH;});
    cy+=titleGap;
    block.body.forEach(function(line){drawText(line,bodyFont,bodyX,cy,bSize,textAlign);cy+=bH;});
    ctx.restore();y+=block.boxH+cardGap;
  });
};
