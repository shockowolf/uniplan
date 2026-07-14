import { Prisma } from '@prisma/client';
import { DomainError, ValidationError } from '@/lib/domain/errors';

type FieldErrors = Record<string, string>;

const koreanMessageByErrorCode: Record<string, string> = {
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '이 작업을 수행할 권한이 없습니다.',
  INVALID_ORIGIN: '요청 출처를 확인할 수 없습니다.',
  NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
  CONFLICT: '현재 상태에서는 요청을 처리할 수 없습니다.',
  VALIDATION_ERROR: '입력값을 확인해 주세요.',
  SERVICE_INVENTORY_NOT_ALLOWED: '서비스 품목은 재고를 추적할 수 없습니다.',
  INVALID_ITEM_CATEGORY: '사용 가능한 품목 분류를 선택해 주세요.',
  ITEM_SEMANTICS_IN_USE: '사용 이력이 있는 품목의 재고 속성은 바꿀 수 없습니다.',
  ITEM_HAS_STOCK: '현재고가 있는 품목은 비활성화할 수 없습니다.',
  ITEM_USED_BY_ACTIVE_BOM: '활성 BOM에서 사용하는 품목은 비활성화할 수 없습니다.',
  ITEM_CATEGORY_NOT_EMPTY: '활성 품목이나 하위 분류가 있는 분류는 비활성화할 수 없습니다.',
  ITEM_CATEGORY_CYCLE: '품목 분류 계층에 순환이 생길 수 없습니다.',
  INVALID_PARENT_CATEGORY: '사용 가능한 상위 분류를 선택해 주세요.',
  INVALID_BOM_OUTPUT: '재고를 추적하는 유효한 생산 품목을 선택해 주세요.',
  BOM_REVISION_IMMUTABLE: '활성화되었거나 사용된 BOM 개정은 수정할 수 없습니다.',
  DUPLICATE_BOM_COMPONENT: '한 개정에 같은 구성 품목을 두 번 넣을 수 없습니다.',
  EMPTY_BOM: 'BOM 개정에는 구성 품목이 하나 이상 필요합니다.',
  INVALID_BOM_COMPONENT: '모든 구성 품목은 사용 가능한 재고 품목이어야 합니다.',
  INVALID_BOM_QUANTITY: '구성 수량은 0보다 커야 합니다.',
  BOM_CYCLE: 'BOM 구조에 순환 참조가 있습니다.',
  INVALID_CHILD_BOM_REVISION: '연결된 하위 BOM 개정을 사용할 수 없습니다.',
  BOM_NOT_ACTIVE: '활성 BOM 개정만 종료할 수 있습니다.',
  BOM_HAS_ACTIVE_REVISION: '활성 개정을 먼저 종료한 뒤 BOM을 비활성화해 주세요.',
  INVALID_PRODUCTION_QUANTITY: '생산 수량은 0보다 커야 합니다.',
  INVALID_INVENTORY_QUANTITY: '수량을 올바르게 입력해 주세요.',
  INVALID_TRANSFER: '출고 창고와 입고 창고는 달라야 합니다.',
  EMPTY_INVENTORY_TRANSACTION: '재고 변동이 없는 거래는 등록할 수 없습니다.',
  INVALID_INVENTORY_ITEM: '사용 가능한 재고 추적 품목을 선택해 주세요.',
  INVALID_WAREHOUSE: '사용 가능한 창고를 선택해 주세요.',
  INVALID_POSTING_USER: '재고 거래 등록자를 확인할 수 없습니다.',
  INSUFFICIENT_STOCK: '출고할 수량보다 현재고가 부족합니다.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '이미 사용한 요청 키에 다른 내용이 들어왔습니다.',
  REVERSAL_OF_REVERSAL: '취소 거래는 다시 취소할 수 없습니다.',
  ALREADY_REVERSED: '이미 취소된 재고 거래입니다.',
  WAREHOUSE_HAS_STOCK: '현재고가 있는 창고는 비활성화할 수 없습니다.',
  INVALID_SAFETY_QUANTITY: '안전재고는 0 이상이어야 합니다.',
  INVALID_NAVIGATION_HREF: '이동 경로는 슬래시(/)로 시작하는 내부 경로여야 합니다.',
  INVALID_RESOURCE_CODE: '권한 코드는 영문 소문자와 숫자, 점 또는 하이픈만 사용할 수 있습니다.',
  INVALID_NAVIGATION_PARENT: '사용 가능한 상위 메뉴를 선택해 주세요.',
  NAVIGATION_CYCLE: '메뉴 계층에 순환이 생길 수 없습니다.',
  NAVIGATION_HAS_CHILDREN: '활성 하위 메뉴가 있는 메뉴는 비활성화할 수 없습니다.',
  NAVIGATION_PERMISSION_MISSING: '새 메뉴 권한을 연결할 관리자 역할이 없습니다.',
};

const defaultFieldByErrorCode: Record<string, string> = {
  SERVICE_INVENTORY_NOT_ALLOWED: 'trackInventory',
  INVALID_ITEM_CATEGORY: 'categoryId',
  INVALID_PARENT_CATEGORY: 'parentId',
  ITEM_CATEGORY_CYCLE: 'parentId',
  INVALID_BOM_OUTPUT: 'outputItemId',
  DUPLICATE_BOM_COMPONENT: 'components',
  EMPTY_BOM: 'components',
  INVALID_BOM_COMPONENT: 'components',
  INVALID_BOM_QUANTITY: 'components',
  BOM_CYCLE: 'components',
  INVALID_PRODUCTION_QUANTITY: 'quantity',
  INVALID_INVENTORY_QUANTITY: 'quantity',
  INVALID_TRANSFER: 'toWarehouseId',
  INVALID_INVENTORY_ITEM: 'itemId',
  INVALID_WAREHOUSE: 'warehouseId',
  INVALID_SAFETY_QUANTITY: 'safetyQuantity',
  INVALID_NAVIGATION_HREF: 'href',
  INVALID_RESOURCE_CODE: 'resourceCode',
  INVALID_NAVIGATION_PARENT: 'parentId',
  NAVIGATION_CYCLE: 'parentId',
};

function inferValidationField(errorMessage: string) {
  const fieldMatch = /^([A-Za-z][A-Za-z0-9]*) (?:is|required|must|cannot)/.exec(
    errorMessage,
  );
  return fieldMatch?.[1];
}

export function apiSuccess(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

export function apiError(
  requestError: unknown,
  fieldByErrorCode: Record<string, string> = {},
) {
  if (requestError instanceof DomainError) {
    const message =
      koreanMessageByErrorCode[requestError.code] ??
      (requestError instanceof ValidationError
        ? '입력값을 확인해 주세요.'
        : '요청을 처리할 수 없습니다.');
    const fieldName =
      fieldByErrorCode[requestError.code] ??
      defaultFieldByErrorCode[requestError.code] ??
      inferValidationField(requestError.message);
    const fieldErrors: FieldErrors = fieldName ? { [fieldName]: message } : {};
    return Response.json(
      { error: { code: requestError.code, message, fieldErrors } },
      { status: requestError.status },
    );
  }
  if (
    requestError instanceof Prisma.PrismaClientKnownRequestError &&
    requestError.code === 'P2002'
  ) {
    return Response.json(
      {
        error: {
          code: 'DUPLICATE_VALUE',
          message: '이미 사용 중인 코드 또는 값입니다.',
          fieldErrors: {},
        },
      },
      { status: 409 },
    );
  }
  console.error('UNIPLAN API request failed', requestError);
  return Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: '요청을 처리하는 중 문제가 발생했습니다.',
        fieldErrors: {},
      },
    },
    { status: 500 },
  );
}

export async function readJsonObject(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      throw new ValidationError('requestBody is required');
    }
    return requestBody as Record<string, unknown>;
  } catch (requestError) {
    if (requestError instanceof DomainError) throw requestError;
    throw new ValidationError('requestBody is required');
  }
}

export function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function optionalNullableString(value: unknown) {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

export function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
