import { ModulePage } from '@/components/ModulePage';
import { GootzChartDashboard } from '@/components/system/GootzChartDashboard';
import { UserManagementDetail } from '@/components/system/UserManagementDetail';

type SystemPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function SystemPage({ searchParams }: SystemPageProps) {
  const params = searchParams ? await searchParams : {};

  if (params.legacy === 'LM002') {
    return <UserManagementDetail />;
  }

  if (params.legacy === 'LM009') {
    return <GootzChartDashboard />;
  }

  return (
    <ModulePage
      description="easiERP의 시스템, 사용자, 권한, 메뉴, URL 인증, 도메인, 회사, 로그인 진입 정보를 Uniplan 관리 구조로 옮기는 영역입니다."
      eyebrow="System"
      metrics={[
        { label: '시스템 메뉴', value: 8 },
        { label: '로그인/세션', value: 3 },
        { label: '권한 플래그', value: 'CRUD' },
        { label: 'Legacy Root', value: 'LSYS' }
      ]}
      sections={[
        { title: '사용자와 역할', body: 'tbcom_user2, tbcom_role, tbcom_user_role 구조를 기준으로 로그인 사용자와 권한을 관리합니다.' },
        { title: '메뉴와 URL 권한', body: 'tbcom_menu, tbcom_menu_map, tbcom_role_menu, tbcom_url_auth를 함께 복원합니다.' },
        { title: '도메인과 로그인', body: 'tbcom_domain의 welcome_url=/admin/login_page.do 흐름을 Uniplan 인증 설정으로 연결할 준비 영역입니다.' }
      ]}
      title="시스템과 로그인 관리"
    />
  );
}
