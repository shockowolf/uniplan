'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  EmptyState,
  FormField,
  LoadingState,
  ManagementWorkbench,
  RequestNotice,
  StatusBadge,
  WorkbenchPanel,
  requestManagementApi,
  toManagementApiError,
  type ManagementApiError,
} from './ManagementWorkbench';

type NavigationMenuRecord = {
  id: string;
  parentId: string | null;
  code: string;
  label: string;
  href: string | null;
  resourceCode: string;
  sortOrder: number;
  active: boolean;
  parent: { id: string; label: string } | null;
};

const emptyNavigationForm = {
  id: '',
  code: '',
  label: '',
  href: '/',
  resourceCode: '',
  parentId: '',
  sortOrder: '10',
};

export function NavigationManagement() {
  const [menuItems, setMenuItems] = useState<NavigationMenuRecord[]>([]);
  const [navigationForm, setNavigationForm] = useState(emptyNavigationForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadNavigation = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{ menuItems: NavigationMenuRecord[] }>('/api/settings/navigation');
      setMenuItems(response.menuItems);
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNavigation(); }, [loadNavigation]);

  function startCreate() {
    setNavigationForm(emptyNavigationForm);
    setEditorOpen(true);
    setRequestError(null);
    setSuccessMessage('');
  }

  function startEdit(menuItem: NavigationMenuRecord) {
    setNavigationForm({
      id: menuItem.id,
      code: menuItem.code,
      label: menuItem.label,
      href: menuItem.href ?? '/',
      resourceCode: menuItem.resourceCode,
      parentId: menuItem.parentId ?? '',
      sortOrder: String(menuItem.sortOrder),
    });
    setEditorOpen(true);
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveNavigation(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/settings/navigation', {
        method: navigationForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...navigationForm,
          parentId: navigationForm.parentId || null,
          sortOrder: Number(navigationForm.sortOrder),
        }),
      });
      setSuccessMessage(navigationForm.id ? '메뉴를 수정했습니다. 새로 고침하면 왼쪽 메뉴에도 반영됩니다.' : '새 메뉴를 등록했습니다. 새로 고침하면 왼쪽 메뉴에도 반영됩니다.');
      setEditorOpen(false);
      await loadNavigation();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateMenuItem(menuItem: NavigationMenuRecord) {
    if (!window.confirm(`${menuItem.label} 메뉴를 비활성화할까요?`)) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/settings/navigation', {
        method: 'PATCH',
        body: JSON.stringify({ id: menuItem.id, action: 'deactivate' }),
      });
      setSuccessMessage('메뉴를 비활성화했습니다. 새로 고침하면 왼쪽 메뉴에도 반영됩니다.');
      await loadNavigation();
    } catch (deactivationError) {
      setRequestError(toManagementApiError(deactivationError));
    }
  }

  return (
    <ManagementWorkbench
      eyebrow="설정"
      title="메뉴 관리"
      description="데이터베이스 기반 메뉴의 표시 이름, 이동 경로, 권한 코드와 순서를 관리합니다."
      actions={<button className="primary-button" onClick={startCreate} type="button">새 메뉴</button>}
    >
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editorOpen ? 'workbench-layout with-editor' : 'workbench-layout'}>
        <WorkbenchPanel title="메뉴 목록" description="활성 메뉴만 사용자 권한에 따라 왼쪽 메뉴에 표시됩니다.">
          {loading ? <LoadingState /> : menuItems.length === 0 ? <EmptyState>등록된 메뉴가 없습니다.</EmptyState> : (
            <div className="responsive-table-wrap">
              <table className="management-table">
                <thead><tr><th>순서</th><th>표시 이름</th><th>상위 메뉴</th><th>이동 경로</th><th>권한 코드</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>{menuItems.map((menuItem) => (
                  <tr key={menuItem.id}>
                    <td data-label="순서">{menuItem.sortOrder}</td>
                    <td data-label="표시 이름"><strong>{menuItem.label}</strong><small className="table-subtext">{menuItem.code}</small></td>
                    <td data-label="상위 메뉴">{menuItem.parent?.label ?? '최상위'}</td>
                    <td data-label="이동 경로"><code>{menuItem.href}</code></td>
                    <td data-label="권한 코드"><code>{menuItem.resourceCode}</code></td>
                    <td data-label="상태"><StatusBadge active={menuItem.active} /></td>
                    <td data-label="관리"><div className="table-actions"><button className="text-button" onClick={() => startEdit(menuItem)} type="button">수정</button>{menuItem.active ? <button className="text-button danger" onClick={() => void deactivateMenuItem(menuItem)} type="button">비활성화</button> : null}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </WorkbenchPanel>

        {editorOpen ? (
          <WorkbenchPanel className="workbench-editor" title={navigationForm.id ? '메뉴 수정' : '새 메뉴 등록'}>
            <form className="management-form" onSubmit={saveNavigation}>
              <FormField label="내부 코드" name="code" error={requestError?.fieldErrors.code}><input required value={navigationForm.code} onChange={(event) => setNavigationForm({ ...navigationForm, code: event.target.value })} /></FormField>
              <FormField label="표시 이름" name="label" error={requestError?.fieldErrors.label}><input required value={navigationForm.label} onChange={(event) => setNavigationForm({ ...navigationForm, label: event.target.value })} /></FormField>
              <FormField label="이동 경로" name="href" error={requestError?.fieldErrors.href} hint="슬래시(/)로 시작하는 내부 경로" wide><input required value={navigationForm.href} onChange={(event) => setNavigationForm({ ...navigationForm, href: event.target.value })} /></FormField>
              <FormField label="권한 코드" name="resourceCode" error={requestError?.fieldErrors.resourceCode} hint="예: inventory.items" wide><input required value={navigationForm.resourceCode} onChange={(event) => setNavigationForm({ ...navigationForm, resourceCode: event.target.value })} /></FormField>
              <FormField label="상위 메뉴" name="parentId" error={requestError?.fieldErrors.parentId}>
                <select value={navigationForm.parentId} onChange={(event) => setNavigationForm({ ...navigationForm, parentId: event.target.value })}><option value="">최상위</option>{menuItems.filter((menuItem) => menuItem.active && menuItem.id !== navigationForm.id).map((menuItem) => <option key={menuItem.id} value={menuItem.id}>{menuItem.label}</option>)}</select>
              </FormField>
              <FormField label="표시 순서" name="sortOrder" error={requestError?.fieldErrors.sortOrder}><input min="0" required step="1" type="number" value={navigationForm.sortOrder} onChange={(event) => setNavigationForm({ ...navigationForm, sortOrder: event.target.value })} /></FormField>
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditorOpen(false)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
