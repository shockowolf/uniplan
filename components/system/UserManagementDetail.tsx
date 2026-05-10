import { ErpDataGrid, ErpGridColumn } from '@/components/ErpDataGrid';

type UserRow = {
  domainNm: string;
  userGb: string;
  userGbNm: string;
  userNm: string;
  userId: string;
  roleNm: string;
  useYn: string;
  regNm: string;
  regId: string;
  regDtm: string;
  updNm: string;
  updId: string;
  updDtm: string;
};

const userRows: UserRow[] = [
  {
    domainNm: 'uniplan.local',
    userGb: 'SYSADMIN',
    userGbNm: '시스템관리자',
    userNm: '관리자',
    userId: 'admin@uniplan.local',
    roleNm: '관리자',
    useYn: 'Y',
    regNm: 'Local Admin',
    regId: 'local-admin',
    regDtm: '2026-05-01',
    updNm: 'Local Admin',
    updId: 'local-admin',
    updDtm: '2026-05-10'
  },
  {
    domainNm: 'uniplan.local',
    userGb: 'EMP',
    userGbNm: '사원',
    userNm: '김영업',
    userId: 'sales01',
    roleNm: '영업팀',
    useYn: 'Y',
    regNm: '관리자',
    regId: 'admin',
    regDtm: '2026-05-02',
    updNm: '관리자',
    updId: 'admin',
    updDtm: '2026-05-07'
  },
  {
    domainNm: 'uniplan.local',
    userGb: 'EMP',
    userGbNm: '사원',
    userNm: '박운영',
    userId: 'ops01',
    roleNm: '운영팀',
    useYn: 'Y',
    regNm: '관리자',
    regId: 'admin',
    regDtm: '2026-05-02',
    updNm: '관리자',
    updId: 'admin',
    updDtm: '2026-05-06'
  },
  {
    domainNm: 'uniplan.local',
    userGb: 'PARTNER',
    userGbNm: '협력사',
    userNm: '다산파트너',
    userId: 'partner01',
    roleNm: '파트너 조회',
    useYn: 'Y',
    regNm: '관리자',
    regId: 'admin',
    regDtm: '2026-05-03',
    updNm: '김영업',
    updId: 'sales01',
    updDtm: '2026-05-08'
  },
  {
    domainNm: 'uniplan.local',
    userGb: 'CUSTOMER',
    userGbNm: '고객',
    userNm: '구리정밀',
    userId: 'cust-guri',
    roleNm: '고객 포털',
    useYn: 'N',
    regNm: '관리자',
    regId: 'admin',
    regDtm: '2026-05-04',
    updNm: '박운영',
    updId: 'ops01',
    updDtm: '2026-05-09'
  }
];

const userColumns: ErpGridColumn<UserRow>[] = [
  { accessorKey: 'userGb', header: '사용자구분코드', align: 'center', hidden: true },
  { accessorKey: 'userGbNm', header: '사용자구분명', align: 'center' },
  { accessorKey: 'userNm', header: '사용자명', align: 'center' },
  { accessorKey: 'userId', header: '사용자ID', align: 'center' },
  { accessorKey: 'roleNm', header: '역할', align: 'center' },
  { accessorKey: 'useYn', header: '사용', align: 'center' },
  { accessorKey: 'regNm', header: '등록자', align: 'center' },
  { accessorKey: 'regId', header: '등록자번호', align: 'center', hidden: true },
  { accessorKey: 'regDtm', header: '등록일시', dataType: 'date', align: 'center' },
  { accessorKey: 'updNm', header: '수정자', align: 'center' },
  { accessorKey: 'updId', header: '수정자번호', align: 'center', hidden: true },
  { accessorKey: 'updDtm', header: '수정일시', dataType: 'date', align: 'center' },
  { accessorKey: 'domainNm', header: '도메인', align: 'center', hidden: true }
];

const activeUsers = userRows.filter((row) => row.useYn === 'Y').length;
const employeeUsers = userRows.filter((row) => row.userGb === 'EMP').length;

export function UserManagementDetail() {
  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">System / LM002</p>
          <h1>사용자관리</h1>
        </div>
        <div className="status-pill">gootzERP Grid Pattern</div>
      </header>

      <section className="metrics">
        <article className="metric-card">
          <span>전체 사용자</span>
          <strong>{userRows.length}</strong>
        </article>
        <article className="metric-card">
          <span>사용 중</span>
          <strong>{activeUsers}</strong>
        </article>
        <article className="metric-card">
          <span>사원 계정</span>
          <strong>{employeeUsers}</strong>
        </article>
        <article className="metric-card">
          <span>Legacy Menu</span>
          <strong>LM002</strong>
        </article>
      </section>

      <section className="module-panel user-management-panel">
        <div className="gootz-filterbar">
          <div>
            <p className="eyebrow">Search</p>
            <h2>사용자 조회 조건</h2>
          </div>
          <div className="gootz-filter-fields">
            <label>
              사용자구분
              <select defaultValue="">
                <option value="">전체</option>
                <option value="SYSADMIN">시스템관리자</option>
                <option value="EMP">사원</option>
                <option value="PARTNER">협력사</option>
                <option value="CUSTOMER">고객</option>
              </select>
            </label>
            <label>
              사용여부
              <select defaultValue="">
                <option value="">전체</option>
                <option value="Y">사용</option>
                <option value="N">중지</option>
              </select>
            </label>
            <label>
              도메인
              <input defaultValue="uniplan.local" readOnly />
            </label>
          </div>
        </div>

        <div className="gootz-commandbar">
          <button type="button">조회</button>
          <button type="button">신규</button>
          <button type="button">저장</button>
          <button type="button">삭제</button>
        </div>

        <ErpDataGrid columns={userColumns} data={userRows} title="사용자목록" />
      </section>
    </section>
  );
}
