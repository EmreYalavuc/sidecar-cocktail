# 🍸 Sidecar Cocktail

**Yapay Zeka Kodlama Aktivite Monitörü**

Claude Code ile çalışırken her araç çağrısını, dosya değişikliğini ve AI kararını gerçek zamanlı olarak izleyen, risk skorlayan ve analiz eden masaüstü uygulaması.

---

## Özellikler

- **Gerçek Zamanlı İzleme** — Claude Code hook'larından gelen PreToolUse, PostToolUse ve Stop olaylarını anında yakalar
- **Risk Skorlama** — Bash komutları, dosya silme, git push gibi işlemleri Low/Medium/High/Critical olarak sınıflandırır
- **AI Analizi** — Gemini veya Claude API ile yüksek riskli olayları otomatik analiz eder; sırları (API key, şifre) maskeler
- **Derin Proje Analizi** — İzlenen bir klasörün tüm kaynak dosyalarını tarayarak AI ile mimari rapor çıkarır
- **Oturum Yönetimi** — Her çalışma seansını kaydeder, oturumlar arası karşılaştırma yapar
- **Dosya Değişim Takibi** — `git diff` ile değişen her dosyayı correlasyon motoru üzerinden eşleştirir
- **Dışa Aktarım** — Oturumları JSON, Markdown veya HTML olarak dışa aktarır
- **Yer İmleri ve Notlar** — Önemli olayları işaretle, not ekle
- **Masaüstü Bildirimleri** — High/Critical olaylarda OS bildirimi gönderir

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Masaüstü çerçevesi | Tauri v2 (Rust) |
| Arayüz | React 19 + TypeScript + Tailwind CSS v4 |
| Durum yönetimi | Zustand |
| Veritabanı | SQLite (WAL modu) via `rusqlite` |
| HTTP sunucu | Axum 0.8 (IPC: `127.0.0.1:7878`) |
| Dosya izleyici | `notify` crate (çoklu yol, durdurulabilir) |
| AI sağlayıcıları | Google Gemini API + Anthropic Claude API |
| İkon | Özel SVG → tauri icon ile üretildi |

---

## Kurulum

### Gereksinimler

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI](https://tauri.app/start/prerequisites/)

### Geliştirme Ortamı

```powershell
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
# (C: sürücüsü doluysa D: sürücüsünü kullan)
$env:CARGO_TARGET_DIR = "D:\cargo-tmp"
npm run tauri dev
```

### Üretim Derlemesi

```powershell
$env:CARGO_TARGET_DIR = "D:\cargo-tmp"
npm run tauri build
```

---

## Claude Code Hook Kurulumu

Sidecar'ın Claude Code olaylarını alabilmesi için hook dispatcher'ı kurman gerekir.

### Otomatik Kurulum (Önerilen)

```powershell
powershell -ExecutionPolicy Bypass -File hooks\setup.ps1
```

Bu betik:
1. `dispatcher.ps1`'i `~\.claude\hooks\` klasörüne kopyalar
2. `~\.claude\settings.json`'a hook tanımlarını ekler
3. Claude Code'u yeniden başlatman yeterli

### Manuel Kurulum

`~\.claude\settings.json` dosyana şunu ekle:

```json
{
  "hooks": {
    "PreToolUse":         [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "powershell -NonInteractive -File \"C:\\Users\\KULLANICI_ADI\\.claude\\hooks\\dispatcher.ps1\"" }] }],
    "PostToolUse":        [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "powershell -NonInteractive -File \"C:\\Users\\KULLANICI_ADI\\.claude\\hooks\\dispatcher.ps1\"" }] }],
    "PostToolUseFailure": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "powershell -NonInteractive -File \"C:\\Users\\KULLANICI_ADI\\.claude\\hooks\\dispatcher.ps1\"" }] }],
    "Stop":               [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "powershell -NonInteractive -File \"C:\\Users\\KULLANICI_ADI\\.claude\\hooks\\dispatcher.ps1\"" }] }]
  }
}
```

---

## Veri Akışı

```
Claude Code hook → dispatcher.ps1 → POST localhost:7878/event
                                           ↓
                                 ipc::handle_event()
                                     ├── correlasyon motoru
                                     ├── SQLite'a kaydet
                                     ├── sidecar://event yayını (frontend)
                                     ├── OS bildirimi (High/Critical)
                                     └── otomatik analiz (High/Critical + API anahtarı)
                                           ↓
                                 ai::analyze() → Gemini/Claude API
                                     ├── sır maskeleme (API key, şifre vb.)
                                     ├── analizi kaydet
                                     └── sidecar://analysis yayını

notify izleyici → watcher::process_change()
                      ├── git diff
                      ├── correlasyon skoru
                      ├── file_change kaydı
                      └── sidecar://file-change yayını
```

---

## Veritabanı

**Konum:** `%APPDATA%\com.sidecar-cocktail.app\sidecar.db`

**Tablolar:** `sessions`, `events`, `file_changes`, `analyses`, `bookmarks`, `settings`, `watch_paths`

---

## IPC Endpoint

```
POST http://127.0.0.1:7878/event   — HookPayload JSON gövdesi
GET  http://127.0.0.1:7878/health  — {"ok":true,"port":7878}
```

---

## Proje Yapısı

```
src/                        React frontend (TypeScript)
  components/               UI bileşenleri
    analysis/               AI analiz görünümü
    layout/                 Header, Sidebar
    project/                Derin proje analizi modalı
    settings/               Ayarlar modalı
    timeline/               Olay zaman çizelgesi
  hooks/                    useEventStream, useFileStream, useAnalysisStream, useSettings
  stores/appStore.ts        Zustand global durum
  types/index.ts            TypeScript tipleri

src-tauri/src/              Rust backend
  ai/                       Gemini + Claude API, sır maskeleme, prompt şablonları
  commands/                 Tauri komutları (sessions, files, analysis, export, config, project)
  correlation/              PreToolUse→dosya değişimi korelasyon motoru
  db/                       SQLite şema ve migrasyonlar
  events/                   Hook payload ayrıştırma, risk skorlama
  git/                      git diff entegrasyonu
  ipc/                      Axum HTTP sunucusu (port 7878)
  watcher/                  notify dosya izleyici (çoklu yol, durdurulabilir)

hooks/                      Claude Code hook betikleri
  dispatcher.ps1            Ana dispatcher (Windows PowerShell)
  dispatcher.sh             Unix/macOS versiyonu
  setup.ps1                 Tek seferlik kurulum betiği
```

---

## Ayarlar

Uygulama içinde ⚙️ Ayarlar butonuna tıklayarak:

- **Gemini / Claude API anahtarı** ekleyebilirsin (OS kimlik bilgisi kasasında saklanır)
- **AI modeli** seçebilirsin (Gemini 4.x → 1.0 arası tüm modeller + Claude ailesi)
- **İzlenecek klasörler** ekleyip çıkarabilirsin
- **Otomatik analiz eşiği** ayarlayabilirsin (Low / Medium / High / Critical)
- **Masaüstü bildirimleri** açıp kapatabilirsin

---

## Lisans

MIT
