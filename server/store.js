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

const DEFAULT_NAME = '화장실';

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
    // 이름은 선택 사항. 비워 두면 '화장실'로 저장
    out.name = cleanText(input.name, LIMITS.name) || DEFAULT_NAME;
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
 * 아주 단순한 JSON 파일 저장소 (DATABASE_URL 이 없을 때, 로컬 실행용).
 * 동기 쓰기 + 임시파일 rename 으로 파일이 깨지지 않게 한다.
 */
class FileStore {
  constructor(file) {
    this.file = file;
    this.items = [];
  }

  async init() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
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

  async list() {
    return this.items;
  }

  async create(data) {
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
    this.items.push(item);
    this.save();
    return item;
  }

  async update(id, data) {
    const item = this.items.find((t) => t.id === id);
    if (!item) return null;
    Object.assign(item, data, { updatedAt: new Date().toISOString() });
    this.save();
    return item;
  }

  async remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((t) => t.id !== id);
    if (this.items.length === before) return false;
    this.save();
    return true;
  }
}

/**
 * PostgreSQL 저장소 (Neon 무료 DB 등). DATABASE_URL 이 있으면 사용한다.
 * 서버가 재시작/재배포돼도 데이터가 남는다.
 */
const PG_COLUMNS = ['name', 'address', 'description', 'password', 'lat', 'lng'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromRow(r) {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    description: r.description,
    password: r.password,
    lat: r.lat,
    lng: r.lng,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

class PgStore {
  constructor(connectionString) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000 });
    // Neon 무료 DB는 쉬는 동안 연결을 끊는다. 끊긴 연결 오류로 서버가 죽지 않게 한다.
    this.pool.on('error', (err) => console.error('DB 연결 오류:', err.message));
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS toilets (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        address text NOT NULL DEFAULT '',
        description text NOT NULL DEFAULT '',
        password text NOT NULL DEFAULT '',
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
  }

  async list() {
    const { rows } = await this.pool.query('SELECT * FROM toilets ORDER BY created_at');
    return rows.map(fromRow);
  }

  async create(data) {
    const { rows } = await this.pool.query(
      `INSERT INTO toilets (id, name, address, description, password, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [crypto.randomUUID(), data.name, data.address, data.description, data.password, data.lat, data.lng]
    );
    return fromRow(rows[0]);
  }

  async update(id, data) {
    if (!UUID_RE.test(id)) return null;
    const keys = PG_COLUMNS.filter((k) => data[k] !== undefined);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    sets.push('updated_at = now()');
    const { rows } = await this.pool.query(
      `UPDATE toilets SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...keys.map((k) => data[k])]
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async remove(id) {
    if (!UUID_RE.test(id)) return false;
    const { rowCount } = await this.pool.query('DELETE FROM toilets WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async close() {
    await this.pool.end();
  }
}

function createStore({ databaseUrl, dataFile }) {
  return databaseUrl ? new PgStore(databaseUrl) : new FileStore(dataFile);
}

module.exports = { createStore, validateToilet, inRegion, REGION_BOUNDS };
