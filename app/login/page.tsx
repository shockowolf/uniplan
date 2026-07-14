import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = {
  title: '로그인 | UNIPLAN',
};

export default function LoginPage() {
  return (
    <section className="login-page">
      <div className="login-card">
        <div aria-hidden="true" className="login-brand-mark">
          U
        </div>
        <p className="eyebrow">Invite-only workspace</p>
        <h1>UNIPLAN 로그인</h1>
        <p className="login-intro">
          운영자가 초대한 회사 계정으로 로그인해 주세요. 공개 회원가입은
          제공하지 않습니다.
        </p>
        <LoginForm />
      </div>
    </section>
  );
}
