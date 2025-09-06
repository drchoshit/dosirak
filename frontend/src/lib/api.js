// frontend/lib/api.js
import axios from 'axios';

/** -------------------------------
 *  기본 설정
 * --------------------------------*/
const envBase =
  (import.meta.env &&
    (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL)) ||
  '/api';
const baseURL = String(envBase || '/api').trim() || '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true, // HttpOnly 쿠키 전달
  headers: { 'Content-Type': 'application/json' },
});

// (개발 편의) 콘솔에 베이스 경로 출력
if (import.meta.env?.DEV) {
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', baseURL);
}

/** -------------------------------
 *  공통: 파일 다운로드 도우미
 *  - blob 응답을 파일로 저장
 * --------------------------------*/
export function saveBlobToFile(blob, filename = 'download') {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** -------------------------------
 *  관리자 인증
 * --------------------------------*/
export const adminAPI = {
  login: (username, password) => api.post('/admin/login', { username, password }),
  me: () => api.get('/admin/me'),
  logout: () => api.post('/admin/logout'),
};

/** -------------------------------
 *  학생 DB
 *  - 엑셀/CSV 입출력 모두 지원
 *  - Admin.jsx에서 바로 호출 가능
 * --------------------------------*/
export const studentAPI = {
  // 목록/CRUD
  list: () => api.get('/admin/students'),
  create: (student) => api.post('/admin/students', student),
  update: (id, student) => api.put(`/admin/students/${id}`, student),
  remove: (id) => api.delete(`/admin/students/${id}`),

  // ✅ 엑셀 "미리보기" 불러오기 (DB 기록 없이 UI만 채우기)
  previewExcel: (file) => {
    const fd = new FormData();
    fd.append('file', file); // 서버: multer.single('file')
    return api.post('/admin/students/preview-excel', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }); // -> { ok, students: [{name, code, studentPhone, parentPhone}, ...] }
  },

  // ✅ 엑셀 불러오기 (신규만 DB에 추가, 기존은 스킵)
  importExcel: (file) => {
    const fd = new FormData();
    fd.append('file', file); // 서버: multer.single('file')
    return api.post('/admin/students/import-excel', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }); // -> { ok, imported, skipped_existing, skipped_code_conflict }
  },

  // ✅ 엑셀 다운로드 (서버가 생성해줌)
  exportExcel: async () => {
    const res = await api.get('/admin/students/export-excel', {
      responseType: 'blob',
    });
    return res; // 필요 시 saveBlobToFile(res.data, 'students.xlsx') 호출
  },

  // (옵션) CSV 불러오기/다운로드도 유지
  importCSV: (csvText) =>
    api.post('/admin/students/import', csvText, {
      headers: { 'Content-Type': 'text/csv' },
    }),
  exportCSV: async () => {
    const res = await api.get('/admin/students/export', { responseType: 'blob' });
    return res; // saveBlobToFile(res.data, 'students.csv')
  },

  // (옵션) 출석 CSV (특정 날짜)
  exportAttendanceCSV: async (date) => {
    const res = await api.get('/admin/attendance.csv', {
      params: { date },
      responseType: 'blob',
    });
    return res; // saveBlobToFile(res.data, `attendance_${date}.csv`)
  },
};

/** -------------------------------
 *  전역 정책
 * --------------------------------*/
export const policyAPI = {
  get: () => api.get('/admin/policy'),
  save: (payload) => api.post('/admin/policy', payload),
};

/** -------------------------------
 *  도시락 미제공(블랙아웃) 날짜
 * --------------------------------*/
export const blackoutAPI = {
  list: () => api.get('/admin/no-service-days'),
  add: ({ date, slot }) => api.post('/admin/no-service-days', { date, slot }),
  remove: (id) => api.delete(`/admin/no-service-days/${id}`),
};

/** -------------------------------
 *  메뉴 이미지
 * --------------------------------*/
export const imageAPI = {
  list: () => api.get('/admin/menu-images'),
  upload: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return api.post('/admin/menu-images', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  remove: (id) => api.delete(`/admin/menu-images/${id}`),
  latestPublic: () => api.get('/menu-images'),
};

/** -------------------------------
 *  주간 요약
 * --------------------------------*/
export const weeklyAPI = {
  summary: ({ start, end }) =>
    api.get('/admin/weekly-summary', { params: { start, end } }),
};

/** -------------------------------
 *  문자 전송(요약)
 * --------------------------------*/
export const smsAPI = {
  sendSummary: (payload) => api.post('/sms/summary', payload),
};
