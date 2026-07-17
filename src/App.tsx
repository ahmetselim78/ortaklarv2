import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '@/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import SaatlikTakipPanosu from '@/components/uretim/SaatlikTakipPanosu'
import AdminPage from '@/pages/AdminPage'
import AyarlarPage from '@/pages/AyarlarPage'
import CariPage from '@/pages/CariPage'
import Dashboard from '@/pages/Dashboard'
import GostergeEkraniPage from '@/pages/GostergeEkraniPage'
import KumandaPaneliPage from '@/pages/KumandaPaneliPage'
import LoginPage from '@/pages/LoginPage'
import MfaPage from '@/pages/MfaPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OperatorGirisPage from '@/pages/OperatorGirisPage'
import PasswordChangePage from '@/pages/PasswordChangePage'
import PozGirisPage from '@/pages/PozGirisPage'
import SaatlikTakipPage from '@/pages/SaatlikTakipPage'
import SiparisPage from '@/pages/SiparisPage'
import StokPage from '@/pages/StokPage'
import TamirIstasyonuPage from '@/pages/TamirIstasyonuPage'
import UnauthorizedPage from '@/pages/UnauthorizedPage'
import UretimIstasyonlariPage from '@/pages/UretimIstasyonlariPage'
import UretimPage from '@/pages/UretimPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/giris" element={<LoginPage />} />
        <Route path="/yetkisiz" element={<UnauthorizedPage />} />
        <Route path="/parola-degistir" element={<ProtectedRoute><PasswordChangePage /></ProtectedRoute>} />
        <Route path="/mfa" element={<ProtectedRoute><MfaPage /></ProtectedRoute>} />

        <Route path="/istasyonlar/poz-giris" element={<ProtectedRoute module="production" action="update"><PozGirisPage /></ProtectedRoute>} />
        <Route path="/istasyonlar/kumanda" element={<ProtectedRoute module="production" action="update"><KumandaPaneliPage /></ProtectedRoute>} />
        <Route path="/istasyonlar/gosterge" element={<ProtectedRoute module="dashboard"><GostergeEkraniPage /></ProtectedRoute>} />
        <Route path="/istasyonlar/tamir" element={<ProtectedRoute module="repair" action="create"><TamirIstasyonuPage /></ProtectedRoute>} />
        <Route path="/istasyonlar/uretim-giris" element={<ProtectedRoute module="production_entry" action="create"><OperatorGirisPage /></ProtectedRoute>} />
        <Route path="/istasyonlar/uretim-panosu" element={<ProtectedRoute module="hourly_tracking"><SaatlikTakipPanosu tamEkran /></ProtectedRoute>} />

        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/cari" element={<ProtectedRoute module="cari"><CariPage /></ProtectedRoute>} />
          <Route path="/stok" element={<ProtectedRoute module="inventory"><StokPage /></ProtectedRoute>} />
          <Route path="/siparisler" element={<ProtectedRoute module="orders"><SiparisPage /></ProtectedRoute>} />
          <Route path="/uretim" element={<ProtectedRoute module="production"><UretimPage /></ProtectedRoute>} />
          <Route path="/istasyonlar" element={<ProtectedRoute module="production"><UretimIstasyonlariPage /></ProtectedRoute>} />
          <Route path="/saatlik-takip" element={<ProtectedRoute module="hourly_tracking"><SaatlikTakipPage /></ProtectedRoute>} />
          <Route path="/ayarlar" element={<ProtectedRoute module="settings"><AyarlarPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute module="admin" action="manage" requireAal2><AdminPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
