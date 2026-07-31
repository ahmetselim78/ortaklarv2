import { Clock3, Construction, Layers3 } from 'lucide-react'

interface YapimAsamasindaPageProps {
  title: string
  description: string
  category: string
}

export default function YapimAsamasindaPage({
  title,
  description,
  category,
}: YapimAsamasindaPageProps) {
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/70 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <section
        aria-labelledby="yapim-asamasinda-baslik"
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-100/70 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-indigo-100/50 blur-3xl" aria-hidden />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
            <Construction size={15} aria-hidden />
            Yapım aşamasında
          </div>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200/70">
              <Construction size={30} strokeWidth={1.8} aria-hidden />
            </div>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-blue-700">{category}</p>
              <h1 id="yapim-asamasinda-baslik" className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {title}
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
                {description}
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm ring-1 ring-slate-200">
                <Clock3 size={20} aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Hazırlık sürüyor</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Modülün operasyonel işlevleri tamamlandığında bu sayfa üzerinden kullanıma açılacak.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100">
                <Layers3 size={20} aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Menü bağlantısı hazır</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Bu alan rol yetkilerine göre görüntülenir ve mevcut adresi korunur.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
