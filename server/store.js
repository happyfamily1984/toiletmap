'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 과천시 + 안양시를 넉넉히 감싸는 영역 (위도/경도)
const REGION_BOUNDS = {
  minLat: 37.35,
  maxLat: 37.48,
  minLng: 126.86,
  maxLng: 127.05,
};

const LIMITS = {
  name: 40,
  address: 120,
  description: 500,
  password: 40,
};

function inRegion(lat, lng) {
  return (
    lat >= REGION_BOUNDS.minLat &&
    lat <= REGION_BOUNDS.maxLat &&
    lng >= REGION_BOUNDS.minLng &&
    lng <= REGION_BOUNDS.maxLng
  );
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/**
 * 입력값을 검증해 저장 가능한 형태로 돌려준다.
 * 잘못된 값이면 { error } 를 돌려준다.
 */
function validateToilet(input, { partial = false } = {}) {
  const out = {};

  if (!partial || input.name !== undefined) {
    out.name = cleanText(input.name, LIMITS.name);
    if (!out.name) return { error: '화장실 이름을 입력해 주세요.' };
  }
  if (!partial || input.address !== undefined) {
    out.address = cleanText(input.address, LIMITS.address);
  }
  if (!partial || input.description !== undefined) {
    out.description = cleanText(input.description, LIMITS.description);
  }
  if (!partial || input.password !== undefined) {
    out.password = cleanText(input.password, LIMITS.password);
  }
  if (!partial || input.lat !== undefined || input.lng !== undefined) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: '위치 정보가 올바르지 않습니다.' };
    }
    if (!inRegion(lat, lng)) {
      return { error: '과천·안양 지역만 등록할 수 있습니다.' };
    }
    out.lat = Math.round(lat * 1e7) / 1e7;
    out.lng = Math.round(lng * 1e7) / 1e7;
  }
  return { value: out };
}

/**
 * 아주 단순한 JSON 파일 저장소.
 * 동기 쓰기 + 임시파일 rename 으로 파일이 깨지지 않게 한다.
 */
class ToiletStore {
  constructor(file) {
    this.file = file;
    this.items = [];
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed.toilets) ? parsed.toilets : [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.items = [];
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ toilets: this.items }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.items;
  }

  get(id) {
    return this.items.find((t) => t.id === id) || null;
  }

  create(data) {
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
    this.items.push(item);
    this.save();
    return item;
  }

  update(id, data) {
    const item = this.get(id);
    if (!item) return null;
    Object.assign(item, data, { updatedAt: new Date().toISOString() });
    this.save();
    return item;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((t) => t.id !== id);
    if (this.items.length === before) return false;
    this.save();
    return true;
  }
}

module.exports = { ToiletStore, validateToilet, inRegion, REGION_BOUNDS };
