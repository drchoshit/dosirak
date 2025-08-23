import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../lib/api';

const weekdaysKo = ['일','월','화','수','목','금','토'];
const slots = ['LUNCH','DINNER'];
const slotKo = { LUNCH:'점심', DINNER:'저녁' };
function ymd(dt){ const p=n=>String(n).padStart(2,'0'); return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}`; }
function addDays(d,i){ const x=new Date(d); x.setDate(x.getDate()+i); return x; }

function genDates(startStr, endStr){
  const out=[];
  const s = new Date(startStr);
  const e = new Date(endStr);
  if(isNaN(s) || isNaN(e)) return out;
  let cur = new Date(s);
  while(cur <= e){
    out.push( ymd(cur) );
    cur.setDate(cur.getDate()+1);
  }
  return out;
}

export default function Student(){
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState(null);
  const [weekDates, setWeekDates] = useState([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const [selected, setSelected] = useState({});
  const [phone, setPhone] = useState('01022223333');
  const [smsPreview, setSmsPreview] = useState(null); // string or null
  const [smsSent, setSmsSent] = useState(false);
  const [showSmsRequire, setShowSmsRequire] = useState(false);
  const [overrideEnableAll, setOverrideEnableAll] = useState(false); // 유지(삭제하지 않음)

  const allowed = useMemo(()=> new Set(policy?.allowed_weekdays||[]),[policy]);
  const nosvc = useMemo(()=>{
    const m=new Map();
    (policy?.no_service_days||[]).forEach(b=>m.set(`${b.date}-${b.slot}`,true));
    return m;
  },[policy]);
  const price = policy?.base_price || 0;

  useEffect(()=>{
    if(rangeStart && rangeEnd){
      setWeekDates(genDates(rangeStart, rangeEnd));
    }
  },[rangeStart, rangeEnd]);

  async function enter(){
    if(!code || !name) return alert('코드와 이름을 모두 입력하세요');
    const res = await api.get('/policy/active',{ params:{ code } });
    setPolicy(res.data);
    const s = res.data.start_date; const e = res.data.end_date || s;
    setRangeStart(s); setRangeEnd(e);
    setWeekDates(genDates(s, e));
  }

  function toggle(date, slot){
    const key = `${date}-${slot}`;
    setSelected(s => ({ ...s, [key]: !s[key] }));
  }

  function removeItem(it){
    const key = `${it.date}-${it.slot}`;
    setSelected(s => ({ ...s, [key]: false }));
  }

  const items = Object.entries(selected)
    .filter(([k,v])=>v)
    .map(([k])=>{
      const lastDash = k.lastIndexOf('-');
      const d = k.slice(0, lastDash);
      const slot = k.slice(lastDash + 1);
      return { date: d, slot, price };
    });
  const total = items.reduce((a,b)=>a+b.price,0);

  async function commit(){
    if(!code) return alert('코드를 먼저 입력');
    if(!smsSent){ setShowSmsRequire(true); return; }
    await api.post('/orders/commit',{ code, items });
    alert('선택 저장 완료');
  }

  // ✅ 보강된 결제 함수 (TossPayments)
  async function pay(method='카드'){
    if(items.length===0) return alert('선택이 없습니다');
    if(!smsSent){ setShowSmsRequire(true); return; }

    const amount = total;
    const orderId = 'ORDER-' + Date.now();
    const orderName =
      items.map(x=>`${x.date} ${slotKo[x.slot]}`).slice(0,3).join(', ')
      + (items.length>3?` 외 ${items.length-3}건`:'');

    // .env (Vite)에서 클라이언트 키 읽기. 없으면 테스트키 fallback
    const ck = (import.meta?.env?.VITE_TOSS_CLIENT_KEY) || 'test_ck_xxx';

    if(!window.TossPayments){
      alert('결제 SDK가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      return;
    }
    const toss = window.TossPayments(ck);

    // 성공/실패 페이지로 전달할 쿼리스트링
    const qs = new URLSearchParams({
      amount: String(amount),
      orderId,
      orderName,
      code,
      // 성공 페이지에서 decode → JSON.parse 하도록 동일 포맷 유지
      items: encodeURIComponent(JSON.stringify(items))
    }).toString();

    try {
      await toss.requestPayment(method, {
        amount,
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payment/success?${qs}`,
        failUrl: `${window.location.origin}/payment/fail?${qs}`
      });
    } catch(e){
      // 사용자가 창 닫거나 결제 취소한 경우: 조용히 반환
      if(e && (e.code === 'USER_CANCEL' || e.message?.includes('User cancelled'))) return;
      alert('결제 시작에 실패했습니다\n' + (e?.message || String(e)));
    }
  }

  async function sms(){
    // group by date for cleaner SMS
    const grouped = items.reduce((acc, it) => {
      (acc[it.date] = acc[it.date] || []).push(it);
      return acc;
    }, {});
    const lines = Object.entries(grouped).map(([date, arr]) => {
      const wd = weekdaysKo[new Date(date).getDay()];
      const labels = arr.map(x=>slotKo[x.slot]).sort().join(', ');
      const perDayTotal = arr.reduce((s,x)=> s + (x.price||0), 0);
      return `${date} ${wd} ${labels}  ${perDayTotal.toLocaleString()}원`;
    });
    const msg = `[도시락 신청 내역]\n` + (name?`${name} 학생\n`:'') + lines.join('\n') + `\n합계 ${total.toLocaleString()}원`;
    setSmsPreview(msg); // open modal
    setSmsSent(true);
    if(phone && phone.trim().length>=10){
      try{
        await api.post('/sms/summary', { to: phone.trim(), code, items, total, name });
      }catch(e){
        // ignore error; preview already shown
        console.error('SMS send failed', e?.response?.data||String(e));
      }
    }
  }

  function resetSelections(){
    setSelected({});
    setOverrideEnableAll(false); // 더 이상 활성화 용도로 사용하지 않음
    setSmsSent(false);
    alert('선택이 초기화되었습니다.');
  }

  return (
    <div className="grid grid-student lg:grid-cols-2 gap-6">
      {/* Left: entry & large image */}
      <section className="card p-5">
        <h2 className="text-xl font-bold mb-3">학생 입장</h2>
        <div className="flex gap-2 flex-col sm:flex-row">
          <input className="flex-1 border rounded-xl px-3 py-2" placeholder="코드 입력 (예: dfv201)" value={code} onChange={e=>setCode(e.target.value)}/>
          <input className="flex-1 border rounded-xl px-3 py-2" placeholder="이름 입력" value={name} onChange={e=>setName(e.target.value)}/>
          <button className="btn-primary" onClick={enter}>입장</button>
        </div>

        {policy && (
          <div className="mt-4 text-slate-600">
            <b>{policy?.student?.name ?? '학생'}</b> 학생의 페이지
          </div>
        )}

        <h3 className="mt-5 font-semibold">이번 주 메뉴</h3>
        <LargeMenu/>
      </section>

      {/* Middle: week calendar */}
      <section className="card p-5">
        <h2 className="text-xl font-bold mb-3">기간 신청</h2>
        {!policy && <div className="text-slate-500">코드와 이름으로 입장하면 신청 캘린더가 열립니다.</div>}
        {policy && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-500">선택 후 우측에서 요약/결제 확인</div>
              <button className="btn-ghost" onClick={resetSelections}>선택 리셋</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekDates.map(d=>{
                const wd = new Date(d).getDay();
                const wdCode=['SUN','MON','TUE','WED','THU','FRI','SAT'][wd];
                const disableDay = !allowed.has(wdCode); // 전역/학생 허용 요일 이외는 비활성
                return (
                  <div key={d} className={"rounded-2xl border p-4 shadow-sm " + (disableDay ? "opacity-50" : "bg-white")}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{d}</div>
                      <div className="text-sm text-slate-500">{weekdaysKo[wd]}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {slots.map(slot=>{
                        const key = `${d}-${slot}`;
                        const isNo = nosvc.get(`${d}-BOTH`) || nosvc.get(key); // 미제공일(BOTH/개별) 체크
                        const sel = !!items.find(x=>x.date===d && x.slot===slot);
                        const disabled = (disableDay || isNo); // reset과 무관하게 항상 비활성 조건 유지
                        return (
                          <button
                            key={slot}
                            onClick={()=>!disabled && toggle(d,slot)}
                            className={`h-10 rounded-xl border text-sm w-full text-center transition
                              ${sel ? 'bg-primary text-white border-primary shadow' : 'bg-white hover:bg-slate-50'}
                              ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
                            `}
                            disabled={disabled}
                            title={disabled ? '미진행' : slotKo[slot]}
                          >
                            {slotKo[slot]}
                          </button>
                        );
                      })}
                    </div>

                    {(nosvc.get(`${d}-BOTH`) || disableDay) && (
                      <div className="mt-2 text-xs text-rose-500/80">신청 불가</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Right: summary */}
      <aside className="card p-5 lg:col-span-2 h-max">
        <h2 className="text-xl font-bold mb-3">결제 요약</h2>
        {(() => {
          // Group items by date
          const groups = items.reduce((acc, it) => {
            (acc[it.date] = acc[it.date] || []).push(it);
            return acc;
          }, {});
          const rows = Object.entries(groups).map(([date, arr]) => {
            const wd = weekdaysKo[new Date(date).getDay()];
            const labels = arr.map(x => slotKo[x.slot]).sort();
            const perDayTotal = arr.reduce((s,x)=> s + (x.price||0), 0);
            return { date, wd, labels, perDayTotal, arr };
          }).sort((a,b)=> a.date.localeCompare(b.date));
          return (
            <>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {items.length===0 && <div className="text-slate-500">선택 내역이 없습니다.</div>}
                {rows.map((r) => (
                  <div key={r.date} className="flex items-center justify-between text-sm">
                    <div>{r.date} {r.wd} {r.labels.join(', ')}</div>
                    <div className="font-semibold">{r.perDayTotal.toLocaleString()}원</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <div className="text-slate-600">합계</div>
                <div className="text-xl font-bold">{total.toLocaleString()}원</div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button className="btn-primary" onClick={commit}>선택 저장</button>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-ghost" onClick={()=>pay('카드')}>카드</button>
                  <button className="btn-ghost" onClick={()=>pay('카카오페이')}>카카오페이</button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="전화번호 입력 (숫자만)"
                    value={phone}
                    onChange={e=>setPhone((e.target.value||'').replace(/[^0-9]/g,''))}
                  />
                  <button className="btn-ghost" onClick={sms}>신청 내역 문자 받기</button>
                </div>

                {smsPreview && (
                  <div className="mt-2 p-3 bg-white border rounded-xl">
                    <div className="text-sm whitespace-pre-wrap">{smsPreview}</div>
                    <div className="mt-2 flex justify-end">
                      <button className="btn-ghost" onClick={()=>setSmsPreview(null)}>닫기</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </aside>

      {/* Global modal: 문자 요구 */}
      {showSmsRequire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[90vw] max-w-md shadow-xl">
            <div className="text-lg font-semibold mb-2">문자 확인 필요</div>
            <div className="text-sm text-slate-600 mb-4">
              저장이나 결제를 진행하기 전에 먼저 <b>“신청 내역 문자 받기”</b>를 눌러 본인 휴대폰으로 신청 내역을 받아 주세요.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={()=>{ setShowSmsRequire(false); sms(); }}>문자로 받기</button>
              <button className="btn" onClick={()=>setShowSmsRequire(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function LargeMenu(){
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(()=>{ (async()=>{
    const r = await fetch('/api/menu-images'); setList(await r.json());
  })(); },[]);
  if(list.length===0) return <div className="text-slate-500">업로드된 메뉴 이미지가 없습니다.</div>;
  const first = list[0];
  return (
    <>
      <img
        src={first.url}
        onClick={()=>setOpen(true)}
        title="클릭하면 확대"
        className="mt-2 w-full h-72 sm:h-96 object-cover rounded-2xl border cursor-zoom-in"
      />
      {open && (
        <div onClick={()=>setOpen(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <img src={first.url} className="max-w-[90vw] max-h-[90vh] rounded-2xl"/>
        </div>
      )}
    </>
  );
}
