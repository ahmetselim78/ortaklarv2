import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import CariPage from '@/pages/CariPage'
import StokPage from '@/pages/StokPage'
import SiparisPage from '@/pages/SiparisPage'
import UretimPage from '@/pages/UretimPage'
import UretimIstasyonlariPage from '@/pages/UretimIstasyonlariPage'
import PozGirisPage from '@/pages/PozGirisPage'
import KumandaPaneliPage from '@/pages/KumandaPaneliPage'
import GostergeEkraniPage from '@/pages/GostergeEkraniPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Tam ekran operatör istasyonları — sidebar yok */}
        <Route path="/istasyonlar/poz-giris" element={<PozGirisPage />} />
        <Route path="/istasyonlar/kumanda" element={<KumandaPaneliPage />} />
        <Route path="/istasyonlar/gosterge" element={<GostergeEkraniPage />} />

        {/* Ana uygulama -- sidebar'li layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cari" element={<CariPage />} />
          <Route path="/stok" element={<StokPage />} />
          <Route path="/siparisler" element={<SiparisPage />} />
          <Route path="/uretim" element={<UretimPage />} />
          <Route path="/istasyonlar" element={<UretimIstasyonlariPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
