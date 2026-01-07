# 🏁 Retro Race Arcade - Multiplayer

Sadə, lakin maraqlı multiplayer retro yarış oyunu. Socket.IO vasitəsilə real vaxtda çoxoyunçu dəstəyi.

## 🎮 Oyun Xüsusiyyətləri

- **Real-time Multiplayer**: 50-ə qədər oyunçu eyni vaxtda yarışa bilər
- **5 Lap Race**: 5 dövrəlik yarış modu
- **Nitro System**: Sürət artırma üçün nitro (Space düyməsi)
- **Trap Obstacles**: Yoldakı tələlərə diqqət edin
- **Lap Winners**: Hər dövrənin qalibi tracking
- **Admin Control**: Raawlinns adlı admin oyunu idarə edə bilər

## 🚀 Quraşdırma və İşə Salma

### Local环境下

```bash
# Repository-ni klonla
git clone <repository-url>
cd oyun-sinaq

# Dependency-ləri yüklə
npm install

# Serveri başlat
npm start
```

Oyun `http://localhost:3000` ünvanında işləyəcək.

## 🎯 Nəzarət Düymələri

- **W** - Sürət artır
- **A** - Sola dön
- **D** - Sağa dön  
- **Space** - Nitro aktiv et

## 🌐 Deployment

### Render.com-da Deployment

1. Repository-ni GitHub-a yüklə
2. Render.com-da yeni Web Service yarat
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Port avtomatik olaraq `process.env.PORT`-dan alınacaq

## 📁 Proyekt Strukturu

```
oyun-sinaq/
├── server.js          # Socket.IO server
├── main.js            # Client-side oyun məntiqi
├── index.html         # Ana səhifə
├── style.css          # Stil faylı
├── package.json       # Node.js dependency-lər
├── RetroRaceArcade_Qt-Cpp-master/  # Car sprite-lər
├── Diger resimler/    # Oyun resimləri
├── Sesler/           # Musiqi və səs effektləri
└── node_modules/     # Node modules (gitignore-da)
```

## 🛠️ Texnologiyalar

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanil JavaScript + HTML5 Canvas
- **Styling**: CSS3
- **Real-time**: WebSocket (Socket.IO)

## 🏆 Oyun Qaydaları

1. Lobby-də nickname daxil edib "Oyuna katıl" düyməsinə bas
2. Admin (Raawlinns) oyunu başladanda 10 saniyə geri sayım başlayır
3. 5 dövrəlik yarışda qalib olmağa çalış
4. Tələlərdən yayın, nitro-dan düzgün istifadə et
5. İlk dövrə və ümumi qalib ekranda göstərilir

## 🤝 Contributing

1. Fork et
2. Feature branch yarat (`git checkout -b feature/AmazingFeature`)
3. Commit et (`git commit -m 'Add some AmazingFeature'`)
4. Push et (`git push origin feature/AmazingFeature`)
5. Pull Request aç

## 📄 Lisenziya

Bu proyekt MIT lisenziyası altında yayımlanır.

---

**Yaradıcı:** Rawnc  
**Version:** 1.0.0
