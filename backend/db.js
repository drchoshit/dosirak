// backend/db.js
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

// ✅ Render Persistent Disk 우선 사용
const DB_PATH =
  process.env.DB_PATH ||
  path.join("/data", "data.sqlite"); // /data는 Render Disk의 기본 마운트 경로

let SQL = null;
let db = null;

export async function getDB() {
  if (db) return db;
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(buf));
    await runMigrations();      // 기존 파일도 마이그레이션
    await persist();
  } else {
    // 폴더가 없을 수도 있으니 보장
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
    db = new SQL.Database();
    bootstrap();                // 신규 스키마
    await persist();
  }
  return db;
}

export async function persist() {
  if (!db) return;
  const data = db.export();
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// 초기 스키마
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

    -- ✅ updated_at 포함
    CREATE TABLE IF NOT EXISTS orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,
      price INTEGER NOT NULL,
      status TEXT NOT NULL,       -- 'SELECTED' | 'PAID'
      created_at TEXT NOT NULL,
      updated_at TEXT,            -- <- 새로 추가
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_orders_date_slot
      ON orders(date, slot, status);
    CREATE INDEX IF NOT EXISTS idx_orders_student_date
      ON orders(student_id, date);

    CREATE TABLE IF NOT EXISTS blackout(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      slot TEXT NOT NULL
    );

    -- (권장) 중복 신청 방지: 학생+날짜+슬롯 유니크
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_unique
      ON orders(student_id, date, slot);
  `);
}

// 마이그레이션: 누락 컬럼/인덱스 보강
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

  // orders 유니크 인덱스
  const idxRows = await all(`PRAGMA index_list('orders')`);
  const hasUx = idxRows.some(r => String(r.name || '').toLowerCase() === 'ux_orders_unique');
  if (!hasUx) {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_unique
            ON orders(student_id, date, slot);`);
  }
}

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

export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

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
