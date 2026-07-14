import { ErpDataGrid, ErpGridColumn } from '@/components/ErpDataGrid';

type UserManagementRecord = {
  domainName: string;
  userType: string;
  userTypeLabel: string;
  userName: string;
  userId: string;
  roleName: string;
  activeFlag: string;
  createdByName: string;
  createdById: string;
  createdAt: string;
  updatedByName: string;
  updatedById: string;
  updatedAt: string;
};

const demoUserRecords: UserManagementRecord[] = [
  {
    domainName: 'uniplan.local',
    userType: 'SYSADMIN',
    userTypeLabel: '시스템관리자',
    userName: '관리자',
    userId: 'admin@uniplan.local',
    roleName: '관리자',
    activeFlag: 'Y',
    createdByName: 'Local Admin',
    createdById: 'local-admin',
    createdAt: '2026-05-01',
    updatedByName: 'Local Admin',
    updatedById: 'local-admin',
    updatedAt: '2026-05-10',
  },
  {
    domainName: 'uniplan.local',
    userType: 'EMP',
    userTypeLabel: '사원',
    userName: '김영업',
    userId: 'sales01',
    roleName: '영업팀',
    activeFlag: 'Y',
    createdByName: '관리자',
    createdById: 'admin',
    createdAt: '2026-05-02',
    updatedByName: '관리자',
    updatedById: 'admin',
    updatedAt: '2026-05-07',
  },
  {
    domainName: 'uniplan.local',
    userType: 'EMP',
    userTypeLabel: '사원',
    userName: '박운영',
    userId: 'ops01',
    roleName: '운영팀',
    activeFlag: 'Y',
    createdByName: '관리자',
    createdById: 'admin',
    createdAt: '2026-05-02',
    updatedByName: '관리자',
    updatedById: 'admin',
    updatedAt: '2026-05-06',
  },
  {
    domainName: 'uniplan.local',
    userType: 'PARTNER',
    userTypeLabel: '협력사',
    userName: '다산파트너',
    userId: 'partner01',
    roleName: '파트너 조회',
    activeFlag: 'Y',
    createdByName: '관리자',
    createdById: 'admin',
    createdAt: '2026-05-03',
    updatedByName: '김영업',
    updatedById: 'sales01',
    updatedAt: '2026-05-08',
  },
  {
    domainName: 'uniplan.local',
    userType: 'CUSTOMER',
    userTypeLabel: '고객',
    userName: '구리정밀',
    userId: 'cust-guri',
    roleName: '고객 포털',
    activeFlag: 'N',
    createdByName: '관리자',
    createdById: 'admin',
    createdAt: '2026-05-04',
    updatedByName: '박운영',
    updatedById: 'ops01',
    updatedAt: '2026-05-09',
  },
];

const userManagementColumns: ErpGridColumn<UserManagementRecord>[] = [
  {
    accessorKey: 'userType',
    header: '사용자구분코드',
    align: 'center',
    hidden: true,
  },
  { accessorKey: 'userTypeLabel', header: '사용자구분명', align: 'center' },
  { accessorKey: 'userName', header: '사용자명', align: 'center' },
  { accessorKey: 'userId', header: '사용자ID', align: 'center' },
  { accessorKey: 'roleName', header: '역할', align: 'center' },
  { accessorKey: 'activeFlag', header: '사용', align: 'center' },
  { accessorKey: 'createdByName', header: '등록자', align: 'center' },
  {
    accessorKey: 'createdById',
    header: '등록자번호',
    align: 'center',
    hidden: true,
  },
  {
    accessorKey: 'createdAt',
    header: '등록일시',
    dataType: 'date',
    align: 'center',
  },
  { accessorKey: 'updatedByName', header: '수정자', align: 'center' },
  {
    accessorKey: 'updatedById',
    header: '수정자번호',
    align: 'center',
    hidden: true,
  },
  {
    accessorKey: 'updatedAt',
    header: '수정일시',
    dataType: 'date',
    align: 'center',
  },
  {
    accessorKey: 'domainName',
    header: '도메인',
    align: 'center',
    hidden: true,
  },
];

const activeUserCount = demoUserRecords.filter(
  (userRecord) => userRecord.activeFlag === 'Y',
).length;
const employeeUserCount = demoUserRecords.filter(
  (userRecord) => userRecord.userType === 'EMP',
).length;

export function UserManagementDetail() {
  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">System / settings-users</p>
          <h1>사용자관리</h1>
        </div>
        <div className="status-pill">Uni Grid Library</div>
      </header>

      <section className="metrics">
        <article className="metric-card">
          <span>전체 사용자</span>
          <strong>{demoUserRecords.length}</strong>
        </article>
        <article className="metric-card">
          <span>사용 중</span>
          <strong>{activeUserCount}</strong>
        </article>
        <article className="metric-card">
          <span>사원 계정</span>
          <strong>{employeeUserCount}</strong>
        </article>
        <article className="metric-card">
          <span>Resource</span>
          <strong>settings.users</strong>
        </article>
      </section>

      <section className="module-panel user-management-panel">
        <div className="uni-filterbar">
          <div>
            <p className="eyebrow">Search</p>
            <h2>사용자 조회 조건</h2>
          </div>
          <div className="uni-filter-fields">
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

        <div className="uni-commandbar">
          <button type="button">조회</button>
          <button type="button">신규</button>
          <button type="button">저장</button>
          <button type="button">삭제</button>
        </div>

        <ErpDataGrid
          columns={userManagementColumns}
          data={demoUserRecords}
          title="사용자목록"
        />
      </section>
    </section>
  );
}
