// backend/db.js
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

// ✅ 안전한 저장 경로 결정: /data(디스크) 있으면 사용, 없으면 앱 폴더
const PERSIST_DIR = process.env.DB_DIR
  || (fs.existsSync("/data") ? "/data" : process.cwd());
const DB_PATH = process.env.DB_PATH || path.join(PERSIST_DIR, "data.sqlite");

let SQL = null;
let db = null;

/** DB 핸들 (초기화 + 스키마/마이그레이션) */
export async function getDB() {
  if (db) return db;

  // sql.js 초기화
  SQL = await initSqlJs();

  // 디렉토리 보장
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(buf));
    await runMigrations();   // 기존 파일에도 마이그레이션 적용
    await persist();
  } else {
    db = new SQL.Database();
    bootstrap();             // 신규 스키마
    await persist();
  }
  return db;
}

/** 디스크에 저장 */
export async function persist() {
  if (!db) return;
  // 디렉토리 보장(재확인)
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** 최초 스키마 */
function bootstrap() {
  db.run(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS students(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      parent_phone TEXT,
      allowed_weekdays TEXT,
      start_date TEXT,
      end_date TEXT,
      price_override INTEGER
    );

    CREATE TABLE IF NOT EXISTS policy(
      id INTEGER PRIMARY KEY CHECK (id=1),
      base_price INTEGER DEFAULT 9000,
      allowed_weekdays TEXT DEFAULT 'MON,TUE,WED,THU,FRI',
      start_date TEXT,
      end_date TEXT,
      sms_extra_text TEXT
    );
    INSERT OR IGNORE INTO policy(id, base_price, allowed_weekdays)
    VALUES (1, 9000, 'MON,TUE,WED,THU,FRI');

    CREATE TABLE IF NOT EXISTS menu_images(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,         -- 'LUNCH' | 'DINNER'
      price INTEGER NOT NULL,
      status TEXT NOT NULL,       -- 'SELECTED' | 'PAID'
      created_at TEXT NOT NULL,
      updated_at TEXT,            -- ✅
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_orders_date_slot
      ON orders(date, slot, status);
    CREATE INDEX IF NOT EXISTS idx_orders_student_date
      ON orders(student_id, date);

    CREATE TABLE IF NOT EXISTS blackout(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      slot TEXT NOT NULL          -- 'BOTH' | 'LUNCH' | 'DINNER'
    );

    -- ✅ 학생+날짜+슬롯 중복 방지
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_unique
      ON orders(student_id, date, slot);
  `);
}

/** 마이그레이션 */
async function runMigrations() {
  // policy.sms_extra_text
  const policyCols = await all("PRAGMA table_info(policy)");
  if (!policyCols.some(c => c.name === "sms_extra_text")) {
    db.run(`ALTER TABLE policy ADD COLUMN sms_extra_text TEXT;`);
  }

  // orders.updated_at
  const orderCols = await all("PRAGMA table_info(orders)");
  if (!orderCols.some(c => c.name === "updated_at")) {
    db.run(`ALTER TABLE orders ADD COLUMN updated_at TEXT;`);
  }

  // 유니크 인덱스
  const idxs = await all(`PRAGMA index_list('orders')`);
  const hasUx = idxs.some(r => String(r.name || '').toLowerCase() === 'ux_orders_unique');
  if (!hasUx) {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_unique
            ON orders(student_id, date, slot);`);
  }
}

/** SELECT 다건 */
export async function all(sql, params = []) {
  const d = await getDB();
  const stmt = d.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

/** SELECT 단건 */
export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

/** 변경계 실행 후 즉시 영속화 */
export async function run(sql, params = []) {
  const d = await getDB();
  const stmt = d.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
  await persist();
}
