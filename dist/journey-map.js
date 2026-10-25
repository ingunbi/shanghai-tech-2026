(() => {
  'use strict';
  const config = window.TRIP_DATA?.journeyMap || {};
  const section = document.getElementById('journey-map');
  if (!section) return;
  const $ = id => document.getElementById(id);
  const list = value => Array.isArray(value) ? value : [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const colors = ['#b54b39','#286b70','#496d9c','#b57a36','#775d8b','#656f72'];
  const days = list(config.days).map((day,i) => ({...day,color:/^#[a-f\d]{6}$/i.test(day.color || '') ? day.color : colors[i % colors.length]}));
  const allPlaces = list(config.places).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) < 85 && Math.abs(place.lng) <= 180);
  const places = allPlaces.filter(place => !place.candidate);
  const byId = new Map(allPlaces.map(place => [place.id,place]));
  const hotel = places.find(place => place.kind === 'hotel');
  const kindLabel = {hotel:'우리의 숙소',airport:'공항',sim:'현지 SIM',experience:'기술 체험',sight:'도시 산책'};
  let activeDate = 'all', candidateId = null;
  let selectedId = hotel?.id || places[0]?.id;
  let map, tiles, routeLayer, markerLayer, initialized = false, forcedOverview = false, tileReady = false, failed = false;
  const markers = new Map();
  let currentPoints = [];
  const activeDay = () => days.find(day => day.date === activeDate);
  const matchingDays = id => days.filter(day => list(day.placeIds).includes(id));
  const pointColor = place => place.kind === 'hotel' || place.kind === 'airport' ? '#283b40' : candidateId ? '#9b663b' : (activeDay() || matchingDays(place.id)[0])?.color || colors[0];
  const pointsForDay = day => list(day?.placeIds).map(id => byId.get(id)).filter(Boolean);
  const visiblePlaces = () => {
    if (candidateId) return [hotel,byId.get(candidateId)].filter(Boolean).filter((place,index,points)=>points.findIndex(point=>point.id===place.id)===index);
    const points = activeDate === 'all' ? places : pointsForDay(activeDay());
    return [...new Map([...(hotel ? [hotel] : []),...points].map(place => [place.id,place])).values()];
  };
  const mapLabel = place => place.mapLabel || place.name;
  const labelOffsets = {hotel:[1,14,-24],airport:[1,14,20],unitree:[-1,-14,-28],haus:[1,14,24],'video-panlong':[-1,-14,10],lujiazui:[1,14,-30],bund:[-1,-14,20],robot:[-1,-14,20],drone:[1,14,24],agibot:[1,14,10]};
  const mobileOffsets = {hotel:[1,12,-24],airport:[1,12,20],unitree:[-1,-12,-42],haus:[1,12,22],'video-panlong':[-1,-12,12],lujiazui:[1,12,-48],bund:[-1,-12,-8],robot:[-1,-12,32],drone:[1,12,40],agibot:[1,12,20]};
  const markerLabel = place => {
    if (place.kind === 'hotel') return 'H';
    if (place.kind === 'airport') return '✈';
    if (candidateId) return '후보';
    const day = activeDay() || matchingDays(place.id)[0];
    const route = pointsForDay(day).filter(point => point.kind !== 'hotel' && point.kind !== 'airport');
    const n = route.findIndex(point => point.id === place.id) + 1;
    return activeDate === 'all' ? String(day?.label || '').slice(0,5).replace('.','/') : String(Math.max(1,n));
  };
  const detailHTML = place => {
    const dates = matchingDays(place.id).map(day => day.label).join(' · ');
    return `<span class="journey-detail-kicker">${esc(kindLabel[place.kind] || '여행 장소')}${dates ? ` / ${esc(dates)}` : ''}</span><h3>${esc(place.name)}</h3>${place.zh ? `<p class="journey-place-zh" lang="zh-CN">${esc(place.zh)}</p>` : ''}${place.note ? `<p>${esc(place.note)}</p>` : ''}${place.address ? `<p class="journey-place-address" lang="zh-CN">${esc(place.address)}</p>` : ''}${place.precision ? `<small>${esc(place.precision)}</small>` : ''}${safeUrl(place.mapUrl) ? `<a class="text-link" href="${esc(safeUrl(place.mapUrl))}" target="_blank" rel="noopener noreferrer">고덕지도에서 길찾기 ↗</a>` : ''}`;
  };
  const renderDetail = () => {
    const place = byId.get(selectedId);
    $('journey-place-detail').innerHTML = place ? detailHTML(place) : '<p>지도나 목록에서 장소를 골라보세요.</p>';
    document.querySelectorAll('[data-map-place]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mapPlace === selectedId)));
  };
  const selectPlace = (id, pan = true) => {
    const place = byId.get(id);
    if (!place) return;
    selectedId = id;
    renderDetail();
    renderOverview();
    if (map && pan && !forcedOverview && !failed) {
      map.panTo([place.lat,place.lng],{animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});
      markers.get(id)?.openPopup();
    }
  };
  const renderSummary = () => {
    if (candidateId) {
      const included = matchingDays(candidateId).map(day=>day.label).join(' · ');
      $('journey-map-summary').innerHTML = `<p class="eyebrow">영상 속 여행 장소</p><h3>${esc(mapLabel(byId.get(candidateId)))}</h3><p>${included ? `${esc(included)} 일정에 반영한 장소예요. 날짜 버튼을 누르면 그날의 동선을 볼 수 있어요.` : '고른 후보 한 곳의 위치예요. 기본 일정에 추가된 장소는 아니며, 날짜 버튼을 누르면 기존 여정으로 돌아갑니다.'}</p><button type="button" class="text-link" data-map-date="all">전체 여정으로 돌아가기 ↗</button>`;
      return;
    }
    const day = activeDay();
    const routeText = value => pointsForDay(value).filter(place=>place.kind !== 'hotel').filter((place,index,items)=>index === 0 || place.id !== items[index-1].id).map(mapLabel).join(' → ');
    $('journey-map-summary').innerHTML = day ? `<p class="eyebrow" style="color:${day.color}">${esc(day.label)} / DAY ${String(days.indexOf(day)+1).padStart(2,'0')}</p><h3>${esc(day.title)}</h3><p class="journey-text-route">${esc(routeText(day))}</p><p>${esc(day.summary)}</p><button type="button" class="text-link" data-map-itinerary="${esc(day.date)}">이날의 상세 일정 보기 ↘</button>` : `<p class="eyebrow">날짜별 방문 순서</p><div class="journey-day-routes">${days.map(day=>`<button type="button" data-map-date="${esc(day.date)}" style="--day-color:${day.color}"><strong>${esc(day.label)}</strong><span>${esc(routeText(day))}</span></button>`).join('')}</div>`;
  };
  const renderPlaceList = () => {
    $('journey-place-list').innerHTML = currentPoints.map(place => `<button type="button" class="journey-place-button" data-map-place="${esc(place.id)}" aria-pressed="${place.id === selectedId}"><span class="journey-list-pin" style="--pin-color:${pointColor(place)}">${esc(markerLabel(place))}</span><span><strong>${esc(mapLabel(place))}</strong><small>${esc(place.kind === 'hotel' ? '매일 출발·귀환' : matchingDays(place.id).map(day => day.label).join(' · '))}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  };
  const bounds = points => {
    const latitudes = points.map(p => p.lat), longitudes = points.map(p => p.lng);
    let minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes), minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
    const lngPad = Math.max((maxLng-minLng)*.1,.006), latPad = Math.max((maxLat-minLat)*.2,.005);
    return {minLat:minLat-latPad,maxLat:maxLat+latPad,minLng:minLng-lngPad,maxLng:maxLng+lngPad};
  };
  function renderOverview() {
    if (!currentPoints.length) return;
    const b = bounds(currentPoints), width = 1000, height = 510;
    const project = place => [65+(place.lng-b.minLng)/(b.maxLng-b.minLng)*870,450-(place.lat-b.minLat)/(b.maxLat-b.minLat)*380];
    const lines = (activeDay() ? [activeDay()] : []).map(day => {
      const points = pointsForDay(day).filter(place=>place.kind !== 'hotel' && place.kind !== 'airport').map(project).map(p => p.map(x=>x.toFixed(1)).join(',')).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${day.color}" stroke-width="3" stroke-dasharray="7 5" opacity=".65"/>`;
    }).join('');
    const pins = currentPoints.map(place => {
      const [x,y] = project(place), color = pointColor(place), chosen = place.id === selectedId;
      const name = mapLabel(place);
      const label = markerLabel(place);
      return `<g role="button" tabindex="0" data-overview-place="${esc(place.id)}" aria-label="${esc(place.name)} 선택" class="journey-svg-pin"><title>${esc(place.name)}</title>${chosen ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${color}" stroke-width="2"/>` : ''}<circle cx="${x}" cy="${y}" r="${activeDate === 'all' ? 16 : 14}" fill="${color}" stroke="#fffdf6" stroke-width="3"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="white" font-size="${activeDate === 'all' ? 8 : 11}" font-weight="700">${esc(label)}</text><text x="${x}" y="${y+34}" text-anchor="middle" class="journey-svg-label">${esc(name)}</text></g>`;
    }).join('');
    const grid = [0,1,2,3,4].map(i=>`<path d="M65 ${70+i*95}H935M${65+i*217.5} 70V450" stroke="#dddcd0" stroke-dasharray="3 7"/>`).join('');
    $('journey-map-fallback').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="좌표 기준 여정 위치 개요"><rect width="1000" height="510" fill="#efeee5"/>${grid}<text x="28" y="35" class="journey-svg-caption">상하이 · 좌표 기준 위치 개요</text><path d="M952 63V25m0 0-6 10m6-10 6 10" stroke="#526367" stroke-width="2" fill="none"/><text x="952" y="83" text-anchor="middle" class="journey-svg-caption">N</text>${lines}${pins}<text x="28" y="491" class="journey-svg-caption">장소의 상대적 위치 · 선은 도로 경로가 아닙니다</text></svg>`;
  }
  const showMode = () => {
    const overview = forcedOverview || failed || !map || !tileReady;
    $('journey-map-fallback').hidden = !overview;
    $('journey-live-map').classList.toggle('is-ready',!overview);
    $('journey-map-view-label').textContent = overview ? '좌표 기준 위치 개요' : candidateId ? '선택한 영상 장소의 위치' : '우리의 상하이 여행 지도';
    $('journey-map-mode').textContent = overview ? '거리 지도 보기' : '위치 개요 보기';
    $('journey-map-notice').textContent = failed ? '거리 지도를 불러오기 어려워 위치 개요를 표시해요. 장소별 고덕지도는 계속 이용할 수 있어요.' : overview ? '위치 개요의 선은 방문 순서예요. 실제 이동은 고덕지도에서 확인하세요.' : candidateId ? '선택한 영상 장소를 보고 있어요. 날짜 버튼으로 그날의 여정에 돌아갈 수 있어요.' : (activeDate === 'all' ? '호텔과 가볼 곳을 한글로 표시했어요. 날짜를 고르면 그날의 방문지만 확대합니다.' : '그날의 방문지를 확대했어요. 선은 방문 순서예요.');
  };
  const layoutLabels = () => {
    if (!map) return;
    const size = map.getSize(), compact = size.x < 620, occupied = [];
    currentPoints.forEach(place => {
      const element = markers.get(place.id)?.getElement(), label = element?.querySelector('.journey-pin-label');
      if (!label) return;
      const point = map.latLngToContainerPoint([place.lat,place.lng]);
      if (point.x < -20 || point.y < -20 || point.x > size.x+20 || point.y > size.y+20) { label.style.visibility='hidden'; return; }
      label.style.visibility='visible';
      const [side,dx,dy] = (compact ? mobileOffsets : labelOffsets)[place.id] || [1,14,0];
      const w = label.offsetWidth, h = label.offsetHeight;
      let x = side < 0 ? dx-w : dx;
      x = Math.max(7-point.x,Math.min(x,size.x-point.x-w-7));
      let bestY = dy-h/2, score = Infinity;
      [0,-34,34,-68,68,-102,102].forEach(shift=>{
        const y = Math.max(8-point.y,Math.min(dy-h/2+shift,size.y-point.y-h-8));
        const rect={x:point.x+x,y:point.y+y,w,h};
        const overlap=occupied.reduce((total,r)=>total+Math.max(0,Math.min(rect.x+w+5,r.x+r.w)-Math.max(rect.x-5,r.x))*Math.max(0,Math.min(rect.y+h+4,r.y+r.h)-Math.max(rect.y-4,r.y)),0);
        const value=overlap+Math.abs(shift)*.4;
        if(value<score){score=value;bestY=y;}
      });
      label.style.left=`${x}px`;label.style.top=`${bestY}px`;
      occupied.push({x:point.x+x,y:point.y+bestY,w,h});
      const leader=element.querySelector('.journey-pin-leader');
      const endX=x>0?x:x+w,endY=Math.max(bestY,Math.min(0,bestY+h));
      if(leader){leader.style.width=`${Math.hypot(endX,endY)}px`;leader.style.transform=`rotate(${Math.atan2(endY,endX)}rad)`;}
    });
  };
  const fitMap = () => {
    if (!map || !currentPoints.length) return;
    map.invalidateSize({pan:false});
    const visits = activeDate === 'all' ? currentPoints : currentPoints.filter(place=>place.kind !== 'hotel' && place.kind !== 'airport');
    const includeHotel = activeDate !== 'all' && currentPoints.length <= 2 && currentPoints.some(place => place.kind === 'hotel');
    const focus = includeHotel || !visits.length ? currentPoints : visits;
    map.fitBounds(window.L.latLngBounds(focus.map(p => [p.lat,p.lng])),{padding:[32,48],maxZoom:14.25,animate:false});
    window.requestAnimationFrame(layoutLabels);
  };
  const updateMap = () => {
    if (!map) return;
    markerLayer.clearLayers(); routeLayer.clearLayers(); markers.clear();
    const day=activeDay();
    if(day){
      const points=pointsForDay(day).filter(place=>place.kind !== 'hotel' && place.kind !== 'airport').map(place=>[place.lat,place.lng]);
      if(points.length>1)window.L.polyline(points,{color:day.color,weight:3,opacity:.65,dashArray:'7 6',interactive:false}).addTo(routeLayer);
    }
    currentPoints.forEach(place => {
      const color = pointColor(place), tag=place.kind === 'hotel'?'숙소':place.kind === 'airport'?'공항':markerLabel(place);
      const icon = window.L.divIcon({className:'journey-leaflet-icon journey-named-icon',html:`<span class="journey-map-dot" style="--pin-color:${color}"></span><span class="journey-pin-leader"></span><span class="journey-pin-label" style="--pin-color:${color}"><small>${esc(tag)}</small><strong>${esc(mapLabel(place))}</strong></span>`,iconSize:[1,1],iconAnchor:[0,0]});
      const marker = window.L.marker([place.lat,place.lng],{icon,title:place.name,alt:place.name,keyboard:true,zIndexOffset:place.kind==='hotel'?100:0}).addTo(markerLayer);
      marker.bindPopup(`<div class="journey-map-popup">${detailHTML(place)}</div>`,{maxWidth:290});
      marker.on('click',()=>selectPlace(place.id,false));
      markers.set(place.id,marker);
    });
    fitMap();
  };
  function initializeMap() {
    if (initialized || !places.length) return;
    initialized = true;
    if (!window.L) { failed = true; showMode(); return; }
    map = window.L.map('journey-live-map',{scrollWheelZoom:false,attributionControl:true,zoomControl:true,zoomSnap:.25,zoomDelta:.5});
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    map.on('zoomend moveend',layoutLabels);
    routeLayer = window.L.layerGroup().addTo(map);
    markerLayer = window.L.layerGroup().addTo(map);
    const tileUrl = safeUrl(config.tileUrl) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    tiles = window.L.tileLayer(tileUrl,{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'});
    let errors = 0;
    tiles.on('tileload',()=>{ tileReady = true; failed = false; showMode(); });
    tiles.on('tileerror',()=>{ errors += 1; if (!tileReady && errors >= 3) { failed = true; showMode(); } });
    tiles.addTo(map); updateMap(); showMode();
    window.setTimeout(()=>{ if (!tileReady) { failed = true; showMode(); } },8000);
  }
  const selectDate = date => {
    candidateId = null;
    activeDate = date === 'all' || days.some(day => day.date === date) ? date : 'all';
    currentPoints = visiblePlaces();
    if (!currentPoints.some(place => place.id === selectedId)) selectedId = currentPoints.find(place=>place.kind !== 'hotel')?.id || hotel?.id;
    document.querySelectorAll('[data-map-date]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mapDate === activeDate)));
    renderSummary(); renderPlaceList(); renderDetail(); renderOverview();
    if (map) updateMap();
    showMode();
  };
  $('journey-map-filters').innerHTML = `<button class="journey-filter" type="button" data-map-date="all" aria-pressed="true"><i style="--day-color:#283b40"></i><span>전체 여정</span></button>${days.map(day => `<button class="journey-filter" type="button" data-map-date="${esc(day.date)}" aria-pressed="false"><i style="--day-color:${day.color}"></i><span>${esc(day.label)}</span></button>`).join('')}`;
  $('journey-updated').textContent = config.updated ? `${String(config.updated).replaceAll('-','.')} 여정 정리` : '';
  if (config.note) $('journey-map-note').textContent = config.note;
  $('journey-map-legend').innerHTML = `<span><i style="--legend-color:#283b40"></i>숙소 · 공항</span>${days.filter(day=>pointsForDay(day).some(place=>place.kind !== 'hotel' && place.kind !== 'airport')).map(day=>`<span><i style="--legend-color:${day.color}"></i>${esc(day.label.replace('.','/'))} 방문지</span>`).join('')}`;
  if (!places.length) {
    $('journey-map-notice').textContent = '아래 일정에서 장소별 고덕지도를 확인할 수 있어요.';
    $('journey-map-canvas').hidden = true;
    return;
  }
  document.addEventListener('journey:show-candidate',event => {
    const place = byId.get(event.detail?.id);
    if (!place || place.kind === 'hotel') return;
    for (let parent = section.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    candidateId = place.id; activeDate = 'candidate'; selectedId = place.id;
    currentPoints = visiblePlaces();
    document.querySelectorAll('[data-map-date]').forEach(button=>button.setAttribute('aria-pressed','false'));
    renderSummary(); renderPlaceList(); renderDetail(); renderOverview();
    window.requestAnimationFrame(()=>{
      if (map) updateMap(); else initializeMap();
      showMode();
      section.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
    });
  });
  $('journey-map-filters').addEventListener('click',event => { const button = event.target.closest('[data-map-date]'); if (button) selectDate(button.dataset.mapDate); });
  $('journey-place-list').addEventListener('click',event => { const button = event.target.closest('[data-map-place]'); if (button) selectPlace(button.dataset.mapPlace); });
  const activateOverview = event => { const pin = event.target.closest('[data-overview-place]'); if (pin) selectPlace(pin.dataset.overviewPlace,false); };
  $('journey-map-fallback').addEventListener('click',activateOverview);
  $('journey-map-fallback').addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateOverview(event); } });
  $('journey-map-summary').addEventListener('click',event => { const dateButton=event.target.closest('[data-map-date]'); if(dateButton){selectDate(dateButton.dataset.mapDate);return;} const button = event.target.closest('[data-map-itinerary]'); if (button) document.dispatchEvent(new CustomEvent('journey:select-day',{detail:{date:button.dataset.mapItinerary}})); });
  $('journey-map-reset').addEventListener('click',()=>{ selectDate('all'); });
  $('journey-map-mode').addEventListener('click',()=>{
    if (!map) initializeMap();
    if (forcedOverview || failed || !tileReady) { forcedOverview = false; failed = false; if (map) { tiles.addTo(map); updateMap(); } }
    else { forcedOverview = true; if (map) map.removeLayer(tiles); }
    showMode();
  });
  selectDate('all'); showMode();
  document.getElementById('map-guide')?.addEventListener('toggle',event=>{
    if (event.target.open) window.requestAnimationFrame(()=>{ initializeMap(); if(map) fitMap(); });
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries=>{ if (entries.some(entry=>entry.isIntersecting)) { initializeMap(); observer.disconnect(); } },{rootMargin:'100px'});
    observer.observe($('journey-map-canvas'));
  } else initializeMap();
  window.addEventListener('resize',()=>{ if (map && !forcedOverview && !failed) fitMap(); });
})();
