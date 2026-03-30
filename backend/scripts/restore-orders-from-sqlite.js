import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import dayjs from "dayjs";

function parseArgs(argv) {
  const out = {
    source: "",
    target: path.resolve(process.cwd(), "data.sqlite"),
    start: "",
    end: "",
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = String(argv[i] || "");
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    const [k, v] = a.split("=", 2);
    if (k === "--source") out.source = v || "";
    else if (k === "--target") out.target = v || "";
    else if (k === "--start") out.start = v || "";
    else if (k === "--end") out.end = v || "";
  }
  return out;
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function nowStamp() {
  return dayjs().format("YYYYMMDD_HHmmss");
}

function assertFileExists(p, label) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    throw new Error(`${label} 파일을 찾을 수 없습니다: ${abs}`);
  }
  return abs;
}

function normalizeStatus(raw) {
  const v = String(raw || "").toUpperCase();
  return v === "PAID" ? "PAID" : "SELECTED";
}

function normalizePortion(raw) {
  const v = String(raw || "").toUpperCase();
  return v === "EXTRA" ? "EXTRA" : "BASE";
}

function hasColumn(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => String(r?.name || "") === column);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.source) {
    throw new Error(
      "사용법: node scripts/restore-orders-from-sqlite.js --source=<백업DB> --start=YYYY-MM-DD --end=YYYY-MM-DD [--target=<현재DB>] [--dry-run]"
    );
  }
  if (!isYmd(args.start) || !isYmd(args.end)) {
    throw new Error("start/end는 YYYY-MM-DD 형식이어야 합니다.");
  }

  const sourcePath = assertFileExists(args.source, "source");
  const targetPath = assertFileExists(args.target, "target");
  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    throw new Error("source와 target DB는 서로 달라야 합니다.");
  }

  const sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const targetDb = new Database(targetPath, { fileMustExist: true });

  const sourceHasPortion = hasColumn(sourceDb, "orders", "portion");
  const sourceHasStatus = hasColumn(sourceDb, "orders", "status");
  const sourceHasCreatedAt = hasColumn(sourceDb, "orders", "created_at");
  const sourceHasUpdatedAt = hasColumn(sourceDb, "orders", "updated_at");
  const sourceRows = sourceDb
    .prepare(
      `
      SELECT
        s.code,
        s.name,
        o.date,
        o.slot,
        ${sourceHasPortion ? "o.portion" : "'BASE'"} AS portion,
        o.price,
        ${sourceHasStatus ? "o.status" : "'SELECTED'"} AS status,
        ${sourceHasCreatedAt ? "o.created_at" : "NULL"} AS created_at,
        ${sourceHasUpdatedAt ? "o.updated_at" : "NULL"} AS updated_at
      FROM orders o
      JOIN students s ON s.id = o.student_id
      WHERE o.date BETWEEN ? AND ?
      ORDER BY o.date, s.name, o.slot
      `
    )
    .all(args.start, args.end);

  const students = targetDb.prepare("SELECT id, code, name FROM students").all();
  const studentByCode = new Map(
    students.map((s) => [String(s.code || "").trim(), { id: Number(s.id), name: String(s.name || "") }])
  );

  const selectExisting = targetDb.prepare(
    "SELECT id, status FROM orders WHERE student_id=? AND date=? AND slot=?"
  );
  const targetHasUpdatedAt = hasColumn(targetDb, "orders", "updated_at");
  const insertOrder = targetHasUpdatedAt
    ? targetDb.prepare(
        `
        INSERT INTO orders(student_id, date, slot, portion, price, status, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?)
        `
      )
    : targetDb.prepare(
        `
        INSERT INTO orders(student_id, date, slot, portion, price, status, created_at)
        VALUES(?,?,?,?,?,?,?)
        `
      );
  const updateToPaid = targetDb.prepare(
    `
    UPDATE orders
    SET status='PAID',
        portion=?,
        price=?,
        updated_at=?
    WHERE id=?
    `
  );

  const report = {
    sourceRows: sourceRows.length,
    skippedNoStudent: 0,
    inserted: 0,
    upgradedToPaid: 0,
    unchanged: 0,
    missingStudents: [],
  };

  const tx = targetDb.transaction(() => {
    for (const row of sourceRows) {
      const code = String(row?.code || "").trim();
      if (!code || !studentByCode.has(code)) {
        report.skippedNoStudent += 1;
        if (code && !report.missingStudents.includes(code)) {
          report.missingStudents.push(code);
        }
        continue;
      }
      const studentId = studentByCode.get(code).id;
      const date = String(row?.date || "").trim();
      const slot = String(row?.slot || "").toUpperCase();
      if (!isYmd(date) || (slot !== "LUNCH" && slot !== "DINNER")) {
        report.unchanged += 1;
        continue;
      }

      const portion = normalizePortion(row?.portion);
      const status = normalizeStatus(row?.status);
      const price = Number(row?.price || 0);
      const createdAt = String(row?.created_at || "").trim() || dayjs().toISOString();
      const updatedAt = String(row?.updated_at || "").trim() || createdAt;

      const existing = selectExisting.get(studentId, date, slot);
      if (!existing?.id) {
        if (!args.dryRun) {
          if (targetHasUpdatedAt) {
            insertOrder.run(studentId, date, slot, portion, price, status, createdAt, updatedAt);
          } else {
            insertOrder.run(studentId, date, slot, portion, price, status, createdAt);
          }
        }
        report.inserted += 1;
        continue;
      }

      if (status === "PAID" && String(existing.status || "").toUpperCase() !== "PAID") {
        if (!args.dryRun) {
          updateToPaid.run(portion, price, dayjs().toISOString(), Number(existing.id));
        }
        report.upgradedToPaid += 1;
      } else {
        report.unchanged += 1;
      }
    }
  });

  let backupPath = "";
  if (!args.dryRun) {
    try {
      targetDb.pragma("wal_checkpoint(TRUNCATE)");
    } catch {}
    backupPath = path.join(path.dirname(targetPath), `data.before_restore.${nowStamp()}.sqlite`);
    fs.copyFileSync(targetPath, backupPath);
  }

  tx();
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: args.dryRun,
        sourcePath,
        targetPath,
        backupPath: backupPath || null,
        start: args.start,
        end: args.end,
        ...report,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(err?.message || err),
      },
      null,
      2
    )
  );
  process.exit(1);
}
