window.V=window.V||{};
(function(V){
'use strict';
var U=V.util,D=V.date;
var EPOCH_DAY=2458850;
var DAY_BIAS=30000;
var MINUTES_MAX=1439;
V.FONTS=[
{id:'system',label:'System',stack:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'},
{id:'humanist',label:'Humanist',stack:'Optima, Candara, "Gill Sans", "Segoe UI", "Trebuchet MS", sans-serif'},
{id:'serif',label:'Serif',stack:'Georgia, "Iowan Old Style", "Times New Roman", "Songti SC", serif'},
{id:'rounded',label:'Rounded',stack:'"SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Segoe UI", ui-rounded, system-ui, sans-serif'},
{id:'mono',label:'Mono',stack:'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace'}
];
V.ACCENTS=[
{id:'blue',label:'Blue',value:'#2f6bff'},
{id:'indigo',label:'Indigo',value:'#4f46e5'},
{id:'violet',label:'Violet',value:'#7c3aed'},
{id:'magenta',label:'Magenta',value:'#c026d3'},
{id:'rose',label:'Rose',value:'#e11d48'},
{id:'orange',label:'Orange',value:'#ea580c'},
{id:'green',label:'Green',value:'#0f9d58'},
{id:'teal',label:'Teal',value:'#0d9488'},
{id:'slate',label:'Slate',value:'#475569'},
{id:'ink',label:'Ink',value:'#111827'}
];
V.THEMES=['system','light','dark'];
V.BACKGROUNDS=[
{id:'none',label:'None'},
{id:'aurora',label:'Aurora'},
{id:'mist',label:'Mist'},
{id:'dusk',label:'Dusk'},
{id:'ocean',label:'Ocean'},
{id:'forest',label:'Forest'},
{id:'graphite',label:'Graphite'},
{id:'image',label:'Your image'}
];
V.DEFAULTS={accent:'blue',font:'system',custom:null,theme:'system',bg:'none'};
V.MIN_START='2020-01-01';
var Codec=V.codec={
MAX_URL:2000,
MAX_BAR:32000,
bytesToB64:function(bytes){
var bin='';
for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
},
b64ToBytes:function(str){
var s=String(str).replace(/-/g,'+').replace(/_/g,'/').replace(/\s/g,'');
while(s.length%4)s+='=';
var bin=atob(s);
var bytes=new Uint8Array(bin.length);
for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
return bytes;
},
encodeBytes:function(json){
return Codec.bytesToB64(new TextEncoder().encode(json));
},
decodeBytes:function(str){
return new TextDecoder().decode(Codec.b64ToBytes(str));
},
writeVarint:function(out,value){
var v=Math.max(0,Math.round(value)||0);
while(v>=128){
out.push((v&127)|128);
v=Math.floor(v/128);
}
out.push(v);
},
readVarint:function(bytes,pos){
var result=0,shift=0,b;
do{
if(pos.i>=bytes.length)throw new Error('truncated payload');
b=bytes[pos.i++];
result+=(b&127)*Math.pow(2,shift);
shift+=7;
}while(b&128);
return result;
},
hexToRgb:function(hex){
var m=/^#?([0-9a-f]{6})$/i.exec(String(hex||''));
if(!m)return null;
var n=parseInt(m[1],16);
return[(n>>16)&255,(n>>8)&255,n&255];
},
rgbToHex:function(rgb){
return'#'+rgb.map(function(v){
var s=Math.max(0,Math.min(255,Math.round(v))).toString(16);
return s.length===1?'0'+s:s;
}).join('');
},
packBytes:function(state){
var out=[V.FORMAT];
var events=state.events||[];
Codec.writeVarint(out,events.length);
events.forEach(function(e){
var nameBytes=new TextEncoder().encode(String(e.name||'Untitled').slice(0,48));
Codec.writeVarint(out,nameBytes.length);
for(var i=0;i<nameBytes.length;i++)out.push(nameBytes[i]);
var ci=-1;
for(var c=0;c<V.COLORS.length;c++){
if(V.COLORS[c].toLowerCase()===String(e.color||'').toLowerCase()){ci=c;break;}
}
out.push(ci<0?0:ci);
var startDate=D.parseISO(e.start)||D.today();
var startDay=Math.max(0,D.toEpochDay(startDate)-EPOCH_DAY);
Codec.writeVarint(out,startDay);
var taps=(Array.isArray(e.log)?e.log:[])
.map(Number)
.filter(function(t){return isFinite(t)&&t>0;})
.sort(function(a,b){return a-b;});
Codec.writeVarint(out,taps.length);
taps.forEach(function(ts){
var d=new Date(ts);
var dayOff=D.toEpochDay(d)-(startDay+EPOCH_DAY);
var mins=Math.floor((ts-D.stripTime(d))/60000);
if(mins<0)mins=0;
if(mins>MINUTES_MAX)mins=MINUTES_MAX;
if(dayOff<-DAY_BIAS)dayOff=-DAY_BIAS;
if(dayOff>32767)dayOff=32767;
Codec.writeVarint(out,mins);
Codec.writeVarint(out,dayOff+DAY_BIAS);
});
});
var look=state.look||V.DEFAULTS;
var custom=look.custom?Codec.hexToRgb(look.custom):null;
var accentIdx=0;
for(var a=0;a<V.ACCENTS.length;a++)if(V.ACCENTS[a].id===look.accent)accentIdx=a;
var fontIdx=0;
for(var f=0;f<V.FONTS.length;f++)if(V.FONTS[f].id===look.font)fontIdx=f;
var themeIdx=Math.max(0,V.THEMES.indexOf(look.theme));
var bgIdx=0;
for(var g=0;g<V.BACKGROUNDS.length;g++)if(V.BACKGROUNDS[g].id===look.bg)bgIdx=g;
var nonDefault=accentIdx>0||fontIdx>0;
var flags=(nonDefault?1:0)|(custom?2:0)|(themeIdx?4:0)|(bgIdx?8:0);
out.push(flags);
if(nonDefault)out.push(((accentIdx&15)<<4)|(fontIdx&15));
if(custom)out.push(custom[0],custom[1],custom[2]);
if(themeIdx)out.push(themeIdx);
if(bgIdx)out.push(bgIdx);
return new Uint8Array(out);
},
unpackBytes:function(bytes){
if(!bytes||bytes.length<3)return null;
var pos={i:0};
var version=bytes[pos.i++];
if(version!==V.FORMAT)return null;
var count=Codec.readVarint(bytes,pos);
if(count>2000)return null;
var events=[];
for(var n=0;n<count;n++){
var nameLen=Codec.readVarint(bytes,pos);
if(nameLen>400||pos.i+nameLen>bytes.length)return null;
var name=new TextDecoder().decode(bytes.subarray(pos.i,pos.i+nameLen));
pos.i+=nameLen;
var colorIdx=bytes[pos.i++];
var startDay=Codec.readVarint(bytes,pos);
var tapCount=Codec.readVarint(bytes,pos);
if(tapCount>200000)return null;
var log=[];
for(var t=0;t<tapCount;t++){
var mins=Codec.readVarint(bytes,pos);
var dayOff=Codec.readVarint(bytes,pos)-DAY_BIAS;
var day=D.fromEpochDay(EPOCH_DAY+startDay+dayOff);
log.push(day.getTime()+mins*60000);
}
log.sort(function(a,b){return a-b;});
events.push({
id:U.uid(),
name:(name||'Untitled').slice(0,48),
color:V.COLORS[colorIdx]||V.COLORS[0],
start:D.toISO(D.fromEpochDay(EPOCH_DAY+startDay)),
log:log
});
}
var look={accent:V.DEFAULTS.accent,font:V.DEFAULTS.font,custom:null,theme:V.DEFAULTS.theme,bg:V.DEFAULTS.bg};
if(pos.i<bytes.length){
var flags=bytes[pos.i++];
if((flags&1)&&pos.i<bytes.length){
var packed=bytes[pos.i++];
look.accent=(V.ACCENTS[packed>>4]||V.ACCENTS[0]).id;
look.font=(V.FONTS[packed&15]||V.FONTS[0]).id;
}
if((flags&2)&&pos.i+3<=bytes.length){
look.custom=Codec.rgbToHex([bytes[pos.i],bytes[pos.i+1],bytes[pos.i+2]]);
pos.i+=3;
}
if((flags&4)&&pos.i<bytes.length){
look.theme=V.THEMES[bytes[pos.i++]]||V.DEFAULTS.theme;
}
if((flags&8)&&pos.i<bytes.length){
look.bg=(V.BACKGROUNDS[bytes[pos.i++]]||V.BACKGROUNDS[0]).id;
}
}
return{v:V.FORMAT,events:events,look:look};
},
encode:function(state){
return Codec.bytesToB64(Codec.packBytes(state));
},
payloadsIn:function(text){
var s=String(text||'').trim();
var out=[];
var re=/(?:^|[?&#])d=([A-Za-z0-9\-_]+)/g,m;
while((m=re.exec(s)))if(out.indexOf(m[1])<0)out.push(m[1]);
if(!out.length&&/^[A-Za-z0-9\-_]{4,}$/.test(s))out.push(s);
return out;
},
decode:function(str){
if(!str)return null;
var text=String(str).trim();
if(/^[\[{]/.test(text)){
var fromJson=Codec.decodeJSON(text);
if(fromJson)return fromJson;
}
var parts=[];
Codec.payloadsIn(text).forEach(function(p){
try{
var one=Codec.unpackBytes(Codec.b64ToBytes(p));
if(one)parts.push(one);
}catch(e){}
});
if(parts.length){
var first=parts[0];
for(var i=1;i<parts.length;i++)first.events=first.events.concat(parts[i].events);
return first;
}
return Codec.decodeJSON(text);
},
decodeJSON:function(text){
var parsed;
try{parsed=JSON.parse(text);}catch(e){return null;}
var list=Array.isArray(parsed)?parsed:(parsed&&Array.isArray(parsed.events)?parsed.events:null);
if(!list)return null;
var look=!Array.isArray(parsed)&&parsed.look?parsed.look:null;
var state;
try{state=Codec.unpackBytes(Codec.packBytes({events:list,look:look||V.DEFAULTS}));}catch(e){return null;}
if(!state)return null;
list.forEach(function(raw,i){
if(state.events[i]&&raw&&raw.id)state.events[i].id=String(raw.id);
});
state.hasLook=!!look;
return state;
},
baseUrl:function(){
return location.origin&&location.origin!=='null'
?location.origin+location.pathname
:location.href.split('#')[0].split('?')[0];
},
urlFor:function(state){
var payload;
try{payload=Codec.encode(state);}catch(e){return Codec.baseUrl();}
return Codec.baseUrl()+'#d='+payload;
},
payloadsFromQuery:function(){
var q=location.search||'';
if(!q)return[];
var out=[];
q.replace(/^\?/,'').split('&').forEach(function(pair){
if(!pair)return;
var eq=pair.indexOf('=');
var key=eq<0?pair:pair.slice(0,eq);
if(key!=='d')return;
var val=eq<0?'':pair.slice(eq+1);
try{out.push(decodeURIComponent(val));}catch(e){out.push(val);}
});
return out;
},
payloadFromHash:function(){
var h=(location.hash||'').replace(/^#/,'');
if(!h)return null;
var m=/(?:^|[?&])d=([A-Za-z0-9\-_]+)/.exec(h);
if(m)return m[1];
if(/^d=/.test(h))return h.slice(2);
return null;
},
accentValue:function(look){
if(look&&look.custom)return look.custom;
var id=(look&&look.accent)||V.DEFAULTS.accent;
for(var i=0;i<V.ACCENTS.length;i++)if(V.ACCENTS[i].id===id)return V.ACCENTS[i].value;
return V.ACCENTS[0].value;
},
accentTints:function(hex,dark){
var C=V.color;
var surface=dark?V.SURFACE.dark:V.SURFACE.light;
var value=C.rgb(hex)?C.hex(C.rgb(hex)):V.ACCENTS[0].value;
if(dark)value=C.readable(value,surface,3);
return{
value:value,
ink:C.onColor(value),
hover:C.mix(value,dark?'#ffffff':'#000000',0.12),
soft:C.mix(surface,value,dark?0.2:0.11),
text:C.readable(value,surface,4.5),
light:C.mix(value,'#ffffff',dark?0.18:0.3)
};
},
fontStack:function(id){
for(var i=0;i<V.FONTS.length;i++)if(V.FONTS[i].id===id)return V.FONTS[i].stack;
return V.FONTS[0].stack;
}
};
})(window.V);
