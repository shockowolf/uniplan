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

type MovementType = 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT' | 'PRODUCTION' | 'REVERSAL';

type SelectRecord = { id: string; code: string; name: string; unit?: string };
type BomVersionRecord = {
  id: string;
  revision: number;
  bom: { code: string; name: string; outputItem: { code: string; name: string; unit: string } };
};
type InventoryEntryRecord = {
  id: string;
  quantity: string;
  item: SelectRecord;
  warehouse: SelectRecord;
};
type InventoryTransactionRecord = {
  id: string;
  transactionType: MovementType | 'OPENING';
  occurredAt: string;
  reference: string | null;
  memo: string | null;
  entries: InventoryEntryRecord[];
  reversal: { id: string } | null;
  reversalOf: { id: string } | null;
  bomVersion: { id: string; revision: number; bom: { code: string; name: string } } | null;
};

type MovementForm = {
  type: MovementType;
  idempotencyKey: string;
  occurredAt: string;
  reference: string;
  memo: string;
  itemId: string;
  warehouseId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: string;
  quantityDelta: string;
  bomVersionId: string;
  componentWarehouseId: string;
  outputWarehouseId: string;
  originalTransactionId: string;
};

const movementTypeLabels: Record<MovementType | 'OPENING', string> = {
  OPENING: '기초 재고',
  RECEIPT: '입고',
  ISSUE: '출고',
  TRANSFER: '창고 이동',
  ADJUSTMENT: '재고 조정',
  PRODUCTION: '생산',
  REVERSAL: '거래 취소',
};

function createEmptyMovementForm(): MovementForm {
  return {
    type: 'RECEIPT',
    idempotencyKey: '',
    occurredAt: new Date().toISOString().slice(0, 16),
    reference: '',
    memo: '',
    itemId: '',
    warehouseId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '1',
    quantityDelta: '1',
    bomVersionId: '',
    componentWarehouseId: '',
    outputWarehouseId: '',
    originalTransactionId: '',
  };
}

export function MovementsManagement() {
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransactionRecord[]>([]);
  const [items, setItems] = useState<SelectRecord[]>([]);
  const [warehouses, setWarehouses] = useState<SelectRecord[]>([]);
  const [activeBomVersions, setActiveBomVersions] = useState<BomVersionRecord[]>([]);
  const [movementForm, setMovementForm] = useState<MovementForm>(createEmptyMovementForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{
        inventoryTransactions: InventoryTransactionRecord[];
        items: SelectRecord[];
        warehouses: SelectRecord[];
        activeBomVersions: BomVersionRecord[];
      }>('/api/inventory/transactions');
      setInventoryTransactions(response.inventoryTransactions);
      setItems(response.items);
      setWarehouses(response.warehouses);
      setActiveBomVersions(response.activeBomVersions);
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMovements(); }, [loadMovements]);

  const reversibleTransactions = useMemo(
    () => inventoryTransactions.filter((transaction) => transaction.transactionType !== 'REVERSAL' && !transaction.reversal),
    [inventoryTransactions],
  );

  function openNewMovement(type: MovementType = 'RECEIPT', originalTransactionId = '') {
    const newForm = createEmptyMovementForm();
    newForm.type = type;
    newForm.originalTransactionId = originalTransactionId;
    newForm.idempotencyKey = globalThis.crypto.randomUUID();
    setMovementForm(newForm);
    setEditorOpen(true);
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveMovement(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/transactions', {
        method: 'POST',
        body: JSON.stringify(movementForm),
      });
      setSuccessMessage(`${movementTypeLabels[movementForm.type]} 거래를 등록했습니다.`);
      setEditorOpen(false);
      await loadMovements();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmReversal(transaction: InventoryTransactionRecord) {
    if (!window.confirm('선택한 재고 거래를 취소할까요? 원장에는 반대 수량의 거래가 새로 기록됩니다.')) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'REVERSAL',
          idempotencyKey: globalThis.crypto.randomUUID(),
          originalTransactionId: transaction.id,
          occurredAt: new Date().toISOString(),
          reference: transaction.reference ? `${transaction.reference} 취소` : '재고 거래 취소',
        }),
      });
      setSuccessMessage('재고 거래를 취소했습니다.');
      await loadMovements();
    } catch (reversalError) {
      setRequestError(toManagementApiError(reversalError));
    }
  }

  const updateForm = (values: Partial<MovementForm>) => setMovementForm({ ...movementForm, ...values });

  return (
    <ManagementWorkbench
      eyebrow="재고 원장"
      title="재고 거래"
      description="입고, 출고, 창고 이동, 재고 조정, 생산과 취소를 원장에 안전하게 기록합니다."
      actions={<button className="primary-button" onClick={() => openNewMovement()} type="button">새 재고 거래</button>}
    >
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editorOpen ? 'workbench-layout with-editor' : 'workbench-layout'}>
        <WorkbenchPanel title="최근 거래" description="최근 100건을 표시합니다.">
          {loading ? <LoadingState /> : inventoryTransactions.length === 0 ? <EmptyState>등록된 재고 거래가 없습니다.</EmptyState> : (
            <div className="responsive-table-wrap">
              <table className="management-table movement-table">
                <thead><tr><th>거래일시</th><th>유형</th><th>참조</th><th>변동 내역</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>{inventoryTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td data-label="거래일시">{new Date(transaction.occurredAt).toLocaleString('ko-KR')}</td>
                    <td data-label="유형"><strong>{movementTypeLabels[transaction.transactionType]}</strong>{transaction.bomVersion ? <small className="table-subtext">{transaction.bomVersion.bom.code} · 개정 {transaction.bomVersion.revision}</small> : null}</td>
                    <td data-label="참조">{transaction.reference ?? '없음'}</td>
                    <td data-label="변동 내역"><div className="entry-list">{transaction.entries.map((entry) => <span key={entry.id}>{entry.warehouse.name} · {entry.item.name} <strong className={Number(entry.quantity) < 0 ? 'negative-quantity' : 'positive-quantity'}>{Number(entry.quantity) > 0 ? '+' : ''}{Number(entry.quantity).toLocaleString('ko-KR')} {entry.item.unit}</strong></span>)}</div></td>
                    <td data-label="상태">{transaction.reversal ? <span className="status-badge inactive">취소됨</span> : transaction.transactionType === 'REVERSAL' ? <span className="status-badge warning">취소 거래</span> : <span className="status-badge active">전기 완료</span>}</td>
                    <td data-label="관리">{transaction.transactionType !== 'REVERSAL' && !transaction.reversal ? <button className="text-button danger" onClick={() => void confirmReversal(transaction)} type="button">거래 취소</button> : <span className="muted-text">완료</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </WorkbenchPanel>

        {editorOpen ? (
          <WorkbenchPanel className="workbench-editor" title="새 재고 거래" description="저장 후 수량과 원장이 한 번에 반영됩니다.">
            <form className="management-form" onSubmit={saveMovement}>
              <FormField label="거래 유형" name="type" wide>
                <select value={movementForm.type} onChange={(event) => updateForm({ type: event.target.value as MovementType })}>
                  {(Object.keys(movementTypeLabels) as (MovementType | 'OPENING')[]).filter((type) => type !== 'OPENING').map((type) => <option key={type} value={type}>{movementTypeLabels[type]}</option>)}
                </select>
              </FormField>

              {movementForm.type === 'PRODUCTION' ? (
                <>
                  <FormField label="활성 BOM 개정" name="bomVersionId" error={requestError?.fieldErrors.bomVersionId} wide>
                    <select required value={movementForm.bomVersionId} onChange={(event) => updateForm({ bomVersionId: event.target.value })}><option value="">선택</option>{activeBomVersions.map((version) => <option key={version.id} value={version.id}>{version.bom.code} · {version.bom.outputItem.name} · 개정 {version.revision}</option>)}</select>
                  </FormField>
                  <FormField label="생산 수량" name="quantity" error={requestError?.fieldErrors.quantity}><input min="0.000001" required step="0.000001" type="number" value={movementForm.quantity} onChange={(event) => updateForm({ quantity: event.target.value })} /></FormField>
                  <FormField label="구성품 출고 창고" name="componentWarehouseId" error={requestError?.fieldErrors.componentWarehouseId}><select required value={movementForm.componentWarehouseId} onChange={(event) => updateForm({ componentWarehouseId: event.target.value })}><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
                  <FormField label="완제품 입고 창고" name="outputWarehouseId" error={requestError?.fieldErrors.outputWarehouseId} wide><select required value={movementForm.outputWarehouseId} onChange={(event) => updateForm({ outputWarehouseId: event.target.value })}><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
                </>
              ) : movementForm.type === 'REVERSAL' ? (
                <FormField label="취소할 거래" name="originalTransactionId" error={requestError?.fieldErrors.originalTransactionId} wide>
                  <select required value={movementForm.originalTransactionId} onChange={(event) => updateForm({ originalTransactionId: event.target.value })}><option value="">선택</option>{reversibleTransactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{new Date(transaction.occurredAt).toLocaleString('ko-KR')} · {movementTypeLabels[transaction.transactionType]} · {transaction.reference ?? '참조 없음'}</option>)}</select>
                </FormField>
              ) : (
                <>
                  <FormField label="품목" name="itemId" error={requestError?.fieldErrors.itemId} wide><select required value={movementForm.itemId} onChange={(event) => updateForm({ itemId: event.target.value })}><option value="">선택</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></FormField>
                  {movementForm.type === 'TRANSFER' ? (
                    <>
                      <FormField label="출고 창고" name="fromWarehouseId" error={requestError?.fieldErrors.fromWarehouseId}><select required value={movementForm.fromWarehouseId} onChange={(event) => updateForm({ fromWarehouseId: event.target.value })}><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
                      <FormField label="입고 창고" name="toWarehouseId" error={requestError?.fieldErrors.toWarehouseId}><select required value={movementForm.toWarehouseId} onChange={(event) => updateForm({ toWarehouseId: event.target.value })}><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
                    </>
                  ) : <FormField label="창고" name="warehouseId" error={requestError?.fieldErrors.warehouseId} wide><select required value={movementForm.warehouseId} onChange={(event) => updateForm({ warehouseId: event.target.value })}><option value="">선택</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>}
                  {movementForm.type === 'ADJUSTMENT' ? <FormField label="조정 수량" name="quantityDelta" error={requestError?.fieldErrors.quantityDelta} hint="감소는 음수로 입력합니다." wide><input required step="0.000001" type="number" value={movementForm.quantityDelta} onChange={(event) => updateForm({ quantityDelta: event.target.value })} /></FormField> : <FormField label="수량" name="quantity" error={requestError?.fieldErrors.quantity} wide><input min="0.000001" required step="0.000001" type="number" value={movementForm.quantity} onChange={(event) => updateForm({ quantity: event.target.value })} /></FormField>}
                </>
              )}

              <FormField label="거래일시" name="occurredAt" wide><input required type="datetime-local" value={movementForm.occurredAt} onChange={(event) => updateForm({ occurredAt: event.target.value })} /></FormField>
              <FormField label="참조" name="reference"><input placeholder="예: 구매 입고 2026-001" value={movementForm.reference} onChange={(event) => updateForm({ reference: event.target.value })} /></FormField>
              <FormField label="메모" name="memo"><input value={movementForm.memo} onChange={(event) => updateForm({ memo: event.target.value })} /></FormField>
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditorOpen(false)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '전기 중…' : '거래 전기'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
