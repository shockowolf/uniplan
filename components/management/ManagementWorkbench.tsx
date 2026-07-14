'use client';

import type { ReactNode } from 'react';

export type ManagementApiError = {
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
};

export async function requestManagementApi<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const responseBody = (await response.json()) as {
    error?: ManagementApiError;
  } & T;
  if (!response.ok) {
    throw (
      responseBody.error ?? {
        code: 'REQUEST_FAILED',
        message: '요청을 처리하지 못했습니다.',
        fieldErrors: {},
      }
    );
  }
  return responseBody;
}

export function toManagementApiError(requestError: unknown) {
  if (
    requestError &&
    typeof requestError === 'object' &&
    'message' in requestError
  ) {
    return requestError as ManagementApiError;
  }
  return {
    code: 'REQUEST_FAILED',
    message: '요청을 처리하지 못했습니다.',
    fieldErrors: {},
  };
}

export function ManagementWorkbench({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="management-workbench">
      <header className="management-header">
        <div>
          <p className="management-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="management-header-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function WorkbenchPanel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workbench-panel ${className}`.trim()}>
      <div className="workbench-panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function FormField({
  label,
  name,
  error,
  hint,
  children,
  wide = false,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'form-field form-field-wide' : 'form-field'}>
      <span>{label}</span>
      {children}
      {error ? (
        <small className="field-error" id={`${name}-error`}>
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

export function RequestNotice({
  error,
  success,
}: {
  error?: ManagementApiError | null;
  success?: string;
}) {
  if (error) return <div className="request-notice error" role="alert">{error.message}</div>;
  if (success) return <div className="request-notice success" role="status">{success}</div>;
  return null;
}

export function StatusBadge({
  active,
  activeLabel = '사용',
  inactiveLabel = '중지',
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span className={active ? 'status-badge active' : 'status-badge inactive'}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="management-empty">{children}</div>;
}

export function LoadingState() {
  return <div className="management-loading" role="status">업무 정보를 불러오는 중입니다.</div>;
}
