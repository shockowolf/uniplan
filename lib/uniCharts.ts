import type { Chart } from '@/lib/templates/types';

type UniChartGroup = {
  key: string;
  title: string;
  sourceLabel: string;
  charts: Chart[];
};

const productSeries = [
  { key: 'sum01', name: '정수기', type: 'area' as const },
  { key: 'sum02', name: '음수기', type: 'area' as const },
  { key: 'sum03', name: '공기살균기', type: 'area' as const },
  { key: 'sum04', name: '온수제조기', type: 'area' as const },
  { key: 'sum05', name: '살균수제조장치', type: 'area' as const }
];

const productCountSeries = [
  { key: 'cnt01', name: '정수기', type: 'bar' as const },
  { key: 'cnt02', name: '음수기', type: 'bar' as const },
  { key: 'cnt03', name: '공기살균기', type: 'bar' as const },
  { key: 'cnt04', name: '온수제조기', type: 'bar' as const },
  { key: 'cnt05', name: '살균수제조장치', type: 'bar' as const }
];

const salesMonthlyData = [
  { contractDt: '202601', sum01: 46000000, sum02: 27000000, sum03: 12000000, sum04: 19000000, sum05: 8000000, cnt01: 28, cnt02: 17, cnt03: 8, cnt04: 11, cnt05: 6 },
  { contractDt: '202602', sum01: 52000000, sum02: 23000000, sum03: 16000000, sum04: 24000000, sum05: 11000000, cnt01: 31, cnt02: 14, cnt03: 10, cnt04: 13, cnt05: 8 },
  { contractDt: '202603', sum01: 49000000, sum02: 31000000, sum03: 18000000, sum04: 22000000, sum05: 15000000, cnt01: 29, cnt02: 20, cnt03: 11, cnt04: 12, cnt05: 10 },
  { contractDt: '202604', sum01: 61000000, sum02: 34000000, sum03: 21000000, sum04: 28000000, sum05: 17000000, cnt01: 37, cnt02: 22, cnt03: 13, cnt04: 16, cnt05: 12 },
  { contractDt: '202605', sum01: 68000000, sum02: 39000000, sum03: 24000000, sum04: 31000000, sum05: 19000000, cnt01: 41, cnt02: 25, cnt03: 15, cnt04: 18, cnt05: 13 }
];

const salesAreaData = [
  { areaCd: '강원', sum01: 9000000, sum02: 4000000, sum03: 2000000, sum04: 3000000, sum05: 1000000, cnt01: 5, cnt02: 3, cnt03: 1, cnt04: 2, cnt05: 1 },
  { areaCd: '경기', sum01: 38000000, sum02: 22000000, sum03: 14000000, sum04: 19000000, sum05: 9000000, cnt01: 23, cnt02: 14, cnt03: 9, cnt04: 11, cnt05: 6 },
  { areaCd: '서울', sum01: 42000000, sum02: 25000000, sum03: 16000000, sum04: 21000000, sum05: 12000000, cnt01: 26, cnt02: 16, cnt03: 10, cnt04: 13, cnt05: 8 },
  { areaCd: '부산', sum01: 21000000, sum02: 11000000, sum03: 6000000, sum04: 9000000, sum05: 4000000, cnt01: 13, cnt02: 7, cnt03: 4, cnt04: 6, cnt05: 3 },
  { areaCd: '제주', sum01: 7000000, sum02: 3000000, sum03: 2000000, sum04: 2000000, sum05: 1000000, cnt01: 4, cnt02: 2, cnt03: 1, cnt04: 1, cnt05: 1 }
];

export const uniChartGroups: UniChartGroup[] = [
  {
    key: 'home-card',
    title: '홈 카드 차트',
    sourceLabel: 'Uni home card chart presets',
    charts: [
      {
        kind: 'stacked-area',
        title: '월별 계약통계',
        description: '판매계약금액과 멤버십계약금액을 누적 영역으로 표시합니다.',
        xKey: 'date',
        yKey: 'sellAmt',
        valueFormat: 'money',
        series: [
          { key: 'sellAmt', name: '판매계약금액', type: 'area' },
          { key: 'mbsAmt', name: '멤버십계약금액', type: 'area' }
        ],
        data: [
          { date: '1월', sellAmt: 38000000, mbsAmt: 12000000 },
          { date: '2월', sellAmt: 42000000, mbsAmt: 15000000 },
          { date: '3월', sellAmt: 51000000, mbsAmt: 18000000 },
          { date: '4월', sellAmt: 47000000, mbsAmt: 21000000 },
          { date: '5월', sellAmt: 56000000, mbsAmt: 24000000 }
        ]
      },
      {
        kind: 'stacked-bar',
        title: '고객상담건수',
        description: 'AS, 고객불만, 설치, 구매 등 상담 유형을 누적 막대로 보여줍니다.',
        xKey: 'inboundRcvDtm',
        yKey: 'asCnt',
        valueFormat: 'count',
        series: [
          { key: 'asCnt', name: 'AS', type: 'bar' },
          { key: 'cmpCnt', name: '고객불만', type: 'bar' },
          { key: 'etcCnt', name: '기타', type: 'bar' },
          { key: 'fltCnt', name: '필터교체', type: 'bar' },
          { key: 'outCnt', name: '계약해지', type: 'bar' },
          { key: 'selCnt', name: '구매', type: 'bar' },
          { key: 'setCnt', name: '설치', type: 'bar' },
          { key: 'watCnt', name: '통수', type: 'bar' }
        ],
        data: [
          { inboundRcvDtm: '월', asCnt: 8, cmpCnt: 3, etcCnt: 5, fltCnt: 7, outCnt: 2, selCnt: 4, setCnt: 6, watCnt: 3 },
          { inboundRcvDtm: '화', asCnt: 10, cmpCnt: 2, etcCnt: 4, fltCnt: 6, outCnt: 1, selCnt: 5, setCnt: 7, watCnt: 4 },
          { inboundRcvDtm: '수', asCnt: 9, cmpCnt: 4, etcCnt: 6, fltCnt: 8, outCnt: 2, selCnt: 6, setCnt: 8, watCnt: 5 },
          { inboundRcvDtm: '목', asCnt: 12, cmpCnt: 3, etcCnt: 5, fltCnt: 9, outCnt: 3, selCnt: 6, setCnt: 9, watCnt: 4 },
          { inboundRcvDtm: '금', asCnt: 11, cmpCnt: 5, etcCnt: 7, fltCnt: 10, outCnt: 2, selCnt: 7, setCnt: 10, watCnt: 6 }
        ]
      },
      {
        kind: 'treemap',
        title: '품목별 판매규모',
        description: '품목 카테고리와 모델별 판매대수를 면적 비중으로 표현합니다.',
        xKey: 'partsNm',
        yKey: 'prdCnt',
        valueFormat: 'count',
        data: [
          { cateNm: '정수기', partsNm: 'GTZP-11', prdCnt: 733 },
          { cateNm: '정수기', partsNm: 'GTZP-12', prdCnt: 337 },
          { cateNm: '정수기', partsNm: 'GTZP-13', prdCnt: 271 },
          { cateNm: '음수기', partsNm: 'GTZP-21', prdCnt: 200 },
          { cateNm: '음수기', partsNm: 'GTZP-22', prdCnt: 120 },
          { cateNm: '공기살균기', partsNm: 'GTZP-31', prdCnt: 480 },
          { cateNm: '공기살균기', partsNm: 'GTZP-32', prdCnt: 440 },
          { cateNm: '온수제조기', partsNm: 'GTZP-41', prdCnt: 167 },
          { cateNm: '살균수제조장치', partsNm: 'GTZP-47', prdCnt: 124 }
        ]
      }
    ]
  },
  {
    key: 'sales-statistics',
    title: '판매 통계 차트',
    sourceLabel: 'Uni sales chart presets',
    charts: [
      {
        kind: 'stacked-area',
        title: '월별 품목 매출액',
        xKey: 'contractDt',
        yKey: 'sum01',
        valueFormat: 'money',
        series: productSeries,
        data: salesMonthlyData
      },
      {
        kind: 'stacked-bar',
        title: '월별 품목 판매수량',
        xKey: 'contractDt',
        yKey: 'cnt01',
        valueFormat: 'count',
        series: productCountSeries,
        data: salesMonthlyData
      },
      {
        kind: 'stacked-area',
        title: '지역별 품목 매출액',
        xKey: 'areaCd',
        yKey: 'sum01',
        valueFormat: 'money',
        series: productSeries,
        data: salesAreaData
      },
      {
        kind: 'stacked-bar',
        title: '지역별 품목 판매수량',
        xKey: 'areaCd',
        yKey: 'cnt01',
        valueFormat: 'count',
        series: productCountSeries,
        data: salesAreaData
      }
    ]
  },
  {
    key: 'operation-statistics',
    title: '운영/인사 차트',
    sourceLabel: 'Uni operation chart presets',
    charts: [
      {
        kind: 'composed',
        title: '청구그래프',
        description: '금액 막대와 수납율 라인을 함께 표시하는 이중 축 차트입니다.',
        xKey: 'chargeYyyymm',
        yKey: 'totalAmt',
        valueFormat: 'money',
        series: [
          { key: 'totalAmt', name: '청구대상금액', type: 'bar', axis: 'left' },
          { key: 'chargeAmt', name: '청구완료금액', type: 'bar', axis: 'left' },
          { key: 'totCollectAmt', name: '수납금액', type: 'bar', axis: 'left' },
          { key: 'remainingCollAmt', name: '미납금액', type: 'bar', axis: 'left' },
          { key: 'collectPer', name: '수납율(%)', type: 'line', axis: 'right', unit: '%' }
        ],
        data: [
          { chargeYyyymm: '202601', totalAmt: 96000000, chargeAmt: 92000000, totCollectAmt: 84000000, remainingCollAmt: 8000000, collectPer: 91.3 },
          { chargeYyyymm: '202602', totalAmt: 104000000, chargeAmt: 99000000, totCollectAmt: 90000000, remainingCollAmt: 9000000, collectPer: 90.9 },
          { chargeYyyymm: '202603', totalAmt: 112000000, chargeAmt: 106000000, totCollectAmt: 101000000, remainingCollAmt: 5000000, collectPer: 95.2 },
          { chargeYyyymm: '202604', totalAmt: 118000000, chargeAmt: 110000000, totCollectAmt: 99000000, remainingCollAmt: 11000000, collectPer: 90.0 },
          { chargeYyyymm: '202605', totalAmt: 124000000, chargeAmt: 116000000, totCollectAmt: 108000000, remainingCollAmt: 8000000, collectPer: 93.1 }
        ]
      },
      {
        kind: 'stacked-bar',
        title: '휴가통계',
        xKey: 'month',
        yKey: 'sumVacyear',
        valueFormat: 'count',
        series: [
          { key: 'sumVacyear', name: '연차', type: 'bar' },
          { key: 'sumVachalf', name: '반차', type: 'bar' },
          { key: 'sumVacgov', name: '공가', type: 'bar' },
          { key: 'sumVachos', name: '병가', type: 'bar' },
          { key: 'sumVacwom', name: '보건', type: 'bar' },
          { key: 'sumVacedu', name: '교육', type: 'bar' },
          { key: 'sumVactrip', name: '사외출장', type: 'bar' },
          { key: 'sumVacabs', name: '결근', type: 'bar' }
        ],
        data: [
          { month: '1월', sumVacyear: 10, sumVachalf: 2, sumVacgov: 1, sumVachos: 0, sumVacwom: 1, sumVacedu: 2, sumVactrip: 3, sumVacabs: 0 },
          { month: '2월', sumVacyear: 8, sumVachalf: 3, sumVacgov: 1, sumVachos: 2, sumVacwom: 0, sumVacedu: 1, sumVactrip: 2, sumVacabs: 1 },
          { month: '3월', sumVacyear: 14, sumVachalf: 4, sumVacgov: 2, sumVachos: 1, sumVacwom: 1, sumVacedu: 2, sumVactrip: 4, sumVacabs: 0 },
          { month: '4월', sumVacyear: 12, sumVachalf: 3, sumVacgov: 1, sumVachos: 2, sumVacwom: 1, sumVacedu: 3, sumVactrip: 5, sumVacabs: 1 },
          { month: '5월', sumVacyear: 16, sumVachalf: 5, sumVacgov: 2, sumVachos: 1, sumVacwom: 2, sumVacedu: 2, sumVactrip: 4, sumVacabs: 0 }
        ]
      },
      {
        kind: 'bar',
        title: '채용현황',
        xKey: 'date',
        yKey: 'plus',
        valueFormat: 'count',
        series: [
          { key: 'plus', name: '입사자', type: 'bar' },
          { key: 'minus', name: '퇴사자', type: 'bar' }
        ],
        data: [
          { date: '1월', plus: 3, minus: 1 },
          { date: '2월', plus: 2, minus: 2 },
          { date: '3월', plus: 4, minus: 1 },
          { date: '4월', plus: 1, minus: 2 },
          { date: '5월', plus: 5, minus: 1 }
        ]
      }
    ]
  }
];
