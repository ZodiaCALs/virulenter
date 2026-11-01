window.V=window.V||{};
(function(V){
'use strict';
var U=V.util,D=V.date,S=V.store,Charts=V.charts;
var RANGES={
'7d':{title:'last 7 days',prev:'the 7 days before'},
'30d':{title:'last 30 days',prev:'the 30 days before'},
'90d':{title:'last 13 weeks',prev:'the 13 weeks before'},
'1y':{title:'last 12 months',prev:'the 12 months before'}
};
var Stats=V.stats={
range:'30d',
only:null,
_els:{},
init:function(){
var els=Stats._els={
view:U.qs('#view-stats'),
range:U.qs('#statRange'),
only:U.qs('#statOnly'),
hero:U.qs('#statHero'),
trend:U.qs('#statTrend'),
trendTitle:U.qs('#statTrendTitle'),
trendSub:U.qs('#statTrendSub'),
weekday:U.qs('#statWeekday'),
weekdaySub:U.qs('#statWeekdaySub'),
hour:U.qs('#statHour'),
hourSub:U.qs('#statHourSub'),
streak:U.qs('#statStreak'),
events:U.qs('#statEvents'),
eventSub:U.qs('#statEventSub'),
heatScroll:U.qs('#statHeatScroll'),
heatMonths:U.qs('#statHeatMonths'),
heat:U.qs('#statHeat'),
heatSub:U.qs('#statHeatSub')
};
els.range.addEventListener('click',function(ev){
var b=ev.target.closest('[data-range]');
if(!b||b.dataset.range===Stats.range)return;
Stats.range=b.dataset.range;
Stats.render();
});
els.only.addEventListener('click',function(ev){
var b=ev.target.closest('[data-only]');
if(!b)return;
var id=b.dataset.only||null;
Stats.only=Stats.only===id?null:id;
Stats.render();
});
els.view.addEventListener('click',function(ev){
var b=ev.target.closest('[data-table-for]');
if(!b)return;
var on=Charts.toggleTable(U.qs('#'+b.dataset.tableFor));
b.setAttribute('aria-pressed',on?'true':'false');
b.classList.toggle('is-on',on);
});
Stats.bindCells(els.heat,function(iso){return Stats.dayRows(iso);});
return Stats;
},
events:function(){
if(Stats.only&&!S.get(Stats.only))Stats.only=null;
return Stats.only?S.events.filter(function(e){return e.id===Stats.only;}):S.events.slice();
},
period:function(){
var today=D.today();
var r=Stats.range;
var start,buckets=[],i;
if(r==='7d'||r==='30d'){
var n=r==='7d'?7:30;
start=D.addDays(today,-(n-1));
for(i=0;i<n;i++){
var d=D.addDays(start,i);
buckets.push({
from:d,to:d,
title:D.fmtDayLong(D.toISO(d)),
tick:i===n-1?'Today'
:r==='7d'?D.WEEKDAYS[d.getDay()]
:d.getDay()===1?d.getDate()+' '+D.MONTHS[d.getMonth()]:'',
today:i===n-1,
kind:'day'
});
}
}else if(r==='90d'){
var monday=D.addDays(today,-((today.getDay()+6)%7));
start=D.addDays(monday,-7*12);
for(i=0;i<13;i++){
var from=D.addDays(start,i*7);
var to=i===12?today:D.addDays(from,6);
buckets.push({
from:from,to:to,
title:'Week of '+D.fmtDay(D.toISO(from)),
tick:from.getDate()+' '+D.MONTHS[from.getMonth()],
today:i===12,
kind:'week'
});
}
}else{
start=new Date(today.getFullYear(),today.getMonth()-11,1);
for(i=0;i<12;i++){
var m0=new Date(start.getFullYear(),start.getMonth()+i,1);
var m1=i===11?today:new Date(m0.getFullYear(),m0.getMonth()+1,0);
buckets.push({
from:m0,to:m1,
title:D.fmtMonth(m0.getFullYear(),m0.getMonth()),
tick:D.MONTHS[m0.getMonth()],
today:i===11,
kind:'month'
});
}
}
var days=D.diffDays(start,today)+1;
return{
start:start,end:today,days:days,buckets:buckets,
prevStart:D.addDays(start,-days),prevEnd:D.addDays(start,-1)
};
},
render:function(){
var els=Stats._els;
var events=Stats.events();
var P=Stats.period();
var meta=RANGES[Stats.range];
var tone=function(e){return V.ui.tone(e.color).c;};
var byDay={};
events.forEach(function(e){
e.log.forEach(function(ts){
var k=D.dayKey(ts);
var o=byDay[k]||(byDay[k]={n:0,per:{}});
o.n++;
o.per[e.id]=(o.per[e.id]||0)+1;
});
});
Stats._byDay=byDay;
var totals={};
Object.keys(byDay).forEach(function(k){totals[k]=byDay[k].n;});
function sumDays(from,to){
var out={n:0,active:0,per:{}};
for(var d=from;d<=to;d=D.addDays(d,1)){
var o=byDay[D.toISO(d)];
if(!o)continue;
out.n+=o.n;
out.active++;
for(var id in o.per)out.per[id]=(out.per[id]||0)+o.per[id];
}
return out;
}
var cur=sumDays(P.start,P.end);
var prev=sumDays(P.prevStart,P.prevEnd);
var rowsFor=function(per){
return events.map(function(e){return{name:e.name,color:tone(e),n:per[e.id]||0};})
.sort(function(a,b){return b.n-a.n;});
};
U.qsa('[data-range]',els.range).forEach(function(b){
var on=b.dataset.range===Stats.range;
b.classList.toggle('is-on',on);
b.setAttribute('aria-checked',on?'true':'false');
});
els.only.hidden=S.events.length<2;
els.only.innerHTML='<button class="fchip'+(Stats.only?'':' is-on')+'" type="button" role="radio" aria-checked="'+
(Stats.only?'false':'true')+'" data-only="">All events</button>'+
S.events.map(function(e){
var on=Stats.only===e.id;
return'<button class="fchip'+(on?' is-on':'')+'" type="button" role="radio" aria-checked="'+on+
'" data-only="'+U.esc(e.id)+'"><i style="background:'+U.esc(tone(e))+'"></i><span>'+U.esc(e.name)+'</span></button>';
}).join('');
var st=S.streaks(totals);
var perDay=cur.n/P.days,prevPerDay=prev.n/P.days;
els.hero.innerHTML=[
tile('lead',cur.n,U.plural(cur.n,'tap')+' · '+meta.title,delta(cur.n,prev.n),0),
tile('',fmtRate(perDay),'per day',delta(perDay,prevPerDay,true),1),
tile('',cur.active,'active '+U.plural(cur.active,'day')+' of '+P.days,delta(cur.active,prev.active,true),2),
tile('',st.current,'day streak · best '+st.longest,'',3)
].join('');
var single=events.length===1?events[0]:null;
var unitWord={day:'day',week:'week',month:'month'}[P.buckets[0].kind];
els.trendTitle.textContent='Taps per '+unitWord;
els.trendSub.textContent=cur.n+' '+U.plural(cur.n,'tap')+' · '+meta.title;
Charts.column(els.trend,{
label:'Taps per '+unitWord+', '+meta.title+(single?', '+single.name:'')+': '+cur.n+' in total.',
colLabel:unitWord[0].toUpperCase()+unitWord.slice(1),
unit:['tap','taps'],
average:true,
color:single?tone(single):null,
empty:'No taps in the '+meta.title,
columns:P.buckets.map(function(b){
var s=sumDays(b.from,b.to);
return{title:b.title,tick:b.tick,value:s.n,today:b.today,rows:single?[]:rowsFor(s.per)};
}),
onSelect:function(i){Stats.open(P.buckets[i]);}
});
var wd=[0,0,0,0,0,0,0],hr=new Array(24).fill(0);
var t0=D.stripTime(P.start),t1=D.stripTime(P.end)+U.MS_DAY;
events.forEach(function(e){
e.log.forEach(function(ts){
if(ts<t0||ts>=t1)return;
var dt=new Date(ts);
wd[(dt.getDay()+6)%7]++;
hr[dt.getHours()]++;
});
});
var wdPeak=peakIndex(wd),hrPeak=peakIndex(hr);
els.weekdaySub.textContent=wdPeak<0?meta.title:'busiest: '+D.WEEKDAYS_LONG[(wdPeak+1)%7];
Charts.column(els.weekday,{
label:'Taps by weekday, '+meta.title+(wdPeak<0?'':'; most on '+D.WEEKDAYS_LONG[(wdPeak+1)%7])+'.',
colLabel:'Weekday',
unit:['tap','taps'],
emphasis:'peak',
height:168,
empty:'No taps in the '+meta.title,
columns:wd.map(function(n,i){
return{title:D.WEEKDAYS_LONG[(i+1)%7],tick:D.WEEKDAYS[(i+1)%7],value:n,note:share(n,cur.n)};
})
});
els.hourSub.textContent=hrPeak<0?'local time':'busiest: '+U.pad2(hrPeak)+':00';
Charts.column(els.hour,{
label:'Taps by hour of day, '+meta.title+(hrPeak<0?'':'; most between '+U.pad2(hrPeak)+':00 and '+U.pad2(hrPeak)+':59')+'.',
colLabel:'Hour',
unit:['tap','taps'],
emphasis:'peak',
height:168,
empty:'No taps in the '+meta.title,
columns:hr.map(function(n,i){
return{title:U.pad2(i)+':00–'+U.pad2(i)+':59',tick:i%6===0?U.pad2(i):'',value:n,note:share(n,cur.n)};
})
});
var rows=events.map(function(e){
var n=cur.per[e.id]||0;
var sd=D.parseISO(e.start);
var from=sd&&sd>P.start?sd:P.start;
var span=Math.max(1,D.diffDays(from,P.end)+1);
var act=0;
for(var d=P.start;d<=P.end;d=D.addDays(d,1)){
var o=byDay[D.toISO(d)];
if(o&&o.per[e.id])act++;
}
return{event:e,count:n,share:cur.n?n/cur.n:0,rate:n/span,activeDays:act,last:S.last(e)};
}).sort(function(a,b){return b.count-a.count||a.event.name.localeCompare(b.event.name,'en');});
els.eventSub.textContent=meta.title;
if(!rows.length){
els.events.innerHTML='<tbody><tr><td class="table-empty" colspan="6">No events yet.</td></tr></tbody>';
}else{
els.events.innerHTML=
'<thead><tr><th scope="col">Event</th><th scope="col">Taps</th><th scope="col">Share</th><th scope="col">Per day</th>'+
'<th scope="col">Active days</th><th scope="col">Last tap</th></tr></thead>'+
'<tbody>'+rows.map(function(r){
var pct=Math.round(r.share*100);
var color=tone(r.event);
return'<tr>'+
'<td class="c-name"><span class="name-cell" style="--c:'+U.esc(color)+'">'+
'<i class="dot"></i><span title="'+U.esc(r.event.name)+'">'+U.esc(r.event.name)+'</span></span></td>'+
'<td class="c-taps">'+r.count+'</td>'+
'<td class="c-share"><span class="share-cell"><span class="meter" style="--c:'+U.esc(color)+'">'+
'<i style="--w:'+pct+'%"></i></span><span>'+pct+'%</span></span></td>'+
'<td class="c-rate" data-label="Per day">'+fmtRate(r.rate)+'</td>'+
'<td class="c-days" data-label="Active days">'+r.activeDays+'</td>'+
'<td class="c-last" data-label="Last tap">'+(r.last?U.esc(D.fmtRelative(r.last)):'—')+'</td>'+
'</tr>';
}).join('')+'</tbody>';
}
var first=events.reduce(function(acc,e){
var f=S.first(e);
return f===null?acc:(acc===null||f<acc?f:acc);
},null);
var perActive=st.activeDays?Object.keys(totals).reduce(function(a,k){return a+totals[k];},0)/st.activeDays:0;
els.streak.innerHTML=
'<div class="streak-row">'+
sr(st.current,'current',st.current>0?'hot':'')+
sr(st.longest,'longest')+
sr(st.activeDays,'active days')+
'</div>'+
'<p class="streak-note">'+
(st.longestEnd
?'Longest run ended '+U.esc(D.fmtDay(st.longestEnd))+
(st.current?' · currently on a '+st.current+'-day run':' · no run active right now')
:'Tap something to start a streak.')+
' · average '+perActive.toFixed(1)+' taps on an active day'+
(first?' · first tap '+U.esc(D.fmtDay(D.dayKey(first))):'')+'.'+
'</p>';
var heat=Stats.heat(totals);
els.heatSub.textContent=heat.active+' active '+U.plural(heat.active,'day');
els.heatScroll.style.setProperty('--weeks',heat.weeks);
els.heatMonths.innerHTML=heat.months;
els.heat.innerHTML=heat.cells;
Stats.revealHeat();
V.views.stale.stats=false;
},
open:function(b){
var d=b.from;
var iso=D.toISO(d);
if(b.kind==='month'){
var sel=D.parseISO(V.views.cal.sel);
iso=sel&&sel.getFullYear()===d.getFullYear()&&sel.getMonth()===d.getMonth()?V.views.cal.sel:iso;
}
V.views.cal.y=d.getFullYear();
V.views.cal.m=d.getMonth();
V.views.cal.sel=iso;
V.views.scrollMem.calendar=0;
V.views.toggleTab('calendar');
},
dayRows:function(iso){
var o=(Stats._byDay||{})[iso];
if(!o)return[];
return Stats.events().map(function(e){return{name:e.name,color:V.ui.tone(e.color).c,n:o.per[e.id]||0};})
.sort(function(a,b){return b.n-a.n;});
},
bindCells:function(grid,rowsFor){
var shown=null;
function show(cell){
var iso=cell.dataset.date;
var n=Number(cell.dataset.n||0);
var r=cell.getBoundingClientRect();
shown=cell;
Charts.clear();
Charts.showTip({x:r.left+r.width/2,y:r.top},{
head:D.fmtDayLong(iso),value:n,unit:['tap','taps'],rows:n?rowsFor(iso):[],
hint:'Click to open in the calendar'
});
}
grid.addEventListener('pointerover',function(ev){
if(ev.pointerType!=='mouse')return;
var cell=ev.target.closest('.hc[data-date]');
if(cell)show(cell);
});
grid.addEventListener('pointerleave',function(ev){
if(ev.pointerType!=='mouse')return;
shown=null;
Charts.clear();
});
grid.addEventListener('pointerdown',function(ev){
if(ev.pointerType==='mouse')return;
var cell=ev.target.closest('.hc[data-date]');
if(!cell)return;
if(shown===cell)return;
ev.preventDefault();
show(cell);
grid._armed=cell;
});
grid.addEventListener('click',function(ev){
var cell=ev.target.closest('.hc[data-date]');
if(!cell)return;
if(grid._armed===cell&&ev.pointerType&&ev.pointerType!=='mouse'){
grid._armed=null;
ev.stopImmediatePropagation();
return;
}
shown=null;
Charts.clear();
},true);
},
heat:function(totals){
var level=V.views.levelOf;
var levels=V.views.levels(totals);
var today=D.today();
var todayISO=D.toISO(today);
var monday=D.addDays(today,-((today.getDay()+6)%7));
var start=D.addDays(monday,-7*52);
var weeks=53;
var cells=[],months=[],active=0,lastLabelCol=-9;
for(var i=0;i<weeks*7;i++){
var day=D.addDays(start,i);
var iso=D.toISO(day);
if(day>today){cells.push('<i class="hc blank"></i>');continue;}
var n=totals[iso]||0;
if(n)active++;
cells.push('<i class="hc'+(n?' v'+level(n,levels):'')+(iso===todayISO?' today':'')+
'" data-date="'+iso+'" data-n="'+n+'" aria-label="'+U.esc(D.fmtDay(iso))+', '+n+' '+U.plural(n,'tap')+'"></i>');
if(day.getDate()===1){
var col=Math.floor(i/7)+1;
if(col-lastLabelCol>=3){
months.push('<span style="grid-column:'+col+' / span 3">'+D.MONTHS[day.getMonth()]+'</span>');
lastLabelCol=col;
}
}
}
return{cells:cells.join(''),months:months.join(''),weeks:weeks,active:active};
},
revealHeat:function(){
var scroller=Stats._els.heatScroll;
requestAnimationFrame(function(){
scroller.scrollLeft=scroller.scrollWidth;
});
},
yearStripHTML:function(year,selISO){
var totals=S.dayTotals();
var level=V.views.levelOf;
var levels=V.views.levels(totals);
var todayISO=D.toISO(D.today());
var out=[];
for(var m=0;m<12;m++){
out.push('<span class="ym" title="'+D.MONTHS_LONG[m]+'">'+D.MONTHS[m][0]+'</span>');
var len=D.daysInMonth(year,m);
for(var d=1;d<=31;d++){
if(d>len){out.push('<i class="yx" aria-hidden="true"></i>');continue;}
var iso=D.toISO(new Date(year,m,d));
var n=totals[iso]||0;
var cls='hc'+(n?' v'+level(n,levels):'')+
(iso===todayISO?' today':'')+(iso===selISO?' sel':'');
out.push('<i class="'+cls+'" data-date="'+iso+'" data-n="'+n+'" aria-label="'+
U.esc(D.fmtDay(iso))+', '+n+' '+U.plural(n,'tap')+'"></i>');
}
}
return out.join('');
},
show:function(){
Stats.render();
}
};
function tile(cls,value,label,change,i){
return'<div class="sh'+(cls?' '+cls:'')+'" style="--i:'+i+'">'+
'<b>'+value+'</b><span>'+U.esc(label)+'</span>'+change+'</div>';
}
function delta(cur,prev,short){
var vs='vs '+RANGES[Stats.range].prev;
if(!prev&&!cur)return'';
var title=' title="'+vs+'"';
if(!prev){
return'<em class="delta up"'+title+'><svg class="ico" aria-hidden="true"><use href="#i-up"/></svg>'+
(short?'new':'new '+vs)+'</em>';
}
var pct=Math.round((cur-prev)/prev*100);
var dir=pct>0?'up':pct<0?'down':'flat';
var icon=dir==='flat'?'':'<svg class="ico" aria-hidden="true"><use href="#i-'+dir+'"/></svg>';
var label=(pct>0?'+':'')+pct+'%';
return'<em class="delta '+dir+'"'+title+' aria-label="'+label+' '+vs+'">'+icon+label+(short?'':' '+vs)+'</em>';
}
function fmtRate(r){
if(!r)return'0';
return r>=10?String(Math.round(r)):r>=1?r.toFixed(1):r.toFixed(2);
}
function share(n,total){
return total?Math.round(n/total*100)+'% of the taps in this range':'';
}
function peakIndex(list){
var best=-1;
list.forEach(function(v,i){if(v>0&&(best<0||v>list[best]))best=i;});
return best;
}
function sr(value,label,cls){
return'<div class="sr'+(cls?' '+cls:'')+'"><b>'+value+'</b><span>'+U.esc(label)+'</span></div>';
}
})(window.V);
