import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const SLOT_LABEL = { LUNCH: "점심", DINNER: "저녁" };
const PORTION_LABEL = { BASE: "기본", EXTRA: "곱빼기" };

function mealLabel(slot, portion) {
  const slotText = SLOT_LABEL[slot] || slot;
  const portionText = PORTION_LABEL[portion] || "기본";
  return `${slotText} / ${portionText}`;
}

export default function OrdersPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [carryovers, setCarryovers] = useState([]);
  const [carryoverModal, setCarryoverModal] = useState(null);
  const [carryoverTarget, setCarryoverTarget] = useState({
    to_date: "",
    to_slot: "LUNCH",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (q.trim()) params.set("q", q.trim());
      const res = await api.get(
        "/admin/orders" + (params.toString() ? "?" + params.toString() : "")
      );
      setGroups(res.data?.groups || []);
      setCarryovers(res.data?.carryovers || []);
    } catch (e) {
      console.error(e);
      alert("신청 리스트를 가져오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [start, end, q]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAll = useMemo(
    () => groups.reduce((sum, g) => sum + (Number(g.total_amount) || 0), 0),
    [groups]
  );

  async function cancelOne(orderId) {
    if (!confirm("해당 신청을 삭제할까요? 결제/미결제 상태와 무관하게 즉시 삭제됩니다.")) return;
    try {
      await api.delete(`/admin/orders/${orderId}`);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "취소 실패";
      alert("취소 실패: " + msg);
    }
  }

  async function cancelStudent(code, slotFilter) {
    const text = slotFilter
      ? `이 학생의 ${SLOT_LABEL[slotFilter]} 신청을`
      : "이 학생의 모든 신청을";
    if (!confirm(`${text} 삭제할까요? 결제/미결제 상태와 무관하게 삭제됩니다.`)) return;
    try {
      await api.post("/admin/orders/cancel-student", {
        code,
        start: start || undefined,
        end: end || undefined,
        slot: slotFilter || undefined,
      });
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "취소 실패";
      alert("취소 실패: " + msg);
    }
  }

  function openCarryover(studentGroup, order) {
    setCarryoverModal({ student: studentGroup, order });
    setCarryoverTarget({ to_date: "", to_slot: order.slot || "LUNCH" });
  }

  async function submitCarryover() {
    if (!carryoverModal) return;
    if (!carryoverTarget.to_date || !carryoverTarget.to_slot) {
      alert("이월할 날짜와 구분을 선택하세요.");
      return;
    }
    const { student, order } = carryoverModal;
    const fromText = `${order.date} ${SLOT_LABEL[order.slot] || order.slot}`;
    const toText = `${carryoverTarget.to_date} ${SLOT_LABEL[carryoverTarget.to_slot] || carryoverTarget.to_slot}`;
    if (!confirm(`${student.name} 학생의 ${fromText} 식사를 ${toText}으로 이월할까요?\n기존 신청 행은 신청 리스트에서 삭제되고, 이월 내역으로 관리됩니다.`)) {
      return;
    }
    try {
      await api.post(`/admin/orders/${order.id}/carryover`, carryoverTarget);
      setCarryoverModal(null);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "이월 실패";
      alert("이월 실패: " + msg);
    }
  }

  async function deleteCarryover(id) {
    if (!confirm("이월 내역을 삭제할까요? 원래 신청 행은 자동 복구되지 않습니다.")) return;
    try {
      await api.delete(`/admin/carryovers/${id}`);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "삭제 실패";
      alert("삭제 실패: " + msg);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h1 className="text-lg font-bold">신청 리스트</h1>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <label className="text-sm">
            시작일
            <input
              type="date"
              className="mt-1 input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              type="date"
              className="mt-1 input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="text-sm">
            검색(이름/코드)
            <input
              className="mt-1 input"
              placeholder="예: 홍길동 / abc123"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "불러오는 중..." : "불러오기"}
            </button>
            <a className="btn-ghost" href="/admin">
              관리자 홈
            </a>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">이월자</h2>
            <div className="text-sm text-slate-500">
              선택한 조회 기간에 반영될 이월 식수입니다. 학생 신청 페이지와 인쇄 명단에는 이 날짜 기준으로 표시됩니다.
            </div>
          </div>
          <div className="text-sm text-slate-500">
            총 {carryovers.length.toLocaleString()}건
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[900px] w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 border text-left">학생</th>
                <th className="p-2 border text-center">원래 날짜</th>
                <th className="p-2 border text-center">이월 날짜</th>
                <th className="p-2 border text-center">구분</th>
                <th className="p-2 border text-right">기존 결제액</th>
                <th className="p-2 border text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {carryovers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-2 border">
                    {c.name} <span className="text-slate-500">({c.code})</span>
                  </td>
                  <td className="p-2 border text-center">
                    {c.from_date} {SLOT_LABEL[c.from_slot] || c.from_slot}
                  </td>
                  <td className="p-2 border text-center">
                    {c.to_date} {SLOT_LABEL[c.to_slot] || c.to_slot}
                  </td>
                  <td className="p-2 border text-center">
                    {mealLabel(c.to_slot, c.portion)}
                  </td>
                  <td className="p-2 border text-right">
                    {Number(c.original_price || 0).toLocaleString()}원
                  </td>
                  <td className="p-2 border text-center">
                    <button
                      className="btn-ghost text-danger"
                      onClick={() => deleteCarryover(c.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {!carryovers.length && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    조회된 이월자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-slate-600 text-sm">총 금액</div>
          <div className="text-xl font-bold">
            {totalAll.toLocaleString()}원
          </div>
        </div>

        <div className="mt-4 space-y-8">
          {groups.map((g) => (
            <div key={g.student_id} className="border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center gap-3">
                <div className="font-bold">
                  {g.name} <span className="text-slate-500">({g.code})</span>
                </div>
                <div className="text-sm text-slate-600">
                  총 {g.count}식 / {Number(g.total_amount).toLocaleString()}원
                </div>
                <div className="grow" />
                <button
                  className="btn-ghost"
                  onClick={() => cancelStudent(g.code)}
                >
                  학생 전체 취소
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => cancelStudent(g.code, "LUNCH")}
                >
                  점심만 취소
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => cancelStudent(g.code, "DINNER")}
                >
                  저녁만 취소
                </button>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-white">
                  <tr>
                    <th className="p-2 border text-left">날짜</th>
                    <th className="p-2 border text-center">구분</th>
                    <th className="p-2 border text-center">식사</th>
                    <th className="p-2 border text-right">가격</th>
                    <th className="p-2 border text-center">상태</th>
                    <th className="p-2 border text-center">이월</th>
                    <th className="p-2 border text-center">취소</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="p-2 border">{it.date}</td>
                      <td className="p-2 border text-center">
                        {SLOT_LABEL[it.slot] || it.slot}
                      </td>
                      <td className="p-2 border text-center">
                        {PORTION_LABEL[it.portion] || "기본"}
                      </td>
                      <td className="p-2 border text-right">
                        {Number(it.price || 0).toLocaleString()}원
                      </td>
                      <td className="p-2 border text-center">
                        {it.status === "PAID" ? (
                          <span className="text-emerald-600 font-semibold">
                            결제
                          </span>
                        ) : (
                          <span className="text-slate-600">미결제</span>
                        )}
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          className="btn-ghost"
                          onClick={() => openCarryover(g, it)}
                        >
                          이월
                        </button>
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          className="btn-ghost text-danger"
                          onClick={() => cancelOne(it.id)}
                        >
                          취소
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!g.items.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-3 text-center text-slate-500"
                      >
                        신청 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

          {!groups.length && (
            <div className="text-center text-slate-500">
              표시할 신청 내역이 없습니다. 필터를 변경해 보세요.
            </div>
          )}
        </div>
      </div>

      {carryoverModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[90vw] max-w-md shadow-xl">
            <div className="text-lg font-semibold mb-2">도시락 이월</div>
            <div className="text-sm text-slate-600 mb-4">
              {carryoverModal.student.name} 학생의 {carryoverModal.order.date}{" "}
              {mealLabel(carryoverModal.order.slot, carryoverModal.order.portion)} 식사를
              다른 날짜로 이월합니다.
            </div>
            <label className="block text-sm mb-3">
              이월할 날짜
              <input
                type="date"
                className="mt-1 input"
                value={carryoverTarget.to_date}
                onChange={(e) =>
                  setCarryoverTarget((v) => ({ ...v, to_date: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              구분
              <select
                className="mt-1 input"
                value={carryoverTarget.to_slot}
                onChange={(e) =>
                  setCarryoverTarget((v) => ({ ...v, to_slot: e.target.value }))
                }
              >
                <option value="LUNCH">점심</option>
                <option value="DINNER">저녁</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-ghost" onClick={() => setCarryoverModal(null)}>
                취소
              </button>
              <button className="btn-primary" onClick={submitCarryover}>
                이월 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
