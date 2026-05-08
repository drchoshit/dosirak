import React, { useEffect, useState, useCallback } from "react";

export default function Print() {
  const [date, setDate] = useState("");

  // ?date= 파라미터 자동 반영
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date") || "";
    if (d) setDate(d);
  }, []);

  // 개별 셀 HTML
  const cellHtml = (item) => {
    if (!item) return "&nbsp;";
    const code = item.code ? ` <span class="code">(${item.code})</span>` : "";
    const portion = item.portion === "EXTRA" ? "EXTRA" : "BASE";
    const portionLabel = portion === "EXTRA" ? "곱빼기" : "일반";
    const portionBadge = ` <span class="portion ${portion === "EXTRA" ? "portion-extra" : "portion-base"}">${portionLabel}</span>`;
    const carryoverBadge =
      item.source === "CARRYOVER"
        ? ` <span class="badge-carryover">(이월)</span>`
        : "";
    const strongOpen = item.status === "PAID" ? "<strong>" : "";
    const strongClose = item.status === "PAID" ? "</strong>" : "";
    const badge =
      item.status === "PAID"
        ? ""
        : ` <span class="badge-unpaid unpaid">미결제</span>`;
    return `<span class="circle"></span>${strongOpen}${item.name}${code}${strongClose}${portionBadge}${carryoverBadge}${badge}`;
  };

  /**
   * 인쇄용 새 창 열기
   */
  const openPrintWindow = useCallback((payload, mode = "both") => {
    const { date, lunch = [], dinner = [], counts = {} } = payload || {};
    const lunchCount = counts.lunch_total ?? lunch.length;
    const dinnerCount = counts.dinner_total ?? dinner.length;

    const makeRowsTwoCols = () => {
      const len = Math.max(lunch.length, dinner.length);
      return Array.from({ length: len })
        .map((_, i) => {
          const L = lunch[i];
          const D = dinner[i];
          return `
            <tr>
              <td class="cell">${cellHtml(L)}</td>
              <td class="cell">${cellHtml(D)}</td>
            </tr>`;
        })
        .join("");
    };

    const makeRowsOneCol = (arr) => {
      const len = Math.max(arr.length, 15);
      return Array.from({ length: len })
        .map((_, i) => {
          const it = arr[i];
          return `<tr><td class="cell">${cellHtml(it)}</td></tr>`;
        })
        .join("");
    };

    const tablesHtml =
      mode === "both"
        ? `
      <table>
        <thead>
          <tr>
            <th>점심 리스트</th>
            <th>저녁 리스트</th>
          </tr>
        </thead>
        <tbody>
          ${makeRowsTwoCols() || '<tr><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td></tr>'}
        </tbody>
      </table>
    `
        : `
      <table class="single">
        <thead>
          <tr>
            <th>${mode === "lunch" ? "점심" : "저녁"} 리스트</th>
          </tr>
        </thead>
        <tbody>
          ${
            makeRowsOneCol(mode === "lunch" ? lunch : dinner) ||
            '<tr><td class="cell">&nbsp;</td></tr>'
          }
        </tbody>
      </table>
    `;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${date} 도시락 명단${mode !== "both" ? " - " + (mode === "lunch" ? "점심" : "저녁") : ""}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Pretendard,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:12mm;}
    .toolbar{margin-bottom:8mm; display:flex; gap:8px}
    .btn{
      display:inline-block; padding:14pt 22pt; font-size:14pt; font-weight:700;
      background:#111; color:#fff; border:none; border-radius:12px; cursor:pointer;
      box-shadow:0 10px 22px rgba(0,0,0,.12);
    }
    .btn-ghost{
      display:inline-block; padding:12pt 18pt; font-size:13pt; font-weight:700;
      background:#f6f7fb; color:#1f2937; border:1px solid #e5e7eb; border-radius:12px; cursor:pointer;
    }
    h1{font-size:22pt;margin:0 0 6pt 0}
    h2.counts{color:#374151; margin:0 0 12pt 0; font-size:13pt}
    .subtitle{color:#6b7280; margin-bottom:4mm; font-size:11pt}
    table{width:100%; border-collapse:collapse; table-layout:fixed;}
    th{font-size:15pt; text-align:center; padding:10pt 8pt; border:2px solid #999; background:#f7f7f9;}
    td.cell{font-size:13pt; padding:8pt 10pt; border:1px dashed #bbb; height:28pt; vertical-align:middle;}
    table.single td.cell { height:28pt; }
    .circle{width:12pt;height:12pt;border:1.5pt solid #777;border-radius:999px;display:inline-block;margin-right:8pt;vertical-align:middle}
    .code{color:#888;font-size:10pt}
    .badge-unpaid{
      display:inline-block; margin-left:8pt; padding:2pt 6pt; font-size:10pt; color:#8a2a2a;
      border:1px solid #e7baba; border-radius:6px; background:#fff2f2;
    }
    .portion{
      display:inline-block; margin-left:8pt; padding:2pt 6pt; font-size:9pt; color:#374151;
      border:1px solid #d7dde4; border-radius:6px; background:#f8fafc;
    }
    .portion-extra{
      border-color:#f2c2a7; background:#fff2e8; color:#a3542b;
    }
    .portion-base{
      border-color:#cfd8e3; background:#f5f7fa; color:#334155;
    }
    .badge-carryover{
      display:inline-block; margin-left:8pt; padding:2pt 6pt; font-size:10pt; font-weight:700; color:#065f46;
      border:1px solid #a7f3d0; border-radius:6px; background:#ecfdf5;
    }
    .hide-unpaid .badge-unpaid { display:none !important; }
    .hide-extra .portion-extra { display:none !important; }

    @media print {
      .toolbar{ display:none }
      body { padding:8mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">🖨️ 인쇄하기</button>
    <button class="btn-ghost" id="toggleUnpaidBtn">미결제 숨기기</button>
    <button class="btn-ghost" id="toggleExtraBtn">곱빼기 숨기기</button>
  </div>
  <h1>${date} 도시락 명단${mode !== "both" ? " — " + (mode === "lunch" ? "점심" : "저녁") : ""}</h1>
  <h2 class="counts">점심: ${lunchCount}명 / 저녁: ${dinnerCount}명</h2>
  ${
    mode === "both"
      ? `<div class="subtitle">양쪽 표가 동시에 인쇄됩니다. 필요한 경우 한쪽만 인쇄하려면 창을 닫고 점심/저녁 단일 버튼을 사용하세요.</div>`
      : ""
  }
  ${tablesHtml}

  <script>
    (function(){
      var hidden = false;
      var btn = document.getElementById('toggleUnpaidBtn');
      btn.addEventListener('click', function(){
        hidden = !hidden;
        document.body.classList.toggle('hide-unpaid', hidden);
        btn.textContent = hidden ? '미결제 보이기' : '미결제 숨기기';
      });

      var extraHidden = false;
      var extraBtn = document.getElementById('toggleExtraBtn');
      extraBtn.addEventListener('click', function(){
        extraHidden = !extraHidden;
        document.body.classList.toggle('hide-extra', extraHidden);
        extraBtn.textContent = extraHidden ? '곱빼기 보이기' : '곱빼기 숨기기';
      });
    })();
  </script>
</body>
</html>`);
    w.document.close();
  }, []);

  // 서버에서 데이터 받아 새 창 열기
  const openPrint = useCallback(
    async (mode = "both") => {
      if (!date) return alert("날짜를 선택하세요.");
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(date);
      if (!ok) return alert("형식이 올바르지 않습니다. 예) 2025-09-05");

      try {
        const res = await fetch(
          `/api/admin/print?date=${encodeURIComponent(date)}`,
          {
            method: "GET",
            credentials: "include", // ✅ 세션 쿠키 전송
          }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || "invalid response");
        openPrintWindow(data, mode);
      } catch (e) {
        console.error(e);
        alert("인쇄용 데이터를 불러오지 못했습니다.\n" + (e.message || e));
      }
    },
    [date, openPrintWindow]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get("auto");
    const modeParam = (params.get("mode") || "both").toLowerCase();
    const mode =
      modeParam === "lunch" || modeParam === "dinner" ? modeParam : "both";
    if (date && auto === "1") {
      const t = setTimeout(() => openPrint(mode), 50);
      return () => clearTimeout(t);
    }
  }, [date, openPrint]);

  return (
    <div className="card p-5">
      <h1 className="text-xl font-bold mb-3">날짜별 명단 인쇄</h1>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-xl px-3 py-2"
        />

        <button
          className="btn-primary text-lg px-6 py-3 rounded-xl"
          onClick={() => openPrint("both")}
        >
          🖨️ 양쪽 열기/인쇄
        </button>

        <button
          className="btn text-lg px-4 py-3 rounded-xl border"
          onClick={() => openPrint("lunch")}
        >
          점심 인쇄
        </button>

        <button
          className="btn text-lg px-4 py-3 rounded-xl border"
          onClick={() => openPrint("dinner")}
        >
          저녁 인쇄
        </button>
      </div>
    </div>
  );
}
