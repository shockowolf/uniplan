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

type ItemCategoryRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  active: boolean;
  parent: { id: string; name: string } | null;
};

type ItemRecord = {
  id: string;
  code: string;
  name: string;
  itemType: ItemTypeValue;
  categoryId: string | null;
  category: { id: string; code: string; name: string } | null;
  unit: string;
  standardPrice: string;
  costPrice: string;
  trackInventory: boolean;
  taxable: boolean;
  active: boolean;
  description: string | null;
  memo: string | null;
};

type ItemTypeValue =
  | 'RAW_MATERIAL'
  | 'COMPONENT'
  | 'FINISHED_GOOD'
  | 'CONSUMABLE'
  | 'SERVICE';

type ItemForm = {
  id?: string;
  code: string;
  name: string;
  itemType: ItemTypeValue;
  categoryId: string;
  unit: string;
  standardPrice: string;
  costPrice: string;
  trackInventory: boolean;
  taxable: boolean;
  description: string;
  memo: string;
};

type CategoryForm = {
  id?: string;
  code: string;
  name: string;
  parentId: string;
  description: string;
};

const itemTypeLabels: Record<ItemTypeValue, string> = {
  RAW_MATERIAL: '원자재',
  COMPONENT: '구성품',
  FINISHED_GOOD: '완제품',
  CONSUMABLE: '소모품',
  SERVICE: '서비스',
};

const emptyItemForm: ItemForm = {
  code: '',
  name: '',
  itemType: 'RAW_MATERIAL',
  categoryId: '',
  unit: '개',
  standardPrice: '0',
  costPrice: '0',
  trackInventory: true,
  taxable: true,
  description: '',
  memo: '',
};

const emptyCategoryForm: CategoryForm = {
  code: '',
  name: '',
  parentId: '',
  description: '',
};

export function ItemsManagement() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [categories, setCategories] = useState<ItemCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [editorKind, setEditorKind] = useState<'item' | 'category' | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [categoryForm, setCategoryForm] =
    useState<CategoryForm>(emptyCategoryForm);
  const [requestError, setRequestError] = useState<ManagementApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestManagementApi<{
        items: ItemRecord[];
        categories: ItemCategoryRecord[];
      }>('/api/inventory/items');
      setItems(response.items);
      setCategories(response.categories);
      setRequestError(null);
    } catch (loadError) {
      setRequestError(toManagementApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLocaleLowerCase('ko');
    if (!normalizedSearchText) return items;
    return items.filter((item) =>
      `${item.code} ${item.name} ${item.category?.name ?? ''}`
        .toLocaleLowerCase('ko')
        .includes(normalizedSearchText),
    );
  }, [items, searchText]);

  function startNewItem() {
    setItemForm(emptyItemForm);
    setEditorKind('item');
    setRequestError(null);
    setSuccessMessage('');
  }

  function startItemEdit(item: ItemRecord) {
    setItemForm({
      id: item.id,
      code: item.code,
      name: item.name,
      itemType: item.itemType,
      categoryId: item.categoryId ?? '',
      unit: item.unit,
      standardPrice: item.standardPrice,
      costPrice: item.costPrice,
      trackInventory: item.trackInventory,
      taxable: item.taxable,
      description: item.description ?? '',
      memo: item.memo ?? '',
    });
    setEditorKind('item');
    setRequestError(null);
    setSuccessMessage('');
  }

  function startNewCategory() {
    setCategoryForm(emptyCategoryForm);
    setEditorKind('category');
    setRequestError(null);
    setSuccessMessage('');
  }

  function startCategoryEdit(category: ItemCategoryRecord) {
    setCategoryForm({
      id: category.id,
      code: category.code,
      name: category.name,
      parentId: category.parentId ?? '',
      description: category.description ?? '',
    });
    setEditorKind('category');
    setRequestError(null);
    setSuccessMessage('');
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/items', {
        method: itemForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...itemForm,
          categoryId: itemForm.categoryId || null,
        }),
      });
      setSuccessMessage(itemForm.id ? '품목을 수정했습니다.' : '품목을 등록했습니다.');
      setEditorKind(null);
      await loadItems();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/items', {
        method: categoryForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...categoryForm,
          kind: 'category',
          parentId: categoryForm.parentId || null,
        }),
      });
      setSuccessMessage(
        categoryForm.id ? '품목 분류를 수정했습니다.' : '품목 분류를 등록했습니다.',
      );
      setEditorKind(null);
      await loadItems();
    } catch (saveError) {
      setRequestError(toManagementApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRecord(kind: 'item' | 'category', id: string, name: string) {
    if (!window.confirm(`${name}을(를) 비활성화할까요?`)) return;
    setRequestError(null);
    try {
      await requestManagementApi('/api/inventory/items', {
        method: 'PATCH',
        body: JSON.stringify({ id, kind, action: 'deactivate' }),
      });
      setSuccessMessage(kind === 'item' ? '품목을 비활성화했습니다.' : '품목 분류를 비활성화했습니다.');
      await loadItems();
    } catch (deactivationError) {
      setRequestError(toManagementApiError(deactivationError));
    }
  }

  return (
    <ManagementWorkbench
      eyebrow="재고 기준 정보"
      title="품목 관리"
      description="품목과 분류, 가격, 재고 추적 여부를 한곳에서 관리합니다."
      actions={
        <>
          <button className="secondary-button" onClick={startNewCategory} type="button">새 분류</button>
          <button className="primary-button" onClick={startNewItem} type="button">새 품목</button>
        </>
      }
    >
      <RequestNotice error={requestError} success={successMessage} />
      <div className={editorKind ? 'workbench-layout with-editor' : 'workbench-layout'}>
        <div className="workbench-main-column">
          <WorkbenchPanel title="품목 목록" description={`전체 ${items.length}개`}>
            <div className="list-toolbar">
              <label className="search-field">
                <span>품목 검색</span>
                <input
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="품목 코드, 품목명, 분류"
                  value={searchText}
                />
              </label>
            </div>
            {loading ? <LoadingState /> : filteredItems.length === 0 ? (
              <EmptyState>조건에 맞는 품목이 없습니다.</EmptyState>
            ) : (
              <div className="responsive-table-wrap">
                <table className="management-table">
                  <thead><tr><th>코드</th><th>품목명</th><th>유형</th><th>분류</th><th>재고</th><th>상태</th><th>관리</th></tr></thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td data-label="코드"><strong>{item.code}</strong></td>
                        <td data-label="품목명">{item.name}<small className="table-subtext">{item.unit}</small></td>
                        <td data-label="유형">{itemTypeLabels[item.itemType]}</td>
                        <td data-label="분류">{item.category?.name ?? '미분류'}</td>
                        <td data-label="재고">{item.trackInventory ? '추적' : '미추적'}</td>
                        <td data-label="상태"><StatusBadge active={item.active} /></td>
                        <td data-label="관리">
                          <div className="table-actions">
                            <button className="text-button" onClick={() => startItemEdit(item)} type="button">수정</button>
                            {item.active ? <button className="text-button danger" onClick={() => void deactivateRecord('item', item.id, item.name)} type="button">비활성화</button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkbenchPanel>

          <WorkbenchPanel title="품목 분류" description="품목을 찾기 쉬운 계층으로 정리합니다.">
            {categories.length === 0 ? <EmptyState>등록된 품목 분류가 없습니다.</EmptyState> : (
              <div className="responsive-table-wrap compact-table">
                <table className="management-table">
                  <thead><tr><th>코드</th><th>분류명</th><th>상위 분류</th><th>상태</th><th>관리</th></tr></thead>
                  <tbody>{categories.map((category) => (
                    <tr key={category.id}>
                      <td data-label="코드">{category.code}</td>
                      <td data-label="분류명"><strong>{category.name}</strong></td>
                      <td data-label="상위 분류">{category.parent?.name ?? '최상위'}</td>
                      <td data-label="상태"><StatusBadge active={category.active} /></td>
                      <td data-label="관리"><div className="table-actions">
                        <button className="text-button" onClick={() => startCategoryEdit(category)} type="button">수정</button>
                        {category.active ? <button className="text-button danger" onClick={() => void deactivateRecord('category', category.id, category.name)} type="button">비활성화</button> : null}
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </WorkbenchPanel>
        </div>

        {editorKind === 'item' ? (
          <WorkbenchPanel className="workbench-editor" title={itemForm.id ? '품목 수정' : '새 품목 등록'}>
            <form className="management-form" onSubmit={saveItem}>
              <FormField label="품목 코드" name="code" error={requestError?.fieldErrors.code}>
                <input required value={itemForm.code} onChange={(event) => setItemForm({ ...itemForm, code: event.target.value })} />
              </FormField>
              <FormField label="품목명" name="name" error={requestError?.fieldErrors.name}>
                <input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} />
              </FormField>
              <FormField label="품목 유형" name="itemType" error={requestError?.fieldErrors.itemType}>
                <select value={itemForm.itemType} onChange={(event) => {
                  const itemType = event.target.value as ItemTypeValue;
                  setItemForm({ ...itemForm, itemType, trackInventory: itemType === 'SERVICE' ? false : itemForm.trackInventory });
                }}>
                  {Object.entries(itemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <FormField label="품목 분류" name="categoryId" error={requestError?.fieldErrors.categoryId}>
                <select value={itemForm.categoryId} onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })}>
                  <option value="">미분류</option>
                  {categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </FormField>
              <FormField label="단위" name="unit" error={requestError?.fieldErrors.unit}>
                <input required value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} />
              </FormField>
              <FormField label="표준 판매가" name="standardPrice" error={requestError?.fieldErrors.standardPrice}>
                <input min="0" step="0.01" type="number" value={itemForm.standardPrice} onChange={(event) => setItemForm({ ...itemForm, standardPrice: event.target.value })} />
              </FormField>
              <FormField label="표준 원가" name="costPrice" error={requestError?.fieldErrors.costPrice}>
                <input min="0" step="0.01" type="number" value={itemForm.costPrice} onChange={(event) => setItemForm({ ...itemForm, costPrice: event.target.value })} />
              </FormField>
              <div className="checkbox-group form-field-wide">
                <label><input checked={itemForm.trackInventory} disabled={itemForm.itemType === 'SERVICE'} onChange={(event) => setItemForm({ ...itemForm, trackInventory: event.target.checked })} type="checkbox" /> 재고 추적</label>
                <label><input checked={itemForm.taxable} onChange={(event) => setItemForm({ ...itemForm, taxable: event.target.checked })} type="checkbox" /> 과세 대상</label>
              </div>
              <FormField label="설명" name="description" wide><textarea rows={3} value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></FormField>
              <FormField label="메모" name="memo" wide><textarea rows={3} value={itemForm.memo} onChange={(event) => setItemForm({ ...itemForm, memo: event.target.value })} /></FormField>
              <div className="form-actions form-field-wide">
                <button className="secondary-button" onClick={() => setEditorKind(null)} type="button">취소</button>
                <button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button>
              </div>
            </form>
          </WorkbenchPanel>
        ) : editorKind === 'category' ? (
          <WorkbenchPanel className="workbench-editor" title={categoryForm.id ? '품목 분류 수정' : '새 품목 분류'}>
            <form className="management-form" onSubmit={saveCategory}>
              <FormField label="분류 코드" name="code" error={requestError?.fieldErrors.code}><input required value={categoryForm.code} onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value })} /></FormField>
              <FormField label="분류명" name="name" error={requestError?.fieldErrors.name}><input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></FormField>
              <FormField label="상위 분류" name="parentId" error={requestError?.fieldErrors.parentId} wide>
                <select value={categoryForm.parentId} onChange={(event) => setCategoryForm({ ...categoryForm, parentId: event.target.value })}>
                  <option value="">최상위</option>
                  {categories.filter((category) => category.active && category.id !== categoryForm.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </FormField>
              <FormField label="설명" name="description" wide><textarea rows={4} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></FormField>
              <div className="form-actions form-field-wide"><button className="secondary-button" onClick={() => setEditorKind(null)} type="button">취소</button><button className="primary-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></div>
            </form>
          </WorkbenchPanel>
        ) : null}
      </div>
    </ManagementWorkbench>
  );
}
