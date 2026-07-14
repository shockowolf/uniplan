'use client';

import { FormEvent, useState } from 'react';

export function LoginForm() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: formData.get('companyCode'),
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      if (!response.ok) {
        const responseBody = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setErrorMessage(
          responseBody?.error?.message ??
            '로그인을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
        return;
      }
      window.location.assign('/');
    } catch {
      setErrorMessage(
        '로그인을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submitLogin}>
      <label>
        회사 코드
        <input
          autoCapitalize="characters"
          autoComplete="organization"
          maxLength={100}
          name="companyCode"
          required
        />
      </label>
      <label>
        이메일
        <input
          autoCapitalize="none"
          autoComplete="username"
          maxLength={320}
          name="email"
          required
          type="email"
        />
      </label>
      <label>
        비밀번호
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>
      {errorMessage ? (
        <p aria-live="polite" className="login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
