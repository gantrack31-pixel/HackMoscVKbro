import { request, json } from "../../api/client";
import type { Slide, Scene } from "../../types";

export type AnalysisSelection = {
  table_id: string; chart_type: string; dimension?: string | null; measures: string[];
  x_measure?: string | null; aggregation: string; intent: string;
  roles?: Record<string,string>; semantics?: Record<string,string>; time_group?: string;
  include_reference?: boolean; top_n?: number | null; max_slides?: number;
};
export type AnalysisColumn = {name:string;type:string;confidence:number;semantics:string;unit:string;missing:number;invalid:number;outlier_rows:unknown[];reasons:string[]};
export type AnalysisChoice = {chart_type:string;reason:string;selection:AnalysisSelection};
export type AnalysisTable = {id:string;name:string;row_count:number;column_count:number;columns:AnalysisColumn[];warnings:string[];recommended:AnalysisChoice[];available:AnalysisChoice[];explanation:string};
export type DatasetProfile = {id:string;name:string;context:string;intent:string;tables:AnalysisTable[];warnings:string[];selection?:AnalysisSelection};
export type AnalysisPlan = {slides:Slide[];slide_count:number;main_slide_count:number;appendix_slide_count:number;warnings:string[];selection:AnalysisSelection;preview?:{scene:Scene;index:number;template_id:string;brand_style_id?:string|null;brand_prefer_template?:boolean};reconciliation:{input_rows:number;reference_rows:number;all_source_rows_available:boolean}};
export type DatasetEntry = {profile:DatasetProfile;selection:AnalysisSelection;plan?:AnalysisPlan};
export const chartLabels:Record<string,string> = {table:"Таблица",line:"Динамика",bar:"Сравнение",histogram:"Распределение",pie:"Доли",scatter:"Взаимосвязь",grouped:"Группы",stacked:"С накоплением",kpi:"Показатели"};
export const analysisApi = {
  upload(file:File,context:string,intent:string) { const body=new FormData(); body.append("file",file);body.append("context",context);body.append("intent",intent);return request<DatasetProfile>("/analysis/upload",{method:"POST",body}); },
  text(text:string,context:string,intent:string) {return request<DatasetProfile>("/analysis/text",json("POST",{text,context,intent}));},
  profile:(id:string) => request<DatasetProfile>(`/analysis/${id}`),
  select:(id:string,selection:AnalysisSelection) => request<{selection:AnalysisSelection;profile:AnalysisTable;recommended:AnalysisChoice[];available:AnalysisChoice[];explanation:string}>(`/analysis/${id}/selection`,json("PUT",selection)),
  plan:(id:string,selection:AnalysisSelection,template_id?:string,preview_index=0,brand_style_id?:string|null,brand_prefer_template=false) => request<AnalysisPlan>(`/analysis/${id}/plan`,json("POST",{selection,template_id,preview_index,brand_style_id,brand_prefer_template})),
  rows:(id:string,table_id:string,offset=0) => request<{columns:string[];rows:string[][];total:number;next_offset:number|null}>(`/analysis/${id}/rows?table_id=${encodeURIComponent(table_id)}&offset=${offset}&limit=20`),
};
