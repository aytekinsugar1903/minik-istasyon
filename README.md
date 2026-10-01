# Minik İstasyon

Gece vardiyasında beş kısa karar. Her rotada 10 bölüm, toplam 50. Yıldızlar tarayıcıda kalır.

| Rota | Karar |
|---|---|
| Makas | Vagon altın şeritteyken kolu çevir |
| Fren | Hayalet vagonu boyalı şeride getir, sonra bırak |
| Kürek | Ahşap 1 kg, kömür 2 kg, taş 3 kg |
| Tabla | Döner tablayı vagon plakasının kemerine çevir |

| Bariyer | Yaklaşımı kapat, peronu aç, çıkışı en son aç |

1–3 öğrenme, 4–7 tek yeni pürüz, 8–10 daralan pay. İlk bölümler açık, sonrakiler sırayla açılır.

## Çalıştır

Node.js 20 veya daha yeni bir sürüm gerekir.

```bash
node server.mjs
```

Adres: http://127.0.0.1:4180

## Kontroller

- Makas: büyük düğme, sahneye dokunuş veya boşluk.
- Fren: sürgü veya ok tuşları, sonra Bırak.
- Kürek: malzeme düğmeleri, sonra Köprüyü kur.
- Tabla: ok tuşları bir derece, Shift ile sekiz derece, sonra Vagonu gönder.
- Bariyer: sıradaki parlak kapak. Boşluk o kapağı kullanır.
- R yeniden dener. Esc duraklatır; süre durur.

## Test

```bash
node tests/run.mjs
```

50 bölümün bilinen bir çözümü vardır. Testler o çözümü oynatır; erken, geç ve yanlış sıra ayrıca başarısız olmalıdır.

## Evdeki bilgisayar

Bu klasörü klonladıktan sonra `node server.mjs` yeter. Kurulum, hesap veya internet gerekmez. Oyun açıldıktan sonra bağlantı da gerekmez; kayıt bu tarayıcıdadır.
