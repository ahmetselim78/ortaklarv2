import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    // Bu dosyalar tip üretilmemiş Supabase/PDF dış veri sınırlarını yerel
    // arayüzlere dönüştürüyor. Kapsamı dar tutarak yeni kodda any yasağını koru.
    files: [
      'src/components/sevkiyat/SevkiyatPlanlama.tsx',
      'src/components/siparis/PDFImportModal.tsx',
      'src/hooks/useEscape.ts',
      'src/hooks/useSiparisTaslaklari.ts',
      'src/hooks/useStok.ts',
      'src/hooks/useUretim.ts',
      'src/pages/Dashboard.tsx',
      'src/pages/KumandaPaneliPage.tsx',
      'src/pages/PozGirisPage.tsx',
      'src/pages/SiparisPage.tsx',
      'src/pages/TamirIstasyonuPage.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Veri yükleme ve modal sıfırlama effect'leri bilinçli olarak yerel state'i
    // senkronize ediyor. Yeni dosyalarda önerilen React kuralı etkin kalır.
    files: [
      'src/components/ayarlar/AraclarPanel.tsx',
      'src/components/ayarlar/OptiExportAyarlariPanel.tsx',
      'src/components/cari/CariListesi.tsx',
      'src/components/siparis/PDFImportModal.tsx',
      'src/components/tamir/TamireGonderModal.tsx',
      'src/components/uretim/SaatlikTakipPanosu.tsx',
      'src/hooks/useCari.ts',
      'src/hooks/useSevkiyat.ts',
      'src/hooks/useStok.ts',
      'src/hooks/useUretim.ts',
      'src/pages/PozGirisPage.tsx',
      'src/pages/TamirIstasyonuPage.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
