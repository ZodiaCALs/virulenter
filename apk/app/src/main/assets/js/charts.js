window.V=window.V||{};
(function(V){
'use strict';
var U=V.util;
var NUM=window.Intl&&Intl.NumberFormat?new Intl.NumberFormat('en'):{format:function(n){return n.toLocaleString('en');}};
var Charts=V.charts={
_tip:null,
_active:null,
init:function(){
var tip=Charts._tip=U.el('div','chart-tip');
tip.setAttribute('role','tooltip');
tip.setAttribute('aria-hidden','true');
document.body.appendChild(tip);
document.addEventListener('pointerdown',function(ev){
if(!ev.target.closest||!ev.target.closest('.chart, .heat-grid, .year-strip'))Charts.clear();
});
window.addEventListener('scroll',function(){Charts.clear();},{passive:true});
window.addEventListener('resize',function(){Charts.clear();});
if(window.ResizeObserver){
Charts._ro=new ResizeObserver(function(entries){
entries.forEach(function(en){
var el=en.target;
var w=Math.round(en.contentRect.width);
if(el._spec&&w&&w!==el._w){
Charts.column(el,el._spec,{animate:false});
}
});
});
}
return Charts;
},
ticks:function(max,count){
if(!(max>0))return{top:4,step:1,values:[0,1,2,3,4],empty:true};
var raw=max/(count||4);
var mag=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10));
var norm=raw/mag;
var step=(norm<=1?1:norm<=2?2:norm<=5?5:10)*mag;
step=Math.max(1,Math.round(step));
var top=Math.ceil(max/step)*step;
var values=[];
for(var v=0;v<=top+1e-9;v+=step)values.push(v);
return{top:top,step:step,values:values};
},
fmt:function(n){
if(n>=10000)return(Math.round(n/100)/10).toString().replace(/\.0$/,'')+'K';
return NUM.format(Math.round(n));
},
column:function(el,spec,opts){
opts=opts||{};
el._spec=spec;
if(Charts._ro&&!el._observed){Charts._ro.observe(el);el._observed=true;}
Charts.bind(el);
el.classList.add('chart');
el.setAttribute('aria-label',spec.label||'Chart');
el.style.setProperty('--series',spec.color||'var(--accent)');
if(el.dataset.view==='table'){
el.removeAttribute('tabindex');
el.setAttribute('role','region');
el.innerHTML=Charts.tableHTML(spec);
el._geo=null;
return;
}
el.setAttribute('role','figure');
el.tabIndex=0;
var cols=spec.columns;
var n=cols.length;
var W=Math.max(220,Math.round(el.clientWidth||el.getBoundingClientRect().width||320));
el._w=W;
var H=spec.height||196;
var axisH=24,topPad=20;
var values=cols.map(function(c){return c.value;});
var max=Math.max.apply(null,values.concat([0]));
var t=Charts.ticks(max);
var tickChars=Math.max.apply(null,t.values.map(function(v){return Charts.fmt(v).length;}));
var padL=Math.round(tickChars*6.6+12),padR=2;
var plotW=W-padL-padR,plotH=H-axisH-topPad;
var band=plotW/n;
var bw=Math.max(2,Math.min(24,band*(n>40?0.74:0.6)));
var base=topPad+plotH;
var yOf=function(v){return topPad+plotH-(v/t.top)*plotH;};
var peakI=-1;
values.forEach(function(v,i){if(v>0&&(peakI<0||v>values[peakI]))peakI=i;});
var avg=n?values.reduce(function(a,b){return a+b;},0)/n:0;
var out=[];
out.push('<svg class="chart-svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">');
t.values.forEach(function(v){
var y=Math.round(yOf(v))+0.5;
out.push('<line class="'+(v===0?'axis':'grid')+'" x1="'+padL+'" x2="'+(W-padR)+'" y1="'+y+'" y2="'+y+'"/>');
out.push('<text class="tick y" x="'+(padL-8)+'" y="'+y+'">'+Charts.fmt(v)+'</text>');
});
out.push('<rect class="band" x="0" y="'+topPad+'" width="'+Math.max(1,band-2)+'" height="'+plotH+'" rx="4"/>');
var geo=[];
cols.forEach(function(c,i){
var cx=padL+band*i+band/2;
var x=cx-bw/2;
var h=c.value>0?Math.max(2,base-yOf(c.value)):0;
var top=base-h;
geo.push({cx:cx,top:top,h:h});
var cls='bar';
if(spec.emphasis==='peak'&&c.value>0)cls+=i===peakI?' is-peak':' is-rest';
if(c.today)cls+=' is-today';
out.push('<path class="'+cls+(opts.animate===false?'':' grow')+'" style="--i:'+Math.min(i,40)+
'" d="'+(h?barPath(x,top,bw,h,4):'')+'" data-i="'+i+'"/>');
});
if(spec.average&&max>0){
var ya=Math.round(yOf(avg))+0.5;
out.push('<line class="avg" x1="'+padL+'" x2="'+(W-padR)+'" y1="'+ya+'" y2="'+ya+'"/>');
var avgText='avg '+(avg>=10?Math.round(avg):(Math.round(avg*10)/10));
var rightSide=peakI<n*0.72;
out.push('<text class="avg-label" x="'+(rightSide?W-padR-2:padL+4)+'" y="'+(ya-6)+'" text-anchor="'+
(rightSide?'end':'start')+'">'+avgText+'</text>');
}
if(peakI>=0){
var pg=geo[peakI];
var px=Math.max(padL+8,Math.min(W-padR-8,pg.cx));
out.push('<text class="peak-label" x="'+px+'" y="'+(pg.top-6)+'" text-anchor="middle">'+Charts.fmt(values[peakI])+'</text>');
}
var lastLeft=Infinity;
var ticksOut=[];
for(var i=n-1;i>=0;i--){
var label=cols[i].tick;
if(!label)continue;
var w=label.length*6.4;
var cx=geo[i].cx;
cx=Math.max(padL+w/2,Math.min(W-padR-w/2,cx));
if(cx+w/2+12>lastLeft)continue;
lastLeft=cx-w/2;
ticksOut.push('<text class="tick x" x="'+cx.toFixed(1)+'" y="'+(base+16)+'">'+U.esc(label)+'</text>');
}
out.push(ticksOut.join(''));
if(t.empty){
out.push('<text class="empty-label" x="'+(padL+plotW/2)+'" y="'+(topPad+plotH/2)+'">'+
U.esc(spec.empty||'Nothing to show yet')+'</text>');
}
out.push('</svg><span class="sr-only" aria-live="polite"></span>');
el.innerHTML=out.join('');
el._geo={padL:padL,band:band,n:n,geo:geo,bw:bw,topPad:topPad,plotH:plotH,empty:!!t.empty};
if(Charts._active===el)Charts.clear();
},
bind:function(el){
if(el._bound)return;
el._bound=true;
el.style.touchAction='pan-y';
function at(ev){
var g=el._geo;
if(!g||g.empty)return-1;
var svg=el.querySelector('svg');
if(!svg)return-1;
var x=ev.clientX-svg.getBoundingClientRect().left-g.padL;
return Math.max(0,Math.min(g.n-1,Math.floor(x/g.band)));
}
el.addEventListener('pointermove',function(ev){
if(ev.pointerType==='mouse'||el._scrub){
var i=at(ev);
if(i>=0)Charts.activate(el,i,ev.pointerType==='mouse'?'mouse':'touch');
}
});
el.addEventListener('pointerleave',function(ev){
if(ev.pointerType==='mouse')Charts.clear();
});
el.addEventListener('pointerdown',function(ev){
if(ev.pointerType==='mouse')return;
var i=at(ev);
if(i<0)return;
if(Charts._active===el&&el._i===i&&!el._scrub&&el._spec.onSelect){
Charts.select(el,i);
return;
}
el._scrub=true;
try{el.setPointerCapture(ev.pointerId);}catch(e){}
Charts.activate(el,i,'touch');
});
el.addEventListener('pointerup',function(){el._scrub=false;});
el.addEventListener('pointercancel',function(){el._scrub=false;Charts.clear();});
el.addEventListener('click',function(ev){
if(ev.pointerType&&ev.pointerType!=='mouse')return;
var i=at(ev);
if(i>=0&&el._spec&&el._spec.onSelect)Charts.select(el,i);
});
el.addEventListener('keydown',function(ev){
var g=el._geo;
if(!g||g.empty)return;
var i=el._i==null||Charts._active!==el?-1:el._i;
var next=null;
if(ev.key==='ArrowRight')next=Math.min(g.n-1,i+1);
else if(ev.key==='ArrowLeft')next=i<0?g.n-1:Math.max(0,i-1);
else if(ev.key==='Home')next=0;
else if(ev.key==='End')next=g.n-1;
else if((ev.key==='Enter'||ev.key===' ')&&i>=0&&el._spec.onSelect){
ev.preventDefault();
Charts.select(el,i);
return;
}else if(ev.key==='Escape'&&Charts._active===el){
ev.stopPropagation();
Charts.clear();
return;
}
if(next===null)return;
ev.preventDefault();
Charts.activate(el,next,'key');
});
el.addEventListener('blur',function(){if(Charts._active===el)Charts.clear();});
},
activate:function(el,i,source){
var g=el._geo;
if(!g)return;
if(Charts._active&&Charts._active!==el)Charts.clear();
Charts._active=el;
el._i=i;
el.classList.add('is-hover');
U.qsa('.bar.is-on',el).forEach(function(b){b.classList.remove('is-on');});
var bar=el.querySelector('.bar[data-i="'+i+'"]');
if(bar)bar.classList.add('is-on');
var band=el.querySelector('.band');
if(band){
band.setAttribute('x',(g.padL+g.band*i+1).toFixed(1));
band.classList.add('is-on');
}
var col=el._spec.columns[i];
var hint=el._spec.onSelect
?(source==='touch'?'Tap again to open in the calendar':source==='key'?'Enter opens it in the calendar':'Click to open in the calendar')
:'';
var svg=el.querySelector('svg').getBoundingClientRect();
var c=g.geo[i];
Charts.showTip({x:svg.left+c.cx,y:svg.top+Math.min(c.top,g.topPad+g.plotH-2)},{
head:col.title,
value:col.value,
unit:el._spec.unit,
rows:col.rows,
note:col.note,
hint:hint
});
if(source==='key'){
var live=el.querySelector('.sr-only');
if(live)live.textContent=col.title+': '+col.value+' '+U.plural(col.value,el._spec.unit[0],el._spec.unit[1])+'.';
}
},
select:function(el,i){
var fn=el._spec&&el._spec.onSelect;
Charts.clear();
if(fn)fn(i);
},
clear:function(){
var el=Charts._active;
Charts._active=null;
if(Charts._tip)Charts._tip.classList.remove('is-on');
if(!el)return;
el._scrub=false;
el.classList.remove('is-hover');
U.qsa('.bar.is-on',el).forEach(function(b){b.classList.remove('is-on');});
var band=el.querySelector('.band');
if(band)band.classList.remove('is-on');
},
showTip:function(anchor,d){
var tip=Charts._tip;
if(!tip)return;
tip.textContent='';
var head=U.el('div','tip-head');
head.textContent=d.head||'';
tip.appendChild(head);
var val=U.el('div','tip-value');
var b=document.createElement('b');
b.textContent=Charts.fmt(d.value);
val.appendChild(b);
val.appendChild(document.createTextNode(' '+U.plural(d.value,d.unit[0],d.unit[1])));
tip.appendChild(val);
if(d.note){
var note=U.el('div','tip-note');
note.textContent=d.note;
tip.appendChild(note);
}
var rows=(d.rows||[]).filter(function(r){return r.n>0;});
if(rows.length>1||(rows.length===1&&rows[0].name)){
var list=U.el('div','tip-rows');
rows.slice(0,6).forEach(function(r){
var row=U.el('div','tip-row');
var key=U.el('i','tip-key');
key.style.background=r.color;
var n=document.createElement('b');
n.textContent=Charts.fmt(r.n);
var name=document.createElement('span');
name.textContent=r.name;
row.appendChild(key);row.appendChild(n);row.appendChild(name);
list.appendChild(row);
});
if(rows.length>6){
var more=U.el('div','tip-row more');
more.textContent='+'+(rows.length-6)+' more';
list.appendChild(more);
}
tip.appendChild(list);
}
if(d.hint){
var hint=U.el('div','tip-hint');
hint.textContent=d.hint;
tip.appendChild(hint);
}
tip.classList.add('is-on');
var vw=document.documentElement.clientWidth;
var w=tip.offsetWidth,h=tip.offsetHeight;
var x=Math.max(8,Math.min(vw-w-8,anchor.x-w/2));
var topbar=document.querySelector('#topbar');
var minY=(topbar?topbar.getBoundingClientRect().bottom:0)+8;
var y=anchor.y-h-12;
if(y<minY)y=anchor.y+16;
tip.style.setProperty('--x',Math.round(x)+'px');
tip.style.setProperty('--y',Math.round(y)+'px');
},
tableHTML:function(spec){
var unit=spec.unit[1];
return'<table class="table chart-table"><caption class="sr-only">'+U.esc(spec.label)+'</caption>'+
'<thead><tr><th scope="col">'+U.esc(spec.colLabel||'Period')+'</th><th scope="col">'+U.esc(unit[0].toUpperCase()+unit.slice(1))+
'</th></tr></thead><tbody>'+spec.columns.map(function(c){
return'<tr><td>'+U.esc(c.title)+'</td><td class="num">'+Charts.fmt(c.value)+'</td></tr>';
}).join('')+'</tbody></table>';
},
toggleTable:function(el){
var table=el.dataset.view!=='table';
if(table)el.dataset.view='table';else delete el.dataset.view;
Charts.clear();
if(el._spec)Charts.column(el,el._spec,{animate:!table});
return table;
}
};
function barPath(x,y,w,h,r){
r=Math.min(r,w/2,h);
var x2=x+w,yb=y+h;
return'M'+f(x)+','+f(yb)+'V'+f(y+r)+'Q'+f(x)+','+f(y)+' '+f(x+r)+','+f(y)+
'H'+f(x2-r)+'Q'+f(x2)+','+f(y)+' '+f(x2)+','+f(y+r)+'V'+f(yb)+'Z';
}
function f(v){return Math.round(v*10)/10;}
})(window.V);
