var CFG={SPIKE:1.5,ATR_N:14,LOOK:12,RECENT:4};
var CUR=["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"];
var PAIRS="EURUSD GBPUSD AUDUSD NZDUSD USDJPY USDCHF USDCAD EURGBP EURJPY EURCHF EURAUD EURNZD EURCAD GBPJPY GBPCHF GBPAUD GBPNZD GBPCAD AUDJPY AUDCHF AUDNZD AUDCAD NZDJPY NZDCHF NZDCAD CADJPY CADCHF CHFJPY".split(" ");
var EXTRA={XAUUSD:"GC=F"};
var TFS={M5:{i:"5m",r:"5d",m:5},M15:{i:"15m",r:"5d",m:15},M30:{i:"30m",r:"5d",m:30},H1:{i:"60m",r:"10d",m:60}};

function parseYahoo(j){
  var r=j.chart.result[0],q=r.indicators.quote[0],out=[];
  (r.timestamp||[]).forEach(function(t,k){
    if(q.open[k]!=null&&q.high[k]!=null&&q.low[k]!=null&&q.close[k]!=null)
      out.push({t:t,o:q.open[k],h:q.high[k],l:q.low[k],c:q.close[k]});
  });
  return out;
}
function analyzePair(bars,nowSec){
  var n=bars.length,N=CFG.ATR_N;
  if(n<N+2)return null;
  var best=null;
  for(var i=Math.max(N,n-CFG.LOOK);i<n;i++){
    var s=0;for(var k=i-N;k<i;k++)s+=bars[k].h-bars[k].l;
    var avg=s/N,rg=bars[i].h-bars[i].l;
    if(avg>0&&rg/avg>=CFG.SPIKE)best={i:i,ratio:rg/avg};
  }
  if(!best)return null;
  var b=bars[best.i];
  return{age:Math.max(1,Math.floor((nowSec-b.t)/60)),dir:b.c>=b.o?"bull":"bear",ratio:Math.round(best.ratio*100)/100};
}
function buildResult(tf,series,nowSec,source){
  var mins=TFS[tf].m,last=0,pairs=[];
  Object.keys(series).forEach(function(p){
    var bars=series[p];if(!bars||!bars.length)return;
    last=Math.max(last,bars[bars.length-1].t);
    var r=analyzePair(bars,nowSec);if(r){r.pair=p;pairs.push(r)}
  });
  pairs.sort(function(a,b){return a.age-b.age});
  var cur={};CUR.forEach(function(c){cur[c]={cur:c,net:0,age:1e9,n:0,pairs:[]}});
  pairs.forEach(function(r){
    if(PAIRS.indexOf(r.pair)<0)return;
    var sg=r.dir==="bull"?1:-1;
    [[r.pair.slice(0,3),sg],[r.pair.slice(3),-sg]].forEach(function(x){
      var e=cur[x[0]];e.net+=x[1];e.age=Math.min(e.age,r.age);e.pairs.push(r.pair);
      if(r.age<=CFG.RECENT*mins)e.n++;
    });
  });
  var out=[];
  CUR.forEach(function(c){
    var e=cur[c];if(!e.pairs.length)return;
    out.push({cur:c,age:e.age,dir:e.net>=0?"bull":"bear",stars:e.n>=6?3:e.n>=5?2:e.n>=3?1:0,pairs:e.pairs.slice(0,3)});
  });
  out.sort(function(a,b){return a.age-b.age});
  return{tf:tf,source:source,market_open:(nowSec-last)<3*3600,currencies:out,pairs:pairs};
}
function synthetic(mins){
  var n=200,now=Math.floor(Date.now()/1000),end=now-now%(mins*60),px=1,bars=[],vol=0.0004+Math.random()*0.0004;
  for(var i=0;i<n;i++){
    var o=px,st=(Math.random()-.5)*2*vol*(Math.random()<.04?4:1);px=o+st;
    var w=Math.random()*vol/2;
    bars.push({t:end-(n-1-i)*mins*60,o:o,h:Math.max(o,px)+w,l:Math.min(o,px)-w,c:px});
  }
  return bars;
}
async function fetchOne(sym,tf){
  var u="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(sym)+"?interval="+TFS[tf].i+"&range="+TFS[tf].r;
  var r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"}});
  if(!r.ok)throw new Error("http "+r.status);
  return parseYahoo(await r.json());
}
var _cache={};
async function getActivity(tf){
  var c=_cache[tf],now=Date.now();
  if(c&&now-c.at<55000)return c.v;
  var syms={};PAIRS.forEach(function(p){syms[p]=p+"=X"});Object.keys(EXTRA).forEach(function(k){syms[k]=EXTRA[k]});
  var series={},ok=0;
  await Promise.all(Object.keys(syms).map(async function(p){
    try{var b=await fetchOne(syms[p],tf);if(b.length>CFG.ATR_N+2){series[p]=b;ok++}}catch(e){}
  }));
  var source="live";
  if(ok<10){source="demo";series={};PAIRS.concat(Object.keys(EXTRA)).forEach(function(p){series[p]=synthetic(TFS[tf].m)})}
  var v=buildResult(tf,series,Math.floor(Date.now()/1000),source);
  _cache[tf]={at:now,v:v};return v;
}
if(typeof module!=="undefined")module.exports={buildResult:buildResult,analyzePair:analyzePair,parseYahoo:parseYahoo,synthetic:synthetic,PAIRS:PAIRS,TFS:TFS};
