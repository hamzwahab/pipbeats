var CFG={SPIKE:2.0,LOOK:12,CSPIKE:0.8,STARS:[1.0,1.5,2.0],MINBARS:50};
var CUR=["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"];
var PAIRS="EURUSD GBPUSD AUDUSD NZDUSD USDJPY USDCHF USDCAD EURGBP EURJPY EURCHF EURAUD EURNZD EURCAD GBPJPY GBPCHF GBPAUD GBPNZD GBPCAD AUDJPY AUDCHF AUDNZD AUDCAD NZDJPY NZDCHF NZDCAD CADJPY CADCHF CHFJPY".split(" ");
var EXTRA={XAUUSD:"GC=F"};
var TFS={M5:{i:"5m",r:"7d",m:5},M15:{i:"15m",r:"30d",m:15},M30:{i:"30m",r:"30d",m:30},H1:{i:"60m",r:"60d",m:60}};

function parseYahoo(j){
  var r=j.chart.result[0],q=r.indicators.quote[0],out=[];
  (r.timestamp||[]).forEach(function(t,k){
    if(q.open[k]!=null&&q.high[k]!=null&&q.low[k]!=null&&q.close[k]!=null)
      out.push({t:t,o:q.open[k],h:q.high[k],l:q.low[k],c:q.close[k]});
  });
  return out;
}
function hourOf(t){return new Date(t*1000).getUTCHours()}
function baselines(bars){
  var sum={},cnt={},tot=0;
  bars.forEach(function(b){var a=Math.abs(Math.log(b.c/b.o)),h=hourOf(b.t);sum[h]=(sum[h]||0)+a;cnt[h]=(cnt[h]||0)+1;tot+=a});
  var all=(tot/bars.length)||1e-9,out={};
  for(var h=0;h<24;h++)out[h]=(cnt[h]>=5&&sum[h]>0)?sum[h]/cnt[h]:all;
  return out;
}
function normMoves(bars){
  var bl=baselines(bars),m={};
  bars.forEach(function(b){m[b.t]=Math.log(b.c/b.o)/(bl[hourOf(b.t)]||1e-9)});
  return m;
}
function spikeOf(bars,m,nowSec){
  var best=null;
  for(var i=Math.max(0,bars.length-CFG.LOOK);i<bars.length;i++){
    var z=m[bars[i].t];if(Math.abs(z)>=CFG.SPIKE)best={t:bars[i].t,z:z};
  }
  if(!best)return null;
  return{age:Math.max(1,Math.floor((nowSec-best.t)/60)),dir:best.z>=0?"bull":"bear",ratio:Math.round(Math.abs(best.z)*100)/100};
}
function buildResult(tf,series,nowSec,source){
  var last=0,pairs=[],zs={};
  Object.keys(series).forEach(function(p){
    var bars=series[p];if(!bars||bars.length<CFG.MINBARS)return;
    last=Math.max(last,bars[bars.length-1].t);
    var m=normMoves(bars);zs[p]=m;
    var r=spikeOf(bars,m,nowSec);if(r){r.pair=p;pairs.push(r)}
  });
  pairs.sort(function(a,b){return a.age-b.age});
  var ref=series.EURUSD&&series.EURUSD.length?series.EURUSD:null,out=[];
  if(ref){
    var tl=ref.slice(-CFG.LOOK).map(function(b){return b.t});
    CUR.forEach(function(c){
      var best=null;
      tl.forEach(function(t){
        var per=[];
        PAIRS.forEach(function(p){
          if(!zs[p]||zs[p][t]===undefined)return;
          var sg=p.slice(0,3)===c?1:p.slice(3)===c?-1:0;
          if(sg)per.push({p:p,v:sg*zs[p][t]});
        });
        if(per.length<4)return;
        var cs=per.reduce(function(a,x){return a+x.v},0)/per.length;
        if(Math.abs(cs)>=CFG.CSPIKE)best={t:t,cs:cs,per:per};
      });
      if(!best)return;
      var a=Math.abs(best.cs);
      best.per.sort(function(x,y){return Math.abs(y.v)-Math.abs(x.v)});
      out.push({cur:c,age:Math.max(1,Math.floor((nowSec-best.t)/60)),dir:best.cs>=0?"bull":"bear",
        stars:a>=CFG.STARS[2]?3:a>=CFG.STARS[1]?2:a>=CFG.STARS[0]?1:0,
        pairs:best.per.slice(0,3).map(function(x){return x.p})});
    });
    out.sort(function(a,b){return a.age-b.age});
  }
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
    try{var b=await fetchOne(syms[p],tf);if(b.length>=CFG.MINBARS){series[p]=b;ok++}}catch(e){}
  }));
  var source="live";
  if(ok<10){source="demo";series={};PAIRS.concat(Object.keys(EXTRA)).forEach(function(p){series[p]=synthetic(TFS[tf].m)})}
  var v=buildResult(tf,series,Math.floor(Date.now()/1000),source);
  _cache[tf]={at:now,v:v};return v;
}
if(typeof module!=="undefined")module.exports={buildResult:buildResult,parseYahoo:parseYahoo,synthetic:synthetic,PAIRS:PAIRS,TFS:TFS};
