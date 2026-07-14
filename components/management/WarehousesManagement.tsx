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

type WarehouseRecord = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  active: boolean;
};

const emptyWarehouseForm = { code: '', name: '', location: '' };

export function WarehousesManagement() {
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [warehouseForm, setWarehouseForm] = useState({ ...emptyWarehouseForm, id: '' });
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{ warehouses: WarehouseRecord[] }>('/api/inventory/warehouses');
      setWarehouses(response.warehouses);
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWarehouses(); }, [loadWarehouses]);

  function startCreate() {
    setWarehouseForm({ ...emptyWarehouseForm, id: '' });
    setEditorOpen(true);
    setRequestError(null);
    setSuccessMessage('');
  }

  function startEdit(warehouse: WarehouseRecord) {
    setWarehouseForm({ id: warehouse.id, code: warehouse.code, name: warehouse.name, location: warehouse.location ?? '' });
    setEditorOpen(true);
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveWarehouse(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/warehouses', {
        method: warehouseForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify(warehouseForm),
      });
      setSuccessMessage(warehouseForm.id ? '창고 정보를 수정했습니다.' : '새 창고를 등록했습니다.');
      setEditorOpen(false);
      await loadWarehouses();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateWarehouse(warehouse: WarehouseRecord) {
    if (!window.confirm(`${warehouse.name}을(를) 비활성화할까요?`)) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/warehouses', {
        method: 'PATCH',
        body: JSON.stringify({ id: warehouse.id, action: 'deactivate' }),
      });
      setSuccessMessage('창고를 비활성화했습니다.');
      await loadWarehouses();
    } catch (deactivationError) {
      setRequestError(toManagementApiError(deactivationError));
    }
  }

  return (
    <ManagementWorkbench
      eyebrow="재고 기준 정보"
      title="창고 관리"
      description="입출고와 생산에 사용할 창고의 코드, 이름, 위치를 관리합니다."
      actions={<button className="primary-button" onClick={startCreate} type="button">새 창고</button>}
    >
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editorOpen ? 'workbench-layout with-editor' : 'workbench-layout'}>
        <WorkbenchPanel title="창고 목록" description={`전체 ${warehouses.length}개`}>
          {loading ? <LoadingState /> : warehouses.length === 0 ? <EmptyState>등록된 창고가 없습니다.</EmptyState> : (
            <div className="responsive-table-wrap">
              <table className="management-table">
                <thead><tr><th>창고 코드</th><th>창고명</th><th>위치</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>{warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td data-label="창고 코드"><strong>{warehouse.code}</strong></td>
                    <td data-label="창고명">{warehouse.name}</td>
                    <td data-label="위치">{warehouse.location ?? '미지정'}</td>
                    <td data-label="상태"><StatusBadge active={warehouse.active} /></td>
                    <td data-label="관리"><div className="table-actions">
                      <button className="text-button" onClick={() => startEdit(warehouse)} type="button">수정</button>
                      {warehouse.active ? <button className="text-button danger" onClick={() => void deactivateWarehouse(warehouse)} type="button">비활성화</button> : null}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </WorkbenchPanel>
        {editorOpen ? (
          <WorkbenchPanel className="workbench-editor" title={warehouseForm.id ? '창고 수정' : '새 창고 등록'}>
            <form className="management-form" onSubmit={saveWarehouse}>
              <FormField label="창고 코드" name="code" error={requestError?.fieldErrors.code}><input required value={warehouseForm.code} onChange={(event) => setWarehouseForm({ ...warehouseForm, code: event.target.value })} /></FormField>
              <FormField label="창고명" name="name" error={requestError?.fieldErrors.name}><input required value={warehouseForm.name} onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })} /></FormField>
              <FormField label="위치" name="location" wide><input placeholder="예: 본사 1층" value={warehouseForm.location} onChange={(event) => setWarehouseForm({ ...warehouseForm, location: event.target.value })} /></FormField>
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditorOpen(false)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
