// backend/db.js
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

// DB 파일 경로
const DB_PATH = path.join(process.cwd(), "data.sqlite");

// sql.js 모듈 / DB 핸들 (싱글톤)
let SQL = null;
let db = null;

/**
 * DB 핸들 가져오기 (초기화 및 스키마/마이그레이션)
 */
export async function getDB() {
  if (db) return db;

  // sql.js 초기화
  SQL = await initSqlJs();

  // 기존 파일이 있으면 로드, 없으면 메모리에 새로 만들고 스키마 생성
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(buf));
    // 기존 파일도 마이그레이션 적용
    await runMigrations();
    await persist(); // 마이그레이션 반영
  } else {
    db = new SQL.Database();
    bootstrap();     // 신규 스키마
    await persist();
  }

  return db;
}

/**
 * 디스크에 영속화
 */
export async function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * 초기에 필요한 테이블/인덱스 생성
 * - students, policy, menu_images, orders, blackout
 * - policy에는 sms_extra_text 기본 포함
 */
function bootstrap() {
  db.run(`
    PRAGMA foreign_keys=ON;

    -- 학생
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

    -- 전역 정책 (id=1 고정)
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

    -- 메뉴 이미지
    CREATE TABLE IF NOT EXISTS menu_images(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    -- 주문(선택/결제) 기록
    CREATE TABLE IF NOT EXISTS orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,         -- 'LUNCH' | 'DINNER'
      price INTEGER NOT NULL,
      status TEXT NOT NULL,       -- 'SELECTED' | 'PAID'
      created_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_orders_date_slot
      ON orders(date, slot, status);
    CREATE INDEX IF NOT EXISTS idx_orders_student_date
      ON orders(student_id, date);

    -- 미제공(블랙아웃) 일자
    CREATE TABLE IF NOT EXISTS blackout(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      slot TEXT NOT NULL          -- 'BOTH' | 'LUNCH' | 'DINNER'
    );
  `);
}

/**
 * 마이그레이션:
 * - policy.sms_extra_text 없으면 추가
 */
async function runMigrations() {
  // table_info(policy) 조회
  const cols = await all("PRAGMA table_info(policy)");
  const hasSmsExtra = cols.some((c) => c.name === "sms_extra_text");

  if (!hasSmsExtra) {
    // sql.js도 ALTER TABLE ADD COLUMN 지원
    db.run(`ALTER TABLE policy ADD COLUMN sms_extra_text TEXT;`);
  }
}

/**
 * SELECT 다건
 */
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

/**
 * SELECT 단건
 */
export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

/**
 * 변경계 쿼리 (INSERT/UPDATE/DELETE 등)
 * - 실행 후 즉시 파일에 영속화
 */
export async function run(sql, params = []) {
  const d = await getDB();
  const stmt = d.prepare(sql);
  try {
    stmt.bind(params);
    // sql.js는 step() 한 번이면 단일 문 실행에 충분
    stmt.step();
  } finally {
    stmt.free();
  }
  await persist();
}
