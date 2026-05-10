# LLM Intent Classifier Plan

UniPlan의 AI는 SQL을 직접 생성하지 않는다. LLM은 사용자의 자연어 질문을 `templateId`와 안전한 파라미터로 분류하는 역할만 한다.

## 1. 현재 구현

파일:

- `lib/ai/intent.ts`
- `lib/ai/orchestrator.ts`
- `lib/templates/registry.ts`

현재 기본값은 keyword classifier다.

```env
UNIPLAN_INTENT_MODE=keyword
```

LLM 모드 shell도 준비되어 있다.

```env
UNIPLAN_INTENT_MODE=llm
```

단, 현재 LLM 모드는 외부 API를 호출하지 않고 keyword 결과를 감싼다. 이후 provider 연결 지점만 열어둔 상태다.

## 2. 분류 결과 형식

```ts
type IntentClassification = {
  templateId: string | null;
  confidence: number;
  source: 'keyword' | 'llm' | 'fallback';
  reason?: string;
  params?: Record<string, string | number | boolean | null>;
};
```

## 3. LLM이 해도 되는 일

- 등록된 template 목록 중 하나 선택
- confidence 산출
- 날짜 범위, limit, 고객명, 상품명 같은 안전 파라미터 추출
- 모호한 질문이면 낮은 confidence 반환

## 4. LLM이 하면 안 되는 일

- SQL 생성
- 테이블/컬럼 직접 지정
- INSERT/UPDATE/DELETE 제안
- 외부 전송/발주/결제 실행
- 권한 밖 회사 데이터 요청

## 5. Prompt 원칙

`buildClassifierPrompt(message)`는 다음 규칙을 포함한다.

- allowed templates 안에서만 고르기
- SQL 생성 금지
- strict JSON 반환
- unsupported면 `templateId: null`

## 6. Provider 연결 위치

`lib/ai/intent.ts`의 `createLlmIntentClassifier()` 내부에서 provider 호출을 연결한다.

흐름:

```text
message
  → buildClassifierPrompt(message)
  → LLM JSON response
  → JSON parse / schema validate
  → templateFromClassification()
  → registry template 실행
```

## 7. 다음 구현 후보

1. JSON schema validation 추가
2. OpenAI/Gemini/Claude provider adapter 추가
3. confidence 낮을 때 follow-up question 반환
4. params를 template runner에 전달
5. date range parser 추가

## 8. 핵심 안전 문구

> UniPlan의 LLM은 쿼리를 만드는 엔진이 아니라, 검증된 분석 템플릿을 선택하는 분류기입니다.
