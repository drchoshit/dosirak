import React, { useEffect, useMemo, useState } from 'react';
import { api, adminAPI, studentAPI } from '../lib/api';
import { FileDown, Printer, Settings, CalendarDays, Trash2, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

const DAY_LABELS = ['일','월','화','수','목','금','토'];
const DAY_CODES  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export default function Admin(){
  // --- Auth state ---
  const [isAuthed, setIsAuthed] = useState(null); // null=확인중, true/false
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // --- Data states (기존) ---
  const [students,setStudents]=useState([]);
  const [policy,setPolicy]=useState(null);
  const [img,setImg]=useState(null);
  const [images,setImages]=useState([]);
  const [nosvc,setNosvc]=useState([]);
  const [boDate,setBoDate]=useState('');

  const [weekStart,setWeekStart]=useState('');
  const [weekEnd,setWeekEnd]=useState('');
  const [weekly,setWeekly]=useState(null);

  const [showStudents,setShowStudents]=useState(false);
  const [newStu,setNewStu]=useState({name:'',code:'',phone:'',parent_phone:''});

  const [boSlot,setBoSlot]=useState('BOTH');
  const [search,setSearch]=useState('');

  // ---- 최초에 로그인 상태 확인 ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminAPI.me();
        const ok = !!data?.authenticated;
        setIsAuthed(ok);
        if (ok) await load();
      } catch {
        setIsAuthed(false);
      }
    })();
  }, []);

  // ---- 인증 후 데이터 로드 ----
  useEffect(() => {
    if (isAuthed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  async function load(){
    const s=await api.get('/admin/students'); setStudents(s.data);
    const p=await api.get('/admin/policy'); setPolicy(p.data);
    const b=await api.get('/admin/no-service-days'); setNosvc(b.data);
    const imgs=await api.get('/admin/menu-images'); setImages(imgs.data);
  }

  // --- Auth handlers ---
  async function handleLogin(e){
    e?.preventDefault();
    setLoginError('');
    try{
      await adminAPI.login(loginForm.username, loginForm.password);
      setIsAuthed(true);
      await load();
    }catch(err){
      setIsAuthed(false);
      setLoginError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  }
  async function handleLogout(){
    try { await adminAPI.logout(); } catch {}
    setIsAuthed(false);
    // 민감 데이터 초기화
    setStudents([]); setPolicy(null); setImages([]); setNosvc([]);
    setWeekly(null);
  }

  // --- Filters/KPI ---
  const filtered=students.filter(s=>(s.name+s.code).toLowerCase().includes(search.toLowerCase()));
  const kpi=useMemo(()=>({students:students.length,nosvc:nosvc.length,price:policy?.base_price||9000}),[students,nosvc,policy]);

  // CSV Import
  async function importCSV(text){
    await api.post('/admin/students/import',text,{headers:{'Content-Type':'text/csv'}});
    await load();
    alert('CSV 불러오기 완료');
  }
  const onCSV=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>importCSV(r.result);
    r.readAsText(f,'utf-8');
    e.target.value='';
  };

  // ---- EXCEL Preview (미리보기: DB 저장 없이 테이블에만 채우기) ----
  async function previewExcelFile(file){
    if(!file) return;
    try{
      const resp = await studentAPI.previewExcel(file);
      const arr = resp.data?.students || [];
      const mapped = arr.map((s,idx)=>({
        id: `tmp-${idx}`, // 미리보기용 가짜 id
        name: s.name || '',
        code: s.code || '',
        phone: s.studentPhone || '',
        parent_phone: s.parentPhone || '',
        allowed_weekdays: '',
        start_date: '',
        end_date: '',
        price_override: null
      }));
      setStudents(mapped);
      alert(`엑셀에서 ${mapped.length}명의 학생을 불러왔습니다. (미리보기)\n행 '저장'을 누르면 해당 항목만 DB에 반영됩니다.\n또는 '엑셀→DB추가'를 사용하면 신규 항목을 일괄 추가합니다.`);
    }catch(err){
      console.error(err);
      alert('엑셀 미리보기 불러오기에 실패했습니다.');
    }
  }
  function onExcelPreviewPick(e){
    const f=e.target.files?.[0];
    if(!f) return;
    previewExcelFile(f);
    e.target.value='';
  }

  // ---- EXCEL Import (신규만 추가 + 스킵 명단 팝업) ----
  async function importExcelFile(file){
    if(!file) return;
    try{
      const resp = await studentAPI.importExcel(file);
      const { imported = 0, skipped_existing = [], skipped_code_conflict = [] } = resp.data || {};
      await load();

      const list = (arr)=>arr.map(x=>`${x.name}(${x.code})`).join(', ');
      let msg = `엑셀 불러오기 완료\n\n추가된 학생: ${imported}명`;

      if (skipped_existing.length){
        msg += `\n\n이미 등록되어 추가되지 않은 학생(이름+코드 일치): ${skipped_existing.length}명`;
        msg += `\n- ${list(skipped_existing).slice(0, 700)}`;
      }
      if (skipped_code_conflict.length){
        msg += `\n\n코드 중복으로 추가되지 않은 항목: ${skipped_code_conflict.length}명`;
        msg += `\n- ${list(skipped_code_conflict).slice(0, 700)}`;
      }
      alert(msg);
    }catch(err){
      console.error(err);
      alert('엑셀 불러오기에 실패했습니다.');
    }
  }
  function onExcelImportPick(e){
    const f=e.target.files?.[0];
    if(!f) return;
    importExcelFile(f);
    e.target.value='';
  }

  // 전역 정책
  function dayCodesFromState(arr){ return arr.map((on,i)=> on?DAY_CODES[i]:null).filter(Boolean).join(','); }
  const [daySel,setDaySel]=useState([false,true,true,true,true,true,false]);
  useEffect(()=>{
    if(policy){
      const set=new Set((policy.allowed_weekdays||'').split(',').filter(Boolean));
      setDaySel(DAY_CODES.map(c=>set.has(c)));
    }
  },[policy]);
  function toggleDay(i){ setDaySel(s=> s.map((v,idx)=> idx===i ? !v : v)); }
  async function savePolicy(){
    const payload={...policy, allowed_weekdays: dayCodesFromState(daySel)};
    await api.post('/admin/policy',payload);
    alert('정책 저장 완료');
  }
  function onStartChange(v){ setPolicy(p=>({ ...p, start_date: v })); }

  // 메뉴 이미지 업로드/삭제
  async function uploadImage(){
    if(!img) { alert('파일을 선택하세요'); return; }
    try{
      const fd=new FormData();
      fd.append('image', img);
      await api.post('/admin/menu-images', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setImg(null);
      await load();
      alert('업로드 완료');
    }catch(e){
      console.error(e);
      alert('업로드 실패');
    }
  }
  async function deleteImage(id){
    await api.delete('/admin/menu-images/'+id);
    await load();
  }

  // 학생 CRUD
  async function addStudent(){
    if(!newStu.name||!newStu.code) return alert('이름/코드 필요');
    await api.post('/admin/students', newStu);
    setNewStu({name:'',code:'',phone:'',parent_phone:''});
    await load();
  }
  async function updateStudent(row){
    if(String(row.id || '').startsWith('tmp-')){
      // 미리보기 행은 DB에 없으므로 create로 처리
      await api.post('/admin/students', {
        name: row.name, code: row.code, phone: row.phone, parent_phone: row.parent_phone
      });
    } else {
      await api.put('/admin/students/'+row.id, { name:row.name, code:row.code, phone:row.phone, parent_phone:row.parent_phone });
    }
    await load();
  }
  async function deleteStudentRow(id){
    if(!confirm('삭제하시겠습니까?')) return;
    if(String(id || '').startsWith('tmp-')){
      setStudents(list=> list.filter(s=>s.id!==id)); // 미리보기 행만 제거
      return;
    }
    await api.delete('/admin/students/'+id);
    await load();
  }
  async function exportStudents(){
    window.location.href = '/api/admin/students/export';
  }

  // ---- EXCEL Export (파일 저장) ----
  async function exportStudentsXlsx(){
    try{
      const res = await studentAPI.exportExcel();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }catch(err){
      console.error(err);
      alert('엑셀 다운로드에 실패했습니다.');
    }
  }

  // 학생별 예외 저장
  async function saveOverride(row){
    const payload={
      allowed_weekdays: (row.allowed_weekdays||'') || null,
      start_date: (row.start_date||'') || null,
      end_date: (row.end_date||'') || null,
      price_override: (row.price_override==='' ? null : (row.price_override ?? null))
    };
    await api.post('/admin/student-policy/'+row.id, payload);
    alert('학생 예외 저장 완료');
    await load();
  }

  // 블랙아웃 추가/삭제
  async function addNoSvc(){
    if(!boDate) return alert('날짜');
    await api.post('/admin/no-service-days',{date:boDate,slot:boSlot});
    setBoDate(''); setBoSlot('BOTH');
    await load();
  }
  async function delNoSvc(id){
    await api.delete('/admin/no-service-days/'+id);
    await load();
  }

  // 파일 업로드로 CSV 불러오기(동일 기능)
  function onFilePick(e){
    const f = e.target.files?.[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=> importCSV(r.result);
    r.readAsText(f, 'utf-8');
    e.target.value = '';
  }

  function onCellChange(id,key,val){
    setStudents(list=> list.map(s=> s.id===id ? {...s,[key]:val} : s));
  }

  // --- 주간 요약 불러오기 & 표시 ---
  async function loadWeekly(){
    if(!weekStart||!weekEnd) { alert('시작일과 종료일을 선택하세요'); return; }
    const r = await api.get('/admin/weekly-summary', { params:{ start: weekStart, end: weekEnd } });
    setWeekly(r.data);
  }
  const wd = (d)=> DAY_LABELS[new Date(d).getDay()];

  // ===== 렌더링 =====
  // 1) 인증 확인중
  if (isAuthed === null) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-slate-600">관리자 인증 확인 중…</div>
      </div>
    );
  }

  // 2) 로그인 폼
  if (!isAuthed) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm card p-6 space-y-4"
        >
          <h1 className="text-xl font-bold text-center">관리자 로그인</h1>
          <label className="block text-sm">
            아이디
            <input
              className="mt-1 input w-full"
              value={loginForm.username}
              onChange={e=>setLoginForm(f=>({...f, username:e.target.value}))}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            비밀번호
            <input
              className="mt-1 input w-full"
              type="password"
              value={loginForm.password}
              onChange={e=>setLoginForm(f=>({...f, password:e.target.value}))}
            />
          </label>
          {loginError && <div className="text-danger text-sm">{loginError}</div>}
          <button type="submit" className="btn-primary w-full">로그인</button>
          <div className="text-xs text-slate-500 text-center mt-1">
          </div>
        </form>
      </div>
    );
  }

  // 3) 인증됨 → 기존 관리자 화면
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 card p-4">
        <button className="btn-ghost" onClick={() => setShowStudents((s) => !s)}>학생 DB</button>

        {/* ✅ 엑셀 불러오기(미리보기) */}
        <label className="btn-ghost">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelPreviewPick}/>
          불러오기(엑셀)
        </label>

        {/* (옵션) 신규만 DB에 일괄 추가 */}
        <label className="btn-ghost">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelImportPick}/>
          엑셀→DB추가
        </label>

        <Link to="/admin/print" className="btn-ghost">
          <Printer size={16} /> 인쇄
        </Link>

        {/* 출석 CSV 다운로드(기존 유지) */}
        <a className="btn-ghost" href="#"
           onClick={async (e) => {
             e.preventDefault();
             const d = prompt("날짜(YYYY-MM-DD)");
             if (!d) return;
             window.location.href = "/api/admin/attendance.csv?date=" + d;
           }}>
          <FileDown size={16} /> CSV 다운로드
        </a>

        <div className="grow" />
        <button className="btn-ghost" onClick={handleLogout} title="로그아웃">
          <LogOut size={16} /> 로그아웃
        </button>
      </div>

      {showStudents && (
        <div className="card p-5">
          <h2 className="font-bold text-lg">학생 DB</h2>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-2 items-end">
            <input className="input" placeholder="이름" value={newStu.name} onChange={e=>setNewStu(s=>({...s,name:e.target.value}))}/>
            <input className="input" placeholder="코드" value={newStu.code} onChange={e=>setNewStu(s=>({...s,code:e.target.value}))}/>
            <input className="input" placeholder="학생 연락처" value={newStu.phone} onChange={e=>setNewStu(s=>({...s,phone:e.target.value}))}/>
            <input className="input" placeholder="학부모 연락처" value={newStu.parent_phone} onChange={e=>setNewStu(s=>({...s,parent_phone:e.target.value}))}/>
            <button className="btn-primary" onClick={addStudent}>학생 추가</button>

            {/* ✅ 엑셀 다운로드/불러오기 */}
            <button className="btn-ghost" onClick={exportStudentsXlsx}>다운로드(엑셀)</button>
            <label className="btn-ghost">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelPreviewPick}/>
              불러오기(엑셀)
            </label>
            <label className="btn-ghost">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelImportPick}/>
              엑셀→DB추가
            </label>

            {/* (기존 CSV도 유지) */}
            <button className="btn-ghost" onClick={exportStudents}>다운로드(CSV)</button>
            <label className="btn-ghost">
              <input type="file" accept=".csv" className="hidden" onChange={onFilePick}/>
              불러오기(CSV)
            </label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-slate-50"><tr>
                <th className="p-2 border">이름</th>
                <th className="p-2 border">코드</th>
                <th className="p-2 border">학생 연락처</th>
                <th className="p-2 border">학부모 연락처</th>
                <th className="p-2 border">액션</th>
              </tr></thead>
              <tbody>
                {students.map(st=>(
                  <tr key={st.id}>
                    <td className="p-2 border"><input className="input" value={st.name||''} onChange={e=>onCellChange(st.id,'name',e.target.value)}/></td>
                    <td className="p-2 border"><input className="input" value={st.code||''} onChange={e=>onCellChange(st.id,'code',e.target.value)}/></td>
                    <td className="p-2 border"><input className="input" value={st.phone||''} onChange={e=>onCellChange(st.id,'phone',e.target.value)}/></td>
                    <td className="p-2 border"><input className="input" value={st.parent_phone||''} onChange={e=>onCellChange(st.id,'parent_phone',e.target.value)}/></td>
                    <td className="p-2 border">
                      <div className="flex gap-2">
                        <button className="btn-ghost" onClick={()=>updateStudent(st)}>저장</button>
                        <button className="btn-ghost" onClick={()=>deleteStudentRow(st.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5"><div className="text-slate-500 text-sm">등록 학생</div><div className="text-3xl font-bold mt-1">{kpi.students}명</div></div>
        <div className="card p-5"><div className="text-slate-500 text-sm">기본 1식 가격</div><div className="text-3xl font-bold mt-1">{kpi.price.toLocaleString()}원</div></div>
        <div className="card p-5"><div className="text-slate-500 text-sm">도시락 미제공 지정 수</div><div className="text-3xl font-bold mt-1">{kpi.nosvc}</div></div>
      </div>

      {policy && (
        <div className="card p-5">
          <h2 className="font-bold text-lg flex items-center gap-2"><Settings size={18}/> 전역 정책</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <label className="text-sm">기본 가격(원)
              <input type="number" value={policy.base_price} onChange={e=>setPolicy({...policy,base_price:+e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2"/>
            </label>
            <div className="text-sm">허용 요일(복수 선택)
              <div className="mt-1 grid grid-cols-7 gap-1">
                {DAY_LABELS.map((lb,i)=>(
                  <label key={lb} className={"px-2 py-1 rounded-lg border text-center cursor-pointer "+(daySel[i]?'bg-primary text-white border-primary':'bg-white')}>
                    <input type="checkbox" className="hidden" checked={daySel[i]} onChange={()=>toggleDay(i)}/>{lb}
                  </label>
                ))}
              </div>
            </div>
            <label className="text-sm">시작일
              <input value={policy.start_date||''} onChange={e=>onStartChange(e.target.value)} placeholder="YYYY-MM-DD" className="mt-1 w-full border rounded-xl px-3 py-2"/>
            </label>
            <label className="text_sm">종료일
              <input type="date" value={policy.end_date||""} onChange={e=>setPolicy(p=>({...p,end_date:e.target.value}))} className="mt-1 w-full border rounded-xl px-3 py-2"/>
            </label>

            {/* ✅ 문자 추가 메모(고정 문구) — Admin이 저장 */}
            <label className="text-sm sm:col-span-2">
              문자 추가 메모(고정 문구)
              <textarea
                rows={3}
                className="mt-1 w-full border rounded-xl px-3 py-2"
                placeholder="예) 도시락 수령은 스터디룸 입구에서 해주세요 🙂"
                value={policy.sms_extra_text || ''}
                onChange={e=>setPolicy(p=>({...p, sms_extra_text: e.target.value}))}
              />
              <div className="text-xs text-slate-500 mt-1">
                학생이 ‘신청 내역 문자 받기’를 누를 때, 본문 하단에 이 문구가 자동으로 붙습니다.
              </div>
            </label>
          </div>
          <button className="btn-primary mt-3" onClick={savePolicy}>저장</button>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-bold text-lg">메뉴 이미지 업로드</h2>
        <div className="flex gap-2 mt-2">
          <input type="file" accept="image/*" onChange={e=>setImg(e.target.files?.[0]||null)} />
          <button className="btn-ghost" type="button" onClick={uploadImage}>업로드</button>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          {images.map(x=>(
            <div key={x.id} className="border rounded-xl p-2 text-center">
              <img src={x.url} className="w-full h-28 object-cover rounded-lg"/>
              <button className="mt-2 btn-ghost mx-auto" onClick={()=>deleteImage(x.id)}><Trash2 size={16}/> 취소(삭제)</button>
            </div>
          ))}
          {images.length===0 && <div className="text-slate-500">업로드된 이미지가 없습니다.</div>}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-lg flex items-center gap-2"><CalendarDays size={18}/> 도시락 미제공일 지정</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          <input type="date" value={boDate} onChange={e=>setBoDate(e.target.value)} className="border rounded-xl px-3 py-2"/>
          <select value={boSlot} onChange={e=>setBoSlot(e.target.value)} className="border rounded-xl px-3 py-2">
            <option value="BOTH">점심+저녁</option>
            <option value="LUNCH">점심</option>
            <option value="DINNER">저녁</option>
          </select>
          <button className="btn-ghost" onClick={addNoSvc}>추가</button>
        </div>
        <table className="w-full text-sm border mt-3">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr><th className="p-2 border">ID</th><th className="p-2 border">날짜</th><th className="p-2 border">구분</th><th className="p-2 border text-center">삭제</th></tr>
          </thead>
          <tbody>
            {nosvc.map(b=>(
              <tr key={b.id}>
                <td className="p-2 border">{b.id}</td>
                <td className="p-2 border">{b.date}</td>
                <td className="p-2 border">{b.slot}</td>
                <td className="p-2 border text-center"><button className="text-danger" onClick={()=>delNoSvc(b.id)}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">학생 별 예외 설정</h2>
          <input placeholder="이름 또는 코드 검색" value={search} onChange={e=>setSearch(e.target.value)} className="border rounded-xl px-3 py-2"/>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-[800px] w-full text-sm border mt-3">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr><th className="p-2 border">코드</th><th className="p-2 border">이름</th><th className="p-2 border">허용요일(MON..)</th><th className="p-2 border">기간</th><th className="p-2 border">1식가격</th><th className="p-2 border">저장</th></tr>
            </thead>
            <tbody>
              {filtered.map(s=>(
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="p-2 border">{s.code}</td>
                  <td className="p-2 border">{s.name}</td>
                  <td className="p-2 border">
                    <div className="grid grid-cols-7 gap-1 text-xs">
                      {['일','월','화','수','목','금','토'].map((lb, i)=>{
                        const codes=['SUN','MON','TUE','WED','THU','FRI','SAT'];
                        const set=new Set((s.allowed_weekdays||'').split(',').filter(Boolean));
                        const checked=set.has(codes[i]);
                        return (
                          <label key={i} className={"px-2 py-1 rounded border text-center cursor-pointer "+(checked?'bg-primary text-white border-primary':'bg-white')}>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={()=>{
                                const current=new Set((s.allowed_weekdays||'').split(',').filter(Boolean));
                                if(checked) current.delete(codes[i]); else current.add(codes[i]);
                                // 순서를 고정해서 저장
                                const ordered = DAY_CODES.filter(c=>current.has(c)).join(',');
                                onCellChange(s.id,'allowed_weekdays', ordered);
                              }}
                            />{lb}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-2 border">
                    <div className="flex items-center gap-1">
                      <input className="w-36 border rounded-lg px-2 py-1" value={s.start_date||''} onChange={e=>onCellChange(s.id,'start_date',e.target.value)} placeholder="YYYY-MM-DD"/>
                      <span>~</span>
                      <input className="w-36 border rounded-lg px-2 py-1" value={s.end_date||''} onChange={e=>onCellChange(s.id,'end_date',e.target.value)} placeholder="YYYY-MM-DD"/>
                    </div>
                  </td>
                  <td className="p-2 border">
                    <input type="number" className="w-28 border rounded-lg px-2 py-1" value={s.price_override||''} onChange={e=>onCellChange(s.id,'price_override',e.target.value)}/>
                  </td>
                  <td className="p-2 border">
                    <button className="btn-ghost" type="button" onClick={()=>saveOverride(s)}>저장</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-lg">주간 신청 요약</h2>
        <div className="mt-3 grid sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <label className="text-sm">시작일
            <input type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/>
          </label>
          <div className="flex items-end"><span className="px-2">~</span></div>
          <label className="text-sm">종료일
            <input type="date" value={weekEnd} onChange={e=>setWeekEnd(e.target.value)} className="mt-1 w-full border rounded-xl px-3 py-2"/>
          </label>
        </div>
        <div className="mt-2">
          <button className="btn-primary" onClick={loadWeekly}>요약 불러오기</button>
        </div>

        {weekly && Array.isArray(weekly.days) && Array.isArray(weekly.rows) ? (
          <div className="mt-4 overflow-auto">
            <table className="min-w-[900px] w-full text-sm border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 border text-left">이름 (코드)</th>
                  {weekly.days.map(d=>(
                    <th key={d} className="p-2 border text-center">{d} <span className="text-slate-500 text-xs">({wd(d)})</span></th>
                  ))}
                  <th className="p-2 border text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {weekly.rows.map(r=>{
                  const total = r.count ?? 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-2 border">{r.name} <span className="text-slate-500">({r.code})</span></td>
                      {weekly.days.map(d=>{
                        const info = r.byDate?.[d] || {};
                        const marks = [
                          info.LUNCH ? '점' : '',
                          info.DINNER ? '저' : ''
                        ].filter(Boolean).join('·');
                        return <td key={d} className="p-2 border text-center">{marks}</td>;
                      })}
                      <td className="p-2 border text-right">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : weekly ? (
          // 구형 API(applied/notApplied) 대응 폴백
          <div className="mt-4 grid lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">신청한 학생 ({weekly.applied.length})</h3>
              <ul className="space-y-1 max-h-80 overflow-auto pr-1">
                {weekly.applied.map(row => (
                  <li key={row.id} className="text-sm flex justify-between">
                    <span>{row.name} <span className="text-slate-500">({row.code})</span></span>
                    <span className="text-slate-600">{row.count}건</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">신청하지 않은 학생 ({weekly.notApplied.length})</h3>
              <ul className="space-y-1 max-h-80 overflow-auto pr-1">
                {weekly.notApplied.map(row => (
                  <li key={row.id} className="text-sm">{row.name} <span className="text-slate-500">({row.code})</span></li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
