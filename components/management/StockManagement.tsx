'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  FormField,
  LoadingState,
  ManagementWorkbench,
  RequestNotice,
  WorkbenchPanel,
  requestManagementApi,
  toManagementApiError,
  type ManagementApiError,
} from './ManagementWorkbench';

type InventoryBalanceRecord = {
  id: string;
  quantity: string;
  safetyQuantity: string;
  item: { id: string; code: string; name: string; unit: string; active: boolean };
  warehouse: { id: string; code: string; name: string; active: boolean };
};

export function StockManagement() {
  const [inventoryBalances, setInventoryBalances] = useState<InventoryBalanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editingBalance, setEditingBalance] = useState<InventoryBalanceRecord | null>(null);
  const [safetyQuantity, setSafetyQuantity] = useState('0');
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{ inventoryBalances: InventoryBalanceRecord[] }>('/api/inventory/stock');
      setInventoryBalances(response.inventoryBalances);
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStock(); }, [loadStock]);

  const visibleBalances = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLocaleLowerCase('ko');
    return inventoryBalances.filter((balance) => {
      const matchesSearch = !normalizedSearchText || `${balance.item.code} ${balance.item.name} ${balance.warehouse.name}`.toLocaleLowerCase('ko').includes(normalizedSearchText);
      const isLowStock = Number(balance.quantity) <= Number(balance.safetyQuantity);
      return matchesSearch && (!lowStockOnly || isLowStock);
    });
  }, [inventoryBalances, lowStockOnly, searchText]);

  function startSafetyEdit(balance: InventoryBalanceRecord) {
    setEditingBalance(balance);
    setSafetyQuantity(balance.safetyQuantity);
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveSafetyQuantity(event: FormEvent) {
    event.preventDefault();
    if (!editingBalance) return;
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/stock', {
        method: 'PATCH',
        body: JSON.stringify({ id: editingBalance.id, safetyQuantity }),
      });
      setEditingBalance(null);
      setSuccessMessage('안전재고를 수정했습니다.');
      await loadStock();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ManagementWorkbench eyebrow="재고 현황" title="현재고 조회" description="창고별 현재고와 안전재고를 확인합니다. 현재고는 재고 거래를 통해서만 바뀝니다.">
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editingBalance ? 'workbench-layout with-editor' : 'workbench-layout'}>
        <WorkbenchPanel title="창고별 현재고" description={`조회 결과 ${visibleBalances.length}건`}>
          <div className="list-toolbar">
            <label className="search-field"><span>재고 검색</span><input placeholder="품목 또는 창고" value={searchText} onChange={(event) => setSearchText(event.target.value)} /></label>
            <label className="toolbar-checkbox"><input checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} type="checkbox" /> 부족 재고만</label>
          </div>
          {loading ? <LoadingState /> : visibleBalances.length === 0 ? <EmptyState>조건에 맞는 재고가 없습니다.</EmptyState> : (
            <div className="responsive-table-wrap">
              <table className="management-table">
                <thead><tr><th>창고</th><th>품목</th><th className="number-cell">현재고</th><th className="number-cell">안전재고</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>{visibleBalances.map((balance) => {
                  const isLowStock = Number(balance.quantity) <= Number(balance.safetyQuantity);
                  return <tr className={isLowStock ? 'attention-row' : undefined} key={balance.id}>
                    <td data-label="창고"><strong>{balance.warehouse.name}</strong><small className="table-subtext">{balance.warehouse.code}</small></td>
                    <td data-label="품목">{balance.item.name}<small className="table-subtext">{balance.item.code}</small></td>
                    <td className="number-cell" data-label="현재고">{Number(balance.quantity).toLocaleString('ko-KR')} {balance.item.unit}</td>
                    <td className="number-cell" data-label="안전재고">{Number(balance.safetyQuantity).toLocaleString('ko-KR')} {balance.item.unit}</td>
                    <td data-label="상태"><span className={isLowStock ? 'status-badge warning' : 'status-badge active'}>{isLowStock ? '보충 필요' : '적정'}</span></td>
                    <td data-label="관리"><button className="text-button" onClick={() => startSafetyEdit(balance)} type="button">안전재고 수정</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </WorkbenchPanel>
        {editingBalance ? (
          <WorkbenchPanel className="workbench-editor" title="안전재고 수정" description={`${editingBalance.warehouse.name} · ${editingBalance.item.name}`}>
            <form className="management-form" onSubmit={saveSafetyQuantity}>
              <FormField label="현재고" name="quantity" hint="재고 거래에서만 변경할 수 있습니다." wide><input disabled value={`${Number(editingBalance.quantity).toLocaleString('ko-KR')} ${editingBalance.item.unit}`} /></FormField>
              <FormField label="안전재고" name="safetyQuantity" error={requestError?.fieldErrors.safetyQuantity} wide><input min="0" required step="0.000001" type="number" value={safetyQuantity} onChange={(event) => setSafetyQuantity(event.target.value)} /></FormField>
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditingBalance(null)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
