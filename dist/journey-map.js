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
  const places = list(config.places).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) < 85 && Math.abs(place.lng) <= 180);
  const byId = new Map(places.map(place => [place.id,place]));
  const hotel = places.find(place => place.kind === 'hotel');
  const kindLabel = {hotel:'우리의 숙소',airport:'공항',sim:'현지 SIM',experience:'기술 체험',sight:'도시 산책'};
  let activeDate = 'all';
  let selectedId = hotel?.id || places[0]?.id;
  let map, tiles, routeLayer, markerLayer, initialized = false, forcedOverview = false, tileReady = false, failed = false;
  const markers = new Map();
  let currentPoints = [];
  const activeDay = () => days.find(day => day.date === activeDate);
  const matchingDays = id => days.filter(day => list(day.placeIds).includes(id));
  const pointColor = place => place.kind === 'hotel' || place.kind === 'airport' ? '#283b40' : (activeDay() || matchingDays(place.id)[0])?.color || colors[0];
  const pointsForDay = day => list(day?.placeIds).map(id => byId.get(id)).filter(Boolean);
  const visiblePlaces = () => {
    const points = activeDate === 'all' ? places : pointsForDay(activeDay());
    return [...new Map([...(hotel ? [hotel] : []),...points].map(place => [place.id,place])).values()];
  };
  const markerLabel = place => {
    if (place.kind === 'hotel') return 'H';
    if (place.kind === 'airport') return '✈';
    const day = activeDay() || matchingDays(place.id)[0];
    const route = pointsForDay(day).filter(point => point.kind !== 'hotel' && point.kind !== 'airport');
    const n = route.findIndex(point => point.id === place.id) + 1;
    return activeDate === 'all' ? `${String(day?.label || '').slice(0,5)}·${Math.max(1,n)}` : String(Math.max(1,n));
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
    const day = activeDay();
    $('journey-map-summary').innerHTML = day ? `<p class="eyebrow" style="color:${day.color}">${esc(day.label)} / DAY ${String(days.indexOf(day)+1).padStart(2,'0')}</p><h3>${esc(day.title)}</h3><p>${esc(day.summary)}</p><button type="button" class="text-link" data-map-itinerary="${esc(day.date)}">이날의 상세 일정 보기 ↘</button>` : `<p class="eyebrow">ONE BASE · SIX DAYS</p><h3>홍차오에서, 상하이 곳곳으로.</h3><p>색깔은 날짜, 선은 방문 순서예요. 날짜를 고르면 하루의 동선만 볼 수 있고, 핀을 누르면 주소와 고덕지도가 열려요.</p>`;
  };
  const renderPlaceList = () => {
    $('journey-place-list').innerHTML = currentPoints.map(place => `<button type="button" class="journey-place-button" data-map-place="${esc(place.id)}" aria-pressed="${place.id === selectedId}"><span class="journey-list-pin" style="--pin-color:${pointColor(place)}">${esc(markerLabel(place))}</span><span><strong>${esc(place.name)}</strong><small>${esc(place.kind === 'hotel' ? '매일 출발·귀환' : matchingDays(place.id).map(day => day.label).join(' · '))}</small></span><span aria-hidden="true">↗</span></button>`).join('');
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
    const lines = (activeDay() ? [activeDay()] : days).map(day => {
      const points = pointsForDay(day).map(project).map(p => p.map(x=>x.toFixed(1)).join(',')).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${day.color}" stroke-width="3" stroke-dasharray="7 5" opacity=".65"/>`;
    }).join('');
    const pins = currentPoints.map(place => {
      const [x,y] = project(place), color = pointColor(place), chosen = place.id === selectedId;
      const name = String(place.name).length > 15 ? `${String(place.name).slice(0,14)}…` : place.name;
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
    $('journey-map-view-label').textContent = overview ? '좌표 기준 위치 개요' : '상하이 여정 지도';
    $('journey-map-mode').textContent = overview ? '거리 지도 보기' : '위치 개요 보기';
    $('journey-map-notice').textContent = failed ? '거리 지도를 불러오기 어려워 위치 개요를 표시해요. 장소별 고덕지도는 계속 이용할 수 있어요.' : overview ? '위치 개요의 선은 방문 순서예요. 실제 이동은 고덕지도에서 확인하세요.' : '핀을 누르면 장소 안내가 열려요. 선은 방문 순서이며 실제 도로 경로가 아닙니다.';
  };
  const fitMap = () => {
    if (!map || !currentPoints.length) return;
    map.invalidateSize({pan:false});
    map.fitBounds(window.L.latLngBounds(currentPoints.map(p => [p.lat,p.lng])),{padding:[42,42],maxZoom:14,animate:false});
  };
  const updateMap = () => {
    if (!map) return;
    markerLayer.clearLayers(); routeLayer.clearLayers(); markers.clear();
    (activeDay() ? [activeDay()] : days).forEach(day => {
      const points = pointsForDay(day).map(place => [place.lat,place.lng]);
      if (points.length > 1) window.L.polyline(points,{color:day.color,weight:3,opacity:activeDate === 'all' ? .55 : .8,dashArray:'7 6',interactive:false}).addTo(routeLayer);
    });
    currentPoints.forEach(place => {
      const color = pointColor(place);
      const icon = window.L.divIcon({className:'journey-leaflet-icon',html:`<span style="--pin-color:${color}" class="journey-marker-badge ${place.kind === 'hotel' ? 'is-hotel' : ''}">${esc(markerLabel(place))}</span>`,iconSize:[36,36],iconAnchor:[18,18]});
      const marker = window.L.marker([place.lat,place.lng],{icon,title:place.name,alt:place.name,keyboard:true}).addTo(markerLayer);
      marker.bindPopup(`<div class="journey-map-popup">${detailHTML(place)}</div>`,{maxWidth:290});
      marker.bindTooltip(esc(place.name),{direction:'top',offset:[0,-16]});
      marker.on('click',()=>selectPlace(place.id,false));
      markers.set(place.id,marker);
    });
    fitMap();
  };
  function initializeMap() {
    if (initialized || !places.length) return;
    initialized = true;
    if (!window.L) { failed = true; showMode(); return; }
    map = window.L.map('journey-live-map',{scrollWheelZoom:false,attributionControl:true,zoomControl:true});
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
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
    activeDate = date === 'all' || days.some(day => day.date === date) ? date : 'all';
    currentPoints = visiblePlaces();
    if (!currentPoints.some(place => place.id === selectedId)) selectedId = currentPoints.find(place=>place.kind !== 'hotel')?.id || hotel?.id;
    document.querySelectorAll('[data-map-date]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mapDate === activeDate)));
    renderSummary(); renderPlaceList(); renderDetail(); renderOverview();
    if (map && !forcedOverview && !failed) updateMap();
  };
  $('journey-map-filters').innerHTML = `<button class="journey-filter" type="button" data-map-date="all" aria-pressed="true"><i style="--day-color:#283b40"></i><span>전체 여정</span></button>${days.map(day => `<button class="journey-filter" type="button" data-map-date="${esc(day.date)}" aria-pressed="false"><i style="--day-color:${day.color}"></i><span>${esc(day.label)}</span></button>`).join('')}`;
  $('journey-updated').textContent = config.updated ? `${String(config.updated).replaceAll('-','.')} 여정 정리` : '';
  if (config.note) $('journey-map-note').textContent = config.note;
  if (!places.length) {
    $('journey-map-notice').textContent = '아래 일정에서 장소별 고덕지도를 확인할 수 있어요.';
    $('journey-map-canvas').hidden = true;
    return;
  }
  $('journey-map-filters').addEventListener('click',event => { const button = event.target.closest('[data-map-date]'); if (button) selectDate(button.dataset.mapDate); });
  $('journey-place-list').addEventListener('click',event => { const button = event.target.closest('[data-map-place]'); if (button) selectPlace(button.dataset.mapPlace); });
  const activateOverview = event => { const pin = event.target.closest('[data-overview-place]'); if (pin) selectPlace(pin.dataset.overviewPlace,false); };
  $('journey-map-fallback').addEventListener('click',activateOverview);
  $('journey-map-fallback').addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateOverview(event); } });
  $('journey-map-summary').addEventListener('click',event => { const button = event.target.closest('[data-map-itinerary]'); if (button) document.dispatchEvent(new CustomEvent('journey:select-day',{detail:{date:button.dataset.mapItinerary}})); });
  $('journey-map-reset').addEventListener('click',()=>{ selectDate('all'); });
  $('journey-map-mode').addEventListener('click',()=>{
    if (!map) initializeMap();
    if (forcedOverview || failed || !tileReady) { forcedOverview = false; failed = false; if (map) { tiles.addTo(map); updateMap(); } }
    else { forcedOverview = true; if (map) map.removeLayer(tiles); }
    showMode();
  });
  selectDate('all'); showMode();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries=>{ if (entries.some(entry=>entry.isIntersecting)) { initializeMap(); observer.disconnect(); } },{rootMargin:'100px'});
    observer.observe($('journey-map-canvas'));
  } else initializeMap();
  window.addEventListener('resize',()=>{ if (map && !forcedOverview && !failed) fitMap(); });
})();
