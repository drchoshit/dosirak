import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const SLOT_LABEL = { LUNCH: "점심", DINNER: "저녁" };

export default function AdditionalOrders() {
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ start: "", end: "", q: "" });
  const [form, setForm] = useState({
    code: "",
    date: "",
    slot: "LUNCH",
    paid: false,
    memo: "",
  });

  const studentOptions = useMemo(
    () =>
      students
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko")),
    [students]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.start) params.set("start", filters.start);
      if (filters.end) params.set("end", filters.end);
      if (filters.q.trim()) params.set("q", filters.q.trim());
      const res = await api.get(
        "/admin/phone-orders" + (params.toString() ? `?${params.toString()}` : "")
      );
      setRows(res.data?.rows || []);
    } catch (e) {
      console.error(e);
      alert("추가 신청자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get("/admin/students");
        const list = Array.isArray(s.data) ? s.data : [];
        setStudents(list);
        setForm((v) => ({ ...v, code: v.code || list[0]?.code || "" }));
      } catch (e) {
        console.error(e);
        alert("학생 목록을 불러오지 못했습니다.");
      }
    })();
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.code || !form.date || !form.slot) {
      alert("학생, 날짜, 구분을 모두 선택하세요.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/phone-orders", form);
      setForm((v) => ({ ...v, date: "", slot: "LUNCH", paid: false, memo: "" }));
      await loadRows();
      alert("추가 신청을 저장했습니다.");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "저장 실패";
      alert("저장 실패: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm("이 추가 신청을 삭제할까요?")) return;
    try {
      await api.delete(`/admin/phone-orders/${id}`);
      await loadRows();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "삭제 실패";
      alert("삭제 실패: " + msg);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">추가 신청자 관리</h1>
            <div className="mt-1 text-sm text-slate-500">
              신청 기간 이후 전화로 접수한 도시락을 수동으로 추가합니다. 저장된 식수는 인쇄 명단의 해당 날짜와 구분에 반영됩니다.
            </div>
          </div>
          <a className="btn-ghost" href="/admin/orders">
            신청 리스트
          </a>
        </div>

        <form
          className="mt-5 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_auto_auto] gap-3 items-end"
          onSubmit={submit}
        >
          <label className="text-sm">
            학생
            <select
              className="mt-1 input"
              value={form.code}
              onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
            >
              {studentOptions.map((s) => (
                <option key={s.id || s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            날짜
            <input
              type="date"
              className="mt-1 input"
              value={form.date}
              onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            구분
            <select
              className="mt-1 input"
              value={form.slot}
              onChange={(e) => setForm((v) => ({ ...v, slot: e.target.value }))}
            >
              <option value="LUNCH">점심</option>
              <option value="DINNER">저녁</option>
            </select>
          </label>
          <label className="h-10 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.paid}
              onChange={(e) => setForm((v) => ({ ...v, paid: e.target.checked }))}
            />
            입금 완료
          </label>
          <button className="btn-primary h-10" disabled={saving}>
            {saving ? "저장 중..." : "추가"}
          </button>
          <label className="text-sm md:col-span-5">
            메모
            <input
              className="mt-1 input"
              placeholder="예: 전화 신청, 입금 확인 예정"
              value={form.memo}
              onChange={(e) => setForm((v) => ({ ...v, memo: e.target.value }))}
            />
          </label>
        </form>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm">
            시작일
            <input
              type="date"
              className="mt-1 input"
              value={filters.start}
              onChange={(e) => setFilters((v) => ({ ...v, start: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              type="date"
              className="mt-1 input"
              value={filters.end}
              onChange={(e) => setFilters((v) => ({ ...v, end: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            검색
            <input
              className="mt-1 input"
              placeholder="이름 또는 코드"
              value={filters.q}
              onChange={(e) => setFilters((v) => ({ ...v, q: e.target.value }))}
            />
          </label>
          <button className="btn" onClick={loadRows} disabled={loading}>
            {loading ? "불러오는 중..." : "조회"}
          </button>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[900px] w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 border text-left">학생</th>
                <th className="p-2 border text-center">날짜</th>
                <th className="p-2 border text-center">구분</th>
                <th className="p-2 border text-right">금액</th>
                <th className="p-2 border text-center">입금</th>
                <th className="p-2 border text-left">메모</th>
                <th className="p-2 border text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-2 border">
                    {r.name} <span className="text-slate-500">({r.code})</span>
                  </td>
                  <td className="p-2 border text-center">{r.date}</td>
                  <td className="p-2 border text-center">
                    {SLOT_LABEL[r.slot] || r.slot}
                  </td>
                  <td className="p-2 border text-right">
                    {Number(r.price || 0).toLocaleString()}원
                  </td>
                  <td className="p-2 border text-center">
                    {r.status === "PAID" ? (
                      <span className="text-emerald-600 font-semibold">입금</span>
                    ) : (
                      <span className="text-slate-600">미입금</span>
                    )}
                  </td>
                  <td className="p-2 border">{r.memo || ""}</td>
                  <td className="p-2 border text-center">
                    <button className="btn-ghost text-danger" onClick={() => remove(r.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    추가 신청 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
