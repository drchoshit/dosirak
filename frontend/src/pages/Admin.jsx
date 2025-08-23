import React,{useEffect,useMemo,useState} from 'react';
import { api } from '../lib/api';
import { FileDown, Printer, Settings, CalendarDays, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const DAY_LABELS=['일','월','화','수','목','금','토'];
const DAY_CODES=['SUN','MON','TUE','WED','THU','FRI','SAT'];

export default function Admin(){
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

  useEffect(()=>{ load(); },[]);
  async function load(){
    const s=await api.get('/admin/students'); setStudents(s.data);
    const p=await api.get('/admin/policy'); setPolicy(p.data);
    const b=await api.get('/admin/no-service-days'); setNosvc(b.data);
    const imgs=await api.get('/admin/menu-images'); setImages(imgs.data);
  }

  const filtered=students.filter(s=>(s.name+s.code).toLowerCase().includes(search.toLowerCase()));
  const kpi=useMemo(()=>({students:students.length,nosvc:nosvc.length,price:policy?.base_price||9000}),[students,nosvc,policy]);

  // CSV Import
  async function importCSV(text){
    await api.post('/admin/students/import',text,{headers:{'Content-Type':'text/csv'}});
    await load();
  }
  const onCSV=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>importCSV(r.result);
    r.readAsText(f,'utf-8');
  };

  // ---- EXCEL Import (신규) ----
  async function importExcelFile(file){
    if(!file) return;
    const fd=new FormData();
    fd.append('file', file); // 서버: multer.single('file')
    await api.post('/admin/students/import-xlsx', fd, {
      headers:{ 'Content-Type':'multipart/form-data' }
    });
    await load();
    alert('엑셀 불러오기 완료');
  }
  function onExcelPick(e){
    const f=e.target.files?.[0];
    if(!f) return;
    importExcelFile(f).catch(err=>{
      console.error(err);
      alert('엑셀 불러오기에 실패했습니다.');
    });
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
    await api.put('/admin/students/'+row.id, { name:row.name, code:row.code, phone:row.phone, parent_phone:row.parent_phone });
    await load();
  }
  async function deleteStudentRow(id){
    if(!confirm('삭제하시겠습니까?')) return;
    await api.delete('/admin/students/'+id);
    await load();
  }
  async function exportStudents(){
    window.location.href = '/api/admin/students/export';
  }

  // ---- EXCEL Export (신규) ----
  async function exportStudentsXlsx(){
    window.location.href = '/api/admin/students/export.xlsx';
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
    // fix: api의 baseURL이 이미 '/api' 이므로 앞에 또 '/api'를 붙이면 404
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 card p-4">
        <button className="btn-ghost" onClick={() => setShowStudents((s) => !s)}>학생 DB</button>

        {/* ✅ 엑셀 불러오기 */}
        <input type="file" accept=".xlsx,.xls" onChange={onExcelPick} className="text-sm" />

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

            {/* ✅ 엑셀 다운로드/불러오기 추가 */}
            <button className="btn-ghost" onClick={exportStudentsXlsx}>다운로드(엑셀)</button>
            <label className="btn-ghost">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelPick}/>
              불러오기(엑셀)
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
            <label className="text-sm">종료일
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
        <div className="overflow-auto max-h=[60vh]">
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
