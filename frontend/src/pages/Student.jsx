import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';  // ✅ 이 줄을 바로 아래에 추가
import api from "../lib/api";

const weekdaysKo = ['일','월','화','수','목','금','토'];
const slots = ['LUNCH','DINNER'];
const slotKo = { LUNCH:'점심', DINNER:'저녁' };

const LS_KEY = 'doshirak.session.v1';

function ymd(dt){ const p=n=>String(n).padStart(2,'0'); return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}`; }
function fmtMD(dateStr){ const d=new Date(dateStr); if (isNaN(d)) return dateStr; return `${d.getMonth()+1}/${d.getDate()}`; }
function fmtDateTime(value){ return value ? String(value).replace('T', ' ') : '미설정'; }
function fmtKstDate(value){
  if(!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Seoul' }).format(date);
}
function genDates(startStr, endStr){
  const out=[]; const s=new Date(startStr), e=new Date(endStr);
  if(isNaN(s) || isNaN(e)) return out;
  let cur=new Date(s); while(cur<=e){ out.push(ymd(cur)); cur.setDate(cur.getDate()+1); }
  return out;
}
function readLS(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }catch{ return {}; }
}
function writeLS(obj){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(obj||{})); }catch{}
}

function normalizePortion(val){
  if (val === 'EXTRA') return 'EXTRA';
  if (val === 'BASE') return 'BASE';
  if (val === true) return 'BASE'; // legacy boolean
  return null;
}

function slotLabel(slot, portion){
  const base = slotKo[slot] || slot;
  return portion === 'EXTRA' ? `${base}(\uACF1\uBE7C\uAE30)` : base;
}

export default function Student(){
  const navigate = useNavigate();  // ✅ 이 줄을 가장 위에 추가
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState(null);
  const [weekDates, setWeekDates] = useState([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // 코드별 임시 선택 저장용
  const [selected, setSelected] = useState({});
  const [couponAssignments, setCouponAssignments] = useState({});
  const [phone, setPhone] = useState('01022223333');
  const [smsPreview, setSmsPreview] = useState(null);
  const [smsVerifiedKey, setSmsVerifiedKey] = useState(null);
  const [showSmsRequire, setShowSmsRequire] = useState(false);
  const [showCommitConfirm, setShowCommitConfirm] = useState(false);
  const [showApplicationClosed, setShowApplicationClosed] = useState(false);
  const [showCouponNotice, setShowCouponNotice] = useState(false);
  const [lsReady, setLsReady] = useState(false); // 초기 복구 완료 플래그

  // 허용 요일: 비어 있으면 월~금 기본 허용
  const allowed = useMemo(()=>{
    const arr = Array.isArray(policy?.allowed_weekdays) ? policy.allowed_weekdays : [];
    return new Set(arr.length ? arr : ['MON','TUE','WED','THU','FRI']);
  },[policy]);

  // 미제공일(블랙아웃) 맵
  const nosvc = useMemo(()=>{
    const m=new Map();
    (policy?.no_service_days||[]).forEach(b=>m.set(`${b.date}-${b.slot}`,true));
    return m;
  },[policy]);

  const basePrice = policy?.base_price || 0;
  const extraPrice = policy?.extra_price ?? basePrice;
  const applicationIsOpen = policy?.application_is_open !== false;

  // 기간 → 날짜 배열
  useEffect(()=>{
    if(rangeStart && rangeEnd) setWeekDates(genDates(rangeStart, rangeEnd));
    else setWeekDates([]);
  },[rangeStart, rangeEnd]);

  // 1) 로컬스토리지에서 복구 + 자동 입장
  useEffect(()=>{
    const saved = readLS();
    if(saved.lastCode){
      setCode(saved.lastCode || '');
      setName(saved.lastName || '');
      setPhone(saved.phone || '01022223333');
      // 먼저 선택 복구
      const sel = (saved.selections && saved.selections[saved.lastCode]) || {};
      setSelected(sel);
      setCouponAssignments((saved.coupons && saved.coupons[saved.lastCode]) || {});
      // 정책 자동 로드
      (async ()=>{
        try{
          const res = await api.get('/policy/active', { params:{ code: saved.lastCode } });
          const pol = res.data;
          setPolicy(pol);
          setShowCouponNotice((pol.carryover_coupons || []).length > 0);
          setShowApplicationClosed(pol.application_is_open === false);
          const s = pol.start_date || ymd(new Date());
          const e = pol.end_date   || s;
          setRangeStart(s); setRangeEnd(e);
        }catch(e){
          // 자동 복구 실패해도 저장 데이터는 지우지 않음
          setPolicy(null); setRangeStart(''); setRangeEnd(''); setWeekDates([]);
        }finally{
          setLsReady(true);
        }
      })();
    }else{
      setLsReady(true);
    }
  },[]);

  // 2) 코드가 바뀌면 해당 코드의 선택을 복원
  useEffect(()=>{
    if(!lsReady) return;
    const saved = readLS();
    const sel = (saved.selections && saved.selections[code]) || {};
    setSelected(sel);
    setCouponAssignments((saved.coupons && saved.coupons[code]) || {});
  },[code, lsReady]);

  // 3) 입력/선택이 바뀔 때마다 로컬스토리지 동기화
  useEffect(()=>{
    if(!lsReady) return;
    const saved = readLS();
    const selections = saved.selections || {};
    const coupons = saved.coupons || {};
    if(code){ selections[code] = selected; } // 코드가 비어있으면 덮어쓰지 않음
    if(code){ coupons[code] = couponAssignments; }
    writeLS({ lastCode: code, lastName: name, phone, selections, coupons });
  },[code, name, phone, selected, couponAssignments, lsReady]);

  async function enter(){
    if(!code || !name) return alert('코드와 이름을 모두 입력하세요');
    try{
      const res = await api.get('/policy/active', { params:{ code } });
      const pol = res.data;
      setPolicy(pol);
      setShowCouponNotice((pol.carryover_coupons || []).length > 0);
      setShowApplicationClosed(pol.application_is_open === false);
      const s = pol.start_date || ymd(new Date());
      const e = pol.end_date   || s;
      setRangeStart(s); setRangeEnd(e);
    }catch(err){
      const status = err?.response?.status;
      if(status === 404) alert('해당 코드의 학생을 찾을 수 없습니다. 관리자에게 학생 등록 여부를 확인해 주세요.');
      else alert('신청 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setPolicy(null); setRangeStart(''); setRangeEnd(''); setWeekDates([]);
    }
  }

  function removeItem(it){
    const key = `${it.date}-${it.slot}`;
    setSelected(s => ({ ...s, [key]: false }));
  }
  function setPortion(date, slot, portion){
    if(!applicationIsOpen){
      setShowApplicationClosed(true);
      return;
    }
    const key = `${date}-${slot}`;
    if(carryoverMap.has(key)){
      alert('이월된 식수는 이미 결제된 0원 식수입니다.');
      return;
    }
    setSelected(s => {
      const next = { ...s };
      const current = normalizePortion(next[key]);
      if (!portion || current === portion) {
        delete next[key];
        setCouponAssignments(c => {
          const nextCoupons = { ...c };
          delete nextCoupons[key];
          return nextCoupons;
        });
        return next;
      }
      next[key] = portion;
      return next;
    });
  }
  function setAllPortion(portion){
    if(!applicationIsOpen){
      setShowApplicationClosed(true);
      return;
    }
    const keys = Object.keys(selected).filter(k => normalizePortion(selected[k]));
    if (!keys.length) { alert('\uC120\uD0DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'); return; }
    setSelected(s => {
      const next = { ...s };
      keys.forEach(k => { next[k] = portion; });
      return next;
    });
  }

  const carryoverItems = useMemo(() => {
    return (policy?.carryovers || [])
      .map(c => ({
        date: c.to_date,
        slot: c.to_slot,
        portion: c.portion || 'BASE',
        price: 0,
        source: 'CARRYOVER',
        from_date: c.from_date,
        from_slot: c.from_slot,
      }));
  }, [policy]);

  const carryoverMap = useMemo(() => {
    const m = new Map();
    carryoverItems.forEach(it => m.set(`${it.date}-${it.slot}`, it));
    return m;
  }, [carryoverItems]);

  const availableCoupons = policy?.carryover_coupons || [];
  const availableCouponIds = useMemo(
    () => new Set(availableCoupons.map((coupon) => Number(coupon.id))),
    [availableCoupons]
  );
  useEffect(() => {
    if (!policy) return;
    setCouponAssignments((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([, couponId]) =>
          availableCouponIds.has(Number(couponId))
        )
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [policy, availableCouponIds]);

  function toggleCoupon(date, slot) {
    const key = `${date}-${slot}`;
    setCouponAssignments(current => {
      if (current[key]) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      const usedIds = new Set(Object.values(current).map(Number));
      const coupon = availableCoupons.find(c => !usedIds.has(Number(c.id)));
      if (!coupon) {
        alert('사용 가능한 이월 쿠폰이 없습니다.');
        return current;
      }
      return { ...current, [key]: coupon.id };
    });
  }

  const items = Object.entries(selected)
    .map(([k,v])=>{
      const portion = normalizePortion(v);
      if (!portion) return null;
      const lastDash = k.lastIndexOf('-');
      const d = k.slice(0, lastDash);
      const slot = k.slice(lastDash + 1);
      if (carryoverMap.has(`${d}-${slot}`)) return null;
      const requestedCouponId = Number(couponAssignments[`${d}-${slot}`] || 0) || null;
      const carryoverCouponId =
        requestedCouponId && availableCouponIds.has(requestedCouponId)
          ? requestedCouponId
          : null;
      const price = carryoverCouponId ? 0 : (portion === 'EXTRA' ? extraPrice : basePrice);
      return {
        date: d,
        slot,
        portion,
        price,
        carryover_coupon_id: carryoverCouponId,
      };
    })
    .filter(Boolean);
  const total = items.reduce((a,b)=>a+(Number(b.price)||0),0);
  const currentSmsKey = JSON.stringify({
    code,
    phone: phone.trim(),
    items: items.map(({ date, slot, portion, price, carryover_coupon_id }) => ({
      date,
      slot,
      portion,
      price,
      carryover_coupon_id,
    })),
  });
  const smsVerified = smsVerifiedKey === currentSmsKey;
  const summaryItems = [...items, ...carryoverItems].sort((a,b)=>{
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.slot).localeCompare(String(b.slot));
  });

  async function commit(){
    if(!code) return alert('코드를 먼저 입력하세요.');
    if(!applicationIsOpen){ setShowApplicationClosed(true); return; }
    if(items.length===0) return alert('선택이 없습니다.');
    if(!smsVerified){ setShowSmsRequire(true); return; }
    try{
      await api.post('/orders/commit',{ code, items });
      alert('도시락 신청 완료(결재 전)');
      resetSelections({ silent: true });
    }catch(e){
      if(e?.response?.status === 403 && e?.response?.data?.error === 'APPLICATION_CLOSED'){
        setPolicy(p => p ? {
          ...p,
          application_start_at: e.response.data.application_start_at,
          application_end_at: e.response.data.application_end_at,
          application_now: e.response.data.application_now,
          application_is_open: false,
        } : p);
        setShowApplicationClosed(true);
        return;
      }
      alert('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  function openCommitConfirm(){
    if(!applicationIsOpen){ setShowApplicationClosed(true); return; }
    if(items.length===0) { alert('선택이 없습니다.'); return; }
    if(!smsVerified) { setShowSmsRequire(true); return; }
    setShowCommitConfirm(true);
  }

  // 문자 전송(미리보기 포함)
  async function sms(){
    if(items.length===0) { alert('선택이 없습니다'); return; }

    const grouped = items.reduce((acc, it) => { (acc[it.date] = acc[it.date] || []).push(it); return acc; }, {});
    const orderedDates = Object.keys(grouped).sort();
    const periodText = orderedDates.length
      ? (fmtMD(orderedDates[0]) + (orderedDates[0] === orderedDates[orderedDates.length - 1] ? '' : `~${fmtMD(orderedDates[orderedDates.length - 1])}`))
      : '-';
    const totalCount = items.length;
    const lines = orderedDates.map(d => {
      const wd = weekdaysKo[new Date(d).getDay()];
      const labels = grouped[d].map(x=>slotLabel(x.slot, x.portion)).sort().join(', ');
      return `${fmtMD(d)}(${wd}) ${labels}`;
    }).join('\n');

    const studentName = (name || policy?.student?.name || '').trim();
    const memo = (policy?.sms_extra_text || '').trim();
    let previewMsg =
      `[메디컬로드맵 도시락 신청]\n\n` +
      `※ ${studentName}학생\n` +
      `- 기간: ${periodText}\n` +
      `- 식수: ${totalCount}식\n` +
      `- 비용: ${total.toLocaleString()}원`;
    if(memo){ previewMsg += `\n\n※ 입금 계좌\n${memo}`; }
    previewMsg += `\n\n※ 신청내역\n${lines || '-'}`;
    setSmsPreview(previewMsg);

    const to = (phone||'').trim();
    if(!to || to.length < 9){ alert('전화번호를 정확히 입력해 주세요.'); return; }
    try{
      await api.post('/sms/summary', { to, code, items, total, name });
      setSmsVerifiedKey(currentSmsKey);
      alert('입력하신 번호로 문자가 전송되었습니다.');
    }catch(e){
      console.error('SMS send failed', e?.response?.data||String(e));
      alert('문자 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  // 현재 코드의 임시 선택만 초기화
  function resetSelections({ silent = false } = {}){
    setSelected({});
    setCouponAssignments({});
    setSmsVerifiedKey(null);
    setSmsPreview(null);
    const saved = readLS();
    const selections = saved.selections || {};
    const coupons = saved.coupons || {};
    if(code) selections[code] = {};
    if(code) coupons[code] = {};
    writeLS({ lastCode: code, lastName: name, phone, selections, coupons });
    if(!silent) alert('선택이 초기화되었습니다.');
  }

  return (
    <div className="grid grid-student lg:grid-cols-2 gap-6">
      {/* Entry */}
      <section className="card p-5 lg:col-span-2">
        <h2 className="text-xl font-bold mb-3">학생 입장</h2>
        <div className="flex gap-2 flex-col sm:flex-row sm:items-center">
          <input className="flex-1 border rounded-xl px-3 py-2" placeholder="코드 입력 (예: dfv201)" value={code} onChange={e=>setCode(e.target.value)}/>
          <input className="flex-1 border rounded-xl px-3 py-2" placeholder="이름 입력" value={name} onChange={e=>setName(e.target.value)}/>
          <button className="btn-primary" onClick={enter}>입장</button>
        </div>

        {/* ✅ 내 신청 내역 보기 버튼 — flex 블록 “밖”에 배치 */}
        <div className="mt-3 text-right">
          <button
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition"
            onClick={() => {
              if (!code) return alert("먼저 코드를 입력하세요.");
              navigate(`/student/history?code=${code}`);
            }}
          >
            내 신청 내역 보기
          </button>
        </div>
      </section>

      {/* Menu */}
      <section className="card p-5 lg:col-span-2">
        <h2 className="text-xl font-bold mb-3">이번 주 메뉴</h2>
        <LargeMenu/>
      </section>

      {/* Middle: week calendar */}
      <section className="card p-5 lg:col-span-2">
        <h2 className="text-xl font-bold mb-3">기간 신청</h2>
        {!policy && <div className="text-slate-500">코드와 이름으로 입장하면 신청 캘린더가 열립니다.</div>}
        {policy && (
          <>
            {!applicationIsOpen && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                현재 온라인 신청 기간이 아닙니다. 신청 가능 시간은 {fmtDateTime(policy.application_start_at)} ~ {fmtDateTime(policy.application_end_at)} 입니다.
              </div>
            )}
            {availableCoupons.length > 0 && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                사용 가능한 이월 쿠폰이 <b>{availableCoupons.length}장</b> 있습니다.
                식사를 선택한 뒤 해당 식사의 “이월 쿠폰 적용” 버튼을 누르면 1회 식사가 0원으로 처리됩니다.
                이월 쿠폰은 발급 후 7일이 지나면 자동으로 만료됩니다.
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-500"></div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={()=>setAllPortion('BASE')}>전체 기본식으로 변경</button>
                <button className="btn-ghost" onClick={()=>setAllPortion('EXTRA')}>전체 곱빼기로 변경</button>
                <button className="btn-ghost" onClick={resetSelections}>선택 리셋</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekDates.map(d=>{
                const wd = new Date(d).getDay();
                const wdCode=['SUN','MON','TUE','WED','THU','FRI','SAT'][wd];

                // 카드 숨김: 허용 요일 X, 혹은 점/저녁 모두 막힘
                const allowedDay = allowed.has(wdCode);
                const blockedBoth =
                  nosvc.get(`${d}-BOTH`) ||
                  (nosvc.get(`${d}-LUNCH`) && nosvc.get(`${d}-DINNER`));
                if (!allowedDay || blockedBoth) return null;

                return (
                  <div key={d} className="rounded-2xl border p-4 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{d}</div>
                      <div className="text-sm text-slate-500">{weekdaysKo[wd]}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {slots.map(slot=>{
                        const key = `${d}-${slot}`;
                        const carryoverItem = carryoverMap.get(key);
                        const disabled = !!nosvc.get(key) || !!carryoverItem || !applicationIsOpen;
                        const selectedItem = items.find(x=>x.date===d && x.slot===slot);
                        const portion = selectedItem?.portion || null;
                        const disabledTitle = carryoverItem
                          ? `이월 식수: ${fmtMD(carryoverItem.from_date)} ${slotKo[carryoverItem.from_slot] || carryoverItem.from_slot}에서 이월`
                          : (!applicationIsOpen ? '현재 온라인 신청 기간이 아닙니다.' : '신청 불가');
                        return (
                          <div key={slot} className={`rounded-xl border p-2 ${disabled && !carryoverItem ? 'opacity-40' : ''} ${carryoverItem ? 'bg-emerald-50 border-emerald-200' : ''}`}>
                            <div className="text-xs text-slate-500 mb-1">{slotKo[slot]}</div>
                            {carryoverItem && (
                              <div className="mb-1 text-[11px] font-semibold text-emerald-700">
                                이월됨 · 결제완료 · 0원
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={()=>!disabled && setPortion(d,slot,'BASE')}
                                className={`h-9 rounded-lg border text-xs w-full text-center transition
                                  ${portion === 'BASE' ? 'bg-primary text-white border-primary shadow' : 'bg-white hover:bg-slate-50'}
                                  ${disabled ? 'cursor-not-allowed' : ''}
                                `}
                                disabled={disabled}
                                title={disabled ? disabledTitle : `${slotKo[slot]} - 기본`}
                              >
                                기본
                              </button>
                              <button
                                onClick={()=>!disabled && setPortion(d,slot,'EXTRA')}
                                className={`h-9 rounded-lg border text-xs w-full text-center transition
                                  ${portion === 'EXTRA' ? 'bg-primary text-white border-primary shadow' : 'bg-white hover:bg-slate-50'}
                                  ${disabled ? 'cursor-not-allowed' : ''}
                                `}
                                disabled={disabled}
                                title={disabled ? disabledTitle : `${slotKo[slot]} - 곱빼기`}
                              >
                                곱빼기
                              </button>
                            </div>
                            {portion && !carryoverItem && availableCoupons.length > 0 && (
                              <button
                                type="button"
                                className={`mt-2 h-8 w-full rounded-lg border text-xs font-semibold transition ${
                                  selectedItem?.carryover_coupon_id
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => toggleCoupon(d, slot)}
                              >
                                {selectedItem?.carryover_coupon_id ? '이월 쿠폰 적용됨 · 0원' : '이월 쿠폰 적용'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
          const rows = summaryItems.map((it, idx) => {
            const wd = weekdaysKo[new Date(it.date).getDay()];
            const label = it.source === 'CARRYOVER'
              ? `${slotLabel(it.slot, it.portion)} (이월)`
              : `${slotLabel(it.slot, it.portion)}${it.carryover_coupon_id ? ' (이월 쿠폰)' : ''}`;
            return {
              key: `${it.source || 'ORDER'}-${it.date}-${it.slot}-${idx}`,
              date: it.date,
              wd,
              label,
              price: Number(it.price || 0),
            };
          }).sort((a,b)=> a.date.localeCompare(b.date));
          return (
            <>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {summaryItems.length===0 && <div className="text-slate-500">선택 내역이 없습니다.</div>}
                {rows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-sm">
                    <div>{r.date} {r.wd} {r.label}</div>
                    <div className="font-semibold">{r.price.toLocaleString()}원</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <div className="text-slate-600">합계</div>
                <div className="text-xl font-bold">{total.toLocaleString()}원</div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="전화번호 입력 (숫자만)"
                    value={phone}
                    onChange={e=>setPhone((e.target.value||'').replace(/[^0-9]/g,''))}
                  />
                  <button className="btn-ghost" onClick={sms}>신청 내역 문자 받기</button>
                </div>

                <button
                  className={`btn-primary ${smsVerified ? '' : 'cursor-not-allowed opacity-50 hover:bg-primary'}`}
                  onClick={openCommitConfirm}
                  aria-disabled={!smsVerified}
                >
                  도시락 신청하기
                </button>

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

      {/* Commit confirm modal */}
      {showCommitConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[90vw] max-w-md shadow-xl">
            <div className="text-lg font-semibold mb-2">확인</div>
            <div className="text-sm text-slate-600 mb-4">
              하단 결제 요약의 신청 일자와 금액을 확인하셨습니까?
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={()=>setShowCommitConfirm(false)}>취소</button>
              <button className="btn-primary" onClick={()=>{ setShowCommitConfirm(false); commit(); }}>확인</button>
            </div>
          </div>
        </div>
      )}

      {showApplicationClosed && policy?.application_is_open === false && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-7 w-[92vw] max-w-lg shadow-xl">
            <div className="text-2xl font-bold mb-3">현재 도시락 신청 기간이 아닙니다</div>
            <div className="text-slate-700 leading-6">
              온라인 신청은 아래 기간에만 가능합니다. 기간 외 추가 신청은 전화로 문의해 주세요.
            </div>
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="text-sm text-amber-900">도시락 신청 가능 시간</div>
              <div className="mt-1 text-lg font-semibold text-amber-950">
                {fmtDateTime(policy.application_start_at)} ~ {fmtDateTime(policy.application_end_at)}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="btn-primary" onClick={()=>setShowApplicationClosed(false)}>확인</button>
            </div>
          </div>
        </div>
      )}

      {showCouponNotice && availableCoupons.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-7 shadow-xl">
            <div className="text-2xl font-bold text-emerald-700">이월 쿠폰이 있습니다</div>
            <div className="mt-3 text-slate-700">
              현재 사용할 수 있는 이월 쿠폰이 <b>{availableCoupons.length}장</b> 있습니다.
              신청할 식사를 먼저 선택한 뒤 “이월 쿠폰 적용” 버튼을 눌러 주세요.
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              이월 쿠폰은 발급일로부터 7일 후 자동으로 없어집니다.
              {availableCoupons.length > 0 && (
                <div className="mt-2 space-y-1 font-semibold">
                  {availableCoupons.map((coupon) => (
                    <div key={coupon.id}>
                      쿠폰 #{coupon.id} · {fmtKstDate(coupon.expires_at)}까지
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn-primary mt-5 w-full"
              onClick={() => setShowCouponNotice(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Global modal: 문자 요구 */}
      {showSmsRequire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[90vw] max-w-md shadow-xl">
            <div className="text-lg font-semibold mb-2">문자 확인 필요</div>
            <div className="text-sm text-slate-600 mb-4">
              전화번호를 입력하고 <b>“신청 내역 문자 받기”</b>를 눌러 문자로 신청 내역을 받아야 도시락 신청이 가능합니다.
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
