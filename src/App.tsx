import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import CariPage from '@/pages/CariPage'
import StokPage from '@/pages/StokPage'
import SiparisPage from '@/pages/SiparisPage'
import UretimPage from '@/pages/UretimPage'
import YikamaIstasyonuPage from '@/pages/YikamaIstasyonuPage'
import EtiketYaziciPage from '@/pages/EtiketYaziciPage'
import CitaIstasyonuPage from '@/pages/CitaIstasyonuPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Tam ekran operatör istasyonları — sidebar yok */}
        <Route path="/yikama" element={<YikamaIstasyonuPage />} />
        <Route path="/etiket" element={<EtiketYaziciPage />} />
        <Route path="/cita" element={<CitaIstasyonuPage />} />

        {/* Ana uygulama -- sidebar'li layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cari" element={<CariPage />} />
          <Route path="/stok" element={<StokPage />} />
          <Route path="/siparisler" element={<SiparisPage />} />
          <Route path="/uretim" element={<UretimPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
