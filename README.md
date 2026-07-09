# Olay Takip

Excel veya CSV olarak girilen olay kayıtlarını yükleyip; cinsiyet, yaş grubu, ilçe, mahalle, konu ve tekrar giriş istatistiklerini hesaplayan, Z raporu ve görseller üreten web uygulaması.

## Özellikler

- **Veri Yükleme**: `.csv`, `.xlsx`, `.xls` dosyalarını sürükle-bırak veya dosya seçimi ile yükleyin.
- **Otomatik Sütun Tanıma**: Türkçe sütun başlıklarını (`Adı`, `Soyadı`, `TC`, `Doğum Tarihi`, `Geliş Tarihi`, `İletişim GSM`, `İkamet İlçe`, `Konu`, `Olay Özeti` vb.) otomatik normalize eder.
- **Veri Düzenleme**: Tablodaki hücreleri tıklayarak düzenleyin, satır silin.
- **Analiz**: Toplam kayıt, benzersiz kişi, tekrar eden kişi, cinsiyet dağılımı, yaş grubu, aylık geliş, ilçe/konu dağılımı.
- **Z Raporu**: Aylık veya günlük özet tablo; CSV/XLSX olarak dışa aktarım.
- **Grafikler**: Cinsiyet pasta grafiği, yaş grubu çubuk grafiği, aylık trend ve konu/ilçe dağılımları.
- **Oturum Kaydı**: Tüm çalışmalar tarayıcının IndexedDB'sine otomatik kaydedilir; sonraki ziyaretlerde geri yüklenir.
- **Google Drive Senkronizasyonu**: Oturumları kendi Google Drive'ınızdaki gizli uygulama klasörüne (`appDataFolder`) yedekleyin ve cihazlar arası taşıyın.

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Backend | Python 3.11, FastAPI, pandas, openpyxl |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Zustand, Plotly |
| Tarayıcı Depolama | Dexie / IndexedDB |
| Bulut Senkronizasyonu | Google Drive API v3 (OAuth 2.0) |
| Test | pytest (backend), vitest (frontend) |

## Kurulum

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Çalıştırma

### Docker Compose ile (önerilir)

```bash
docker-compose up --build
```

Uygulama `http://localhost:5173` adresinde açılır, API `http://localhost:8000` üzerindedir.

### Ayrı ayrı geliştirme sunucuları

```bash
# Terminal 1 - Backend
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Testler

```bash
# Backend
cd backend
source .venv/bin/activate
pytest -q

# Frontend
cd frontend
npm run test
```

## Build

```bash
cd frontend
npm run build
```

Üretim yapısı `frontend/dist/` dizinine çıkar.

## Google Drive Senkronizasyonu Kurulumu

Varsayılan olarak Google Drive senkronizasyonu devre dışıdır. Aktifleştirmek için:

1. [Google Cloud Console](https://console.cloud.google.com)'dan bir proje oluşturun.
2. **APIs & Services** → **Google Drive API**'yi etkinleştirin.
3. **OAuth consent screen** oluşturun ve şu kapsamları ekleyin:
   - `https://www.googleapis.com/auth/drive.appdata`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
4. **Credentials** → **OAuth client ID (Web application)** oluşturun:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/`
5. Client ID'yi `frontend/src/lib/cloudConfig.ts` içindeki `GOOGLE_CLIENT_ID` alanına yapıştırın.
6. Uygulamayı yeniden yükleyin; header'daki **Drive Bağla** butonu ile hesabınızı bağlayın.

## Beklenen Sütun Başlıkları

Uygulama aşağıdaki Türkçe veya teknik adları tanır:

| Anlamı | Türkçe Başlık | Teknik Ad |
|--------|---------------|-----------|
| Ad | `Adı`, `Ad` | `adi` |
| Soyad | `Soyadı`, `Soyad` | `soyadi` |
| TC Kimlik No | `TC`, `T.C.`, `Tc No` | `tc` |
| Doğum Yeri/Tarihi | `Doğum Yeri`, `Doğum Tarihi` | `dogum_yeri`, `dogum_tarihi` |
| Geliş Tarihi | `Geliş Tarihi`, `Geliş T.` | `gelis_tarihi` |
| İletişim GSM | `İletişim GSM`, `GSM`, `Telefon` | `iletisim_gsm` |
| İkamet İlçe | `İkamet İlçe`, `İlçe` | `ikamet_ilce` |
| Konu | `Konu` | `konu` |
| Olay Özeti | `Olay Özeti`, `Özet` | `olay_ozeti` |

Cinsiyet için ayrı bir sütun (`Cinsiyet`) varsa öncelikle o kullanılır; yoksa TC kimlik numarasının son rakamından tahmin edilir (tek: Erkek, çift: Kadın).

## Proje Yapısı

```
olaylar/
├── backend/
│   ├── main.py                 # FastAPI uygulaması
│   ├── routers/
│   │   ├── upload.py           # Dosya yükleme ve sütun normalizasyonu
│   │   ├── session.py          # Oturum CRUD, hücre edit, dışa aktarım
│   │   └── analiz.py           # Özet, Z raporu ve grafik endpointleri
│   ├── services/
│   │   ├── store.py            # Bellek içi DataFrame deposu + disk yedekleme
│   │   ├── upload.py           # Veri tipi dönüşümü
│   │   ├── olay_analiz.py      # Cinsiyet, yaş, tekrar giriş analizi
│   │   ├── z_raporu.py         # Aylık/günlük Z raporu
│   │   └── plot_data.py        # Plotly grafik verisi
│   └── tests/                  # pytest testleri
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Ana düzen ve sekme navigasyonu
│   │   ├── store.ts            # Zustand global durum
│   │   ├── api.ts              # API çağrıları
│   │   ├── types.ts            # TypeScript tipleri
│   │   ├── components/
│   │   │   ├── UploadZone.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── OlaySummaryPanel.tsx
│   │   │   ├── ZReportPanel.tsx
│   │   │   ├── OlayChartsPanel.tsx
│   │   │   ├── SessionsPanel.tsx
│   │   │   └── CloudSyncBar.tsx
│   │   ├── lib/
│   │   │   ├── format.ts
│   │   │   ├── sessionDb.ts    # IndexedDB katmanı
│   │   │   ├── cloudConfig.ts  # Google OAuth yapılandırması
│   │   │   └── cloudSync.ts    # Google Drive senkronizasyonu
│   │   └── hooks/
│   │       └── useAutoSession.ts
│   └── dist/                   # Üretim yapısı
└── docker-compose.yml
```

## Coolify + Hetzner ile Canlıya Alma

Proje tek bir Docker imajı olarak paketlenmiştir; Vite ile derlenen React arayüzü FastAPI’nin sunduğu `backend/static` dizininden aynı domain üzerinden servis edilir. Böylece `/api` çağrıları CORS yapılandırması gerektirmez.

### 1. Sunucu Hazırlığı

- Hetzner’dan bir sunucu (ör. CX21 veya üstü, Ubuntu 22.04/24.04) oluşturun.
- Sunucuya SSH ile bağlanın ve Docker’ı kurun:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

- Coolify kurulumu tamamlandığında size verilen `https://<ip>:8000` adresinden yönetim paneline ulaşın.

### 2. Coolify Kaynağı Oluşturma

1. **Project** → **Add New Project** → proje adı `olaylar`.
2. Sol menüden **Resources** → **Add New Resource** → **Dockerfile**.
3. **Git Source** olarak bu GitHub/GitLab reposunu seçin.
4. **Build context** `/`, **Dockerfile** `Dockerfile`.
5. **Port** `8000` olarak bırakın.
6. **Domains** alanına kullanmak istediğiniz domaini girin (ör. `https://olaylar.example.com`).
7. **Environment Variables** bölümünde aşağıdaki değişkenleri tanımlayın:

| Değişken | Değer | Açıklama |
|----------|-------|----------|
| `CORS_ALLOWED_ORIGINS` | boş veya `https://olaylar.example.com` | Aynı origin’de boş bırakılabilir. |
| `SESSION_CACHE_DIR` | `/app/backend/session_cache` | Oturumların saklanacağı dizin. |
| `MAX_SESSIONS` | `20` | Bellekte tutulacak maksimum oturum. |
| `SESSION_TTL_SECONDS` | `1800` | Oturumun ne kadar saklanacağı. |

8. **Persistent Storage** ekle:
   - **Path in container**: `/app/backend/session_cache`
   - **Mount Path**: isteğe bağlı, örn. `/data/olaylar-sessions`

9. **Deploy** butonuna basın.

### 3. Docker Compose ile Manuel Kurulum

Coolify yerine doğrudan sunucuda çalıştırmak isterseniz:

```bash
cp .env.example .env
# .env içinde gerekli düzenlemeleri yapın
docker compose up -d --build
```

Uygulama `http://<sunucu-ip>:8000` adresinde açılır.

### 4. Güncelleme

Yeni bir push sonrası Coolify üzerinden **Redeploy** yapmanız yeterlidir. Kalıcı oturum verileri `session_cache` volümünde tutulduğu için silinmez.

## Lisans

MIT
