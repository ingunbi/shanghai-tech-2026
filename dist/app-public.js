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

  if (meta.title) $('#hero-title').innerHTML = esc(meta.title).replace(', ', ',<br>');
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
  const stopAccessHTML = stop => {
    const access = stop.accessId ? array(data.experiences).find(experience => experience.id === stop.accessId)?.access : null;
    const content = accessHTML(access, 'h5');
    return content ? `<details class="stop-access"><summary>예약·한국 번호 확인 <span aria-hidden="true">＋</span></summary>${content}</details>` : '';
  };
  const stopHTML = stop => {
    const address = [stop.zh, stop.address].filter(Boolean).join('\n');
    return `<li class="timeline-stop"><div class="stop-time">${esc(stop.time)}</div><div class="stop-main"><div class="stop-topline"><h4 class="stop-title">${esc(stop.title)}</h4><div class="status-pills">${pill(stop.priority, true)}${pill(stop.type, true)}${pill(stop.status)}</div></div>${stop.detail ? `<p class="stop-detail">${esc(stop.detail)}</p>` : ''}${stop.zh ? `<div class="stop-zh" lang="zh-CN">${esc(stop.zh)}</div>` : ''}${stop.address ? `<div class="stop-address"><span lang="zh-CN">${esc(stop.address)}</span>${copyButton(address)}</div>` : address ? `<div class="stop-address">${copyButton(address)}</div>` : ''}<div class="stop-links">${link(stop.mapUrl,'고덕지도')}${link(stop.sourceUrl,'확인 자료')}</div>${stopAccessHTML(stop)}</div></li>`;
  };
  const dayHTML = (day, index, print = false) => `<div class="day-content-grid"><div class="day-summary"><p class="day-kicker">DAY ${String(index + 1).padStart(2,'0')} — ${esc(day.kicker)}</p><h3>${print ? `${esc(day.label)} (${esc(day.weekday)}) · ` : ''}${esc(day.title)}</h3><p>${esc(day.summary)}</p>${array(day.focus).length ? `<ul class="day-focus" aria-label="오늘의 핵심과 선택 일정">${day.focus.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${day.area ? `<span class="day-area">${esc(day.area)}</span>` : ''}${array(day.route).length ? `<div class="route-label">TODAY’S ROUTE</div><div class="day-route">${day.route.map(place => `<span>${esc(place)}</span>`).join('<i aria-hidden="true">→</i>')}</div>` : ''}${day.travelNote || day.weatherPlan ? `<div class="day-small-note">${day.travelNote ? `<strong>이동의 여유</strong>${esc(day.travelNote)}` : ''}${day.weatherPlan ? `<div class="weather-note"><strong>날씨가 달라지면</strong>${esc(day.weatherPlan)}</div>` : ''}</div>` : ''}</div><ol class="timeline" aria-label="${esc(day.label)} 상세 일정">${array(day.stops).map(stopHTML).join('')}</ol></div>${!print ? `<div class="day-note"><label for="daily-note">오늘의 작은 메모<span>이 브라우저에 자동 저장</span></label><textarea id="daily-note" data-note-date="${esc(day.date)}" placeholder="궁금한 기기, 방문 전 물어볼 것, 찍고 싶은 장면…" aria-label="${esc(day.label)} 여행 메모">${esc(saved.notes[day.date] || '')}</textarea></div>` : ''}`;

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
    $('#day-tabs').innerHTML = days.map((day,index) => `<button class="day-tab" type="button" role="tab" id="day-tab-${index}" aria-controls="day-panel" aria-selected="${index === activeDay}" tabindex="${index === activeDay ? 0 : -1}" data-day="${index}"><span class="day-tab-top"><span>DAY ${String(index + 1).padStart(2,'0')}</span><span>${esc(day.weekday)}</span></span><span class="day-tab-date">${esc(day.label)}</span><span class="day-tab-label">${esc(day.area)}</span>${day.date === today ? '<span class="day-tab-today">TODAY</span>' : ''}</button>`).join('');
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
  $('#print-button').addEventListener('click',() => window.print());

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('.site-header nav a').forEach(anchor => anchor.classList.toggle('current',anchor.getAttribute('href') === `#${visible.target.id}`));
    },{rootMargin:'-15% 0px -55% 0px',threshold:[0,.1,.3]});
    ['journey-map','itinerary','experiences','reservations','sim-stores','prepare'].forEach(id => { const section = document.getElementById(id); if (section) observer.observe(section); });
  }
})();
