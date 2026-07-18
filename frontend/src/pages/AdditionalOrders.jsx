import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const SLOT_LABEL = { LUNCH: "점심", DINNER: "저녁" };
function fmtKstDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
}

export default function AdditionalOrders() {
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentSavingId, setPaymentSavingId] = useState(null);
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
      const couponParams = new URLSearchParams();
      if (filters.q.trim()) couponParams.set("q", filters.q.trim());
      const [res, couponRes] = await Promise.all([
        api.get("/admin/phone-orders" + (params.toString() ? `?${params.toString()}` : "")),
        api.get(
          "/admin/carryover-coupons" +
            (couponParams.toString() ? `?${couponParams.toString()}` : "")
        ),
      ]);
      setRows(res.data?.rows || []);
      setCoupons(couponRes.data?.coupons || []);
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

  async function markPhoneOrderPayment(id, paid) {
    setPaymentSavingId(id);
    try {
      const res = await api.patch(`/admin/phone-orders/${id}/payment`, { paid });
      const status = res.data?.status || (paid ? "PAID" : "SELECTED");
      setRows((list) =>
        list.map((row) => (row.id === id ? { ...row, status } : row))
      );
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "입금 상태 변경 실패";
      alert("입금 상태 변경 실패: " + msg);
    } finally {
      setPaymentSavingId(null);
    }
  }

  async function openCarryover(row) {
    const fromText = `${row.date} ${SLOT_LABEL[row.slot] || row.slot}`;
    if (!confirm(`${row.name} 학생의 ${fromText} 추가 신청 도시락을 이월 쿠폰 1장으로 바꿀까요?\n기존 추가 신청 행은 삭제되고 학생이 다음 신청 때 원하는 식사에 쿠폰을 적용할 수 있습니다.`)) {
      return;
    }

    try {
      await api.post(`/admin/phone-orders/${row.id}/carryover-coupon`);
      await loadRows();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "이월 실패";
      alert("이월 실패: " + msg);
    }
  }

  function openCouponEdit(coupon) {
    setEditingCoupon({
      ...coupon,
      expires_date: fmtKstDate(coupon.expires_at),
    });
  }

  async function saveCouponEdit() {
    if (!editingCoupon) return;
    if (
      !editingCoupon.from_date ||
      !editingCoupon.from_slot ||
      !editingCoupon.expires_date ||
      (editingCoupon.used_order_id &&
        (!editingCoupon.used_date || !editingCoupon.used_slot))
    ) {
      alert("날짜와 구분을 모두 입력하세요.");
      return;
    }
    try {
      await api.patch(`/admin/carryover-coupons/${editingCoupon.id}`, {
        from_date: editingCoupon.from_date,
        from_slot: editingCoupon.from_slot,
        used_date: editingCoupon.used_date || undefined,
        used_slot: editingCoupon.used_slot || undefined,
        expires_at: `${editingCoupon.expires_date}T23:59:59+09:00`,
      });
      setEditingCoupon(null);
      await loadRows();
      alert("이월 쿠폰 정보를 수정했습니다.");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "수정 실패";
      alert("수정 실패: " + msg);
    }
  }

  async function removeCoupon(coupon) {
    if (coupon.used_order_id) return;
    if (!confirm(`${coupon.name} 학생의 미사용 이월 쿠폰을 삭제할까요?`)) return;
    try {
      await api.delete(`/admin/carryover-coupons/${coupon.id}`);
      await loadRows();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "삭제 실패";
      alert("삭제 실패: " + msg);
    }
  }

  const couponCounts = useMemo(() => {
    const counts = new Map();
    coupons.forEach((coupon) => {
      const current = counts.get(coupon.student_id) || { total: 0, available: 0 };
      current.total += 1;
      if (!coupon.used_order_id && !coupon.is_expired) current.available += 1;
      counts.set(coupon.student_id, current);
    });
    return counts;
  }, [coupons]);

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">학생별 이월 쿠폰 현황</h2>
            <div className="mt-1 text-sm text-slate-500">
              쿠폰은 발급 후 7일 동안 사용할 수 있습니다. 사용 완료 쿠폰은 원래 식사에서 실제 적용 식사로 이동한 내역을 표시합니다.
            </div>
          </div>
          <div className="text-sm text-slate-500">총 {coupons.length}장</div>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-[1080px] w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 border text-left">학생 / 보유 수</th>
                <th className="p-2 border text-center">원래 식사</th>
                <th className="p-2 border text-center">적용 식사</th>
                <th className="p-2 border text-center">상태</th>
                <th className="p-2 border text-center">만료일</th>
                <th className="p-2 border text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const count = couponCounts.get(coupon.student_id) || { total: 0, available: 0 };
                const expired = !!Number(coupon.is_expired);
                return (
                  <tr key={coupon.id} className="hover:bg-slate-50">
                    <td className="p-2 border">
                      <div>{coupon.name} <span className="text-slate-500">({coupon.code})</span></div>
                      <div className="text-xs text-emerald-700">
                        사용 가능 {count.available}장 / 전체 {count.total}장
                      </div>
                    </td>
                    <td className="p-2 border text-center">
                      {coupon.from_date} {SLOT_LABEL[coupon.from_slot] || coupon.from_slot}
                    </td>
                    <td className="p-2 border text-center">
                      {coupon.used_order_id
                        ? `${coupon.used_date} ${SLOT_LABEL[coupon.used_slot] || coupon.used_slot}`
                        : "아직 적용하지 않음"}
                    </td>
                    <td className="p-2 border text-center">
                      {coupon.used_order_id ? (
                        <span className="font-semibold text-blue-600">사용 완료</span>
                      ) : expired ? (
                        <span className="font-semibold text-red-500">만료</span>
                      ) : (
                        <span className="font-semibold text-emerald-600">사용 가능</span>
                      )}
                    </td>
                    <td className="p-2 border text-center">
                      {fmtKstDate(coupon.expires_at)}
                    </td>
                    <td className="p-2 border text-center">
                      <div className="flex justify-center gap-2">
                        <button className="btn-ghost" onClick={() => openCouponEdit(coupon)}>
                          수정
                        </button>
                        <button
                          className="btn-ghost text-danger"
                          disabled={!!coupon.used_order_id}
                          onClick={() => removeCoupon(coupon)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!coupons.length && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    발급된 이월 쿠폰이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
          <table className="min-w-[1080px] w-full text-sm border">
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
              {rows.map((r) => {
                const isPaid = r.status === "PAID";
                const savingPayment = paymentSavingId === r.id;
                return (
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
                      {isPaid ? (
                        <span className="text-emerald-600 font-semibold">입금</span>
                      ) : (
                        <span className="text-slate-600">미입금</span>
                      )}
                    </td>
                    <td className="p-2 border">{r.memo || ""}</td>
                    <td className="p-2 border text-center">
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          className={
                            isPaid
                              ? "btn-primary text-sm px-3 py-1"
                              : "btn-ghost text-sm px-3 py-1"
                          }
                          disabled={savingPayment}
                          onClick={() => markPhoneOrderPayment(r.id, true)}
                        >
                          입금
                        </button>
                        <button
                          type="button"
                          className={
                            !isPaid
                              ? "btn-primary text-sm px-3 py-1"
                              : "btn-ghost text-sm px-3 py-1"
                          }
                          disabled={savingPayment}
                          onClick={() => markPhoneOrderPayment(r.id, false)}
                        >
                          미입금
                        </button>
                        <button className="btn-ghost" onClick={() => openCarryover(r)}>
                          이월 쿠폰 발급
                        </button>
                        <button className="btn-ghost text-danger" onClick={() => remove(r.id)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[92vw] max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">이월 쿠폰 수정</h3>
            <div className="mt-1 text-sm text-slate-500">
              {editingCoupon.name} ({editingCoupon.code})
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm">
                원래 날짜
                <input
                  type="date"
                  className="input mt-1"
                  value={editingCoupon.from_date || ""}
                  onChange={(e) =>
                    setEditingCoupon((value) => ({ ...value, from_date: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                원래 구분
                <select
                  className="input mt-1"
                  value={editingCoupon.from_slot || "LUNCH"}
                  onChange={(e) =>
                    setEditingCoupon((value) => ({ ...value, from_slot: e.target.value }))
                  }
                >
                  <option value="LUNCH">점심</option>
                  <option value="DINNER">저녁</option>
                </select>
              </label>
              {editingCoupon.used_order_id && (
                <>
                  <label className="text-sm">
                    적용 날짜
                    <input
                      type="date"
                      className="input mt-1"
                      value={editingCoupon.used_date || ""}
                      onChange={(e) =>
                        setEditingCoupon((value) => ({ ...value, used_date: e.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    적용 구분
                    <select
                      className="input mt-1"
                      value={editingCoupon.used_slot || "LUNCH"}
                      onChange={(e) =>
                        setEditingCoupon((value) => ({ ...value, used_slot: e.target.value }))
                      }
                    >
                      <option value="LUNCH">점심</option>
                      <option value="DINNER">저녁</option>
                    </select>
                  </label>
                </>
              )}
              <label className="col-span-2 text-sm">
                만료일
                <input
                  type="date"
                  className="input mt-1"
                  value={editingCoupon.expires_date || ""}
                  onChange={(e) =>
                    setEditingCoupon((value) => ({ ...value, expires_date: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditingCoupon(null)}>
                취소
              </button>
              <button className="btn-primary" onClick={saveCouponEdit}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
