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
    zone: null,        // 살뜰 권역 데이터 (zone.json)
    zoneShapes: [],    // 지도에 그린 권역 폴리곤
    zoneOn: false,
    labelMode: false,
    addMode: false,
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
        if (res.status === 401 && url !== '/api/login') {
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
      .then(function () {
        pin = '';
        renderPin();
        showMain();
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

  function markerIcon(t) {
    var nm = naver.maps;
    var html;
    if (state.labelMode) {
      html = '<div class="label-marker">' +
        '<div class="label-name">' + escapeHtml(t.name) + '</div>' +
        (t.password
          ? '<div class="label-pw">🔑 ' + escapeHtml(t.password) + '</div>'
          : '<div class="label-pw none">비밀번호 없음</div>') +
        '</div>';
    } else {
      html = '<div class="pin"><div class="pin-shape"><span>WC</span></div></div>';
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
      m.setZIndex(state.labelMode ? 100 : 50);
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
      '<p class="address">' + escapeHtml(t.address || '주소 정보 없음') + '</p>' +
      '<div class="pw-box' + (t.password ? '' : ' none') + '">' +
        '<div><div class="k">비밀번호</div><div class="v">' +
          escapeHtml(t.password || '없음 / 개방') + '</div></div>' +
      '</div>' +
      '<p class="desc' + (t.description ? '' : ' none') + '">' +
        escapeHtml(t.description || '설명이 없습니다.') + '</p>' +
      '<p class="meta">최근 수정 ' + escapeHtml(formatDate(t.updatedAt)) + '</p>' +
      '<div class="actions">' +
        '<button type="button" class="btn danger" data-act="delete">삭제</button>' +
        '<button type="button" class="btn primary" data-act="edit">수정</button>' +
      '</div>'
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
    $('sheet-body').onclick = function (e) {
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
  function locate() {
    if (!navigator.geolocation) return toast('위치 기능을 사용할 수 없어요');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var nm = naver.maps;
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      if (!inBounds(lat, lng)) {
        toast('현재 위치가 과천·안양·의왕 밖이에요');
        return;
      }
      var latlng = new nm.LatLng(lat, lng);
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
      state.map.morph(latlng, LABEL_ZOOM);
    }, function () {
      toast('위치 권한을 허용해 주세요');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  // 안드로이드 앱의 뒤로가기 버튼: 열린 시트/메뉴를 먼저 닫는다
  window.toiletmapBack = function () {
    if (!$('sheet').hidden) { closeSheet(); return true; }
    if (state.addMode) { setAddMode(false); return true; }
    if (!$('menu').hidden) { $('menu').hidden = true; return true; }
    return false;
  };

  // ---------------- 살뜰 권역 ----------------
  var ZONE_KEY = 'toiletmap.zoneOn';

  function loadZone() {
    if (state.zone) return Promise.resolve(state.zone);
    return fetch('/zone.json').then(function (r) { return r.json(); }).then(function (z) {
      state.zone = z;
      return z;
    });
  }

  // 권역 전체를 하나의 영역으로 표시 (동별 구분 없음)
  function drawZone(z) {
    var nm = naver.maps;
    z.polygons.forEach(function (ring) {
      state.zoneShapes.push(new nm.Polygon({
        map: state.map,
        paths: [ring.map(function (p) { return new nm.LatLng(p[0], p[1]); })],
        fillColor: '#ff5fa2',
        fillOpacity: 0.18,
        strokeColor: '#ff3d8b',
        strokeOpacity: 0.7,
        strokeWeight: 2,
        clickable: false, // 등록 모드에서 지도 클릭이 그대로 통하도록
        zIndex: 1,
      }));
    });
  }

  function zoneBounds(z) {
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    z.polygons.forEach(function (ring) {
      ring.forEach(function (p) {
        minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
        minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]);
      });
    });
    return new naver.maps.LatLngBounds(
      new naver.maps.LatLng(minLat, minLng),
      new naver.maps.LatLng(maxLat, maxLng)
    );
  }

  function setZone(on, fit) {
    state.zoneOn = on;
    $('zone-btn').classList.toggle('active', on);
    try { localStorage.setItem(ZONE_KEY, on ? '1' : '0'); } catch (e) { /* 저장 안 돼도 무관 */ }
    if (!on) {
      state.zoneShapes.forEach(function (s) { s.setMap(null); });
      state.zoneShapes = [];
      return;
    }
    loadZone().then(function (z) {
      if (!state.zoneOn || state.zoneShapes.length) return;
      drawZone(z);
      if (fit) state.map.fitBounds(zoneBounds(z), { top: 70, right: 20, bottom: 90, left: 20 });
    }).catch(function () { toast('권역 정보를 불러오지 못했어요'); });
  }

  function setupMainUi() {
    $('locate-btn').addEventListener('click', locate);
    $('zone-btn').addEventListener('click', function () {
      if (state.map) setZone(!state.zoneOn, true);
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
  function showMain() {
    $('login').hidden = true;
    $('main').hidden = false;
    showAd();
    if (!mapReady) {
      mapReady = loadNaverMaps(state.config.naverClientId).then(initMap).then(function () {
        var saved = null;
        try { saved = localStorage.getItem(ZONE_KEY); } catch (e) { /* 무시 */ }
        if (saved === '1') setZone(true, false);
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
        if (r[1].authed) showMain(); else showLogin();
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
