'use strict';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const state={items:[],search:'',manualId:null,activeGroup:[],zoom:4,center:{lat:35.7,lng:105.3}};
let amap=null,satellite=null,roadNet=null,standardLayer=null,satelliteMode=true,roadNetVisible=true,mapReady=false;
const mapCoord=i=>validGPS(i)?[i.lng,i.lat]:null;
function screenPoint(lat,lng){if(!amap)return {x:-9999,y:-9999};const p=amap.lngLatToContainer([lng,lat]);return {x:p.x,y:p.y};}
function setZoom(z){if(amap)amap.setZoom(clamp(z,2,19));}
function renderMap(){renderMarkers();}
function mapMessage(message){$('mapErr').textContent=message;$('mapErr').classList.remove('hide');}
async function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(Error('地图脚本加载失败，请检查网络'));document.head.appendChild(s);});}
async function initializeAMap(){
 const response=await fetch("https://amap-photo-gallery-map-proxy.tart-sage-5381.chatgpt.site/amap-config.json");if(!response.ok)throw Error('在线底图尚未配置；可继续浏览照片。');
 const config=await response.json();if(!config.key||!config.serviceHost)throw Error('在线底图尚未配置；可继续浏览照片。');window._AMapSecurityConfig={serviceHost:config.serviceHost};
 await Promise.race([loadScript('https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(config.key)),sleep(20000).then(()=>{throw Error('高德加载超时，请检查网络后刷新');})]);
 if(!window.AMap)throw Error('高德接口未能初始化');
 satellite=new AMap.TileLayer.Satellite();roadNet=new AMap.TileLayer.RoadNet();standardLayer=new AMap.TileLayer();
 amap=new AMap.Map('amap',{viewMode:'2D',zoom:4,center:[105.3,35.7],layers:[satellite,roadNet],resizeEnable:true,animateEnable:false,zoomEnable:true,dragEnable:true});
 const sync=()=>{const c=amap.getCenter();state.center={lat:c.lat,lng:c.lng};state.zoom=amap.getZoom();renderMarkers();};
 amap.on('mapmove',sync);amap.on('zoomchange',sync);amap.on('resize',sync);
 amap.on('complete',()=>{mapReady=true;document.body.dataset.mapReady='true';if(!state.coordinateError)$('mapErr').classList.add('hide');sync();});
 function applyMapLayers(){amap.setLayers(satelliteMode?(roadNetVisible?[satellite,roadNet]:[satellite]):[standardLayer]);if(satelliteMode&&roadNetVisible)roadNet.show();else roadNet.hide();amap.setFeatures(satelliteMode&&!roadNetVisible?[]:['bg','point','road','building']);$('modeBtn').textContent=satelliteMode?'标准图':'卫星图';$('roadBtn').classList.toggle('hide',!satelliteMode);$('roadBtn').textContent=roadNetVisible?'路网开':'路网关';$('roadBtn').setAttribute('aria-pressed',String(roadNetVisible));}
 $('modeBtn').onclick=()=>{satelliteMode=!satelliteMode;applyMapLayers();};
 $('roadBtn').onclick=()=>{roadNetVisible=!roadNetVisible;applyMapLayers();};
}
function renderMarkers(){let layer=$('markers');layer.textContent='';let points=[];const w=$('map').clientWidth,h=$('map').clientHeight;for(let item of state.items){if(!validGPS(item))continue;if(state.search&&!matchItem(item,state.search))continue;const coords=mapCoord(item);if(!coords)continue;const p=screenPoint(coords[1],coords[0]);if(p.x< -65||p.y< -65||p.x>w+65||p.y>h+65)continue;points.push({item,p});}points.sort((a,b)=>a.p.x-b.p.x);let groups=[];for(let pt of points){let found=groups.find(g=>Math.abs(g.x-pt.p.x)<54&&Math.abs(g.y-pt.p.y)<54);if(found){found.items.push(pt.item);found.x=(found.x*(found.items.length-1)+pt.p.x)/found.items.length;found.y=(found.y*(found.items.length-1)+pt.p.y)/found.items.length;}else{groups.push({x:pt.p.x,y:pt.p.y,items:[pt.item]});}}let frag=document.createDocumentFragment();for(let g of groups){let b=document.createElement('button');b.className='mark'+(g.items[0].thumb?'':' noimage');b.style.left=g.x+'px';b.style.top=g.y+'px';b.setAttribute('aria-label','查看此处 '+g.items.length+' 张照片');let src=g.items[0].thumb;if(src){let img=document.createElement('img');img.src=src;img.alt='';b.appendChild(img);}else b.textContent='▧';if(g.items.length>1){let count=document.createElement('span');count.className='count';count.textContent=g.items.length;b.appendChild(count);}b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',e=>{e.stopPropagation();if(state.manualId)return;openGroup(g.items)});frag.appendChild(b);}layer.appendChild(frag);}
function validGPS(i){return Number.isFinite(i.lat)&&Number.isFinite(i.lng)&&Math.abs(i.lat)<=90&&Math.abs(i.lng)<=180&&!(i.lat===0&&i.lng===0);}
async function fitAll(){
 if(!amap)return;
 try{const items=state.items.filter(i=>mapCoord(i));if(!items.length){renderMap();return;}
  const positions=items.map(mapCoord);if(positions.length===1){amap.setZoomAndCenter(16,positions[0]);return;}
  const xs=positions.map(p=>p[0]),ys=positions.map(p=>p[1]);const lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
  if(Math.abs(lo[0]-hi[0])+Math.abs(lo[1]-hi[1])<0.0001)amap.setZoomAndCenter(16,lo);
  else amap.setBounds(new AMap.Bounds(lo,hi),true,[150,80,140,80],18);
  renderMarkers();
 }catch(e){state.coordinateError=e.message;mapMessage('GPS 已保留，坐标转换未完成：'+e.message+'。可稍后点击「查看全部位置」重试。');}
}
window.addEventListener('resize',renderMap);
function openSheet(title,subtitle,markup,after){closePhotoBand(false);$('sheetTitle').textContent=title;$('sheetSub').textContent=subtitle||'';$('sheetBody').innerHTML=markup;$('shade').classList.remove('hide');$('sheet').classList.remove('hide');if(after)after();}
function closeSheet(){$('shade').classList.add('hide');$('sheet').classList.add('hide');$('sheetBody').textContent='';}
$('shade').onclick=closeSheet;$('closeSheet').onclick=closeSheet;
function toast(message,ms=2600){let el=$('toast');el.textContent=message;el.classList.remove('hide');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hide'),ms);}
function busy(yes,message){$('loading').classList.toggle('hide',!yes);$('loadingText').textContent=message||'正在处理…';}
function updateStats(){let total=state.items.length,geo=state.items.filter(validGPS).length;$('badgeN').textContent=total;$('statText').textContent=`分享照片 ${total} 张 · 已定位 ${geo} 张`;$('empty').classList.toggle('hide',total>0);}
function matchItem(i,q){let s=(i.name+' '+i.date+' '+(i.note||'')).toLowerCase();return s.includes(q.toLowerCase());}
function showLibrary(filter='all'){let items=state.items.filter(i=>filter==='all'||(filter==='gps'?validGPS(i):!validGPS(i)));if(state.search)items=items.filter(i=>matchItem(i,state.search));return items.map(i=>`<button class="photo ${i.thumb?'':'placeholder'}" data-id="${esc(i.id)}" title="${esc(i.name)}">${i.thumb?`<img loading="lazy" src="${i.thumb}"/>`:'▧'}${validGPS(i)?'':'<span class="nogps">未定位</span>'}<span class="date">${esc(i.date?.slice(0,10)||'')}　${esc(i.name)}</span></button>`).join('');}
function librarySheet(filter='all'){let n=state.items.length,g=state.items.filter(validGPS).length,u=n-g;openSheet('照片图库',`${n} 张照片 · ${g} 张已定位 · ${u} 张待定位`,`<div class="row" style="margin-bottom:12px"><button class="pill" data-filter="all">全部 ${n}</button><button class="pill" data-filter="gps">已定位 ${g}</button><button class="pill" data-filter="nogps">未定位 ${u}</button></div><div class="photos" id="photosGrid">${showLibrary(filter)}</div>${n?'':'<p class="muted">暂无照片。</p>'}`,()=>{for(let b of $('sheetBody').querySelectorAll('[data-filter]'))b.onclick=()=>librarySheet(b.dataset.filter);for(let b of $('photosGrid').querySelectorAll('[data-id]'))b.onclick=()=>detailSheet(b.dataset.id,filter);});}
$('libraryBtn').onclick=()=>librarySheet();
function findItem(id){return state.items.find(i=>i.id===id);}

function detailSheet(id){const item=findItem(id);if(item)viewItem(item);}
const photoView={scale:1,x:0,y:0,baseWidth:0,baseHeight:0,drag:null,returnFocus:null,item:null,savedNote:'',saving:null};
let bandReturnFocus=null;
function fillBandCaption(caption,item){
 caption.textContent='';
 const file=document.createElement('span');file.className='band-file';file.textContent=`${item.name} · ${item.date||'日期未知'}`;
 const note=document.createElement('span');note.className='band-note';note.textContent=item.note||'';note.title=item.note||'';
 caption.append(file,note);
}
function noteStatus(message,error=false){$('viewerNoteStatus').textContent=message;$('viewerNoteStatus').dataset.error=String(error);}
function closePhotoBand(restoreFocus=true){
 const wasOpen=!$('photoBand').classList.contains('hide');
 $('photoBand').classList.add('hide');$('photoBandShade').classList.add('hide');$('photoBand').inert=false;
 if(wasOpen&&restoreFocus&&bandReturnFocus?.isConnected)bandReturnFocus.focus({preventScroll:true});
}
function openGroup(items){
 closeSheet();state.activeGroup=items;bandReturnFocus=document.activeElement;
 $('photoBandTitle').textContent=items.length===1?'此处的照片':`此处 ${items.length} 张照片`;
 $('photoBandHint').textContent='滚动鼠标滚轮横向浏览 · 点击照片放大 · 点击框外返回地图';
 const rail=$('photoBandRail');rail.textContent='';
 for(const [index,item] of items.entries()){
  const button=document.createElement('button');button.className='band-card';button.dataset.photoId=item.id;
  button.setAttribute('aria-label',`放大照片 ${index+1}：${item.name}`);
  const src=item.large||item.thumb;
  if(src){const img=document.createElement('img');img.alt=item.name;img.draggable=false;img.loading='lazy';
   img.onload=()=>{if(img.naturalWidth&&img.naturalHeight)button.style.aspectRatio=`${img.naturalWidth} / ${img.naturalHeight}`;};
   img.src=src;button.appendChild(img);
  }else{const missing=document.createElement('span');missing.className='band-placeholder';missing.textContent='暂无照片预览';button.appendChild(missing);}
  const number=document.createElement('span');number.className='band-number';number.textContent=`${index+1} / ${items.length}`;button.appendChild(number);
  const caption=document.createElement('span');caption.className='band-caption';fillBandCaption(caption,item);button.appendChild(caption);
  button.onclick=()=>viewItem(item);rail.appendChild(button);
 }
 $('photoBandShade').classList.remove('hide');$('photoBand').classList.remove('hide');rail.scrollLeft=0;$('photoBand').focus({preventScroll:true});
}
$('closePhotoBand').onclick=()=>closePhotoBand();$('photoBandShade').onclick=()=>closePhotoBand();
$('photoBand').addEventListener('wheel',event=>{
 event.preventDefault();event.stopPropagation();const rail=$('photoBandRail');
 const unit=event.deltaMode===1?16:event.deltaMode===2?rail.clientWidth:1;
 const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
 rail.scrollLeft+=delta*unit;
},{passive:false});
function updatePhotoTransform(){
 const stage=$('viewerStage'),maxX=Math.max(0,(photoView.baseWidth*photoView.scale-stage.clientWidth)/2),maxY=Math.max(0,(photoView.baseHeight*photoView.scale-stage.clientHeight)/2);
 photoView.x=clamp(photoView.x,-maxX,maxX);photoView.y=clamp(photoView.y,-maxY,maxY);
 $('viewerImg').style.transform=`translate(-50%,-50%) translate(${photoView.x}px,${photoView.y}px) scale(${photoView.scale})`;
 $('viewerZoom').textContent=Math.round(photoView.scale*100)+'%';
 stage.style.cursor=photoView.drag?'grabbing':photoView.scale>1?'grab':'default';
}
function fitPhoto(){
 const img=$('viewerImg'),stage=$('viewerStage');if(!img.naturalWidth||!stage.clientWidth)return;
 const fit=Math.min((stage.clientWidth-24)/img.naturalWidth,(stage.clientHeight-24)/img.naturalHeight);
 photoView.baseWidth=img.naturalWidth*fit;photoView.baseHeight=img.naturalHeight*fit;
 img.style.width=photoView.baseWidth+'px';img.style.height=photoView.baseHeight+'px';
 photoView.scale=1;photoView.x=0;photoView.y=0;photoView.drag=null;updatePhotoTransform();
}
function zoomPhoto(scale,clientX,clientY){
 const stage=$('viewerStage'),rect=stage.getBoundingClientRect(),next=clamp(scale,.25,8);
 const x=clientX==null?0:clientX-rect.left-rect.width/2,y=clientY==null?0:clientY-rect.top-rect.height/2;
 const ratio=next/photoView.scale;photoView.x=x-(x-photoView.x)*ratio;photoView.y=y-(y-photoView.y)*ratio;photoView.scale=next;updatePhotoTransform();
}
function updateAmapLink(item) {
  const link = $('viewerAmap');
  link.hidden = !validGPS(item);
  if (link.hidden) {
    link.removeAttribute('href');
    return;
  }
  const url = new URL('https://uri.amap.com/marker');
  url.search = new URLSearchParams({
    position: `${item.lng},${item.lat}`,
    name: item.name,
    coordinate: 'gaode',
    callnative: '0',
    src: 'photo-gallery'
  });
  link.href = url.href;
}

function viewItem(item){
 updateAmapLink(item);
 const source=item.large||item.thumb;if(!source)return toast('这张照片暂时无法预览');
 photoView.item=item;photoView.savedNote=item.note||'';$('viewerNote').value=photoView.savedNote;noteStatus('');
 photoView.returnFocus=document.activeElement;photoView.scale=1;photoView.x=0;photoView.y=0;photoView.drag=null;
 const img=$('viewerImg');img.style.opacity='0';img.onload=()=>{if($('viewer').classList.contains('hide'))return;fitPhoto();img.style.opacity='1';};
 $('viewerTitle').textContent=`${item.name} · ${item.date||'日期未知'}`;img.alt=item.name;
 $('viewer').classList.remove('hide');$('photoBand').inert=true;$('sheet').inert=true;img.src=source;
 if(img.complete&&img.naturalWidth){fitPhoto();img.style.opacity='1';}
 $('viewerFrame').focus({preventScroll:true});
}
function closePhotoViewer(){
 if($('viewer').classList.contains('hide'))return;
 $('viewer').classList.add('hide');$('photoBand').inert=false;$('sheet').inert=false;photoView.drag=null;
 if(photoView.returnFocus?.isConnected)photoView.returnFocus.focus({preventScroll:true});
}
$('closeViewer').onclick=closePhotoViewer;
$('viewer').addEventListener('click',event=>{if(event.target===$('viewer'))closePhotoViewer();});
$('viewer').addEventListener('wheel',event=>{
 if($('viewerNoteBar').contains(event.target)){event.stopPropagation();return;}
 event.preventDefault();event.stopPropagation();if(!$('viewerFrame').contains(event.target))return;
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?500:1);
 zoomPhoto(photoView.scale*Math.exp(-delta*.0016),event.clientX,event.clientY);
},{passive:false});
$('viewerZoomIn').onclick=()=>zoomPhoto(photoView.scale*1.25);
$('viewerZoomOut').onclick=()=>zoomPhoto(photoView.scale/1.25);
$('viewerFit').onclick=fitPhoto;
$('viewerStage').addEventListener('dblclick',event=>{if(!$('viewerNoteBar').contains(event.target))zoomPhoto(photoView.scale>1?1:2,event.clientX,event.clientY);});
$('viewerStage').addEventListener('pointerdown',event=>{
 if(event.button!==0||$('viewerNoteBar').contains(event.target))return;event.preventDefault();const stage=$('viewerStage');
 photoView.drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:photoView.x,y:photoView.y};stage.setPointerCapture(event.pointerId);updatePhotoTransform();
});
$('viewerStage').addEventListener('pointermove',event=>{
 const drag=photoView.drag;if(!drag||drag.id!==event.pointerId)return;
 photoView.x=drag.x+event.clientX-drag.startX;photoView.y=drag.y+event.clientY-drag.startY;updatePhotoTransform();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('viewerStage').addEventListener(type,()=>{photoView.drag=null;updatePhotoTransform();});
window.addEventListener('resize',()=>{if(!$('viewer').classList.contains('hide'))fitPhoto();});
document.addEventListener('keydown',event=>{
 const viewerOpen=!$('viewer').classList.contains('hide'),bandOpen=!$('photoBand').classList.contains('hide');
 if(event.key==='Escape'){if(viewerOpen)closePhotoViewer();else if(bandOpen)closePhotoBand();else if(!$('sheet').classList.contains('hide'))closeSheet();else return;event.preventDefault();event.stopPropagation();}
 if(event.key==='Tab'&&(viewerOpen||bandOpen)){
  const modal=viewerOpen?$('viewerFrame'):$('photoBand');const focusable=[...modal.querySelectorAll('button:not([hidden]),input,textarea,[tabindex="0"]')].filter(el=>!el.disabled);
  const first=focusable[0],last=focusable[focusable.length-1];if(!first)return;
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal)){last.focus();event.preventDefault();}
  else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===modal)){first.focus();event.preventDefault();}
 }
});


document.getElementById('viewerNoteBar').addEventListener('submit',e=>e.preventDefault());
$('fitBtn').onclick=fitAll;$('zin').onclick=()=>setZoom(state.zoom+1);$('zout').onclick=()=>setZoom(state.zoom-1);
$('searchBtn').onclick=()=>{openSheet('搜索照片','按文件名、日期、照片备注 / 关键词检索',`<input id="searchInput" class="simpleInput" placeholder="如：2026、咖啡厅、海河" value="${esc(state.search)}"/><div class="row" style="margin-top:12px"><button class="btn primary" id="doSearch">搜索</button><button class="btn" id="clearSearch">清除筛选</button></div><p class="muted">搜索会同时筛选地图和照片图库。</p>`,()=>{$('doSearch').onclick=()=>{state.search=$('searchInput').value.trim();closeSheet();renderMarkers();toast(state.search?'已筛选匹配的地图照片':'已显示全部照片');};$('clearSearch').onclick=()=>{state.search='';closeSheet();renderMarkers();toast('已清除筛选');};});};

async function init(){
 try{
  const response=await fetch('./gallery.json');if(!response.ok)throw Error('无法读取照片清单');
  state.items=await response.json();updateStats();
 }catch(e){mapMessage(e.message);return;}
 try{await initializeAMap();if(state.items.some(validGPS))await fitAll();}
 catch(e){mapMessage(e.message);$('controls').classList.add('hide');librarySheet();}
}
init();
