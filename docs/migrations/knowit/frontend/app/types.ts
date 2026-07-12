export type ResearchRun = {
  run_id: string;
  topic: string;
  status: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

export type ProviderInfo = {
  name: string;
  provider_type: string;
  display_name: string;
  enabled: boolean;
  is_local: boolean;
  sends_data_off_machine: boolean;
  capabilities: {
    supports_text_generation: boolean;
    supports_json_generation: boolean;
    supports_embeddings: boolean;
    supports_reranking: boolean;
    supports_streaming: boolean;
    supports_long_context: boolean;
  };
};

export type ProviderHealth = {
  provider_name: string;
  available: boolean;
  status: string;
  message: string;
};

export type Paper = {
  paper_id: string;
  source: string;
  source_id: string;
  title: string;
  authors: string[];
  abstract: string;
  doi: string | null;
  published_date: string | null;
  updated_date: string | null;
  paper_url: string;
  pdf_url: string | null;
  categories: string[];
  citation_count: number | null;
  reference_count: number | null;
};

export type Folder = {
  folder_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  paper_count: number;
};

export type FolderPaper = {
  paper: Paper;
  added_at: string;
};

export type FolderWithPapers = {
  folder: Folder;
  papers: FolderPaper[];
};

export type RankedPaper = {
  paper: Paper;
  rank_position: number;
  relevance_score: number;
  ranking_method: string;
  ranking_explanation: string;
};

export type RankedPaperSearchResponse = {
  topic: string;
  source: string;
  max_results: number;
  ranking_method: string;
  papers: RankedPaper[];
};

export type PaperExtraction = {
  run_id: string;
  paper_id: string;
  provider_name: string;
  problem: string;
  method: string;
  datasets_or_setting: string;
  key_results: string[];
  main_contribution: string;
  limitations: string[];
  tags: string[];
  confidence: number;
  source_quote_or_evidence: string;
  has_full_text: boolean;
  full_text_status: string;
  created_at: string;
};

export type Landscape = {
  run_id: string;
  provider_name: string;
  overview: string;
  clusters: string[];
  relationships: string[];
  tensions: string[];
  open_problems: string[];
  recommended_reading_path: string[];
  created_at: string;
};

export type ProviderHealthMap = Record<string, ProviderHealth>;

export type PaperSource = "arxiv" | "semantic_scholar" | "both";

export type RunSnapshot = {
  run: ResearchRun;
  papers: RankedPaper[];
  extractions: PaperExtraction[];
  landscape: Landscape | null;
};
