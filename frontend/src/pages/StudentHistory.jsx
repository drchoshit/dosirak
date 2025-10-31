import * as React from "react";
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import api from "../lib/api";

function StudentHistory() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [student, setStudent] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/student/orders/${code}`);
        if (!data.ok) throw new Error("데이터 로드 실패");
        setStudent(data.student);
        setOrders(data.orders);
      } catch (e) {
        console.error(e);
        setError("신청 내역을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    if (code) fetchData();
  }, [code]);

  if (!code)
    return (
      <div className="p-5 text-center">
        <h2 className="text-lg font-bold mb-2">학생 코드가 필요합니다.</h2>
        <p>학생 페이지에서 “내 신청 내역 보기” 버튼을 다시 눌러주세요.</p>
      </div>
    );

  if (loading)
    return <div className="p-5 text-center text-slate-500">불러오는 중입니다...</div>;

  if (error)
    return <div className="p-5 text-center text-red-500">{error}</div>;

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-3">내 도시락 신청 내역</h1>
      {student && (
        <div className="mb-4 text-sm text-slate-700">
          <div><b>이름:</b> {student.name}</div>
          <div><b>코드:</b> {student.code}</div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-slate-500 mt-4">아직 신청 내역이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-300 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-300 px-2 py-1 w-28">날짜</th>
                <th className="border border-slate-300 px-2 py-1 w-20">식사</th>
                <th className="border border-slate-300 px-2 py-1 w-20">가격</th>
                <th className="border border-slate-300 px-2 py-1 w-24">상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {dayjs(o.date).format("YYYY-MM-DD")}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {o.slot === "LUNCH" ? "점심" : o.slot === "DINNER" ? "저녁" : o.slot}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right">
                    {Number(o.price || 0).toLocaleString()}원
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {o.status === "PAID" ? "결제 완료" : "신청만 함"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-center">
        <button className="btn-ghost" onClick={() => navigate(-1)}>
          ← 돌아가기
        </button>
      </div>
    </div>
  );
}

export default StudentHistory;
