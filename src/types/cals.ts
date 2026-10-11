export type CalsDeliveryType = 'construction' | 'consignment'; // 'construction': 土木工事(INDEX_C), 'consignment': 業務委託(INDEX_D)

export interface ConstructionInfo {
  deliveryType?: CalsDeliveryType; // 成果品区分 (土木工事 / 業務委託)
  constructionName: string;      // 工事名称 または 業務名称
  lineRiverName: string;          // 路線・河川名
  clientName: string;             // 発注者名称 (例: 広島県北部建設事務所)
  contractorName: string;         // 請負者・受注者名称
  contractNumber?: string;        // 契約番号 / 業務実績登録番号
  startDate?: string;             // 工期開始 / 履行期間-着手
  endDate?: string;               // 工期完了 / 履行期間-完了
  place?: string;                 // 工事場所 / 履行場所
  supervisor?: string;            // 監督員名
  chiefEngineer?: string;         // 主任技術者・管理技術者名
  overview?: string;              // 業務概要 (業務委託用)
  keywords?: string[];            // 業務キーワード (業務委託用)
}

export interface BlackboardItem {
  name: string;
  value: string;
}

export interface PhotoItem {
  id: string;
  title: string;                  // 写真タイトル
  category: string;               // 写真区分 (着工前 / 施工中 / 完成 / 不可視部分 等)
  type: string;                   // 写真種別 (出来形管理 / 品質管理 / 安全管理 等)
  workType: string;               // 工種 (例: 擁壁工, 舗装工)
  workKind: string;               // 種別 (例: 重力式擁壁)
  workDetail: string;             // 細別 (例: コンクリート打設)
  date: string;                   // 撮影日 (YYYY-MM-DD)
  time?: string;                  // 撮影時刻
  station?: string;               // 測点 (NO.10+5.0 等)
  remarks?: string;               // 備考
  fileName: string;               // 写真ファイル名 (PIC00001.JPG 等)
  filePath: string;               // 相対パス
  fileUrl?: string;               // ブラウザ内 Blob URL
  blackboardItems: BlackboardItem[]; // 電子黒板情報 (測定項目・設計値・実測値など)
}

export interface ReportItem {
  id: string;
  title: string;                  // 報告書・書類タイトル
  type: string;                   // 報告書種別 (打合せ簿, 施工計画書, 試験成績表 等)
  fileName: string;               // ファイル名 (REP00001.PDF 等)
  filePath: string;               // 相対パス
  fileUrl?: string;               // ブラウザ内 Blob URL
  createDate?: string;            // 作成年月日
  summary?: string;               // 要約・概要
  groupTitle?: string;            // 帳票グループ名称 (例: 9月度履行報告書, 施工計画書(当初))
  fileRole?: string;              // ファイル役割 (鑑 / 本文 / 添付資料 等)
}

export interface DrawingItem {
  id: string;
  title: string;                  // 図面タイトル
  type: string;                   // 図面種別 (完成図, 施工図, 平面図 等)
  fileName: string;               // PDFファイル名
  filePath: string;               // 相対パス
  fileUrl?: string;               // ブラウザ内 Blob URL
  cadFileName?: string;           // SFC / P21 ファイル名
  scale?: string;                 // 縮尺 (1/500 等)
}

export type InspectionStatus = 'pending' | 'ok' | 'issue';

export interface InspectionRecord {
  targetId: string;               // photo / report / drawing の ID
  targetType: 'photo' | 'report' | 'drawing';
  targetTitle: string;
  status: InspectionStatus;       // 'pending' | 'ok' | 'issue'
  notes: string;                  // 指摘事項・確認メモ
  updatedAt: string;              // 更新日時
}

export interface DeliveryDataset {
  deliveryType: CalsDeliveryType; // 'construction' | 'consignment'
  constructionInfo: ConstructionInfo;
  photos: PhotoItem[];
  reports: ReportItem[];
  drawings: DrawingItem[];
  otherFiles: { name: string; path: string; fileUrl?: string }[];
  loadedAt: string;
  folderName: string;
}
