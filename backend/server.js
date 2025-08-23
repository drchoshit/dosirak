import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { parse } from "csv-parse/sync";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { all, get, run } from "./db.js";
import crypto from "crypto";
import { fileURLToPath } from "url"; // ✅ __dirname 대체

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------- App & Middlewares ----------
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || true,
    credentials: true,
  })
);

// Uploads: folder & static
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------- DB Migration (sms_extra_text 자동) ----------
(async () => {
  try {
    const cols = await all("PRAGMA table_info(policy)");
    const hasCol = cols.some((c) => c.name === "sms_extra_text");
    if (!hasCol) {
      await run("ALTER TABLE policy ADD COLUMN sms_extra_text TEXT");
      console.log("DB migrated: sms_extra_text column added to policy table");
    }
  } catch (e) {
    console.error("DB migration check failed:", e);
  }
})();

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- Students: import/export & CRUD ----------
app.post(
  "/api/admin/students/import",
  express.text({ type: "text/csv" }),
  async (req, res) => {
    const records = parse(req.body, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    for (const r of records) {
      await run(
        `INSERT INTO students(code,name,allowed_weekdays,start_date,end_date,price_override)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET
           name=excluded.name,
           allowed_weekdays=excluded.allowed_weekdays,
           start_date=excluded.start_date,
           end_date=excluded.end_date,
           price_override=excluded.price_override`,
        [
          r.code,
          r.name,
          r.allowed_weekdays,
          r.start_date,
          r.end_date,
          r.price_override,
        ]
      );
    }
    res.json({ imported: records.length });
  }
);

app.get("/api/admin/students", async (_req, res) =>
  res.json(await all("SELECT * FROM students ORDER BY name"))
);

// Students CRUD
app.post("/api/admin/students", async (req, res) => {
  const { name, code, phone, parent_phone } = req.body || {};
  await run(
    "INSERT INTO students(name, code, phone, parent_phone) VALUES(?,?,?,?)",
    [name, code, phone || "", parent_phone || ""]
  );
  res.json({ ok: true });
});

app.put("/api/admin/students/:id", async (req, res) => {
  const { id } = req.params;
  const { name, code, phone, parent_phone } = req.body || {};
  await run(
    "UPDATE students SET name=?, code=?, phone=?, parent_phone=? WHERE id=?",
    [name, code, phone || "", parent_phone || "", id]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/students/:id", async (req, res) => {
  const { id } = req.params;
  await run("DELETE FROM students WHERE id=?", [id]);
  res.json({ ok: true });
});

// Export CSV
app.get("/api/admin/students/export", async (_req, res) => {
  const rows = await all(
    "SELECT name, code, phone, parent_phone FROM students ORDER BY name"
  );
  const header = "name,code,phone,parent_phone\n";
  const body = rows
    .map((r) =>
      [r.name, r.code, r.phone || "", r.parent_phone || ""]
        .map((v) => `"${String(v).replaceAll(`"`, `""`)}"`)
        .join(",")
    )
    .join("\n");
  const csv = header + body + "\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="students.csv"');
  res.send(csv);
});

// ---------- Global Policy ----------
app.get("/api/admin/policy", async (_req, res) =>
  res.json(await get("SELECT * FROM policy WHERE id=1"))
);

app.post("/api/admin/policy", async (req, res) => {
  const {
    base_price,
    allowed_weekdays,
    start_date,
    end_date,
    sms_extra_text,
  } = req.body || {};
  await run(
    "UPDATE policy SET base_price=?, allowed_weekdays=?, start_date=?, end_date=?, sms_extra_text=? WHERE id=1",
    [base_price, allowed_weekdays, start_date, end_date, sms_extra_text ?? null]
  );
  res.json({ ok: true });
});

// Per-student policy override
app.post("/api/admin/student-policy/:id", async (req, res) => {
  const { id } = req.params;
  const { allowed_weekdays, start_date, end_date, price_override } =
    req.body || {};
  await run(
    "UPDATE students SET allowed_weekdays=?, start_date=?, end_date=?, price_override=? WHERE id=?",
    [
      allowed_weekdays || null,
      start_date || null,
      end_date || null,
      price_override || null,
      id,
    ]
  );
  res.json({ ok: true });
});

// ---------- Blackout ----------
app.get("/api/admin/no-service-days", async (_req, res) => {
  const rows = await all("SELECT * FROM blackout ORDER BY date, slot");
  res.json(rows);
});

app.post("/api/admin/no-service-days", async (req, res) => {
  const { date, slot } = req.body || {};
  await run("INSERT INTO blackout(date, slot) VALUES(?,?)", [date, slot]);
  res.json({ ok: true });
});

app.delete("/api/admin/no-service-days/:id", async (req, res) => {
  const { id } = req.params;
  await run("DELETE FROM blackout WHERE id=?", [id]);
  res.json({ ok: true });
});

// ---------- Active Policy (Student Page) ----------
app.get("/api/policy/active", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: "code required" });

  const s = await get("SELECT * FROM students WHERE code=?", [code]);
  if (!s) return res.status(404).json({ error: "not found" });

  const g = await get("SELECT * FROM policy WHERE id=1");

  const rawAllowed =
    (s.allowed_weekdays && s.allowed_weekdays.trim()) ||
    (g.allowed_weekdays || "");
  const allowed = new Set(
    rawAllowed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );

  const toDate = (v) => (v ? new Date(v) : null);
  const gStart = toDate(g.start_date);
  const gEnd = toDate(g.end_date);
  const sStart = toDate(s.start_date);
  const sEnd = toDate(s.end_date);

  const effStart = [gStart, sStart]
    .filter(Boolean)
    .reduce((a, b) => (a && b ? (a > b ? a : b) : a || b), null);
  const effEnd = [gEnd, sEnd]
    .filter(Boolean)
    .reduce((a, b) => (a && b ? (a < b ? a : b) : a || b), null);

  const start_date = effStart
    ? dayjs(effStart).format("YYYY-MM-DD")
    : g.start_date || s.start_date || null;
  const end_date = effEnd
    ? dayjs(effEnd).format("YYYY-MM-DD")
    : g.end_date || s.end_date || null;

  const bl = await all("SELECT * FROM blackout");
  res.json({
    base_price: s.price_override ?? g.base_price,
    allowed_weekdays: Array.from(allowed),
    start_date,
    end_date,
    no_service_days: bl,
    student: { id: s.id, name: s.name, code: s.code },
  });
});

// ---------- Orders / Payments ----------
app.post("/api/orders/commit", async (req, res) => {
  const { code, items } = req.body || {};
  const s = await get("SELECT * FROM students WHERE code=?", [code]);
  if (!s) return res.status(404).json({ error: "student not found" });

  const now = dayjs().toISOString();
  for (const it of items || []) {
    await run(
      "INSERT INTO orders(student_id,date,slot,price,status,created_at) VALUES(?,?,?,?,?,?)",
      [s.id, it.date, it.slot, it.price, "SELECTED", now]
    );
  }
  res.json({ ok: true });
});

app.post("/api/payments/toss/confirm", async (req, res) => {
  const { paymentKey, orderId, amount, code, dateslots } = req.body || {};
  if (!paymentKey || !orderId || !amount)
    return res.status(400).json({ error: "missing fields" });
  try {
    const secretKey = process.env.TOSS_SECRET_KEY || "";
    const resp = await axios.post(
      "https://api.tosspayments.com/v1/payments/confirm",
      { paymentKey, orderId, amount },
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from(secretKey + ":").toString("base64"),
        },
      }
    );

    const s = await get("SELECT * FROM students WHERE code=?", [code]);
    if (s && Array.isArray(dateslots)) {
      for (const it of dateslots) {
        await run(
          'UPDATE orders SET status="PAID" WHERE student_id=? AND date=? AND slot=?',
          [s.id, it.date, it.slot]
        );
      }
    }
    res.json({ ok: true, receipt: resp.data });
  } catch (e) {
    res
      .status(400)
      .json({ error: "confirm_failed", detail: e?.response?.data || String(e) });
  }
});

// ---------- Weekly Summary ----------
app.get("/api/admin/weekly-summary", async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end)
    return res.status(400).json({ error: "start and end required" });

  const days = [];
  let cur = dayjs(start);
  const endD = dayjs(end);
  while (cur.isBefore(endD) || cur.isSame(endD)) {
    days.push(cur.format("YYYY-MM-DD"));
    cur = cur.add(1, "day");
  }

  const students = await all("SELECT id, name, code FROM students ORDER BY name");
  const orders = await all(
    "SELECT student_id, date, slot FROM orders WHERE status='SELECTED' AND date BETWEEN ? AND ?",
    [start, end]
  );

  const hasMap = new Map();
  orders.forEach((o) => {
    hasMap.set(`${o.student_id}|${o.date}|${o.slot}`, true);
  });

  const rows = students.map((s) => {
    const byDate = {};
    let count = 0;
    days.forEach((d) => {
      const lunch = !!hasMap.get(`${s.id}|${d}|LUNCH`);
      const dinner = !!hasMap.get(`${s.id}|${d}|DINNER`);
      if (lunch) count++;
      if (dinner) count++;
      byDate[d] = { LUNCH: lunch, DINNER: dinner };
    });
    return { id: s.id, name: s.name, code: s.code, count, byDate };
  });

  const applied = rows
    .filter((r) => r.count > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      count: r.count,
      items: days.flatMap((d) =>
        [
          r.byDate[d].LUNCH ? { date: d, slot: "LUNCH" } : null,
          r.byDate[d].DINNER ? { date: d, slot: "DINNER" } : null,
        ].filter(Boolean)
      ),
    }));
  const notApplied = rows
    .filter((r) => r.count === 0)
    .map(({ id, name, code }) => ({ id, name, code }));

  res.json({ start, end, days, rows, applied, notApplied });
});

// ---------- Attendance CSV ----------
app.get("/api/admin/attendance.csv", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date required" });

  const lunch = (
    await all(
      `SELECT students.name
       FROM orders JOIN students ON orders.student_id=students.id
       WHERE orders.date=? AND orders.slot='LUNCH' AND orders.status='PAID'
       ORDER BY students.name`,
      [date]
    )
  ).map((r) => r.name);

  const dinner = (
    await all(
      `SELECT students.name
       FROM orders JOIN students ON orders.student_id=students.id
       WHERE orders.date=? AND orders.slot='DINNER' AND orders.status='PAID'
       ORDER BY students.name`,
      [date]
    )
  ).map((r) => r.name);

  const header = "slot,name\n";
  const body =
    lunch.map((n) => `LUNCH,"${n.replaceAll(`"`, `""`)}"`).join("\n") +
    (lunch.length && dinner.length ? "\n" : "") +
    dinner.map((n) => `DINNER,"${n.replaceAll(`"`, `""`)}"`).join("\n");
  const csv = header + body + "\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="attendance_${date}.csv"`
  );
  res.send(csv);
});

// ---------- Menu Images ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage });

app.post("/api/admin/menu-images", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "파일이 없습니다." });
  const url = `/uploads/${path.basename(req.file.path)}`;
  const now = dayjs().toISOString();
  await run("INSERT INTO menu_images(url, uploaded_at) VALUES(?,?)", [url, now]);
  const row = await get(
    "SELECT * FROM menu_images WHERE url=? ORDER BY id DESC LIMIT 1",
    [url]
  );
  res.json(row || { url });
});

app.get("/api/menu-images", async (_req, res) => {
  const rows = await all(
    "SELECT * FROM menu_images ORDER BY uploaded_at DESC LIMIT 5"
  );
  res.json(rows);
});

app.get("/api/admin/menu-images", async (_req, res) => {
  const rows = await all("SELECT * FROM menu_images ORDER BY uploaded_at DESC");
  res.json(rows);
});

app.delete("/api/admin/menu-images/:id", async (req, res) => {
  const row = await get("SELECT * FROM menu_images WHERE id=?", [req.params.id]);
  if (row) {
    const filepath = path.join(UPLOAD_DIR, path.basename(row.url));
    try {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch {}
    await run("DELETE FROM menu_images WHERE id=?", [req.params.id]);
  }
  res.json({ ok: true });
});

// ---------- SMS ----------
const onlyDigits = (s = "") => String(s).replace(/\D/g, "");
function createSolapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

app.post("/api/sms/summary", async (req, res) => {
  try {
    const { to, code, items, total, name } = req.body || {};
    if (!to || !code || !Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const s = await get("SELECT * FROM students WHERE code=?", [code]);
    if (!s) return res.status(404).json({ ok: false, error: "student not found" });

    const g = await get("SELECT sms_extra_text FROM policy WHERE id=1");
    const policyExtra = (g?.sms_extra_text ?? "").toString().trim();

    const dest = onlyDigits(to);
    const sender = onlyDigits(process.env.COOLSMS_SENDER || "");
    if (!sender) return res.status(400).json({ ok: false, error: "MISSING_SENDER" });
    if (dest.length < 9) return res.status(400).json({ ok: false, error: "INVALID_TO_NUMBER" });

    const lines = (items || [])
      .map((it) => `${it.date} ${it.slot === "LUNCH" ? "점심" : "저녁"}`)
      .join(", ");

    let text =
      `[도시락 신청 결과]\n` +
      `학생: ${name || s.name}\n` +
      `내역: ${lines}\n` +
      `합계: ${Number(total || 0).toLocaleString()}원`;

    if (policyExtra) {
      const clipped = policyExtra.slice(0, 500);
      text += `\n\n※ 안내\n${clipped}`;
    }

    const apiKey = process.env.COOLSMS_API_KEY;
    const apiSecret = process.env.COOLSMS_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ ok: false, error: "MISSING_API_KEYS" });
    }

    const authHeader = createSolapiAuthHeader(apiKey, apiSecret);
    const payload = { message: { to: dest, from: sender, text } };

    const resp = await axios.post(
      "https://api.solapi.com/messages/v4/send",
      payload,
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ ok: true, result: resp.data });
  } catch (e) {
    const detail = e?.response?.data || String(e);
    console.error("SMS_SEND_ERROR:", detail);
    return res.status(400).json({ ok: false, error: detail });
  }
});

// ---------- ✅ 정적 파일 서빙 & SPA 폴백 (API 뒤에 위치해야 함) ----------
const PUBLIC_DIR = path.join(__dirname, "public");
console.log("[STATIC] PUBLIC_DIR =", PUBLIC_DIR);
console.log("[STATIC] exists(public)     =", fs.existsSync(PUBLIC_DIR));
console.log("[STATIC] exists(index.html) =", fs.existsSync(path.join(PUBLIC_DIR, "index.html")));

// 정적 파일 서빙
app.use(express.static(PUBLIC_DIR));

// SPA에서 직접 진입하는 경로들 명시 처리
const SPA_ROUTES = ["/", "/admin", "/admin/print", "/payment/success", "/payment/fail"];
SPA_ROUTES.forEach((routePath) => {
  app.get(routePath, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
});

// 그 외에도 /api 로 시작하지 않는 모든 경로는 SPA 폴백
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ---------- Start Server ----------
const port = process.env.PORT || 5000;
console.log("Starting server, PORT =", port);
console.log("Serving static from:", PUBLIC_DIR);

app.listen(port, () => console.log("Server started on port", port));
