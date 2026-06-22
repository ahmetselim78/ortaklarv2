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
import TamirIstasyonuPage from '@/pages/TamirIstasyonuPage'
import AyarlarPage from '@/pages/AyarlarPage'
import SaatlikTakipPage from '@/pages/SaatlikTakipPage'
import AdminPage from '@/pages/AdminPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SaatlikTakipPanosu from '@/components/uretim/SaatlikTakipPanosu'
import OperatorGirisPage from '@/pages/OperatorGirisPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Tam ekran operatör istasyonları — sidebar yok */}
        <Route path="/istasyonlar/poz-giris" element={<PozGirisPage />} />
        <Route path="/istasyonlar/kumanda" element={<KumandaPaneliPage />} />
        <Route path="/istasyonlar/gosterge" element={<GostergeEkraniPage />} />
        <Route path="/istasyonlar/tamir" element={<TamirIstasyonuPage />} />
        <Route path="/istasyonlar/uretim-giris" element={<OperatorGirisPage />} />
        {/* TV Panosu — tam ekran, sidebar yok */}
        <Route path="/istasyonlar/uretim-panosu" element={<SaatlikTakipPanosu tamEkran />} />

        {/* Ana uygulama -- sidebar'li layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cari" element={<CariPage />} />
          <Route path="/stok" element={<StokPage />} />
          <Route path="/siparisler" element={<SiparisPage />} />
          <Route path="/uretim" element={<UretimPage />} />
          <Route path="/istasyonlar" element={<UretimIstasyonlariPage />} />
          <Route path="/saatlik-takip" element={<SaatlikTakipPage />} />
          <Route path="/ayarlar" element={<AyarlarPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/operator-giris" element={<OperatorGirisPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
