'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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

type BomItemRecord = { id: string; code: string; name: string; unit: string };
type BomComponentRecord = {
  id: string;
  componentItemId: string;
  quantity: string;
  sortOrder: number;
  componentItem: BomItemRecord;
  childBomVersion: { id: string; revision: number; bom: { code: string; name: string } } | null;
};
type BomVersionRecord = {
  id: string;
  revision: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  notes: string | null;
  activatedAt: string | null;
  retiredAt: string | null;
  components: BomComponentRecord[];
};
type BomRecord = {
  id: string;
  code: string;
  name: string;
  outputItemId: string;
  outputItem: BomItemRecord;
  active: boolean;
  versions: BomVersionRecord[];
};
type ComponentFormRecord = { itemId: string; quantity: string };
type ExplodedComponentRecord = { itemId: string; itemCode: string; itemName: string; quantity: string };

const versionStatusLabels = { DRAFT: '작성 중', ACTIVE: '활성', RETIRED: '종료' } as const;

export function BomsManagement() {
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [items, setItems] = useState<BomItemRecord[]>([]);
  const [selectedBomId, setSelectedBomId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [editorMode, setEditorMode] = useState<'create' | 'header' | 'components' | null>(null);
  const [headerForm, setHeaderForm] = useState({ id: '', code: '', name: '', outputItemId: '', notes: '' });
  const [componentForms, setComponentForms] = useState<ComponentFormRecord[]>([]);
  const [explosionQuantity, setExplosionQuantity] = useState('1');
  const [explodedComponents, setExplodedComponents] = useState<ExplodedComponentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadBoms = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{ boms: BomRecord[]; items: BomItemRecord[] }>('/api/inventory/boms');
      setBoms(response.boms);
      setItems(response.items);
      setSelectedBomId((currentId) => currentId && response.boms.some((bom) => bom.id === currentId) ? currentId : response.boms[0]?.id ?? '');
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBoms(); }, [loadBoms]);

  const selectedBom = useMemo(() => boms.find((bom) => bom.id === selectedBomId) ?? null, [boms, selectedBomId]);
  const selectedVersion = useMemo(() => selectedBom?.versions.find((version) => version.id === selectedVersionId) ?? selectedBom?.versions[0] ?? null, [selectedBom, selectedVersionId]);

  useEffect(() => {
    if (selectedBom && !selectedBom.versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(selectedBom.versions[0]?.id ?? '');
    }
    setExplodedComponents(null);
  }, [selectedBom, selectedVersionId]);

  function startCreate() {
    setHeaderForm({ id: '', code: '', name: '', outputItemId: '', notes: '' });
    setEditorMode('create');
    setRequestError(null);
    setSuccessMessage('');
  }

  function startHeaderEdit() {
    if (!selectedBom) return;
    setHeaderForm({ id: selectedBom.id, code: selectedBom.code, name: selectedBom.name, outputItemId: selectedBom.outputItemId, notes: '' });
    setEditorMode('header');
    setRequestError(null);
    setSuccessMessage('');
  }

  function startComponentEdit(version: BomVersionRecord) {
    setSelectedVersionId(version.id);
    setComponentForms(version.components.map((component) => ({ itemId: component.componentItemId, quantity: component.quantity })));
    setEditorMode('components');
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveHeader(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/boms', {
        method: editorMode === 'header' ? 'PATCH' : 'POST',
        body: JSON.stringify(editorMode === 'header' ? { bomId: headerForm.id, code: headerForm.code, name: headerForm.name } : headerForm),
      });
      setSuccessMessage(editorMode === 'header' ? 'BOM 머리글을 수정했습니다.' : '새 BOM과 첫 작성 개정을 등록했습니다.');
      setEditorMode(null);
      await loadBoms();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function createDraftRevision() {
    if (!selectedBom) return;
    setRequestError(null);
    try {
      const response = await requestManagementApi<{ bomVersion: BomVersionRecord }>('/api/inventory/boms', {
        method: 'POST',
        body: JSON.stringify({ action: 'draftRevision', bomId: selectedBom.id }),
      });
      setSelectedVersionId(response.bomVersion.id);
      setSuccessMessage('새 작성 개정을 만들었습니다.');
      await loadBoms();
    } catch (creationError) {
      setRequestError(toManagementApiError(creationError));
    }
  }

  async function saveComponents(event: FormEvent) {
    event.preventDefault();
    if (!selectedVersion) return;
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/boms', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'components', versionId: selectedVersion.id, components: componentForms }),
      });
      setSuccessMessage('BOM 구성 품목을 저장했습니다.');
      setEditorMode(null);
      await loadBoms();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function changeVersionStatus(action: 'activate' | 'retire', version: BomVersionRecord) {
    const actionLabel = action === 'activate' ? '활성화' : '종료';
    if (!window.confirm(`개정 ${version.revision}을(를) ${actionLabel}할까요?`)) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/boms', {
        method: 'PATCH',
        body: JSON.stringify({ action, versionId: version.id }),
      });
      setSuccessMessage(`BOM 개정을 ${actionLabel}했습니다.`);
      await loadBoms();
    } catch (statusError) {
      setRequestError(toManagementApiError(statusError));
    }
  }

  async function deactivateSelectedBom() {
    if (!selectedBom || !window.confirm(`${selectedBom.name}을(를) 비활성화할까요?`)) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/boms', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'deactivate', bomId: selectedBom.id }),
      });
      setSuccessMessage('BOM을 비활성화했습니다.');
      await loadBoms();
    } catch (deactivationError) {
      setRequestError(toManagementApiError(deactivationError));
    }
  }

  async function showExplosion() {
    if (!selectedVersion || selectedVersion.status !== 'ACTIVE') return;
    setRequestError(null);
    try {
      const response = await requestManagementApi<{ explodedComponents: ExplodedComponentRecord[] }>(`/api/inventory/boms?versionId=${encodeURIComponent(selectedVersion.id)}&quantity=${encodeURIComponent(explosionQuantity)}`);
      setExplodedComponents(response.explodedComponents);
    } catch (explosionError) {
      setRequestError(toManagementApiError(explosionError));
    }
  }

  function addComponent() {
    setComponentForms([...componentForms, { itemId: '', quantity: '1' }]);
  }

  function updateComponent(componentIndex: number, values: Partial<ComponentFormRecord>) {
    setComponentForms(componentForms.map((component, index) => index === componentIndex ? { ...component, ...values } : component));
  }

  function removeComponent(componentIndex: number) {
    setComponentForms(componentForms.filter((_, index) => index !== componentIndex));
  }

  return (
    <ManagementWorkbench
      eyebrow="생산 기준 정보"
      title="BOM 관리"
      description="작성 개정의 구성 품목을 편집하고, 검증을 통과한 개정을 활성화합니다."
      actions={<button className="primary-button" onClick={startCreate} type="button">새 BOM</button>}
    >
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editorMode ? 'workbench-layout bom-layout with-editor' : 'workbench-layout bom-layout'}>
        <div className="bom-browser">
          <WorkbenchPanel title="BOM 목록" description={`전체 ${boms.length}개`}>
            {loading ? <LoadingState /> : boms.length === 0 ? <EmptyState>등록된 BOM이 없습니다.</EmptyState> : (
              <div className="selection-list">{boms.map((bom) => (
                <button className={selectedBomId === bom.id ? 'selection-card selected' : 'selection-card'} key={bom.id} onClick={() => { setSelectedBomId(bom.id); setEditorMode(null); }} type="button">
                  <span><strong>{bom.code}</strong><small>{bom.name}</small></span>
                  <StatusBadge active={bom.active} />
                  <span className="selection-detail">생산 품목 · {bom.outputItem.name}</span>
                </button>
              ))}</div>
            )}
          </WorkbenchPanel>
        </div>

        <div className="workbench-main-column">
          {selectedBom ? (
            <>
              <WorkbenchPanel
                title={`${selectedBom.code} · ${selectedBom.name}`}
                description={`생산 품목: ${selectedBom.outputItem.code} · ${selectedBom.outputItem.name}`}
                actions={<><button className="secondary-button" onClick={startHeaderEdit} type="button">머리글 수정</button>{selectedBom.active ? <button className="secondary-button" onClick={() => void createDraftRevision()} type="button">새 개정</button> : null}{selectedBom.active && !selectedBom.versions.some((version) => version.status === 'ACTIVE') ? <button className="danger-button" onClick={() => void deactivateSelectedBom()} type="button">BOM 비활성화</button> : null}</>}
              >
                <div className="version-tabs" role="tablist">{selectedBom.versions.map((version) => <button aria-selected={(selectedVersion?.id ?? '') === version.id} className={(selectedVersion?.id ?? '') === version.id ? 'version-tab selected' : 'version-tab'} key={version.id} onClick={() => { setSelectedVersionId(version.id); setEditorMode(null); }} role="tab" type="button">개정 {version.revision}<span className={`version-status ${version.status.toLocaleLowerCase()}`}>{versionStatusLabels[version.status]}</span></button>)}</div>
                {selectedVersion ? (
                  <div className="version-detail">
                    <div className="version-summary"><div><span>상태</span><strong>{versionStatusLabels[selectedVersion.status]}</strong></div><div><span>구성 품목</span><strong>{selectedVersion.components.length}개</strong></div><div><span>비고</span><strong>{selectedVersion.notes ?? '없음'}</strong></div></div>
                    <div className="button-row version-actions">{selectedVersion.status === 'DRAFT' ? <><button className="secondary-button" onClick={() => startComponentEdit(selectedVersion)} type="button">구성 품목 편집</button><button className="primary-button" onClick={() => void changeVersionStatus('activate', selectedVersion)} type="button">개정 활성화</button></> : selectedVersion.status === 'ACTIVE' ? <button className="danger-button" onClick={() => void changeVersionStatus('retire', selectedVersion)} type="button">활성 개정 종료</button> : null}</div>
                    {selectedVersion.components.length === 0 ? <EmptyState>구성 품목을 추가해 주세요.</EmptyState> : (
                      <div className="responsive-table-wrap compact-table"><table className="management-table"><thead><tr><th>순서</th><th>구성 품목</th><th>소요 수량</th><th>하위 BOM 연결</th></tr></thead><tbody>{selectedVersion.components.map((component, index) => <tr key={component.id}><td data-label="순서">{index + 1}</td><td data-label="구성 품목"><strong>{component.componentItem.name}</strong><small className="table-subtext">{component.componentItem.code}</small></td><td data-label="소요 수량">{Number(component.quantity).toLocaleString('ko-KR')} {component.componentItem.unit}</td><td data-label="하위 BOM 연결">{component.childBomVersion ? `${component.childBomVersion.bom.code} · 개정 ${component.childBomVersion.revision}` : '최하위 품목'}</td></tr>)}</tbody></table></div>
                    )}
                  </div>
                ) : null}
              </WorkbenchPanel>

              {selectedVersion?.status === 'ACTIVE' ? (
                <WorkbenchPanel title="다단계 소요량" description="하위 BOM을 펼쳐 최하위 품목의 총 소요량을 계산합니다.">
                  <div className="explosion-toolbar"><label><span>생산 수량</span><input min="0.000001" step="0.000001" type="number" value={explosionQuantity} onChange={(event) => setExplosionQuantity(event.target.value)} /></label><button className="primary-button" onClick={() => void showExplosion()} type="button">다단계 소요량 보기</button></div>
                  {explodedComponents ? explodedComponents.length === 0 ? <EmptyState>최하위 소요 품목이 없습니다.</EmptyState> : <div className="responsive-table-wrap compact-table"><table className="management-table"><thead><tr><th>품목 코드</th><th>최하위 품목</th><th>총 소요량</th></tr></thead><tbody>{explodedComponents.map((component) => <tr key={component.itemId}><td data-label="품목 코드">{component.itemCode}</td><td data-label="최하위 품목"><strong>{component.itemName}</strong></td><td data-label="총 소요량">{Number(component.quantity).toLocaleString('ko-KR')}</td></tr>)}</tbody></table></div> : null}
                </WorkbenchPanel>
              ) : null}
            </>
          ) : !loading ? <WorkbenchPanel title="BOM 상세"><EmptyState>왼쪽에서 BOM을 선택하거나 새 BOM을 등록해 주세요.</EmptyState></WorkbenchPanel> : null}
        </div>

        {editorMode === 'create' || editorMode === 'header' ? (
          <WorkbenchPanel className="workbench-editor" title={editorMode === 'create' ? '새 BOM 머리글' : 'BOM 머리글 수정'}>
            <form className="management-form" onSubmit={saveHeader}>
              <FormField label="BOM 코드" name="code" error={requestError?.fieldErrors.code}><input required value={headerForm.code} onChange={(event) => setHeaderForm({ ...headerForm, code: event.target.value })} /></FormField>
              <FormField label="BOM 이름" name="name" error={requestError?.fieldErrors.name}><input required value={headerForm.name} onChange={(event) => setHeaderForm({ ...headerForm, name: event.target.value })} /></FormField>
              {editorMode === 'create' ? <FormField label="생산 품목" name="outputItemId" error={requestError?.fieldErrors.outputItemId} wide><select required value={headerForm.outputItemId} onChange={(event) => setHeaderForm({ ...headerForm, outputItemId: event.target.value })}><option value="">선택</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></FormField> : null}
              {editorMode === 'create' ? <FormField label="첫 개정 비고" name="notes" wide><textarea rows={3} value={headerForm.notes} onChange={(event) => setHeaderForm({ ...headerForm, notes: event.target.value })} /></FormField> : null}
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditorMode(null)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : editorMode === 'components' && selectedVersion ? (
          <WorkbenchPanel className="workbench-editor" title={`개정 ${selectedVersion.revision} 구성 품목`} description="같은 품목은 한 번만 추가할 수 있습니다.">
            <form onSubmit={saveComponents}>
              <div className="component-editor-list">{componentForms.map((component, componentIndex) => <div className="component-editor-row" key={componentIndex}>
                <FormField label={`구성 품목 ${componentIndex + 1}`} name="components" error={componentIndex === 0 ? requestError?.fieldErrors.components : undefined}><select required value={component.itemId} onChange={(event) => updateComponent(componentIndex, { itemId: event.target.value })}><option value="">선택</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></FormField>
                <FormField label="소요 수량" name="components"><input min="0.000001" required step="0.000001" type="number" value={component.quantity} onChange={(event) => updateComponent(componentIndex, { quantity: event.target.value })} /></FormField>
                <button aria-label={`구성 품목 ${componentIndex + 1} 삭제`} className="remove-button" onClick={() => removeComponent(componentIndex)} type="button">삭제</button>
              </div>)}</div>
              <button className="secondary-button full-button" onClick={addComponent} type="button">구성 품목 추가</button>
              <div className="form-actions"><button className="secondary-button" onClick={() => setEditorMode(null)} type="button">취소</button><button className="primary-button" disabled={saving || componentForms.length === 0} type="submit">{saving ? '저장 중…' : '구성 저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
