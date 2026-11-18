import type {
  DrugApproval,
  DrugPipelineEntry,
  ListDrugApprovalsResponse,
  ListDrugPipelineResponse,
  PharmaServiceClient,
  PipelineFacetCount,
} from '@/generated/client/worldmonitor/pharma/v1/service_client';
import { Panel } from './Panel';
import { t, getLocale } from '@/services/i18n';
import { joinSafeHtml, safeHtml, safeUrlAttr, type SafeHtml } from '@/utils/sanitize';

let _client: PharmaServiceClient | null = null;
async function getPharmaClient(): Promise<PharmaServiceClient> {
  if (!_client) {
    const { PharmaServiceClient } = await import('@/generated/client/worldmonitor/pharma/v1/service_client');
    const { getRpcBaseUrl } = await import('@/services/rpc-client');
    _client = new PharmaServiceClient(getRpcBaseUrl(), { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });
  }
  return _client;
}

type View = 'pipeline' | 'approvals';

const PIPELINE_LIMIT = 200;

const MODALITY_COLORS: Record<string, string> = {
  small_molecule: '#3498db',
  antibody: '#9b59b6',
  adc: '#e67e22',
  cell_therapy: '#e74c3c',
  gene_therapy: '#1abc9c',
  rna: '#2ecc71',
  vaccine: '#f1c40f',
  peptide_protein: '#5dade2',
  other: '#95a5a6',
};

function label(group: 'modality' | 'area', key: string): string {
  const path = `components.drugPipeline.${group}.${key}`;
  const translated = t(path);
  return translated === path ? key.replace(/_/g, ' ') : translated;
}

/** "2027-03" → "2027 Q1"; '' when the month is unusable. */
export function quarterOf(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return '';
  const q = Math.ceil(Number(m[2]) / 3);
  return q >= 1 && q <= 4 ? `${m[1]} Q${q}` : '';
}

function formatMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

function badge(text: string, color: string): SafeHtml {
  return safeHtml`<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:0.03em;white-space:nowrap;color:${color};border:1px solid ${color}">${text}</span>`;
}

function select(name: string, current: string, allLabel: string, group: 'modality' | 'area', facets: PipelineFacetCount[]): SafeHtml {
  const options = facets.map((f) => (f.key === current
    ? safeHtml`<option value="${f.key}" selected>${label(group, f.key)} (${f.count})</option>`
    : safeHtml`<option value="${f.key}">${label(group, f.key)} (${f.count})</option>`));
  return safeHtml`<select data-drug-filter="${name}" aria-label="${allLabel}" style="flex:1;min-width:0;font-size:11px;padding:3px 4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px">
    <option value="">${allLabel}</option>${joinSafeHtml(options)}
  </select>`;
}

function renderEntry(e: DrugPipelineEntry): SafeHtml {
  const color = MODALITY_COLORS[e.modality] ?? MODALITY_COLORS.other!;
  const window = `${formatMonth(e.expectedDecisionFrom)} – ${formatMonth(e.expectedDecisionTo)}`;
  const completion = t(e.primaryCompletionActual
    ? 'components.drugPipeline.completedOn'
    : 'components.drugPipeline.completionExpected', { date: e.primaryCompletionDate });
  return safeHtml`
    <a href="${safeUrlAttr(e.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;color:inherit">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.candidate}</span>
        ${badge(label('modality', e.modality), color)}
        ${e.novel ? badge(t('components.drugPipeline.newDrug'), '#2ecc71') : badge(t('components.drugPipeline.labelExpansion'), '#95a5a6')}
      </div>
      <div style="font-size:10px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.sponsor} · ${e.conditions[0] ?? ''}</div>
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--text-dim)">
        <span>${t('components.drugPipeline.estimatedWindow', { window })}</span>
        <span style="white-space:nowrap">${completion}</span>
      </div>
    </a>`;
}

function renderApproval(a: DrugApproval): SafeHtml {
  const color = MODALITY_COLORS[a.modality] ?? MODALITY_COLORS.other!;
  const name = a.brandName || a.genericName;
  return safeHtml`
    <div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
        ${badge(label('modality', a.modality), color)}
        ${a.newMolecularEntity ? badge(t('components.drugPipeline.newDrug'), '#2ecc71') : ''}
        ${a.reviewPriority === 'PRIORITY' ? badge(t('components.drugPipeline.priorityReview'), '#e67e22') : ''}
      </div>
      <div style="font-size:10px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.genericName} · ${a.sponsor}</div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim)">
        <span>${a.applicationNumber}</span><span>${a.approvalDate}</span>
      </div>
    </div>`;
}

export class DrugPipelinePanel extends Panel {
  private view: View = 'pipeline';
  private modality = '';
  private area = '';
  private novelOnly = true;
  private pipeline: ListDrugPipelineResponse | null = null;
  private approvals: ListDrugApprovalsResponse | null = null;
  private requestSeq = 0;

  constructor() {
    super({ id: 'drug-pipeline', title: t('components.drugPipeline.title'), showCount: false, infoTooltip: t('components.drugPipeline.infoTooltip') });

    this.content.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-drug-view]');
      if (!tab) return;
      const next = tab.dataset.drugView === 'approvals' ? 'approvals' : 'pipeline';
      if (next === this.view) return;
      this.view = next;
      if (next === 'approvals' && !this.approvals) void this.fetchData();
      else this.render();
    });
    this.content.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const filter = el.dataset?.drugFilter;
      if (!filter) return;
      if (filter === 'modality') this.modality = el.value;
      else if (filter === 'area') this.area = el.value;
      else if (filter === 'novel') this.novelOnly = (el as HTMLInputElement).checked;
      void this.fetchData();
    });
  }

  public async fetchData(): Promise<boolean> {
    const hasData = this.view === 'pipeline' ? this.pipeline : this.approvals;
    if (!hasData) this.showLoading();
    const seq = ++this.requestSeq;
    try {
      const client = await getPharmaClient();
      if (this.view === 'approvals') {
        const resp = await client.listDrugApprovals({});
        if (seq !== this.requestSeq) return false;
        if (resp.unavailable) return this.fail(t('components.drugPipeline.errors.noData'), Boolean(this.approvals));
        this.approvals = resp;
      } else {
        const resp = await client.listDrugPipeline({
          modality: this.modality,
          therapeuticArea: this.area,
          novelOnly: this.novelOnly,
          limit: PIPELINE_LIMIT,
        });
        if (seq !== this.requestSeq) return false;
        if (resp.unavailable) return this.fail(t('components.drugPipeline.errors.noData'), Boolean(this.pipeline));
        this.pipeline = resp;
      }
      this.render();
      return true;
    } catch (e) {
      if (seq !== this.requestSeq) return false;
      return this.fail(e instanceof Error ? e.message : t('components.drugPipeline.errors.failedToLoad'), Boolean(hasData));
    }
  }

  private fail(message: string, keepStale: boolean): boolean {
    // Keep showing the last good render rather than replacing it with an error.
    if (!keepStale) this.showError(message, () => void this.fetchData());
    return false;
  }

  private renderTabs(): SafeHtml {
    const tab = (view: View, text: string): SafeHtml => {
      const active = this.view === view;
      return safeHtml`<button type="button" data-drug-view="${view}" aria-pressed="${active ? 'true' : 'false'}" style="flex:1;font-size:11px;font-weight:600;padding:5px 6px;cursor:pointer;border-radius:4px;border:1px solid var(--border);background:${active ? 'rgba(255,255,255,0.1)' : 'transparent'};color:${active ? 'var(--text)' : 'var(--text-dim)'}">${text}</button>`;
    };
    return safeHtml`<div style="display:flex;gap:6px;padding:0 0 8px">${tab('pipeline', t('components.drugPipeline.tabs.pipeline'))}${tab('approvals', t('components.drugPipeline.tabs.approvals'))}</div>`;
  }

  private renderPipeline(data: ListDrugPipelineResponse): SafeHtml {
    const filters = safeHtml`
      <div style="display:flex;gap:6px;padding:0 0 6px">
        ${select('modality', this.modality, t('components.drugPipeline.allModalities'), 'modality', data.modalityCounts)}
        ${select('area', this.area, t('components.drugPipeline.allAreas'), 'area', data.areaCounts)}
      </div>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-dim);padding:0 0 6px;cursor:pointer">
        ${this.novelOnly
          ? safeHtml`<input type="checkbox" data-drug-filter="novel" checked>`
          : safeHtml`<input type="checkbox" data-drug-filter="novel">`}
        ${t('components.drugPipeline.novelOnly')}
      </label>`;

    const groups = new Map<string, DrugPipelineEntry[]>();
    for (const e of data.entries) {
      const key = quarterOf(e.expectedDecisionFrom);
      const bucket = groups.get(key);
      if (bucket) bucket.push(e);
      else groups.set(key, [e]);
    }
    const body = data.entries.length === 0
      ? safeHtml`<div style="padding:16px 0;text-align:center;font-size:11px;color:var(--text-dim)">${t('components.drugPipeline.noMatches')}</div>`
      : joinSafeHtml([...groups.entries()].map(([quarter, entries]) => safeHtml`
          <div style="padding-top:8px">
            <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:0.06em;padding:0 0 3px">${t('components.drugPipeline.earliestFrom', { quarter })} · ${entries.length}</div>
            ${joinSafeHtml(entries.map(renderEntry))}
          </div>`));

    const shown = data.entries.length < data.total
      ? t('components.drugPipeline.showingOf', { shown: data.entries.length, total: data.total })
      : t('components.drugPipeline.totalTrials', { total: data.total });
    return safeHtml`${filters}
      <div style="font-size:10px;color:var(--text-dim)">${shown}</div>
      ${body}
      <div style="font-size:10px;color:var(--text-dim);padding-top:10px;line-height:1.4">${t('components.drugPipeline.disclaimer')}</div>`;
  }

  private renderApprovals(data: ListDrugApprovalsResponse): SafeHtml {
    if (data.approvals.length === 0) {
      return safeHtml`<div style="padding:16px 0;text-align:center;font-size:11px;color:var(--text-dim)">${t('components.drugPipeline.noMatches')}</div>`;
    }
    return safeHtml`${joinSafeHtml(data.approvals.map(renderApproval))}
      <div style="font-size:10px;color:var(--text-dim);padding-top:10px;line-height:1.4">${t('components.drugPipeline.approvalsNote')}</div>`;
  }

  private render(): void {
    const data = this.view === 'pipeline' ? this.pipeline : this.approvals;
    if (!data) return;
    const body = this.view === 'pipeline'
      ? this.renderPipeline(data as ListDrugPipelineResponse)
      : this.renderApprovals(data as ListDrugApprovalsResponse);
    this.setSafeContent(safeHtml`<div style="padding:0 14px 12px;max-height:520px;overflow-y:auto">${this.renderTabs()}${body}</div>`);
  }
}
