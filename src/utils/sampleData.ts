import type { DeliveryDataset } from '../types/cals';


/**
 * 簡易的なSVG画像データURIを生成（工事写真・電子黒板のシミュレーション）
 */
function createMockPhotoDataUrl(
  title: string,
  workType: string,
  station: string,
  date: string,
  bgColor: string,
  measureText: string
): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <!-- 現場背景 -->
  <rect width="800" height="600" fill="${bgColor}"/>
  <!-- 現場のテクスチャ/グリッド -->
  <line x1="0" y1="420" x2="800" y2="420" stroke="#333" stroke-width="4"/>
  <rect x="150" y="250" width="500" height="170" fill="#a0a0a0" stroke="#444" stroke-width="4"/>
  <line x1="150" y1="280" x2="650" y2="280" stroke="#777" stroke-width="2" stroke-dasharray="8,8"/>
  <text x="400" y="340" font-family="sans-serif" font-size="28" fill="#222" text-anchor="middle" font-weight="bold">${title}</text>
  
  <!-- スケール/スタッフ棒 -->
  <rect x="180" y="180" width="24" height="240" fill="#ffffff" stroke="#c00" stroke-width="2"/>
  <line x1="180" y1="240" x2="204" y2="240" stroke="#c00" stroke-width="4"/>
  <line x1="180" y1="300" x2="204" y2="300" stroke="#c00" stroke-width="4"/>
  <line x1="180" y1="360" x2="204" y2="360" stroke="#c00" stroke-width="4"/>

  <!-- 電子黒板 (右下に標準配置) -->
  <g transform="translate(460, 360)">
    <!-- 黒板背景 -->
    <rect width="320" height="220" rx="8" fill="#1b4332" stroke="#d8f3dc" stroke-width="3" filter="drop-shadow(2px 4px 6px rgba(0,0,0,0.5))"/>
    <rect x="6" y="6" width="308" height="208" rx="4" fill="none" stroke="#2d6a4f" stroke-width="2"/>
    
    <text x="160" y="32" font-family="sans-serif" font-size="16" fill="#fff" font-weight="bold" text-anchor="middle">電子小黒板 (GioV仕様)</text>
    <line x1="10" y1="42" x2="310" y2="42" stroke="#52b788" stroke-width="1.5"/>

    <text x="16" y="66" font-family="sans-serif" font-size="14" fill="#95d5b2">工事名:</text>
    <text x="76" y="66" font-family="sans-serif" font-size="14" fill="#ffffff" font-weight="bold">一般国道487号 道路改良</text>

    <text x="16" y="96" font-family="sans-serif" font-size="14" fill="#95d5b2">工　種:</text>
    <text x="76" y="96" font-family="sans-serif" font-size="14" fill="#ffffff">${workType}</text>

    <text x="16" y="126" font-family="sans-serif" font-size="14" fill="#95d5b2">測　点:</text>
    <text x="76" y="126" font-family="sans-serif" font-size="14" fill="#ffffff">${station}</text>

    <text x="16" y="156" font-family="sans-serif" font-size="14" fill="#95d5b2">実　測:</text>
    <text x="76" y="156" font-family="sans-serif" font-size="14" fill="#ffff3f" font-weight="bold">${measureText}</text>

    <line x1="10" y1="172" x2="310" y2="172" stroke="#52b788" stroke-width="1"/>
    <text x="16" y="196" font-family="sans-serif" font-size="12" fill="#d8f3dc">撮影日: ${date}</text>
    <text x="180" y="196" font-family="sans-serif" font-size="12" fill="#d8f3dc">受注: ㈱安芸建設</text>
  </g>
</svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 簡易的なモックHTML/PDF風プレビューのデータURIを生成
 */
function createMockDocDataUrl(docTitle: string, docNumber: string, contentLines: string[]): string {
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Yu Gothic", "Meiryo", sans-serif; padding: 40px; color: #1f2937; background: #fff; line-height: 1.6; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 24px; font-weight: bold; color: #1e3a8a; }
    .meta { font-size: 13px; color: #4b5563; text-align: right; }
    .box { border: 1px solid #d1d5db; background: #f9fafb; padding: 16px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
    th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; width: 28%; }
    .stamp-area { margin-top: 40px; display: flex; justify-content: flex-end; gap: 16px; }
    .stamp-box { width: 80px; height: 80px; border: 1px solid #9ca3af; text-align: center; font-size: 11px; padding: 4px; display: flex; flex-direction: column; justify-content: space-between; }
    .stamp-circle { border: 2px solid #dc2626; color: #dc2626; border-radius: 50%; width: 50px; height: 50px; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:12px; color:#2563eb; font-weight:bold;">GioV 電子納品基準準拠 帳票</div>
      <div class="title">${docTitle}</div>
    </div>
    <div class="meta">
      <div>文書番号: ${docNumber}</div>
      <div>工事名: 一般国道487号 道路改良工事（交付金）</div>
      <div>作成日: 2026年08月20日</div>
    </div>
  </div>

  <div class="box">
    <strong>【発注者】</strong> GioV建設事務所 道路整備課<br>
    <strong>【受注者】</strong> 株式会社安芸建設（現場代理人・監理技術者）
  </div>

  <table>
    ${contentLines.map((line, idx) => `
      <tr>
        <th>項目 ${idx + 1}</th>
        <td>${line}</td>
      </tr>
    `).join('')}
  </table>

  <div class="stamp-area">
    <div class="stamp-box">
      <div>監督員</div>
      <div class="stamp-circle">確認済</div>
      <div>08/25</div>
    </div>
    <div class="stamp-box">
      <div>現場代理人</div>
      <div class="stamp-circle">承認</div>
      <div>08/20</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * 簡易的なP21 (ISO 10303-21) CAD図面データURLを生成
 */
function createMockP21DataUrl(): string {
  const p21 = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('SXF CAD DRAWING'),'2;1');
FILE_NAME('D0001003.P21','2026-10-17T00:00:00',('JACIC'),('CALS'),'','','');
FILE_SCHEMA(('SXF_LEVEL2'));
ENDSEC;
DATA;
/* 図面外枠 A1 (841 x 594 mm) */
#1=CARTESIAN_POINT('',(0.0,0.0));
#2=CARTESIAN_POINT('',(841.0,0.0));
#3=CARTESIAN_POINT('',(841.0,594.0));
#4=CARTESIAN_POINT('',(0.0,594.0));
#5=LINE('',#1,#2);
#6=LINE('',#2,#3);
#7=LINE('',#3,#4);
#8=LINE('',#4,#1);

/* 図面内枠 (マージン 10mm) */
#10=CARTESIAN_POINT('',(10.0,10.0));
#11=CARTESIAN_POINT('',(831.0,10.0));
#12=CARTESIAN_POINT('',(831.0,584.0));
#13=CARTESIAN_POINT('',(10.0,584.0));
#14=LINE('',#10,#11);
#15=LINE('',#11,#12);
#16=LINE('',#12,#13);
#17=LINE('',#13,#10);

/* 表題欄 */
#20=CARTESIAN_POINT('',(531.0,10.0));
#21=CARTESIAN_POINT('',(531.0,90.0));
#22=CARTESIAN_POINT('',(831.0,90.0));
#23=LINE('',#20,#21);
#24=LINE('',#21,#22);

/* 図面タイトル */
#30=CARTESIAN_POINT('',(545.0,65.0));
#31=TEXT_LITERAL('','標準横断図・土工定規図 (CAD完成図)',#30,8.0);
#32=CARTESIAN_POINT('',(545.0,40.0));
#33=TEXT_LITERAL('','工事名: 一般国道487号 道路改良工事',#32,5.0);
#34=CARTESIAN_POINT('',(545.0,22.0));
#35=TEXT_LITERAL('','縮尺: 1:50 / 形式: ISO 10303-21 (SXF)',#34,4.5);

/* 道路横断勾配・車道ライン (中央分離、歩道、擁壁) */
#100=CARTESIAN_POINT('',(120.0,280.0));
#101=CARTESIAN_POINT('',(220.0,280.0));
#102=CARTESIAN_POINT('',(420.0,290.0));
#103=CARTESIAN_POINT('',(620.0,280.0));
#104=CARTESIAN_POINT('',(720.0,280.0));
#105=LINE('',#100,#101);
#106=LINE('',#101,#102);
#107=LINE('',#102,#103);
#108=LINE('',#103,#104);

/* 車道センターライン */
#110=CARTESIAN_POINT('',(420.0,200.0));
#111=CARTESIAN_POINT('',(420.0,400.0));
#112=LINE('',#110,#111);
#113=CARTESIAN_POINT('',(425.0,405.0));
#114=TEXT_LITERAL('','道路中心線 (CL)',#113,5.0);

/* 擁壁・U型側溝の断面形状 */
#120=CARTESIAN_POINT('',(120.0,280.0));
#121=CARTESIAN_POINT('',(120.0,160.0));
#122=CARTESIAN_POINT('',(70.0,140.0));
#123=CARTESIAN_POINT('',(70.0,200.0));
#124=LINE('',#120,#121);
#125=LINE('',#121,#122);
#126=LINE('',#122,#123);
#127=LINE('',#123,#120);

/* 寸法線・矢印 */
#130=CARTESIAN_POINT('',(220.0,330.0));
#131=CARTESIAN_POINT('',(420.0,330.0));
#132=LINE('',#130,#131);
#133=CARTESIAN_POINT('',(300.0,335.0));
#134=TEXT_LITERAL('','車道 W=3.25m (2.0%)',#133,5.0);

#140=CARTESIAN_POINT('',(420.0,330.0));
#141=CARTESIAN_POINT('',(620.0,330.0));
#142=LINE('',#140,#141);
#143=CARTESIAN_POINT('',(500.0,335.0));
#144=TEXT_LITERAL('','車道 W=3.25m (-2.0%)',#143,5.0);

#150=CARTESIAN_POINT('',(120.0,350.0));
#151=CARTESIAN_POINT('',(220.0,350.0));
#152=LINE('',#150,#151);
#153=CARTESIAN_POINT('',(140.0,355.0));
#154=TEXT_LITERAL('','歩道 W=2.0m',#153,5.0);

/* 円形構造物 (水抜きパイプ) */
#160=CARTESIAN_POINT('',(95.0,210.0));
#161=CIRCLE('',#160,8.0);
#162=CARTESIAN_POINT('',(95.0,175.0));
#163=CIRCLE('',#162,8.0);
#164=CARTESIAN_POINT('',(110.0,190.0));
#165=TEXT_LITERAL('','VPφ75 水抜き管',#164,4.0);

/* レイヤー（画層）定義テーブル (CAD製図基準準拠) */
#200=PRESENTATION_LAYER_ASSIGNMENT('図面枠 (B-T)','外枠および表題欄',(#5,#6,#7,#8,#14,#15,#16,#17,#23,#24));
#201=PRESENTATION_LAYER_ASSIGNMENT('構造物外形 (S-C)','車道および構造物線',(#105,#106,#107,#108,#124,#125,#126,#127,#161,#163));
#202=PRESENTATION_LAYER_ASSIGNMENT('中心線 (C-C)','道路中心線CL',(#112));
#203=PRESENTATION_LAYER_ASSIGNMENT('寸法線 (D-L)','横断寸法線',(#132,#142,#152));
#204=PRESENTATION_LAYER_ASSIGNMENT('注記・文字 (M-T)','図面注記および文字',(#31,#33,#35,#114,#134,#144,#154,#165));

ENDSEC;
END-ISO-10303-21;
`.trim();

  return `data:text/plain;charset=utf-8,${encodeURIComponent(p21)}`;
}

/**
 * GioV 公共工事の模擬電子納品データセット
 */
export function getSampleHiroshimaDataset(): DeliveryDataset {
  return {
    deliveryType: 'construction',
    constructionInfo: {
      deliveryType: 'construction',
      constructionName: '一般国道487号 道路改良工事（交付金）',
      lineRiverName: '一般国道487号',
      clientName: 'GioV建設事務所',
      contractorName: '株式会社安芸建設',
      contractNumber: '第 26-03487 号',
      startDate: '2026-04-01',
      endDate: '2026-10-31',
      place: '広島県呉市警固屋地内',
      supervisor: '広島 太郎（総括監督員）',
      chiefEngineer: '安芸 次郎（監理技術者）',
    },
    photos: [
      {
        id: 'PIC00001',
        title: '着工前 全景（起点側より終点側を望む）',
        category: '着工前',
        type: '施工状況',
        workType: '道路改良工',
        workKind: '土工',
        workDetail: '掘削工',
        date: '2026-04-10',
        time: '09:15:00',
        station: 'NO.0+0.00',
        remarks: '工事着手前の現況全景写真',
        fileName: 'PIC00001.JPG',
        filePath: 'PHOTO/PIC00001.JPG',
        fileUrl: createMockPhotoDataUrl(
          '着工前 現況全景写真',
          '土工 (掘削)',
          'NO.0+0.00',
          '2026-04-10',
          '#bbf7d0',
          '設計地形確認'
        ),
        blackboardItems: [
          { name: '測点', value: 'NO.0+0.00' },
          { name: '工事区分', value: '着工前' },
        ],
      },
      {
        id: 'PIC00002',
        title: '基礎砕石工 敷均し厚さ測定',
        category: '施工中',
        type: '出来形管理',
        workType: '擁壁工',
        workKind: '重力式擁壁',
        workDetail: '基礎工',
        date: '2026-05-18',
        time: '11:20:00',
        station: 'NO.2+15.00',
        remarks: '設計厚さ t=150mm、実測 t=155mm (+5mm)',
        fileName: 'PIC00002.JPG',
        filePath: 'PHOTO/PIC00002.JPG',
        fileUrl: createMockPhotoDataUrl(
          '基礎砕石 敷均し厚さ測定',
          '擁壁工 (基礎砕石)',
          'NO.2+15.00',
          '2026-05-18',
          '#fed7aa',
          '設計150mm / 実測155mm'
        ),
        blackboardItems: [
          { name: '測点', value: 'NO.2+15.00' },
          { name: '設計値', value: 't=150mm' },
          { name: '実測値', value: 't=155mm' },
          { name: '合否判定', value: '規格値内（良）' },
        ],
      },
      {
        id: 'PIC00003',
        title: '底版コンクリート 配筋状況（鉄筋径・ピッチ確認）',
        category: '施工中',
        type: '出来形管理',
        workType: '擁壁工',
        workKind: 'L型擁壁',
        workDetail: '鉄筋工',
        date: '2026-06-04',
        time: '14:00:00',
        station: 'NO.3+0.00',
        remarks: '主筋 D16 @150mm、配力筋 D13 @200mm ピッチ合格',
        fileName: 'PIC00003.JPG',
        filePath: 'PHOTO/PIC00003.JPG',
        fileUrl: createMockPhotoDataUrl(
          '底版 配筋ピッチ・かぶり測定',
          '鉄筋工 (底版)',
          'NO.3+0.00',
          '2026-06-04',
          '#e2e8f0',
          '主筋D16 @150 / 実測150mm'
        ),
        blackboardItems: [
          { name: '測点', value: 'NO.3+0.00' },
          { name: '主筋設計', value: 'D16 @150' },
          { name: '実測主筋', value: 'D16 @150' },
          { name: 'かぶり厚', value: '設計70mm / 実測75mm' },
        ],
      },
      {
        id: 'PIC00004',
        title: 'コンクリート打設状況（スランプ・空気量・温度試験）',
        category: '施工中',
        type: '品質管理',
        workType: '擁壁工',
        workKind: '重力式擁壁',
        workDetail: 'コンクリート打設',
        date: '2026-06-12',
        time: '10:30:00',
        station: 'NO.3+10.00',
        remarks: 'スランプ 8.0cm(規格8±2.5)、空気量 4.6%(規格4.5±1.5%)',
        fileName: 'PIC00004.JPG',
        filePath: 'PHOTO/PIC00004.JPG',
        fileUrl: createMockPhotoDataUrl(
          '受入検査 (スランプ/空気量/塩化物)',
          'コンクリート工',
          '生コン車No.3',
          '2026-06-12',
          '#e0e7ff',
          'SL:8.0cm / Air:4.6% (合格)'
        ),
        blackboardItems: [
          { name: '配合', value: '24-8-25BB' },
          { name: 'スランプ', value: '実測 8.0cm (規格8.0±2.5)' },
          { name: '空気量', value: '実測 4.6% (規格4.5±1.5)' },
          { name: 'コンクリート温度', value: '24.5℃' },
        ],
      },
      {
        id: 'PIC00005',
        title: '擁壁裏込め砕石・透水マット 施工状況（不可視部分）',
        category: '不可視部分',
        type: '施工状況',
        workType: '擁壁工',
        workKind: '重力式擁壁',
        workDetail: '裏込め工',
        date: '2026-07-02',
        time: '15:10:00',
        station: 'NO.2+15.00〜NO.4+0.00',
        remarks: '埋め戻し後不可視となる透水マット・水抜きパイプ設置状況',
        fileName: 'PIC00005.JPG',
        filePath: 'PHOTO/PIC00005.JPG',
        fileUrl: createMockPhotoDataUrl(
          '透水マット・水抜きパイプ (不可視部)',
          '裏込め工',
          'NO.3+0.00',
          '2026-07-02',
          '#fef08a',
          '水抜き管φ75 @2.0m 配置確認'
        ),
        blackboardItems: [
          { name: '測点', value: 'NO.3+0.00' },
          { name: '管理項目', value: '不可視部分施工状況' },
          { name: '透水マット', value: 't=10mm 全面敷設' },
        ],
      },
      {
        id: 'PIC00006',
        title: '完成 全景（起点側より終点側を望む）',
        category: '完成',
        type: '完成写真',
        workType: '道路改良工',
        workKind: '完成',
        workDetail: '全景',
        date: '2026-09-30',
        time: '13:45:00',
        station: 'NO.0+0.00',
        remarks: '工事完成全景写真（着工前写真 PIC00001 と同位置・同画角）',
        fileName: 'PIC00006.JPG',
        filePath: 'PHOTO/PIC00006.JPG',
        fileUrl: createMockPhotoDataUrl(
          '工事完成 全景写真',
          '完成検査用',
          'NO.0+0.00',
          '2026-09-30',
          '#bae6fd',
          '全工種 完了確認'
        ),
        blackboardItems: [
          { name: '測点', value: 'NO.0+0.00' },
          { name: '区分', value: '完成' },
          { name: '延長', value: 'L=120.0m' },
        ],
      },
    ],
    reports: [
      {
        id: 'REP00001',
        title: '工事打合せ簿 第01号（施工計画書提出・工程確認）',
        type: '打合せ簿',
        proposalItem: '提出',
        groupTitle: '工事打合せ簿 第01号（施工計画書提出・工程確認）',
        fileName: 'REP00001.PDF',
        filePath: 'REPORT/ORG/REP00001.PDF',
        createDate: '2026-04-12',
        summary: '当初施工計画書の提出及び交通規制計画に関する協議協議事項の確認。監督員より承諾。',
        fileUrl: createMockDocDataUrl(
          '工事打合せ簿（第01号）',
          '広西建 第 01 号',
          [
            '件名: 施工計画書（当初）の提出及び着工前協議',
            '協議理由: 本工事着工に先立ち、現場組織表・工程表・安全衛生管理計画を提出し承諾を得るため。',
            '協議事項: 一般国道487号片側交互通行規制（夜間施工は行わず昼間9:00〜17:00規制）',
            '指示・承諾事項: 提出の施工計画書について承諾する。通学時間帯の安全通路確保を徹底のこと。',
          ]
        ),
      },
      {
        id: 'REP00002',
        title: '工事打合せ簿 第05号（擁壁基礎地盤の支持力確認立会）',
        type: '打合せ簿',
        proposalItem: '立会',
        groupTitle: '工事打合せ簿 第05号（擁壁基礎地盤の支持力確認立会）',
        fileName: 'REP00002.PDF',
        filePath: 'REPORT/ORG/REP00002.PDF',
        createDate: '2026-05-15',
        summary: '重力式擁壁基礎（NO.2+10〜NO.4+00）地盤支持力平板載荷試験の立会確認。地耐力qa=150kN/m2以上を満足。',
        fileUrl: createMockDocDataUrl(
          '工事打合せ簿（第05号・立会確認）',
          '広西建 第 05 号',
          [
            '件名: 重力式擁壁基礎地盤 平板載荷試験 立会確認',
            '立会日時: 2026年05月15日 10:00〜',
            '試験結果: 極限支持力 qu=480 kN/㎡、長期許容支持力 qa=160 kN/㎡（設計基準 150 kN/㎡ 以上満足）',
            '立会確認者: GioV建設事務所 監督員 / 受注者 監理技術者',
          ]
        ),
      },
      {
        id: 'REP00003',
        title: 'コンクリート圧縮強度試験成績表（28日強度）',
        type: '試験成績表',
        fileName: 'REP00003.PDF',
        filePath: 'REPORT/ORG/REP00003.PDF',
        createDate: '2026-07-10',
        summary: '打設日 2026/06/12 重力式擁壁コンクリート（呼び強度24N/mm2）の材齢28日圧縮強度試験。平均29.4N/mm2で合格。',
        fileUrl: createMockDocDataUrl(
          'コンクリート圧縮強度試験成績表（材齢28日）',
          '広島試 第 26-0612 号',
          [
            'コンクリート配合: 24-8-25BB（高炉セメントB種）',
            '供試体番号: No.1, No.2, No.3（標準水中養生）',
            '試験値: No.1=29.1 N/mm², No.2=29.8 N/mm², No.3=29.3 N/mm²',
            '平均圧縮強度: 29.4 N/mm²（設計基準強度 24.0 N/mm² に対して 122.5% で適合）',
          ]
        ),
      },
      {
        id: 'REP00004',
        title: '段階確認書（鉄筋組立完了・型枠組立確認）',
        type: '段階確認書',
        fileName: 'REP00004.PDF',
        filePath: 'REPORT/ORG/REP00004.PDF',
        createDate: '2026-06-05',
        summary: 'L型擁壁底版鉄筋組立および型枠建込みの段階確認。かぶり、ピッチ、継手長さを確認し合格。',
        fileUrl: createMockDocDataUrl(
          '段階確認書（鉄筋・型枠工）',
          '段階確認 第 26-02 号',
          [
            '確認対象: L型擁壁底版 配筋及び型枠（NO.3+0.00）',
            '確認事項: 鉄筋径、配筋ピッチ、かぶり厚さ、スペーサー配置、型枠締付け状況',
            '確認結果: 設計図書通り施工されていることを現認した。（合格）',
          ]
        ),
      },
    ],
    drawings: [
      {
        id: 'DRW00001',
        title: '道路改良 平面図・縦断図（完成図）',
        type: '完成図',
        fileName: 'DRW00001.PDF',
        filePath: 'DRAWING/ORG/DRW00001.PDF',
        cadFileName: 'DRW00001.P21',
        scale: '1/500',
        fileUrl: createMockDocDataUrl(
          '道路改良 平面図・縦断図（完成図面）',
          '図面番号: 01/03',
          [
            '路線名: 一般国道487号 / 施工区間: NO.0+0.00 〜 NO.6+0.00 (L=120.0m)',
            '車道幅員: W=3.25m × 2車線 (全幅 8.5m、歩道 W=2.0m 片側設置)',
            '横断勾配: 2.0% 片勾配 / 縦断勾配: 最大 3.5%',
            '主要構造物: 重力式擁壁 (H=2.0m〜3.5m, L=45m), プレキャストU型側溝',
          ]
        ),
      },
      {
        id: 'DRW00002',
        title: '重力式擁壁 配筋図・構造図',
        type: '構造詳細図',
        fileName: 'DRW00002.PDF',
        filePath: 'DRAWING/ORG/DRW00002.PDF',
        cadFileName: 'DRW00002.P21',
        scale: '1/50',
        fileUrl: createMockDocDataUrl(
          '重力式擁壁 構造詳細図・標準断面図',
          '図面番号: 02/03',
          [
            '擁壁形式: 重力式擁壁 TYPE-A (天端幅 400mm, 前面勾配 1:0.3, 背面勾配 1:0.0)',
            '基礎工: 基礎砕石 RC-40 (厚さ t=150mm), 均しコンクリート t=50mm',
            '裏込め材料: クラッシャーラン (C-40) 幅 300mm、透水マット全面設置',
            '水抜きパイプ: 硬質塩化ビニル管 φ75mm (前面に 2.0㎡ に1箇所の割合で配置)',
          ]
        ),
      },
      {
        id: 'DRW00003',
        title: '標準横断図・土工定規図（CAD完成図）',
        type: '完成図',
        fileName: 'D0001003.P21',
        filePath: 'DRAWING/D0001003.P21',
        cadFileName: 'D0001003.P21',
        scale: '1/50',
        fileUrl: createMockP21DataUrl(),
      },
    ],
    otherFiles: [],
    loadedAt: new Date().toLocaleString('ja-JP'),
    folderName: '【GioV】一般国道487号_電子納品サンプル',
  };
}
