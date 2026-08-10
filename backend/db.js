// backend/db.js  — server-safe persistent DB (better-sqlite3)
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Render 등에서 Persistent Disk를 /data에 마운트했다면 그 경로 사용
const useDataDir =
  process.env.NODE_ENV === 'production' && fs.existsSync('/data');

const DB_PATH = useDataDir
  ? path.resolve('/data', 'data.sqlite')           // 배포(디스크)용
  : path.resolve(__dirname, 'data.sqlite');        // 로컬/백엔드 폴더 고정

// DB 오픈 (동기, 안정)
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// 스키마 보장
db.exec(`
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
    extra_price INTEGER DEFAULT 12000,
    allowed_weekdays TEXT DEFAULT 'MON,TUE,WED,THU,FRI',
    start_date TEXT,
    end_date TEXT,
    application_start_at TEXT,
    application_end_at TEXT,
    sms_extra_text TEXT
  );
  INSERT OR IGNORE INTO policy(id, base_price, allowed_weekdays)
  VALUES (1, 9000, 'MON,TUE,WED,THU,FRI');

  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('LUNCH','DINNER')),
    portion TEXT NOT NULL DEFAULT 'BASE' CHECK (portion IN ('BASE','EXTRA')),
    price INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SELECTED','PAID')),
    carryover_coupon_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(student_id, date, slot),
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_orders_date_slot
    ON orders(date, slot, status);
  CREATE INDEX IF NOT EXISTS idx_orders_student_date
    ON orders(student_id, date);

  CREATE TABLE IF NOT EXISTS menu_images(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blackout(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('BOTH','LUNCH','DINNER'))
  );

  CREATE TABLE IF NOT EXISTS carryovers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    from_date TEXT NOT NULL,
    from_slot TEXT NOT NULL CHECK (from_slot IN ('LUNCH','DINNER')),
    to_date TEXT NOT NULL,
    to_slot TEXT NOT NULL CHECK (to_slot IN ('LUNCH','DINNER')),
    portion TEXT NOT NULL DEFAULT 'BASE' CHECK (portion IN ('BASE','EXTRA')),
    original_price INTEGER NOT NULL DEFAULT 0,
    source_order_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_carryovers_to_date_slot
    ON carryovers(to_date, to_slot);
  CREATE INDEX IF NOT EXISTS idx_carryovers_student_to_date
    ON carryovers(student_id, to_date);

  CREATE TABLE IF NOT EXISTS carryover_coupons(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    from_date TEXT NOT NULL,
    from_slot TEXT NOT NULL CHECK (from_slot IN ('LUNCH','DINNER')),
    portion TEXT NOT NULL DEFAULT 'BASE' CHECK (portion IN ('BASE','EXTRA')),
    original_price INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'ORDER' CHECK (source_type IN ('ORDER','PHONE')),
    source_order_id INTEGER,
    used_order_id INTEGER,
    used_at TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_carryover_coupons_student
    ON carryover_coupons(student_id, used_order_id);

  CREATE TABLE IF NOT EXISTS phone_orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('LUNCH','DINNER')),
    portion TEXT NOT NULL DEFAULT 'BASE' CHECK (portion IN ('BASE','EXTRA')),
    price INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('SELECTED','PAID')),
    memo TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(student_id, date, slot),
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_phone_orders_date_slot
    ON phone_orders(date, slot, status);
  CREATE INDEX IF NOT EXISTS idx_phone_orders_student_date
    ON phone_orders(student_id, date);
`);

// Existing databases need the coupon link column before server routes are registered.
const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
if (!orderColumns.some((column) => column.name === 'carryover_coupon_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN carryover_coupon_id INTEGER');
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_carryover_coupon
    ON orders(carryover_coupon_id) WHERE carryover_coupon_id IS NOT NULL
`);

const couponColumns = db.prepare('PRAGMA table_info(carryover_coupons)').all();
if (!couponColumns.some((column) => column.name === 'expires_at')) {
  db.exec('ALTER TABLE carryover_coupons ADD COLUMN expires_at TEXT');
  db.exec(`
    UPDATE carryover_coupons
       SET expires_at=datetime(created_at, '+31 days')
     WHERE expires_at IS NULL OR expires_at=''
  `);
}

// 헬퍼 (server.js와 시그니처 동일)
export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}
export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}
export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export default db;
