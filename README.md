# 🤖 Gelişmiş Discord Moderasyon ve Eğlence Botu

Bu bot; Discord sunucunuzu güvenli tutmak, moderasyon işlerini kolaylaştırmak ve üyelerin eğlenceli vakit geçirmesini sağlamak amacıyla geliştirilmiş Node.js tabanlı bir Discord botudur.

## ✨ Özellikler

* **🛡️ Gelişmiş Moderasyon:** Ban, mute, kanal kilitleme ve oto-güvenlik sistemleri.
* **🎮 Eğlence ve Oyunlar:** Kelime türetmece, bom oyunu ve ses kanalı istatistikleri.
* **⚡ 7/24 Aktif Altyapı:** Express ile oluşturulmuş sahte web sunucusu sayesinde kesintisiz çalışma.

---

## 📜 Komut Rehberi

Bot içerisindeki tüm komutlar ve kullanım amaçları aşağıda listelenmiştir:

### 👤 Kullanıcı Komutları
* `!mesajtop` — Sunucuda en çok mesaj atan ilk 10 üyeyi sıralar.
* `!sestop` — Ses kanallarında en çok vakit geçiren ilk 10 üyeyi sıralar.
* `!yardım` — Tüm bot komutlarını ve detaylı rehberi gösterir.

### 🛠️ Yönetici Komutları (Yalnızca Yöneticiler)
* `!otorol-ayarla @Rol` — Sunucuya yeni katılan üyelere otomatik verilecek rolü ayarlar.
* `!tagrol-ayarla @Rol` — Sunucu etiketi (tag) takan kullanıcılara otomatik rol verir ve mevcut üyeleri tarar.
* `!ozel-oda-kur` — Kullanıcıların kendi ses odalarını açabileceği sistemi kurar.
* `!istatistik-kur` — Sunucu üye ve çevrim içi istatistik kanallarını oluşturur.
* `!destek-kur` — Destek talebi (ticket) oluşturma panelini kurar.
* `!sil [sayı]` — Belirtilen miktarda mesajı toplu olarak siler (1-100 arası).

### 🔨 Moderasyon Komutları
* `!ban @üye [sebep]` — Belirtilen üyeyi sunucudan yasaklar.
* `!mute @üye [süre] [sebep]` — Üyeyi belirtilen süre boyunca susturur (Örn: `!mute @kullanici 10dk küfür`). Geçerli süreler: `sn`, `dk`, `sa`, `gün`.
* `!kilit` — Bulunduğunuz kanalı mesajlara kapatır (Sadece yetkililer yazabilir).
* `!kilitac` — Kanalın kilidini tekrar herkese açar.

### 🎮 Eğlence Kanalları (Otomatik Çalışır)
* **Kelime Türetmece (#kelime-turetmece):** Son harfle başlayan yeni bir kelime yazarak oynanır.
* **Bom Oyunu (#bom-oyunu):** Sırayla sayılır, 5 ve katlarında "BOM" denir.

---

## ⚙️ Kurulum Rehberi (Nasıl Çalıştırılır?)

Projeyi kendi bilgisayarınızda veya sunucunuzda çalıştırmak için sırasıyla şu adımları izleyin:

### 1. Dosyaları İndirin ve Paketleri Yükleyin
Proje klasörünün içinde terminali açın ve gerekli eklentileri yüklemek için şu komutu girin:
```bash
npm install

### 2. .env Dosyası Oluşturun (Çok Önemli!)
Bu bot, gizli bilgileri kodun içine değil, güvenli bir .env dosyasında saklar.

Proje ana dizininde .env adında yeni bir dosya oluşturun.

İçine mutlaka şu satırı ekleyin (kendi bot token'ınızı yazmayı unutmayın):
TOKEN=buraya_discord_bot_tokeninizi_yazın

### 3. Botu Başlatın
Her şeyi hazırladıktan sonra botu çalıştırmak için terminale şu komutu yazın:
node index.js

📜 Lisans
Bu proje açık kaynaklıdır ve dilediğiniz gibi geliştirebilirsiniz.
