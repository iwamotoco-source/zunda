# ずんだスイッチ Offline — iPhone ネイティブ版

既存の `https://zunda-two.vercel.app/` はそのまま保持し、独立したiOSネイティブアプリ候補をこのフォルダに追加しています。

**本フォルダは未ビルドのソースコード候補です。現時点でIPA作成やiPhone実機合成成功を確認したものではありません。**

## 本当にオフラインで音声合成する仕組み

- VOICEVOX CoreをiPhoneアプリ内に組み込む（`@faiare/expo-voicevox`）。
- `zundamon/*`の8スタイル、OpenJTalk辞書、VOICEVOX ONNX Runtime等をアプリに同梱（`assetSource: "bundle"`）。
- アプリをインストールして起動したら、機内モードでも新しい文章をずんだもんの声で合成できます。外部通信は不要です。
- 229種類の定型フレーズはWeb版と同じデータを同梱。
- 検索はひらがな・ローマ字・漢字の読み・部分一致。
- お気に入りはテキスト・スタイルに加えてWAVのコピーを端末のDocuments内に保存するため、再生成せず即再生可能。
- ユーザー入力テキストは端末外へ送信しません。

## 前提条件
- macOS、Node.js >=22.13、Xcode 26.4以上、iOS 16.4以上
- Xcode signingを設定するためApple Accountが必要。TestFlight配信にはApple Developer Programが必要
- Expo Goや普通のPWAではネイティブモジュールをロードできません
- 初回ビルドにVOICEVOX Core、音声モデル等のダウンロードが必要（ビルドPCのネット接続）。インストール済みiPhone上では不要
- 8スタイルのVVMを含むためアプリ容量は大きくなります（モデル3本で約176MB＋辞書・ネイティブライブラリ）

## Macでの手順

```sh
git clone https://github.com/iwamotoco-source/zunda.git
cd zunda/native
npm install
npx expo install --fix
npx expo-doctor
npx expo prebuild --platform ios
npx expo run:ios --device
```

Xcodeの署名設定でApple TeamとBundle Identifier（`com.example.zundaswitchoffline`は仮）を変更してください。prebuildは数百MBのライブラリ・辞書・モデルを取得します。`native/ios`など生成物はGitにコミットしません。

## 重要な確認事項

- 公式 VOICEVOX Core 0.17.1 はiOS向けXCFrameworkを提供。ここでは非公式の `@faiare/expo-voicevox@0.4.0` を使い、Core 0.17.0 を固定した試作です。新しいパッケージなのでMacでビルド・実機検証が必要です。
- モデル再配布とクレジットはVOICEVOXの音声モデル・キャラクター利用規約に従い、第三者著作物のライセンス表示を同梱してください。 `npx expo prebuild` 時にプラグインがモデル利用条件を出力します。
- PWAのIndexedDBお気に入り・生成履歴はiOSネイティブアプリに自動移行されません。文例の229件は移植済みです。
- インストール済みアプリに同梱しているモデルは既に端末内にあるため、インターネットやMacがなくても音声生成可能な設計です。ただし本リポジトリ内では実機での速度・メモリ・WAV出力は未測定です。

参考：
- https://www.npmjs.com/package/@faiare/expo-voicevox
- https://github.com/VOICEVOX/voicevox_core/releases
- https://github.com/VOICEVOX/voicevox_vvm
- https://docs.expo.dev/versions/v58.0.0/
