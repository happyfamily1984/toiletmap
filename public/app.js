(function () {
  'use strict';

  // 이 줌 레벨 이상이면 마커에 이름 + 비밀번호를 표시
  var LABEL_ZOOM = 16;
  // 이 줌 레벨 이상으로 확대해야 지도를 눌러 화장실을 등록할 수 있음
  var ADD_ZOOM = 16;
  var REGIONS = {
    gwacheon: { name: '과천', lat: 37.4292, lng: 126.9876 },
    anyang: { name: '안양', lat: 37.3943, lng: 126.9568 },
    uiwang: { name: '의왕', lat: 37.3447, lng: 126.9683 },
  };
  var DEFAULT_CENTER = { lat: 37.412, lng: 126.968 };

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    config: null,
    map: null,
    toilets: [],
    markers: {},
    tempMarker: null,
    myMarker: null,
    zones: null,       // 권역 데이터 (zones.json)
    zoneShapes: [],    // 지도에 그린 권역 폴리곤
    activeZone: null,  // 'salddeul' | 'finish' | null
    nearId: null,      // 내 근처: 가장 가까운 화장실 id
    routeLine: null,   // 내 근처: 경로 선
    labelMode: false,
    addMode: false,
    canEdit: false,    // 편집 코드(6511)로 접속했을 때만 true. 보기 코드(0000)는 false
  };

  // ---------------- 공통 ----------------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        // 관리자 API 의 401 은 멤버 로그아웃이 아님 (관리자 비밀번호만 다시 입력)
        if (res.status === 401 && url !== '/api/login' && url.indexOf('/api/admin/') !== 0) {
          showLogin();
        }
        if (!res.ok) {
          var err = new Error(data.error || '요청에 실패했습니다.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function fatal(html) {
    var el = $('fatal');
    el.innerHTML = html;
    el.hidden = false;
  }

  function inBounds(lat, lng) {
    var b = state.config.bounds;
    return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
  }

  // ---------------- 접속 코드 ----------------
  var pin = '';
  var loginBusy = false;

  function renderPin() {
    var dots = document.querySelectorAll('.pin-dots span');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('filled', i < pin.length);
    }
  }

  function pressKey(key) {
    if (loginBusy) return;
    if (key === 'back') {
      pin = pin.slice(0, -1);
    } else if (/^\d$/.test(key) && pin.length < 4) {
      pin += key;
    }
    $('login-error').textContent = '';
    renderPin();
    if (pin.length === 4) submitPin();
  }

  function submitPin() {
    loginBusy = true;
    api('POST', '/api/login', { code: pin })
      .then(function (data) {
        pin = '';
        renderPin();
        showMain(!!data.canEdit);
      })
      .catch(function (err) {
        pin = '';
        renderPin();
        $('login-error').textContent = err.message;
        var dots = document.querySelector('.pin-dots');
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
      })
      .then(function () { loginBusy = false; });
  }

  function setupLogin() {
    document.querySelector('.keypad').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-key]');
      if (btn) pressKey(btn.getAttribute('data-key'));
    });
    document.addEventListener('keydown', function (e) {
      if ($('login').hidden) return;
      if (/^\d$/.test(e.key)) pressKey(e.key);
      else if (e.key === 'Backspace') pressKey('back');
    });
  }

  function showLogin() {
    closeSheet();
    $('main').hidden = true;
    $('login').hidden = false;
  }

  // ---------------- 지도 ----------------
  function loadNaverMaps(clientId) {
    return new Promise(function (resolve, reject) {
      if (window.naver && window.naver.maps) return resolve();
      window.navermap_authFailure = function () {
        fatal('네이버 지도 인증에 실패했습니다.<br>네이버 클라우드 플랫폼에서 Client ID와<br>Web 서비스 URL 등록을 확인해 주세요.');
      };
      var s = document.createElement('script');
      s.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' +
        encodeURIComponent(clientId) + '&submodules=geocoder';
      s.onload = function () {
        // geocoder 서브모듈은 maps.js 뒤에 따로 불러와지므로 준비될 때까지 기다린다
        if (naver.maps.Service && naver.maps.Service.geocode) return resolve();
        naver.maps.onJSContentLoaded = resolve;
        setTimeout(resolve, 5000);
      };
      s.onerror = function () { reject(new Error('네이버 지도를 불러오지 못했습니다.')); };
      document.head.appendChild(s);
    });
  }

  function initMap() {
    var nm = naver.maps;
    var b = state.config.bounds;
    var pad = 0.05;
    state.map = new nm.Map('map', {
      center: new nm.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      zoom: 14,
      minZoom: 11,
      maxBounds: new nm.LatLngBounds(
        new nm.LatLng(b.minLat - pad, b.minLng - pad),
        new nm.LatLng(b.maxLat + pad, b.maxLng + pad)
      ),
      zoomControl: true,
      zoomControlOptions: { position: nm.Position.RIGHT_CENTER, style: nm.ZoomControlStyle.SMALL },
      mapDataControl: false,
      scaleControl: false,
      logoControlOptions: { position: nm.Position.BOTTOM_LEFT },
    });

    nm.Event.addListener(state.map, 'click', function (e) {
      $('menu').hidden = true;
      onMapClick(e.coord);
    });
    nm.Event.addListener(state.map, 'zoom_changed', function () {
      updateLabelMode();
      updateAddHint();
    });
    window.addEventListener('resize', function () {
      var el = $('map');
      state.map.setSize(new nm.Size(el.offsetWidth, el.offsetHeight));
    });
    updateLabelMode();

    setTimeout(function () {
      if (!state.addMode) $('hint').classList.add('fade');
    }, 5000);
  }

  // ---------------- 별점 ----------------
  var DEFAULT_RATING = 3;

  function ratingOf(t) {
    var r = Number(t && t.rating);
    return r >= 1 && r <= 5 ? r : DEFAULT_RATING;
  }

  function starsText(n) {
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  // 별 5개: 금색 + 왕관 + 반짝이, 별 4개: 금색
  function tierClass(t) {
    var r = ratingOf(t);
    return r === 5 ? ' tier5' : r === 4 ? ' tier4' : '';
  }

  var SPARKLES = '<span class="sparkle s1">✦</span><span class="sparkle s2">✦</span><span class="sparkle s3">✦</span>';

  function markerIcon(t) {
    var nm = naver.maps;
    var html;
    var isNear = state.nearId === t.id;
    var tier = tierClass(t);
    var rankBadge = isNear ? '<span class="near-tag">가장 가까움</span>' : '';
    var five = ratingOf(t) === 5;
    if (state.labelMode) {
      html = '<div class="label-marker' + tier + '">' +
        (five ? '<span class="crown">👑</span>' + SPARKLES : '') + rankBadge +
        '<div class="label-name">' + escapeHtml(t.name) + '</div>' +
        '<div class="label-stars">' + starsText(ratingOf(t)) + '</div>' +
        (t.password
          ? '<div class="label-pw">🔑 ' + escapeHtml(t.password) + '</div>'
          : '<div class="label-pw none">비밀번호 없음</div>') +
        '</div>';
    } else {
      html = '<div class="pin' + tier + '">' +
        (five ? '<span class="crown">👑</span>' + SPARKLES : '') + rankBadge +
        '<div class="pin-shape"><span>WC</span></div></div>';
    }
    return { content: html, anchor: new nm.Point(0, 0) };
  }

  function renderMarkers() {
    var nm = naver.maps;
    var seen = {};
    state.toilets.forEach(function (t) {
      seen[t.id] = true;
      var m = state.markers[t.id];
      var pos = new nm.LatLng(t.lat, t.lng);
      if (!m) {
        m = new nm.Marker({ map: state.map, position: pos, icon: markerIcon(t) });
        nm.Event.addListener(m, 'click', function () {
          var cur = findToilet(t.id);
          if (cur) showDetail(cur);
        });
        state.markers[t.id] = m;
      } else {
        m.setPosition(pos);
        m.setIcon(markerIcon(t));
      }
      m.setZIndex(state.nearId === t.id ? 300 : (state.labelMode ? 100 : 50));
    });
    Object.keys(state.markers).forEach(function (id) {
      if (!seen[id]) {
        state.markers[id].setMap(null);
        delete state.markers[id];
      }
    });
  }

  function updateLabelMode() {
    var labelMode = state.map.getZoom() >= LABEL_ZOOM;
    if (labelMode !== state.labelMode) {
      state.labelMode = labelMode;
      renderMarkers();
    }
  }

  function findToilet(id) {
    for (var i = 0; i < state.toilets.length; i++) {
      if (state.toilets[i].id === id) return state.toilets[i];
    }
    return null;
  }

  function loadToilets() {
    return api('GET', '/api/toilets').then(function (data) {
      state.toilets = data.toilets || [];
      renderMarkers();
    });
  }

  function setTempMarker(latlng) {
    var nm = naver.maps;
    if (!state.tempMarker) {
      state.tempMarker = new nm.Marker({
        map: state.map,
        position: latlng,
        zIndex: 200,
        icon: {
          content: '<div class="pin temp"><div class="pin-shape"><span>+</span></div></div>',
          anchor: new nm.Point(0, 0),
        },
      });
    } else {
      state.tempMarker.setPosition(latlng);
      state.tempMarker.setMap(state.map);
    }
  }

  function clearTempMarker() {
    if (state.tempMarker) state.tempMarker.setMap(null);
  }

  // ---------------- 주소 (네이버 지오코더) ----------------
  function hasGeocoder() {
    return !!(naver.maps.Service && naver.maps.Service.reverseGeocode);
  }

  function reverseGeocode(latlng) {
    return new Promise(function (resolve) {
      if (!hasGeocoder()) return resolve(null);
      var S = naver.maps.Service;
      S.reverseGeocode({
        coords: latlng,
        orders: [S.OrderType.ADDR, S.OrderType.ROAD_ADDR].join(','),
      }, function (status, response) {
        if (status !== S.Status.OK || !response || !response.v2) return resolve(null);
        var v2 = response.v2;
        var region = v2.results && v2.results[0] && v2.results[0].region;
        var area2 = region && region.area2 ? region.area2.name : '';
        var addr = v2.address || {};
        resolve({
          area2: area2,
          address: addr.roadAddress || addr.jibunAddress || '',
        });
      });
    });
  }

  function isServiceArea(area2) {
    return /^(과천시|안양시|의왕시)/.test(area2 || '');
  }

  // ---------------- 등록 모드 ----------------
  function setAddMode(on) {
    state.addMode = on;
    var btn = $('add-btn');
    btn.classList.toggle('active', on);
    btn.textContent = on ? '✕ 등록 취소' : '＋ 화장실 등록';
    if (!on) clearTempMarker();
    updateAddHint();
  }

  function updateAddHint() {
    var hint = $('hint');
    if (!state.addMode) {
      hint.classList.add('fade');
      return;
    }
    var need = ADD_ZOOM - state.map.getZoom();
    hint.textContent = need > 0
      ? '지도를 ' + need + '단계 더 확대해 주세요'
      : '등록할 위치를 지도에서 눌러 주세요';
    hint.classList.remove('fade');
  }

  function onMapClick(latlng) {
    // 등록 버튼을 누른 뒤, 충분히 확대된 상태에서만 등록
    if (!state.addMode) return;
    if (state.map.getZoom() < ADD_ZOOM) {
      toast('지도를 더 확대한 뒤 위치를 눌러 주세요');
      return;
    }
    var lat = latlng.lat();
    var lng = latlng.lng();
    if (!inBounds(lat, lng)) {
      toast('과천·안양·의왕 지역만 등록할 수 있어요');
      return;
    }
    setTempMarker(latlng);
    reverseGeocode(latlng).then(function (info) {
      if (info && info.area2 && !isServiceArea(info.area2)) {
        clearTempMarker();
        toast('과천·안양·의왕 지역만 등록할 수 있어요 (' + info.area2 + ')');
        return;
      }
      showForm({ lat: lat, lng: lng, address: info ? info.address : '' });
    });
  }

  // ---------------- 바텀시트 ----------------
  function openSheet(html) {
    $('sheet-body').innerHTML = html;
    $('sheet').hidden = false;
    $('sheet-backdrop').hidden = false;
    $('sheet').scrollTop = 0;
  }

  function closeSheet() {
    $('sheet').hidden = true;
    $('sheet-backdrop').hidden = true;
    $('sheet-body').innerHTML = '';
    if (state.tempMarker) clearTempMarker();
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }

  function showDetail(t) {
    clearTempMarker();
    openSheet(
      '<h2>' + escapeHtml(t.name) + '</h2>' +
      '<div class="stars">' + starsText(ratingOf(t)) + '</div>' +
      '<p class="address">' + escapeHtml(t.address || '주소 정보 없음') + '</p>' +
      '<div class="pw-box' + (t.password ? '' : ' none') + '">' +
        '<div><div class="k">비밀번호</div><div class="v">' +
          escapeHtml(t.password || '없음 / 개방') + '</div></div>' +
      '</div>' +
      '<p class="desc' + (t.description ? '' : ' none') + '">' +
        escapeHtml(t.description || '설명이 없습니다.') + '</p>' +
      '<p class="meta">최근 수정 ' + escapeHtml(formatDate(t.updatedAt)) + '</p>' +
      (state.canEdit
        ? '<div class="actions">' +
            '<button type="button" class="btn danger" data-act="delete">삭제</button>' +
            '<button type="button" class="btn primary" data-act="edit">수정</button>' +
          '</div>'
        : '<p class="view-only">보기 전용 접속이라 수정할 수 없어요</p>')
    );
    $('sheet-body').onclick = function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'edit') showForm(t);
      if (btn.getAttribute('data-act') === 'delete') deleteToilet(t);
    };
  }

  function showForm(t) {
    var editing = !!t.id;
    openSheet(
      '<h2>' + (editing ? '화장실 정보 수정' : '화장실 등록') + '</h2>' +
      '<form id="toilet-form" autocomplete="off">' +
        '<label class="field"><span>주소</span>' +
          '<input name="address" maxlength="120" value="' + escapeHtml(t.address) + '" placeholder="주소" /></label>' +
        '<label class="field"><span>화장실 이름 (비워두면 \'화장실\')</span>' +
          '<input name="name" maxlength="40" value="' + escapeHtml(t.name) + '" placeholder="예: ○○빌딩 2층 화장실" /></label>' +
        '<div class="field"><span>별점</span>' +
          '<div class="star-pick" id="star-pick">' +
            [1, 2, 3, 4, 5].map(function (n) {
              return '<button type="button" data-star="' + n + '" aria-label="별 ' + n + '개">★</button>';
            }).join('') +
          '</div>' +
          '<input type="hidden" name="rating" value="' + ratingOf(t) + '" /></div>' +
        '<label class="field"><span>비밀번호</span>' +
          '<input name="password" maxlength="40" value="' + escapeHtml(t.password) + '" placeholder="예: 1234* (없으면 비워두세요)" /></label>' +
        '<label class="field"><span>설명</span>' +
          '<textarea name="description" maxlength="500" placeholder="위치, 이용 시간, 청결도 등">' +
            escapeHtml(t.description) + '</textarea></label>' +
        '<p class="form-error" id="form-error"></p>' +
        '<div class="actions">' +
          '<button type="button" class="btn" data-act="cancel">취소</button>' +
          '<button type="submit" class="btn primary">저장</button>' +
        '</div>' +
      '</form>'
    );
    var form = $('toilet-form');
    function paintStars() {
      var r = Number(form.elements.rating.value);
      var btns = form.querySelectorAll('#star-pick button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', i < r);
    }
    paintStars();
    $('sheet-body').onclick = function (e) {
      var star = e.target.closest('button[data-star]');
      if (star) {
        form.elements.rating.value = star.getAttribute('data-star');
        paintStars();
        return;
      }
      var btn = e.target.closest('button[data-act="cancel"]');
      if (!btn) return;
      if (editing) showDetail(findToilet(t.id) || t);
      else closeSheet();
    };
    if (!editing) setTimeout(function () { form.elements.name.focus(); }, 200);

    form.onsubmit = function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var payload = {
        name: form.elements.name.value,
        address: form.elements.address.value,
        password: form.elements.password.value,
        description: form.elements.description.value,
        rating: Number(form.elements.rating.value),
        lat: t.lat,
        lng: t.lng,
      };
      submitBtn.disabled = true;
      var req = editing
        ? api('PUT', '/api/toilets/' + encodeURIComponent(t.id), payload)
        : api('POST', '/api/toilets', payload);
      req.then(function (data) {
        var saved = data.toilet;
        var idx = state.toilets.findIndex(function (x) { return x.id === saved.id; });
        if (idx >= 0) state.toilets[idx] = saved; else state.toilets.push(saved);
        clearTempMarker();
        if (!editing) setAddMode(false);
        renderMarkers();
        showDetail(saved);
        toast(editing ? '수정했어요' : '등록했어요');
      }).catch(function (err) {
        $('form-error').textContent = err.message;
        submitBtn.disabled = false;
      });
    };
  }

  // ---------------- 가입신청 ----------------
  var JOIN_PHONE = '010-7449-6511';

  function showApplyForm() {
    openSheet(
      '<h2>배민플러스 가입신청</h2>' +
      '<a class="call-link" href="tel:' + JOIN_PHONE + '">' +
        '<span class="ico">📞</span><span>전화로 바로 문의<small>' + JOIN_PHONE + '</small></span></a>' +
      '<form id="apply-form" autocomplete="off">' +
        '<label class="field"><span>이름 *</span><input name="name" maxlength="20" placeholder="홍길동" /></label>' +
        '<label class="field"><span>전화번호 *</span><input name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="010-1234-5678" /></label>' +
        '<div class="field"><span>희망 권역 *</span><div class="choice">' +
          '<label><input type="radio" name="zone" value="과천B" /><span class="gb">과천B</span></label>' +
          '<label><input type="radio" name="zone" value="동안A" /><span class="da">동안A</span></label>' +
        '</div></div>' +
        '<label class="field"><span>주 평균 수행 건수 (선택)</span><input name="weeklyCount" type="number" inputmode="numeric" min="0" max="2000" placeholder="예: 150" /></label>' +
        '<label class="field"><span>기타 하고 싶은 말</span><textarea name="message" maxlength="500" placeholder="문의 사항, 희망 시간대 등"></textarea></label>' +
        '<p class="form-error" id="form-error"></p>' +
        '<div class="actions">' +
          '<button type="button" class="btn" data-act="cancel">취소</button>' +
          '<button type="submit" class="btn primary">신청하기</button>' +
        '</div>' +
      '</form>'
    );
    var form = $('apply-form');
    form.oninput = function () { $('form-error').textContent = ''; };
    $('sheet-body').onclick = function (e) {
      if (e.target.closest('button[data-act="cancel"]')) closeSheet();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      var zone = form.querySelector('input[name="zone"]:checked');
      var payload = {
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        zone: zone ? zone.value : '',
        weeklyCount: form.elements.weeklyCount.value,
        message: form.elements.message.value,
      };
      if (!payload.name.trim()) { $('form-error').textContent = '이름을 입력해 주세요.'; return; }
      if (!payload.phone.trim()) { $('form-error').textContent = '전화번호를 입력해 주세요.'; return; }
      if (!payload.zone) { $('form-error').textContent = '희망 권역을 선택해 주세요.'; return; }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      api('POST', '/api/applications', payload).then(function () {
        closeSheet();
        toast('가입신청이 접수됐어요. 곧 연락드릴게요!');
      }).catch(function (err) {
        $('form-error').textContent = err.message;
        btn.disabled = false;
      });
    };
  }

  // ---------------- 관리자 (가입신청 확인) ----------------
  function formatDateTime(iso) {
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function formatPhone(p) {
    return p.length === 11 ? p.slice(0, 3) + '-' + p.slice(3, 7) + '-' + p.slice(7) : p;
  }

  function openAdmin() {
    api('GET', '/api/admin/session').then(function (s) {
      if (!s.enabled) {
        openSheet('<h2>관리자</h2><p class="empty">관리자 비밀번호가 아직 설정되지 않았어요.<br>Render 환경변수에 ADMIN_PASSWORD 를 넣어 주세요.</p>');
        $('sheet-body').onclick = null;
        return;
      }
      if (s.admin) showApplications(); else showAdminLogin();
    }).catch(function (err) { toast(err.message); });
  }

  function showAdminLogin() {
    openSheet(
      '<h2>관리자 로그인</h2>' +
      '<form id="admin-form" autocomplete="off">' +
        '<label class="field"><span>관리자 비밀번호</span>' +
          '<input name="password" type="password" inputmode="numeric" maxlength="20" placeholder="비밀번호" /></label>' +
        '<p class="form-error" id="form-error"></p>' +
        '<div class="actions">' +
          '<button type="button" class="btn" data-act="cancel">취소</button>' +
          '<button type="submit" class="btn primary">확인</button>' +
        '</div>' +
      '</form>'
    );
    var form = $('admin-form');
    setTimeout(function () { form.elements.password.focus(); }, 200);
    $('sheet-body').onclick = function (e) {
      if (e.target.closest('button[data-act="cancel"]')) closeSheet();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      api('POST', '/api/admin/login', { password: form.elements.password.value })
        .then(showApplications)
        .catch(function (err) {
          $('form-error').textContent = err.message;
          form.elements.password.value = '';
        });
    };
  }

  function showApplications() {
    api('GET', '/api/admin/applications').then(function (data) {
      var apps = data.applications || [];
      openSheet(
        '<h2>가입신청 ' + apps.length + '건</h2>' +
        '<div class="apps">' +
        (apps.length ? apps.map(function (a) {
          var zc = a.zone === '동안A' ? 'da' : 'gb';
          return '<div class="app-card">' +
            '<div class="top"><span class="nm">' + escapeHtml(a.name) + '</span>' +
              '<span class="zn ' + zc + '">' + escapeHtml(a.zone) + '</span></div>' +
            '<a class="ph" href="tel:' + escapeHtml(a.phone) + '">📞 ' + escapeHtml(formatPhone(a.phone)) + '</a>' +
            '<div class="meta2">' + (a.weeklyCount === null || a.weeklyCount === undefined ? '' : '주 평균 ' + Number(a.weeklyCount) + '건 · ') +
              escapeHtml(formatDateTime(a.createdAt)) + '</div>' +
            (a.message ? '<div class="msg">' + escapeHtml(a.message) + '</div>' : '') +
            '<button type="button" class="del" data-del="' + escapeHtml(a.id) + '">삭제</button>' +
          '</div>';
        }).join('') : '<p class="empty">아직 들어온 가입신청이 없어요.</p>') +
        '</div>' +
        '<div class="actions">' +
          '<button type="button" class="btn" data-act="admin-logout">관리자 로그아웃</button>' +
          '<button type="button" class="btn primary" data-act="close">닫기</button>' +
        '</div>'
      );
      $('sheet-body').onclick = function (e) {
        var del = e.target.closest('button[data-del]');
        if (del) {
          if (!confirm('이 가입신청을 삭제할까요?')) return;
          api('DELETE', '/api/admin/applications/' + encodeURIComponent(del.getAttribute('data-del')))
            .then(showApplications).catch(function (err) { toast(err.message); });
          return;
        }
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        if (btn.getAttribute('data-act') === 'close') closeSheet();
        if (btn.getAttribute('data-act') === 'admin-logout') {
          api('POST', '/api/admin/logout').then(function () { closeSheet(); toast('관리자 로그아웃했어요'); });
        }
      };
    }).catch(function (err) {
      if (err.status === 401) showAdminLogin(); else toast(err.message);
    });
  }

  function deleteToilet(t) {
    if (!confirm('"' + t.name + '" 화장실을 삭제할까요?')) return;
    api('DELETE', '/api/toilets/' + encodeURIComponent(t.id)).then(function () {
      state.toilets = state.toilets.filter(function (x) { return x.id !== t.id; });
      renderMarkers();
      closeSheet();
      toast('삭제했어요');
    }).catch(function (err) { toast(err.message); });
  }

  // ---------------- 내 위치 / 메뉴 ----------------
  // 내 위치 파란 점 표시
  function showMyLocation(latlng) {
    var nm = naver.maps;
    if (!state.myMarker) {
      state.myMarker = new nm.Marker({
        map: state.map,
        position: latlng,
        zIndex: 10,
        icon: {
          content: '<div style="width:16px;height:16px;border-radius:50%;background:#2f7cf6;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,124,246,.35);transform:translate(-50%,-50%)"></div>',
          anchor: new nm.Point(0, 0),
        },
      });
    } else {
      state.myMarker.setPosition(latlng);
    }
  }

  function getPosition(onOk) {
    if (!navigator.geolocation) return toast('위치 기능을 사용할 수 없어요');
    navigator.geolocation.getCurrentPosition(function (pos) {
      onOk(pos.coords.latitude, pos.coords.longitude);
    }, function () {
      toast('위치 권한을 허용해 주세요');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function locate() {
    getPosition(function (lat, lng) {
      if (!inBounds(lat, lng)) {
        toast('현재 위치가 과천·안양·의왕 밖이에요');
        return;
      }
      var latlng = new naver.maps.LatLng(lat, lng);
      showMyLocation(latlng);
      state.map.morph(latlng, LABEL_ZOOM);
    });
  }

  // ---------------- 내 근처 화장실 추천 ----------------
  // 두 지점 사이 거리(m)
  function distanceM(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDistance(m) {
    return m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(1) + 'km';
  }

  // 걷는 길 경로 (OpenStreetMap 기반 무료 경로 서비스, FOSSGIS). 실패하면 직선 점선으로 표시
  var ROUTE_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';

  function fetchWalkRoute(from, to) {
    var url = ROUTE_URL + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat + '?overview=full&geometries=geojson';
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('route ' + r.status);
      return r.json();
    }).then(function (data) {
      var route = data && data.routes && data.routes[0];
      if (!route || !route.geometry) throw new Error('no route');
      return {
        path: route.geometry.coordinates.map(function (c) { return { lat: c[1], lng: c[0] }; }),
        distance: route.distance,
      };
    });
  }

  function clearNearby() {
    state.nearId = null;
    if (state.routeLine) { state.routeLine.setMap(null); state.routeLine = null; }
    $('near-btn').classList.remove('active');
    renderMarkers();
  }

  function drawRoute(points, dashed) {
    var nm = naver.maps;
    if (state.routeLine) state.routeLine.setMap(null);
    state.routeLine = new nm.Polyline({
      map: state.map,
      path: points.map(function (p) { return new nm.LatLng(p.lat, p.lng); }),
      strokeColor: '#1f9d6b',
      strokeWeight: dashed ? 4 : 6,
      strokeOpacity: 0.85,
      strokeStyle: dashed ? 'shortdash' : 'solid',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      clickable: false,
      zIndex: 5,
    });
  }

  // 내 근처: 내 위치 표시 + 가장 가까운 화장실 1곳 표시 + 걷는 길 경로
  var NEAR_MAX_ZOOM = LABEL_ZOOM - 1; // 이름표가 나오기 직전 단계까지만 확대

  function nearby() {
    if (!state.map) return;
    if (state.nearId) return clearNearby(); // 다시 누르면 해제
    if (!state.toilets.length) return toast('아직 등록된 화장실이 없어요');
    toast('내 위치를 찾는 중…');
    getPosition(function (lat, lng) {
      var here = { lat: lat, lng: lng };
      showMyLocation(new naver.maps.LatLng(lat, lng));
      var best = null;
      state.toilets.forEach(function (t) {
        var d = distanceM(lat, lng, t.lat, t.lng);
        if (!best || d < best.d) best = { t: t, d: d };
      });
      state.nearId = best.t.id;
      $('near-btn').classList.add('active');
      renderMarkers();

      var dest = { lat: best.t.lat, lng: best.t.lng };
      var fit = function (points) {
        var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        points.forEach(function (p) {
          minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
          minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
        });
        state.map.fitBounds(
          new naver.maps.LatLngBounds(new naver.maps.LatLng(minLat, minLng), new naver.maps.LatLng(maxLat, maxLng)),
          { top: 190, right: 70, bottom: 200, left: 70 }
        );
        if (state.map.getZoom() > NEAR_MAX_ZOOM) state.map.setZoom(NEAR_MAX_ZOOM);
      };
      var say = function (meters, viaRoad) {
        var walk = Math.max(1, Math.round(meters / 67)); // 걸음 약 4km/h
        toast('가장 가까운 화장실: ' + best.t.name + ' · ' + (viaRoad ? '' : '직선 ') +
          formatDistance(meters) + ' (걸어서 약 ' + walk + '분)');
      };

      // 우선 직선 점선으로 바로 보여주고, 걷는 길 경로가 오면 바꿔 그림
      drawRoute([here, dest], true);
      fit([here, dest]);
      fetchWalkRoute(here, dest).then(function (route) {
        if (state.nearId !== best.t.id) return; // 그 사이 해제됨
        drawRoute(route.path, false);
        fit(route.path.concat([here, dest]));
        say(route.distance, true);
      }).catch(function () {
        if (state.nearId !== best.t.id) return;
        say(best.d, false);
      });
    });
  }

  // 안드로이드 앱의 뒤로가기 버튼: 열린 시트/메뉴를 먼저 닫는다
  window.toiletmapBack = function () {
    if (!$('promo').hidden) { $('promo').hidden = true; return true; }
    if (!$('sheet').hidden) { closeSheet(); return true; }
    if (state.addMode) { setAddMode(false); return true; }
    if (!$('menu').hidden) { $('menu').hidden = true; return true; }
    return false;
  };

  // ---------------- 권역 (살뜰 / 피니시) ----------------
  // 한 번에 하나의 권역만 표시. 같은 버튼을 다시 누르면 해제.
  var ZONE_KEY = 'toiletmap.zone';
  var ZONE_BTNS = { salddeul: 'zone-btn', finish: 'finish-btn' };

  function loadZones() {
    if (state.zones) return Promise.resolve(state.zones);
    return fetch('/zones.json').then(function (r) { return r.json(); }).then(function (z) {
      state.zones = z.zones;
      return state.zones;
    });
  }

  // 권역 전체를 하나의 영역으로 표시 (동별 구분 없음)
  function drawZone(zone) {
    var nm = naver.maps;
    // polygon = [외곽선, 구멍1, 구멍2 ...] (권역 안에 빠진 동은 구멍으로 비워 둠)
    zone.polygons.forEach(function (polygon) {
      state.zoneShapes.push(new nm.Polygon({
        map: state.map,
        paths: polygon.map(function (ring) {
          return ring.map(function (p) { return new nm.LatLng(p[0], p[1]); });
        }),
        fillColor: zone.color,
        fillOpacity: 0.18,
        strokeColor: zone.stroke,
        strokeOpacity: 0.7,
        strokeWeight: 2,
        clickable: false, // 등록 모드에서 지도 클릭이 그대로 통하도록
        zIndex: 1,
      }));
    });
  }

  function zoneBounds(zone) {
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    zone.polygons.forEach(function (polygon) {
      polygon[0].forEach(function (p) {
        minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
        minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]);
      });
    });
    return new naver.maps.LatLngBounds(
      new naver.maps.LatLng(minLat, minLng),
      new naver.maps.LatLng(maxLat, maxLng)
    );
  }

  function clearZoneShapes() {
    state.zoneShapes.forEach(function (s) { s.setMap(null); });
    state.zoneShapes = [];
  }

  // key: 'salddeul' | 'finish' | null(해제)
  function setZone(key, fit) {
    state.activeZone = key;
    Object.keys(ZONE_BTNS).forEach(function (k) {
      $(ZONE_BTNS[k]).classList.toggle('active', k === key);
    });
    try { localStorage.setItem(ZONE_KEY, key || ''); } catch (e) { /* 저장 안 돼도 무관 */ }
    clearZoneShapes();
    if (!key) return;
    loadZones().then(function (zones) {
      if (state.activeZone !== key || !zones[key]) return; // 그 사이 다른 권역으로 바뀜
      clearZoneShapes();
      drawZone(zones[key]);
      if (fit) state.map.fitBounds(zoneBounds(zones[key]), { top: 70, right: 20, bottom: 90, left: 20 });
    }).catch(function () { toast('권역 정보를 불러오지 못했어요'); });
  }

  function savedZone() {
    var v = null;
    try {
      v = localStorage.getItem(ZONE_KEY);
      // 예전 버전(살뜰 권역 켜기/끄기) 저장값 이어받기
      if (v === null && localStorage.getItem('toiletmap.zoneOn') === '1') v = 'salddeul';
    } catch (e) { /* 무시 */ }
    return ZONE_BTNS[v] ? v : null;
  }

  function setupMainUi() {
    $('locate-btn').addEventListener('click', locate);
    $('join-btn').addEventListener('click', showApplyForm);
    $('near-btn').addEventListener('click', nearby);
    // 프로모션 전단지
    document.querySelector('.promo-row').addEventListener('click', function (e) {
      var btn = e.target.closest('.promo-btn');
      if (!btn) return;
      var img = $('promo-img');
      img.alt = btn.getAttribute('data-title');
      img.src = '/api/promo/' + btn.getAttribute('data-promo');
      $('promo').hidden = false;
    });
    $('promo').addEventListener('click', function (e) {
      // 바깥 영역이나 ✕ 를 누르면 닫기
      if (e.target === $('promo') || e.target.closest('.promo-close')) $('promo').hidden = true;
    });
    $('promo-img').addEventListener('error', function () {
      if (!$('promo').hidden) {
        $('promo').hidden = true;
        toast('전단지를 불러오지 못했어요');
      }
    });
    Object.keys(ZONE_BTNS).forEach(function (k) {
      $(ZONE_BTNS[k]).addEventListener('click', function () {
        if (state.map) setZone(state.activeZone === k ? null : k, true);
      });
    });
    $('add-btn').addEventListener('click', function () {
      if (state.map) setAddMode(!state.addMode);
    });
    $('sheet-backdrop').addEventListener('click', closeSheet);
    $('menu-btn').addEventListener('click', function () {
      $('menu').hidden = !$('menu').hidden;
    });
    $('menu').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      $('menu').hidden = true;
      var region = btn.getAttribute('data-region');
      if (region && state.map) {
        var r = REGIONS[region];
        state.map.morph(new naver.maps.LatLng(r.lat, r.lng), 14);
      }
      if (btn.id === 'admin-btn') openAdmin();
      if (btn.id === 'logout-btn') {
        api('POST', '/api/logout').then(showLogin, showLogin);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });
  }

  // 카카오 애드핏 배너 (서버에 ADFIT_AD_UNIT 이 설정된 경우만)
  var adShown = false;
  function showAd() {
    var unit = state.config.adfitUnit;
    if (!unit || adShown) return;
    adShown = true;
    var bar = $('ad-bar');
    var ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.setAttribute('data-ad-unit', unit);
    ins.setAttribute('data-ad-width', '320');
    ins.setAttribute('data-ad-height', '50');
    bar.appendChild(ins);
    var sc = document.createElement('script');
    sc.async = true;
    sc.src = 'https://t1.daumcdn.net/kas/static/ba.min.js';
    bar.appendChild(sc);
    bar.hidden = false;
    $('main').classList.add('has-ad');
  }

  var mapReady = null;
  // 편집 권한에 따라 등록 버튼과 안내 문구를 바꾼다
  function applyRole(canEdit) {
    state.canEdit = canEdit;
    $('add-btn').hidden = !canEdit;
    if (!canEdit && state.addMode) setAddMode(false);
    var hint = $('hint');
    if (!state.addMode) {
      hint.textContent = canEdit
        ? '＋ 화장실 등록 버튼을 눌러 화장실을 추가할 수 있어요'
        : '보기 전용으로 접속했어요';
    }
  }

  function showMain(canEdit) {
    applyRole(!!canEdit);
    $('login').hidden = true;
    $('main').hidden = false;
    showAd();
    if (!mapReady) {
      mapReady = loadNaverMaps(state.config.naverClientId).then(initMap).then(function () {
        var saved = savedZone();
        if (saved) setZone(saved, false);
      });
    }
    mapReady
      .then(loadToilets)
      .catch(function (err) {
        if (err && err.status === 401) return;
        fatal(escapeHtml(err.message || '오류가 발생했습니다.'));
      });
  }

  // ---------------- 시작 ----------------
  function start() {
    setupLogin();
    setupMainUi();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }

    Promise.all([api('GET', '/api/config'), api('GET', '/api/session')])
      .then(function (r) {
        state.config = r[0];
        if (!state.config.naverClientId) {
          fatal('서버에 NAVER_MAP_CLIENT_ID 가 설정되지 않았습니다.');
          return;
        }
        if (r[1].authed) showMain(r[1].canEdit); else showLogin();
      })
      .catch(function () {
        fatal('서버에 연결할 수 없습니다.<br>인터넷 연결을 확인해 주세요.');
      });

    // 앱으로 돌아왔을 때 다른 사람이 수정한 내용 반영
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.map && !$('main').hidden) {
        loadToilets().catch(function () {});
      }
    });
  }

  start();
})();
