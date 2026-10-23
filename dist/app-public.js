(() => {
  'use strict';

  const data = window.TRIP_DATA || {};
  const days = Array.isArray(data.days) ? data.days : [];
  const meta = data.meta || {};
  const storageKey = 'shanghai-2026-travel-notes-v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const array = value => Array.isArray(value) ? value : [];
  const url = value => {
    try { const parsed = new URL(value); return ['https:','http:'].includes(parsed.protocol) && !['mail.google.com','gmail.com'].includes(parsed.hostname) ? parsed.href : ''; }
    catch { return ''; }
  };
  const link = (href, label, className = 'text-link') => url(href) ? `<a class="${className}" href="${esc(url(href))}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>` : '';
  const copyButton = (text, label = '중문 복사') => text ? `<button class="copy-button" type="button" data-copy="${esc(text)}" aria-label="${esc(label)}">${esc(label)}</button>` : '';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { saved = {}; }
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  if (!saved.checks || typeof saved.checks !== 'object') saved.checks = {};
  if (!saved.notes || typeof saved.notes !== 'object') saved.notes = {};
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Reading the plan still works when storage is unavailable. */ } };

  const todayParts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today = ['year','month','day'].map(type => todayParts.find(part => part.type === type).value).join('-');
  const dateNumber = value => Date.parse(`${value}T00:00:00+09:00`);
  const start = meta.startDate || '2026-10-27';
  const end = meta.endDate || '2026-11-01';
  const difference = Math.round((dateNumber(start) - dateNumber(today)) / 86400000);
  $('#departure-count').textContent = difference > 0 ? `출발 D−${difference}` : difference === 0 ? '오늘, 상하이로' : today <= end ? `여행 ${Math.abs(difference) + 1}일째` : '다음 장면을 추억하며';

  if (meta.title) $('#hero-title').textContent = meta.title;
  if (meta.heroImage) $('#hero-image').src = meta.heroImage;
  if (meta.heroCaption) $('#hero-caption').textContent = meta.heroCaption;
  if (meta.heroCredit && url(meta.heroSourceUrl)) {
    $('#hero-credit').href = url(meta.heroSourceUrl);
    $('#hero-credit').textContent = `${meta.heroCredit} ↗`;
  }
  if (data.notes?.plan) $('.plan-state strong').textContent = data.notes.plan;
  if (data.notes?.assumption) {
    const note = document.createElement('p');
    note.className = 'creator-assumption';
    note.textContent = data.notes.assumption;
    $('.experience-footnote').appendChild(note);
  }
  if (data.notes?.privacy) $('.prep-progress>p').textContent = data.notes.privacy;
  if (meta.updated) $('#source-note').textContent = `${meta.updated.replaceAll('-','.')} 자료 확인 · ${$('#source-note').textContent}`;

  const statusClass = value => {
    const text = String(value || '');
    if (/필요|재확인|조건부|미확인|미정/.test(text)) return 'verify';
    if (/관측|관람|보기/.test(text)) return 'observe';
    if (/자유|선택|준비|추천|계획|전환/.test(text)) return 'neutral';
    return '';
  };
  const pill = (value, neutral = false) => value ? `<span class="pill ${neutral ? 'neutral' : statusClass(value)}">${esc(value)}</span>` : '';
  const accessHTML = (access, headingTag = 'h4') => {
    if (!access || (!access.reservation && !access.phone)) return '';
    const sources = array(access.sources).map(source => link(source.url, source.label || '확인 근거')).filter(Boolean).join('');
    return `<section class="access-box" aria-label="예약과 한국 번호 이용 안내"><${headingTag} class="access-title">예약 · 한국 번호</${headingTag}><dl class="access-facts">${access.reservation ? `<div><dt>예약</dt><dd>${esc(access.reservation)}</dd></div>` : ''}${access.phone ? `<div><dt>한국 번호</dt><dd>${esc(access.phone)}</dd></div>` : ''}</dl>${access.action ? `<p class="access-action"><strong>다음 단계</strong>${esc(access.action)}</p>` : ''}${access.evidenceLabel || access.checkedAt ? `<p class="access-meta">${access.evidenceLabel ? `<span>${esc(access.evidenceLabel)}</span>` : ''}${access.checkedAt ? `<span>확인 ${esc(access.checkedAt)}</span>` : ''}</p>` : ''}${sources ? `<div class="access-sources" aria-label="예약 및 전화번호 안내 근거">${sources}</div>` : ''}</section>`;
  };
  if (data.diningPolicy && $('#dining-policy')) $('#dining-policy').textContent = data.diningPolicy;
  const stopAccessHTML = stop => {
    const access = stop.accessId ? array(data.experiences).find(experience => experience.id === stop.accessId)?.access : null;
    const content = accessHTML(access, 'h5');
    return content ? `<details class="stop-access"><summary>예약·한국 번호 확인 <span aria-hidden="true">＋</span></summary>${content}</details>` : '';
  };
  const mealText = value => Array.isArray(value) ? value.filter(Boolean).join(' · ') : value;
  const mealPhone = phone => {
    const number = String(phone || '').replace(/[^\d+]/g,'');
    return number ? `<a class="text-link" href="tel:${esc(number)}">${esc(phone)} <span aria-hidden="true">☎</span></a>` : '';
  };
  const mealHTML = (meal, print = false) => {
    if (!meal || typeof meal !== 'object') return '';
    const dishes = mealText(meal.dishes);
    const sources = array(meal.sources).map(source => link(source.url,source.label || '식당 공식 안내')).filter(Boolean).join('');
    const backup = meal.backup && typeof meal.backup === 'object' ? meal.backup : null;
    const backupAddress = backup ? [backup.zh,backup.address].filter(Boolean).join('\n') : '';
    const fact = (label,value,className = '') => value ? `<p class="meal-fact ${className}"><strong>${esc(label)}</strong><span>${esc(mealText(value))}</span></p>` : '';
    return `<section class="meal-box" aria-label="식사 메뉴와 대기 안내"><p class="meal-kicker">식사 메모${meal.cuisine ? ` <span>${esc(meal.cuisine)}</span>` : ''}</p>${fact('추천 메뉴',dishes)}${meal.why ? `<p class="meal-why">${esc(meal.why)}</p>` : ''}${fact('대기 기준',meal.queuePlan,'meal-queue')}${fact('좌석 확인',meal.seating)}${meal.hoursNote || meal.priceNote ? `<div class="meal-meta">${fact('영업 확인',meal.hoursNote)}${fact('가격 참고',meal.priceNote)}</div>` : ''}${meal.phone || sources ? `<div class="meal-links">${mealPhone(meal.phone)}${sources}</div>` : ''}${backup?.name ? `<details class="meal-backup"${print ? ' open' : ''}><summary>기다려야 하면 · ${esc(backup.name)} <span aria-hidden="true">＋</span></summary><div class="meal-backup-body"><h5>${esc(backup.name)}</h5>${backup.zh ? `<p class="meal-backup-zh" lang="zh-CN">${esc(backup.zh)}</p>` : ''}${backup.address ? `<p class="meal-backup-address" lang="zh-CN">${esc(backup.address)}</p>` : ''}${backup.detail ? `<p>${esc(backup.detail)}</p>` : ''}<div class="meal-links">${link(backup.mapUrl,'대안 고덕지도')}${link(backup.sourceUrl,'대안 확인 자료')}${mealPhone(backup.phone)}${copyButton(backupAddress,'대안 중문 주소 복사')}</div></div></details>` : ''}${meal.checkedAt ? `<p class="meal-checked">식당 정보 확인 ${esc(meal.checkedAt)}</p>` : ''}</section>`;
  };
  const stopHTML = (stop, print = false) => {
    const address = [stop.zh, stop.address].filter(Boolean).join('\n');
    return `<li class="timeline-stop"><div class="stop-time">${esc(stop.time)}</div><div class="stop-main"><div class="stop-topline"><h4 class="stop-title">${esc(stop.title)}</h4><div class="status-pills">${pill(stop.priority, true)}${pill(stop.type, true)}${pill(stop.status)}</div></div>${stop.detail ? `<p class="stop-detail">${esc(stop.detail)}</p>` : ''}${mealHTML(stop.meal,print)}${stop.zh ? `<div class="stop-zh" lang="zh-CN">${esc(stop.zh)}</div>` : ''}${stop.address ? `<div class="stop-address"><span lang="zh-CN">${esc(stop.address)}</span>${copyButton(address)}</div>` : address ? `<div class="stop-address">${copyButton(address)}</div>` : ''}<div class="stop-links">${link(stop.mapUrl,'고덕지도')}${link(stop.sourceUrl,'확인 자료')}${link(stop.videoUrl,'영상 속 장소')}</div>${stopAccessHTML(stop)}</div></li>`;
  };
  const fullDayHTML = (day, index, print = false) => `<div class="day-content-grid"><div class="day-summary"><p class="day-kicker">DAY ${String(index + 1).padStart(2,'0')} — ${esc(day.kicker)}</p><h3>${print ? `${esc(day.label)} (${esc(day.weekday)}) · ` : ''}${esc(day.title)}</h3><p>${esc(day.summary)}</p>${array(day.focus).length ? `<ul class="day-focus" aria-label="오늘의 핵심과 선택 일정">${day.focus.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${day.mealNote ? `<p class="day-meal-note"><strong>식사 계획</strong>${esc(day.mealNote)}</p>` : ''}${day.area ? `<span class="day-area">${esc(day.area)}</span>` : ''}${array(day.route).length ? `<div class="route-label">TODAY’S ROUTE</div><div class="day-route">${day.route.map(place => `<span>${esc(place)}</span>`).join('<i aria-hidden="true">→</i>')}</div>` : ''}${day.travelNote || day.weatherPlan ? `<div class="day-small-note">${day.travelNote ? `<strong>이동의 여유</strong>${esc(day.travelNote)}` : ''}${day.weatherPlan ? `<div class="weather-note"><strong>날씨가 달라지면</strong>${esc(day.weatherPlan)}</div>` : ''}</div>` : ''}</div><ol class="timeline" aria-label="${esc(day.label)} 상세 일정">${array(day.stops).map(stop => stopHTML(stop,print)).join('')}</ol></div>${!print ? `<div class="day-note"><label for="daily-note">오늘의 작은 메모<span>이 브라우저에 자동 저장</span></label><textarea id="daily-note" data-note-date="${esc(day.date)}" placeholder="궁금한 기기, 방문 전 물어볼 것, 찍고 싶은 장면…" aria-label="${esc(day.label)} 여행 메모">${esc(saved.notes[day.date] || '')}</textarea></div>` : ''}`;


  const compactStopHTML = stop => {
    const address = [stop.zh,stop.address].filter(Boolean).join('\n');
    const hasDetails = stop.detail || stop.meal || address || stop.sourceUrl || stop.videoUrl || stop.accessId;
    return `<li class="compact-stop"><div class="stop-time">${esc(stop.time)}</div><div class="compact-stop-copy"><div class="compact-stop-head"><h4>${esc(stop.displayTitle || stop.title)}</h4>${stop.quickStatus ? `<span class="quick-status">${esc(stop.quickStatus)}</span>` : ''}${link(stop.mapUrl,'지도')}</div>${stop.shortNote ? `<p class="compact-stop-note">${esc(stop.shortNote)}</p>` : ''}${hasDetails ? `<details class="stop-details"><summary>${stop.meal ? '메뉴·예약·식당 대안' : '주소·방문 안내'}</summary><div class="stop-details-body">${stop.detail ? `<p class="stop-detail">${esc(stop.detail)}</p>` : ''}${mealHTML(stop.meal)}${stop.zh ? `<p class="stop-zh" lang="zh-CN">${esc(stop.zh)}</p>` : ''}${stop.address ? `<div class="stop-address"><span lang="zh-CN">${esc(stop.address)}</span>${copyButton(address)}</div>` : address ? `<div class="stop-address">${copyButton(address)}</div>` : ''}<div class="stop-links">${link(stop.mapUrl,'고덕지도')}${link(stop.sourceUrl,'확인 자료')}${link(stop.videoUrl,'영상 속 장소')}</div>${stopAccessHTML(stop)}</div></details>` : ''}</div></li>`;
  };
  const dayHTML = (day,index,print = false) => {
    if (print) return fullDayHTML(day,index,true);
    return `<div class="compact-day-header"><p class="eyebrow">DAY ${String(index + 1).padStart(2,'0')} · ${esc(day.label)} ${esc(day.weekday)}</p><h3>${esc(day.displayTitle || day.title)}</h3><p>${esc(day.displaySummary || day.summary)}</p></div><ol class="compact-timeline" aria-label="${esc(day.label)} 핵심 일정">${array(day.stops).filter(stop=>!stop.secondary).map(compactStopHTML).join('')}</ol><details class="day-more"><summary>이동 안내·예약 체크·개인 메모</summary><div class="day-more-body">${array(day.stops).some(stop=>stop.secondary) ? `<ol class="compact-timeline secondary-stops" aria-label="추가 준비·조건부 일정">${array(day.stops).filter(stop=>stop.secondary).map(compactStopHTML).join('')}</ol>` : ''}<p>${esc(day.summary)}</p>${array(day.focus).length ? `<ul class="day-focus" aria-label="오늘의 핵심과 선택 일정">${day.focus.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${day.mealNote ? `<p class="day-meal-note"><strong>식사 계획</strong>${esc(day.mealNote)}</p>` : ''}${array(day.route).length ? `<p class="day-route">${day.route.map(esc).join(' → ')}</p>` : ''}${day.travelNote || day.weatherPlan ? `<div class="day-small-note">${day.travelNote ? `<strong>이동의 여유</strong>${esc(day.travelNote)}` : ''}${day.weatherPlan ? `<div class="weather-note"><strong>날씨가 달라지면</strong>${esc(day.weatherPlan)}</div>` : ''}</div>` : ''}<div class="day-note"><label for="daily-note">오늘의 작은 메모<span>이 브라우저에 자동 저장</span></label><textarea id="daily-note" data-note-date="${esc(day.date)}" placeholder="궁금한 기기, 방문 전 물어볼 것, 찍고 싶은 장면…" aria-label="${esc(day.label)} 여행 메모">${esc(saved.notes[day.date] || '')}</textarea></div></div></details>`;
  };

  let activeDay = Math.max(0, days.findIndex(day => day.date === today));
  const setDay = (index, shouldFocus = false) => {
    if (!days[index]) return;
    activeDay = index;
    document.querySelectorAll('.day-tab').forEach((tab, tabIndex) => {
      const selected = tabIndex === activeDay;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const tab = $(`#day-tab-${index}`);
    $('#day-panel').setAttribute('aria-labelledby', tab.id);
    $('#day-panel').innerHTML = dayHTML(days[index], index);
    if (shouldFocus) {
      tab.focus({preventScroll:true});
      tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    }
  };
  document.addEventListener('journey:select-day', event => {
    const index = days.findIndex(day => day.date === event.detail?.date);
    if (index < 0) return;
    setDay(index);
    $('#itinerary').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
  });
  if (days.length) {
    $('#day-tabs').innerHTML = days.map((day,index) => `<button class="day-tab" type="button" role="tab" id="day-tab-${index}" aria-controls="day-panel" aria-selected="${index === activeDay}" tabindex="${index === activeDay ? 0 : -1}" data-day="${index}"><span class="day-tab-top"><span>DAY ${String(index + 1).padStart(2,'0')}</span><span>${esc(day.weekday)}</span></span><span class="day-tab-date">${esc(day.label)}</span><span class="day-tab-label">${esc(day.shortArea || day.area)}</span>${day.date === today ? '<span class="day-tab-today">TODAY</span>' : ''}</button>`).join('');
    $('#day-overview').innerHTML = days.map((day,index) => `<button class="overview-row" type="button" data-select-day="${index}" aria-label="${esc(day.label)} ${esc(day.title)} 일정 보기"><span class="overview-number">${String(index + 1).padStart(2,'0')}</span><span class="overview-date">${esc(day.label)} ${esc(day.weekday)}</span><span class="overview-title">${esc(day.title)}</span><span class="overview-area">${esc(day.area)}</span><span class="overview-arrow" aria-hidden="true">↗</span></button>`).join('');
    $('#print-days').innerHTML = days.map((day,index) => `<article class="print-day">${dayHTML(day,index,true)}</article>`).join('');
    setDay(activeDay);
  } else {
    $('#day-panel').innerHTML = '<p class="empty-state">여행 일정 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>';
  }

  $('#day-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-day]');
    if (tab) setDay(Number(tab.dataset.day));
  });
  $('#day-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : (activeDay + (event.key === 'ArrowRight' ? 1 : -1) + days.length) % days.length;
    setDay(index,true);
  });
  $('#day-overview').addEventListener('click', event => {
    const row = event.target.closest('[data-select-day]');
    if (!row) return;
    setDay(Number(row.dataset.selectDay));
    $('#itinerary').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
  });
  $('#day-panel').addEventListener('input', event => {
    if (!event.target.matches('[data-note-date]')) return;
    saved.notes[event.target.dataset.noteDate] = event.target.value;
    persist();
  });

  const experiences = array(data.experiences);
  $('#experience-grid').innerHTML = experiences.map((experience,index) => `<article class="experience-card">${experience.image ? `<figure class="experience-image-wrap"><img class="experience-image" src="${esc(experience.image)}" alt="${esc(experience.title)} 관련 공식 자료사진" loading="lazy" width="800" height="500">${experience.imageCredit ? `<figcaption>${esc(experience.imageCredit)}</figcaption>` : ''}</figure>` : `<div class="experience-typography" aria-hidden="true"><span>${esc(experience.tag)}</span><strong>${String(index + 1).padStart(2,'0')}</strong><i>HUMAN × CITY</i></div>`}<div class="experience-card-head"><span class="eyebrow">${esc(experience.tag)}</span><span class="experience-index">${String(index + 1).padStart(2,'0')} / ${esc(experience.area)}</span></div><h3>${esc(experience.title)}</h3><p class="experience-zh" lang="zh-CN">${esc(experience.zh)}</p><div class="status-pills">${pill(experience.status)}</div><p class="experience-card-detail">${esc(experience.detail)}</p>${accessHTML(experience.access)}${experience.address ? `<div class="experience-card-address"><span lang="zh-CN">${esc(experience.address)}</span>${copyButton([experience.zh,experience.address].filter(Boolean).join('\n'))}</div>` : ''}<div class="stop-links">${link(experience.mapUrl,'고덕지도')}${link(experience.sourceUrl,'공식 안내')}</div></article>`).join('');

  const videoGuide = data.videoGuide || {};
  const videoPlaces = array(videoGuide.places).filter(place => place && place.id);
  const videoStorageKey = 'shanghai-2026-video-candidates-v1';
  let videoFavorites = new Set(), videoArea = 'all', videoOnlyFavorites = false, videoLimit = 12;
  try {
    const stored = JSON.parse(localStorage.getItem(videoStorageKey) || '[]');
    if (Array.isArray(stored)) videoFavorites = new Set(stored.filter(id => typeof id === 'string' && videoPlaces.some(place => String(place.id) === id)));
  } catch { /* The candidate list still works when local storage is unavailable. */ }
  const persistVideoFavorites = () => {
    try { localStorage.setItem(videoStorageKey,JSON.stringify([...videoFavorites])); }
    catch { $('#video-save-note').textContent = '이 환경에서는 찜을 저장하기 어려워요. 현재 화면에서 고른 후보는 새로고침하면 사라질 수 있어요.'; }
  };
  const videoTime = seconds => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}` : '';
  const videoLink = (item, label = '영상') => link(item.videoUrl,`${label}${videoTime(item.videoSeconds) ? ` ${videoTime(item.videoSeconds)}` : ' 보기'}`);
  const videoFit = fit => ({nearby:'기존 일정 근처',halfday:'반나절 후보',fullday:'별도 하루 후보'}[fit] || '동선 확인');
  const renderVideoCandidates = () => {
    const filtered = videoPlaces.filter(place => (videoArea === 'all' || place.area === videoArea) && (!videoOnlyFavorites || videoFavorites.has(String(place.id))));
    const visible = filtered.slice(0,videoLimit);
    $('#video-favorites-count').textContent = String(videoFavorites.size);
    $('#video-favorites-only').setAttribute('aria-pressed',String(videoOnlyFavorites));
    $('#video-result-count').textContent = `전체 ${videoPlaces.length}곳 중 ${filtered.length}곳${filtered.length > visible.length ? ` · ${visible.length}곳 표시` : ''}`;
    $('#video-candidate-grid').innerHTML = visible.length ? visible.map(place => {
      const favorite = videoFavorites.has(String(place.id));
      const hasMap = place.mapPlaceId && array(data.journeyMap?.places).some(point => point.id === place.mapPlaceId && Number.isFinite(point.lat) && Number.isFinite(point.lng));
      const address = [place.zh,place.address].filter(Boolean).join('\n');
      const children = array(place.subPlaces);
      return `<article class="video-candidate-card ${favorite ? 'is-favorite' : ''}" aria-labelledby="video-place-${esc(place.id)}"><div class="video-card-top"><span class="eyebrow">${esc(place.area || '상하이')} / ${esc(place.category || '여행 후보')}</span><button type="button" class="video-favorite-button" data-video-favorite="${esc(place.id)}" aria-pressed="${favorite}" aria-label="${esc(place.name)} 후보 찜"><span aria-hidden="true">${favorite ? '♥' : '♡'}</span>${favorite ? '찜함' : '찜'}</button></div><h3 id="video-place-${esc(place.id)}">${esc(place.name)}</h3>${place.zh ? `<p class="video-place-zh" lang="zh-CN">${esc(place.zh)}</p>` : ''}<div class="status-pills">${pill(videoFit(place.fit),true)}${pill(place.status)}</div>${place.suggestedDay ? `<p class="video-suggested-day">함께 보기 · ${esc(place.suggestedDay)}</p>` : ''}${place.detail ? `<p class="video-place-description">${esc(place.detail)}</p>` : ''}${place.address ? `<p class="video-place-address" lang="zh-CN">${esc(place.address)}</p>` : ''}<div class="video-card-links">${videoLink(place)}${place.includedDate ? `<button type="button" class="text-link" data-video-day="${esc(place.includedDate)}">${esc(place.includedDate.slice(5).replace('-','/'))} 일정 보기 ↗</button>` : ''}${link(place.mapUrl,'고덕지도')}${link(place.sourceUrl,'현재 정보 근거')}${address ? copyButton(address,'중문 장소·주소 복사') : ''}${hasMap ? `<button type="button" class="text-link" data-video-map="${esc(place.mapPlaceId)}">여정 지도에 표시 ↗</button>` : ''}</div>${children.length ? `<details class="video-subplaces"><summary>이곳에서 소개한 세부 장소 ${children.length}곳 <span aria-hidden="true">＋</span></summary><ul>${children.map(child => `<li><h4>${esc(child.name)}</h4>${child.zh ? `<p lang="zh-CN">${esc(child.zh)}</p>` : ''}${child.note ? `<p>${esc(child.note)}</p>` : ''}<div>${videoLink(child)}${link(child.mapUrl,'고덕지도')}${link(child.sourceUrl,'현재 정보 근거')}</div></li>`).join('')}</ul></details>` : ''}</article>`;
    }).join('') : `<p class="video-empty">${videoOnlyFavorites ? '아직 이 지역에 찜한 후보가 없어요. 찜만 보기 버튼을 끄면 전체 후보를 볼 수 있어요.' : '이 지역에 표시할 후보가 없어요.'}</p>`;
    const remaining = filtered.length - visible.length;
    $('#video-candidates-more').hidden = remaining <= 0;
    $('#video-candidates-more').textContent = `후보 ${Math.min(12,remaining)}곳 더 보기 · ${remaining}곳 남음 ↓`;
  };
  if ($('#video-places')) {
    if (videoGuide.intro) $('#video-guide-intro').textContent = videoGuide.intro;
    $('#video-guide-note').textContent = videoGuide.note || '영상 소개 시점과 현재 운영 조건을 구분해 확인하세요. 이 목록은 기본 일정 외에 골라 볼 여행 후보입니다.';
    $('#video-guide-source').innerHTML = `${videoGuide.channel || videoGuide.date ? `<span>${esc([videoGuide.channel,videoGuide.date].filter(Boolean).join(' · '))}</span>` : ''}${link(videoGuide.startUrl || videoGuide.url,'보내준 영상 보기')}`;
    const areas = [...new Set(videoPlaces.map(place => place.area).filter(Boolean))];
    $('#video-area-select').innerHTML = '<option value="all">전체 지역</option>' + areas.map(area => `<option value="${esc(area)}">${esc(area)}</option>`).join('');
    $('#video-area-select').addEventListener('change',event => { videoArea = event.target.value; videoLimit = 12; renderVideoCandidates(); });
    $('#video-favorites-only').addEventListener('click',()=>{ videoOnlyFavorites = !videoOnlyFavorites; videoLimit = 12; renderVideoCandidates(); });
    $('#video-candidates-more').addEventListener('click',()=>{ videoLimit += 12; renderVideoCandidates(); });
    $('#video-candidate-grid').addEventListener('click',event => {
      const favorite = event.target.closest('[data-video-favorite]');
      if (favorite) {
        const id = favorite.dataset.videoFavorite;
        if (videoFavorites.has(id)) videoFavorites.delete(id); else videoFavorites.add(id);
        persistVideoFavorites(); renderVideoCandidates();
        const nextButton = [...document.querySelectorAll('[data-video-favorite]')].find(button => button.dataset.videoFavorite === id);
        (nextButton || $('#video-favorites-only')).focus({preventScroll:true});
        return;
      }
      const dayButton = event.target.closest('[data-video-day]');
      if (dayButton) { document.dispatchEvent(new CustomEvent('journey:select-day',{detail:{date:dayButton.dataset.videoDay}})); return; }
      const mapButton = event.target.closest('[data-video-map]');
      if (mapButton) document.dispatchEvent(new CustomEvent('journey:show-candidate',{detail:{id:mapButton.dataset.videoMap}}));
    });
    renderVideoCandidates();
  }

  const flight = data.flight || {};
  $('#flight-content').innerHTML = array(flight.legs).map(leg => `<div class="flight-leg"><div class="flight-leg-head"><span>${esc(String(leg.date || '').replaceAll('-','.'))}${leg.weekday ? ` (${esc(leg.weekday)})` : ''}</span><span>CHINA EASTERN · ${esc(leg.number)}</span></div><div class="flight-airports"><div class="flight-airport"><strong>${esc(leg.departure)}</strong><span>${esc(leg.from)}</span><small>${esc(leg.fromTerminal)}</small></div><span class="flight-direction" aria-hidden="true">→</span><div class="flight-airport"><strong>${esc(leg.arrival)}</strong><span>${esc(leg.to)}</span><small>${esc(leg.toTerminal)}</small></div></div>${leg.note ? `<div class="flight-leg-note">${esc(leg.note)}</div>` : ''}</div>`).join('') + `${flight.baggage ? `<div class="reservation-meta"><p>${esc(flight.baggage)}</p></div>` : ''}`;

  const hotel = data.hotel || {};
  $('#hotel-content').innerHTML = `<h3>${esc(hotel.name)}</h3>${hotel.zh ? `<p class="hotel-zh" lang="zh-CN">${esc(hotel.zh)}</p>` : ''}${hotel.stay ? `<div class="hotel-stay"><strong>${esc(hotel.stay)}</strong></div>` : ''}${hotel.checkin || hotel.checkout ? `<div class="hotel-room">${hotel.checkin ? `체크인 ${esc(hotel.checkin)}` : ''}${hotel.checkin && hotel.checkout ? ' · ' : ''}${hotel.checkout ? `체크아웃 ${esc(hotel.checkout)}` : ''}</div>` : ''}${hotel.address ? `<div class="hotel-address"><span lang="zh-CN">${esc(hotel.address)}</span>${copyButton([hotel.zh,hotel.address].filter(Boolean).join('\n'))}</div>` : ''}<div class="reservation-link">${link(hotel.mapUrl,'호텔 고덕지도')}${hotel.phone ? `<a class="text-link" href="tel:${esc(hotel.phone.replaceAll(' ',''))}">${esc(hotel.phone)}</a>` : ''}</div>`;

  const simStores = data.simStores || {};
  const simFacts = store => [['운영시간',store.hours],['여권 개통',store.passport],['방문·예약',store.booking],['한국에서 유지',store.retention]].filter(([,value]) => value).map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('#sim-intro').textContent = simStores.intro || '';
  $('#sim-updated').textContent = simStores.updated ? `확인 ${String(simStores.updated).replaceAll('-','.')}` : '';
  $('#sim-caution').textContent = simStores.caution || '';
  $('#sim-caution').hidden = !simStores.caution;
  $('#sim-steps').innerHTML = array(simStores.steps).map((step,index) => `<li><span class="sim-step-number" aria-hidden="true">${String(index + 1).padStart(2,'0')}</span><div><h3>${esc(step.title)}</h3><p>${esc(step.body)}</p></div></li>`).join('');
  $('#sim-store-grid').innerHTML = array(simStores.stores).map((store,index) => {
    const phone = String(store.phone || '').replace(/[^+\d]/g,'');
    const sources = array(store.sources).map(source => link(source.url,source.label || '확인 근거')).filter(Boolean).join('');
    return `<article class="sim-store-card ${store.confirmed ? 'is-confirmed' : 'needs-check'}" aria-labelledby="sim-store-title-${index}"><div class="sim-store-topline"><span class="sim-store-index">${String(index + 1).padStart(2,'0')} / ${store.confirmed ? 'CONFIRMED SERVICE' : 'CHECK BEFORE VISITING'}</span><span class="pill ${store.confirmed ? '' : 'verify'}">${esc(store.status)}</span></div><h3 id="sim-store-title-${index}">${esc(store.name)}</h3>${store.zh ? `<p class="sim-store-zh" lang="zh-CN">${esc(store.zh)}</p>` : ''}${store.locationNote ? `<p class="sim-location-note">${esc(store.locationNote)}</p>` : ''}<div class="sim-store-address"><p lang="zh-CN">${esc(store.address)}</p>${copyButton([store.zh,store.address].filter(Boolean).join('\n'),'중문 주소 복사')}</div><div class="sim-store-actions">${link(store.mapUrl,'고덕지도')}${phone ? `<a class="text-link" href="tel:${esc(phone)}">${esc(store.phone)} <span aria-hidden="true">☎</span></a>` : ''}${link(store.bookingUrl,'개통 예약 안내')}</div><dl class="sim-store-facts">${simFacts(store)}</dl>${sources ? `<div class="sim-store-sources"><span>확인 자료</span>${sources}</div>` : ''}</article>`;
  }).join('');
  const simRequest = simStores.request || {};
  $('#sim-request').innerHTML = simRequest.title ? `<div><p class="eyebrow">ASK AT THE DESK</p><h3>${esc(simRequest.title)}</h3>${simRequest.body ? `<p>${esc(simRequest.body)}</p>` : ''}</div>${simRequest.copy ? `<div><details class="phrase-details"><summary>중문 요청 문장 보기</summary><p lang="zh-CN">${esc(simRequest.copy)}</p></details>${copyButton(simRequest.copy,'중문 요청 문장 복사')}</div>` : ''}` : '';
  $('#sim-request').hidden = !simRequest.title;

  const prep = array(data.prep);
  const prepDone = item => Object.prototype.hasOwnProperty.call(saved.checks,item.id) ? Boolean(saved.checks[item.id]) : Boolean(item.done);
  const groupOrder = [...new Set(prep.filter(item => !item.done).map(item => item.when || '출발 전')), ...new Set(prep.filter(item => item.done).map(item => item.when || '출발 전'))];
  $('#checklist').innerHTML = groupOrder.map(group => `<div class="checklist-group"><h3>${esc(group)}</h3>${prep.filter(item => (item.when || '출발 전') === group).map(item => `<div class="checklist-item ${prepDone(item) ? 'is-done' : ''}"><label class="checklist-main"><input type="checkbox" data-check-id="${esc(item.id)}" ${prepDone(item) ? 'checked' : ''}><span class="checklist-title">${esc(item.title)}</span></label>${item.detail ? `<p class="checklist-detail">${esc(item.detail)}</p>` : ''}${link(item.sourceUrl,'관련 안내')}</div>`).join('')}</div>`).join('');
  const updateProgress = () => {
    const completed = prep.filter(prepDone).length;
    const percent = prep.length ? Math.round(completed / prep.length * 100) : 0;
    $('#prep-count').textContent = `${completed} / ${prep.length}`;
    $('#prep-progress-fill').style.width = `${percent}%`;
    $('#prep-progressbar').setAttribute('aria-valuenow',String(percent));
    $('#prep-progressbar').setAttribute('aria-valuetext',`${prep.length}개 중 ${completed}개 준비 완료`);
  };
  updateProgress();
  $('#checklist').addEventListener('change', event => {
    const input = event.target.closest('[data-check-id]');
    if (!input) return;
    saved.checks[input.dataset.checkId] = input.checked;
    input.closest('.checklist-item').classList.toggle('is-done',input.checked);
    persist();
    updateProgress();
  });

  $('#practical-grid').innerHTML = array(data.practical).map((item,index) => `<article class="practical-card"><span>NOTE ${String(index + 1).padStart(2,'0')}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.copy ? `<details class="phrase-details"><summary>중문 문장 보기</summary><p lang="zh-CN">${esc(item.copy)}</p></details>${copyButton(item.copy,'중문 문장 복사')}` : ''}${item.link ? `<div>${link(item.link,item.label || '자세히 보기')}</div>` : ''}</article>`).join('');
  $('#source-list').innerHTML = array(data.sources).map(source => `<li>${url(source.url) ? `<a href="${esc(url(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>` : esc(source.title)}<span>${esc(source.date)}${source.note ? ` · ${esc(source.note)}` : ''}</span></li>`).join('');

  let toastTimer;
  const toast = message => {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'),3000);
  };
  const copy = async value => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement('textarea');
        const previousFocus = document.activeElement;
        input.value = value;
        input.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        const worked = document.execCommand('copy');
        input.remove();
        previousFocus?.focus({preventScroll:true});
        if (!worked) throw new Error('copy unavailable');
      }
      toast('중문을 복사했어요. 지도나 대화창에 붙여넣으세요.');
    } catch { toast('자동 복사가 어려워요. 표시된 중문을 길게 눌러 복사해 주세요.'); }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-copy]');
    if (button) copy(button.dataset.copy);
  });
  let printAccordionState = [];
  window.addEventListener('beforeprint',() => {
    if (printAccordionState.length) return;
    for (let ancestor = $('#reservations'); ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName !== 'DETAILS') continue;
      printAccordionState.push([ancestor,ancestor.open]);
      ancestor.open = true;
    }
  });
  window.addEventListener('afterprint',() => {
    printAccordionState.forEach(([element,wasOpen])=>{ element.open = wasOpen; });
    printAccordionState = [];
  });
  $('#print-button').addEventListener('click',() => window.print());

  const revealAnchor = (hash,scroll = false) => {
    if (!hash || hash === '#') return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
    if (scroll) window.requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'auto'}));
  };
  document.addEventListener('click',event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (anchor) revealAnchor(anchor.getAttribute('href'));
  });
  window.addEventListener('hashchange',()=>revealAnchor(window.location.hash,true));
  revealAnchor(window.location.hash,true);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('.site-header nav a').forEach(anchor => anchor.classList.toggle('current',anchor.getAttribute('href') === `#${visible.target.id}`));
    },{rootMargin:'-15% 0px -55% 0px',threshold:[0,.1,.3]});
    document.querySelectorAll('.site-header nav a[href^="#"]').forEach(anchor => { const section = document.getElementById(anchor.getAttribute('href').slice(1)); if (section) observer.observe(section); });
  }
})();
