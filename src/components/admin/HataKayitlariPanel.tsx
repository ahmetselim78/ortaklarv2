import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, Bug, CheckCircle2, Clock3, Download, FileUp, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { supabase } from '@/lib/supabase'
import { ERROR_RESOLUTION_REPORT_CONTRACT, parseErrorResolutionReport, type ErrorResolutionReport } from '@/lib/errorResolutionReport'
import { tumSatirlariGetir } from '@/lib/supabasePagination'

interface SystemError {
  id: string
  fingerprint: string
  source: string
  severity: string
  status: 'open' | 'acknowledged' | 'resolved'
  title: string
  sanitized_message: string
  route: string | null
  function_name: string | null
  sample_context: unknown
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  last_alert_at: string | null
  created_by: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
}

type StatusFilter = 'all' | SystemError['status']

const STATUS_LABELS: Record<SystemError['status'], string> = {
  open: 'Açık',
  acknowledged: 'İnceleniyor',
  resolved: 'Çözüldü',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

function countBy(rows: SystemError[], key: 'source' | 'severity' | 'status') {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1
    return counts
  }, {})
}

function downloadErrorExport(rows: SystemError[]) {
  const generatedAt = new Date()
  const payload = {
    schema_version: 1,
    export_type: 'ortaklar_merkezi_hatalar',
    generated_at: generatedAt.toISOString(),
    source_page: `${window.location.origin}/admin/hatalar`,
    scope: 'Dışa aktarım anında açık olan hata kayıtları; ekrandaki durum filtresinden bağımsızdır.',
    agent_note: 'Bu kayıtlara AI incelemesi için İnceleniyor durumu verilmiştir. Kayıtlar oluşurken hassas alanlar temizlenmiştir. Tekrarlanan hatalar occurrence_count alanında birleştirilir.',
    resolution_report_contract: ERROR_RESOLUTION_REPORT_CONTRACT,
    summary: {
      unique_error_count: rows.length,
      total_occurrence_count: rows.reduce((total, row) => total + row.occurrence_count, 0),
      by_status: countBy(rows, 'status'),
      by_severity: countBy(rows, 'severity'),
      by_source: countBy(rows, 'source'),
      first_seen_at: rows.length > 0 ? rows.reduce((oldest, row) => row.first_seen_at < oldest ? row.first_seen_at : oldest, rows[0].first_seen_at) : null,
      last_seen_at: rows.length > 0 ? rows.reduce((latest, row) => row.last_seen_at > latest ? row.last_seen_at : latest, rows[0].last_seen_at) : null,
    },
    errors: rows,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `merkezi-hatalar-ai-${generatedAt.toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function HataKayitlariPanel() {
  const [rows, setRows] = useState<SystemError[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [resolutionReport, setResolutionReport] = useState<ErrorResolutionReport | null>(null)
  const [aiExportRows, setAiExportRows] = useState<SystemError[] | null>(null)
  const resolutionFileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('system_errors').select('*').order('last_seen_at', { ascending: false }).limit(500)
    if (queryError) setError(queryError.message)
    else { setRows((data ?? []) as SystemError[]); setError(null) }
    setLoading(false)
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  async function setStatus(id: string, status: SystemError['status']) {
    setPendingId(id)
    const { error: rpcError } = await supabase.rpc('set_system_error_status', { p_error_id: id, p_status: status })
    if (rpcError) setError(rpcError.message)
    else await load()
    setPendingId(null)
  }

  async function prepareAIExport() {
    setExporting(true)
    setError(null)
    setWarning(null)
    setSuccess(null)
    try {
      const openRows = await tumSatirlariGetir<SystemError>(
        (from, to) => supabase
          .from('system_errors')
          .select('*', { count: 'exact' })
          .eq('status', 'open')
          .order('last_seen_at', { ascending: false })
          .range(from, to),
        { baglam: 'merkezi hata dışa aktarımı' },
      )
      if (openRows.length === 0) {
        setWarning('AI için aktarılacak açık hata yok. İnceleniyor ve Çözüldü kayıtları yeniden dışa aktarılmaz.')
        return
      }
      setAiExportRows(openRows)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Hata kayıtları dışa aktarılamadı.')
    } finally {
      setExporting(false)
    }
  }

  async function confirmAIExport() {
    if (!aiExportRows) return

    setExporting(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('acknowledge_system_errors_for_ai_export', {
        p_error_ids: aiExportRows.map(row => row.id),
      })
      if (rpcError) throw new Error(rpcError.message)

      const acknowledgedIds = new Set(((data ?? []) as Array<{ error_id: string }>).map(row => row.error_id))
      const exportedRows = aiExportRows
        .filter(row => acknowledgedIds.has(row.id))
        .map(row => ({ ...row, status: 'acknowledged' as const }))
      setAiExportRows(null)

      if (exportedRows.length === 0) {
        setWarning('Seçilen açık hatalar dışa aktarımdan önce durum değiştirdi. Dosya oluşturulmadı.')
        await load()
        return
      }

      downloadErrorExport(exportedRows)
      setSuccess(`${exportedRows.length} hata AI incelemesine aktarıldı ve İnceleniyor durumuna alındı.`)
      await load()
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Hata kayıtları dışa aktarılamadı.')
    } finally {
      setExporting(false)
    }
  }

  async function selectResolutionReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setError(null)
    setWarning(null)
    setSuccess(null)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Çözüm raporu en fazla 2 MB olabilir.')
      setResolutionReport(parseErrorResolutionReport(await file.text()))
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Çözüm raporu okunamadı.')
    }
  }

  async function applyResolutionReport() {
    if (!resolutionReport) return

    setResolving(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('resolve_system_errors_from_report', {
        p_error_ids: resolutionReport.resolvedErrorIds,
      })
      if (rpcError) throw new Error(rpcError.message)

      setResolutionReport(null)
      setSuccess(`${data ?? resolutionReport.resolvedErrorIds.length} hata kaydı çözüldü olarak işaretlendi.`)
      await load()
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Çözüm raporu uygulanamadı.')
    } finally {
      setResolving(false)
    }
  }

  const filteredRows = useMemo(() => filter === 'all' ? rows : rows.filter(row => row.status === filter), [filter, rows])
  const counts = useMemo(() => ({
    all: rows.length,
    open: rows.filter(row => row.status === 'open').length,
    acknowledged: rows.filter(row => row.status === 'acknowledged').length,
    resolved: rows.filter(row => row.status === 'resolved').length,
  }), [rows])

  return (
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6 xl:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Bug size={22} /></span>
            <div><h2 className="text-xl font-bold text-slate-950">Merkezi Hatalar</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kritik istemci, API, Edge ve operasyon hatalarını tek merkezden takip edin.</p></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input ref={resolutionFileInputRef} type="file" accept="application/json,.json" onChange={event => void selectResolutionReport(event)} className="hidden" />
            <button type="button" onClick={() => resolutionFileInputRef.current?.click()} disabled={resolving || exporting} title="AI tarafından oluşturulan çözüm raporu, seçilen hata kayıtlarını çözüldü olarak işaretler" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              <FileUp size={15} /> Çözüm raporu yükle
            </button>
            <button type="button" onClick={() => void prepareAIExport()} disabled={exporting || resolving} title="Yalnızca Açık hataları aktarır ve onaydan sonra İnceleniyor durumuna alır" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {exporting ? 'Hazırlanıyor…' : 'AI için dışa aktar'}
            </button>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yenile</button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            ['all', 'Tüm kayıtlar', Bug, 'bg-slate-100 text-slate-600'],
            ['open', 'Açık', ShieldAlert, 'bg-red-50 text-red-700'],
            ['acknowledged', 'İnceleniyor', Clock3, 'bg-amber-50 text-amber-700'],
            ['resolved', 'Çözüldü', CheckCircle2, 'bg-emerald-50 text-emerald-700'],
          ] as const).map(([value, label, Icon, classes]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${filter === value ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${classes}`}><Icon size={17} /></span>
              <span><span className="block text-xl font-extrabold tabular-nums text-slate-950">{counts[value]}</span><span className="block text-xs text-slate-500">{label}</span></span>
            </button>
          ))}
        </div>

        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
        {warning && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{warning}</div>}
        {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{success}</div>}

        {loading && rows.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm text-slate-400"><Loader2 size={20} className="animate-spin" /> Hata kayıtları yükleniyor…</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><CheckCircle2 size={30} className="mx-auto text-emerald-500" /><p className="mt-3 text-sm font-semibold text-slate-700">Bu durumda hata kaydı yok</p><p className="mt-1 text-xs text-slate-400">Farklı bir durum filtresi seçebilirsiniz.</p></div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map(row => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${row.severity === 'critical' ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}>{row.severity === 'critical' ? 'Kritik' : row.severity}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{row.source}</span>
                      <span className="text-xs font-semibold text-slate-400">×{row.occurrence_count}</span>
                    </div>
                    <h3 className="mt-3 break-words text-sm font-bold text-slate-900 sm:text-base">{row.title}</h3>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-600 sm:text-sm">{row.sanitized_message}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400"><span>İlk: {formatDate(row.first_seen_at)}</span><span>Son: {formatDate(row.last_seen_at)}</span></p>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 lg:w-auto">
                    {(['open', 'acknowledged', 'resolved'] as const).map(status => (
                      <button key={status} type="button" onClick={() => void setStatus(row.id, status)} disabled={pendingId === row.id} className={`inline-flex min-h-9 items-center justify-center rounded-lg px-2 text-[11px] font-semibold transition disabled:opacity-50 sm:px-3 ${row.status === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{pendingId === row.id && row.status !== status ? null : STATUS_LABELS[status]}</button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {resolutionReport && <ConfirmDialog
        baslik="Çözüm raporunu uygula"
        mesaj={`${resolutionReport.resolvedErrorIds.length} hata kaydı çözüldü olarak işaretlenecek. Devam etmek istiyor musunuz?`}
        onayButon="Çözüldü olarak işaretle"
        onayRenk="green"
        onOnayla={() => void applyResolutionReport()}
        onKapat={() => setResolutionReport(null)}
        yukleniyor={resolving}
      />}
      {aiExportRows && <ConfirmDialog
        baslik="AI incelemesine aktar"
        mesaj={`${aiExportRows.length} açık hata dışa aktarılacak ve ardından İnceleniyor durumuna alınacak. İnceleniyor ve Çözüldü kayıtları tekrar AI'a aktarılmaz.`}
        onayButon="Aktar ve incelemeye al"
        onayRenk="blue"
        onOnayla={() => void confirmAIExport()}
        onKapat={() => setAiExportRows(null)}
        yukleniyor={exporting}
      />}
    </div>
  )
}
