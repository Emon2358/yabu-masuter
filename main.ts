// main.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/") {
    return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>yabu master</title>
  <!-- iOS向けWeb App設定 -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="yabu master">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    canvas { border: 1px solid #ccc; margin-top: 20px; max-width: 100%; height: auto; }
    .controls { margin-top: 20px; }
    .controls input, .controls button { margin-right: 10px; }
    #filterName, #instruction { margin-top: 10px; font-weight: bold; }
  </style>
</head>
<body>
  <h1>yabu master</h1>
  <p>iPhone向け画像加工＆共有アプリです。画像を選択後、左右スワイプでフィルターを切り替え、<br>
  ダブルタップまたはShakeでリセット、スライダーで強度調整、共有ボタンでSNS等に送信できます。</p>
  <!-- 画像選択：iPhoneではカメラ起動も可能 -->
  <input type="file" id="fileInput" accept="image/*" capture="environment">
  
  <div class="controls">
    <label for="slider">フィルター強度: </label>
    <input type="range" id="slider" min="0" max="100" value="100">
    <span id="sliderValue">1.00</span>
    <button id="shareButton">画像を共有</button>
    <button id="shakeButton">Shakeリセット有効化</button>
  </div>
  
  <div id="filterName">現在のフィルター: グレースケール</div>
  <div id="instruction">※ダブルタップまたはデバイスを振るとリセットされます</div>
  
  <canvas id="canvas"></canvas>
  
  <script>
    // ユーティリティ：値を指定範囲内に制限
    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    // フィルター定義
    const filters = [
      {
        name: "グレースケール",
        fn: (r, g, b) => {
          const avg = (r + g + b) / 3;
          return [avg, avg, avg];
        }
      },
      {
        name: "セピア",
        fn: (r, g, b) => {
          const newR = r * 0.393 + g * 0.769 + b * 0.189;
          const newG = r * 0.349 + g * 0.686 + b * 0.168;
          const newB = r * 0.272 + g * 0.534 + b * 0.131;
          return [newR, newG, newB];
        }
      },
      {
        name: "反転",
        fn: (r, g, b) => [255 - r, 255 - g, 255 - b]
      },
      {
        name: "明るさUP",
        fn: (r, g, b) => [clamp(r + 50, 0, 255), clamp(g + 50, 0, 255), clamp(b + 50, 0, 255)]
      }
    ];
    let currentFilterIndex = 0;

    // DOM要素の取得
    const fileInput = document.getElementById('fileInput');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('slider');
    const sliderValue = document.getElementById('sliderValue');
    const shareButton = document.getElementById('shareButton');
    const shakeButton = document.getElementById('shakeButton');
    const filterNameDiv = document.getElementById('filterName');

    // 画像の元データを保存
    let originalImageData = null;

    // 画像選択時の処理
    fileInput.addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // キャンバスサイズを画像サイズに合わせる
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          // 元画像データを保存
          originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // 初期描画：スライダーの値（初期値1.0）と現在のフィルターで加工
          applyCurrentFilter(slider.value / 100);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    // 現在のフィルターを適用する関数
    function applyCurrentFilter(intensity) {
      if (!originalImageData) return;
      const newImageData = ctx.createImageData(originalImageData);
      const data = originalImageData.data;
      const newData = newImageData.data;
      const filterFn = filters[currentFilterIndex].fn;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const [fr, fg, fb] = filterFn(r, g, b);
        newData[i]   = clamp(r * (1 - intensity) + fr * intensity, 0, 255);
        newData[i+1] = clamp(g * (1 - intensity) + fg * intensity, 0, 255);
        newData[i+2] = clamp(b * (1 - intensity) + fb * intensity, 0, 255);
        newData[i+3] = data[i+3];
      }
      ctx.putImageData(newImageData, 0, 0);
    }

    // スライダーによるフィルター強度変更
    slider.addEventListener('input', () => {
      const intensity = slider.value / 100;
      sliderValue.textContent = intensity.toFixed(2);
      applyCurrentFilter(intensity);
    });

    // タッチジェスチャー：左右スワイプでフィルター切り替え
    let touchStartX = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
      }
    });

    canvas.addEventListener('touchend', e => {
      if (!touchStartX) return;
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchEndX - touchStartX;
      const threshold = 50; // スワイプと判定するピクセル数
      if (deltaX > threshold) {
        // 右スワイプ：前のフィルターへ
        currentFilterIndex = (currentFilterIndex - 1 + filters.length) % filters.length;
        updateFilterName();
      } else if (deltaX < -threshold) {
        // 左スワイプ：次のフィルターへ
        currentFilterIndex = (currentFilterIndex + 1) % filters.length;
        updateFilterName();
      }
      applyCurrentFilter(slider.value / 100);
      touchStartX = 0;
    });

    function updateFilterName() {
      filterNameDiv.textContent = "現在のフィルター: " + filters[currentFilterIndex].name;
    }

    // ダブルタップでリセット（元画像に戻す）
    let lastTapTime = 0;
    canvas.addEventListener('touchend', e => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      if (tapLength < 300 && tapLength > 0) {
        resetFilters();
      }
      lastTapTime = currentTime;
    });

    // リセット処理：スライダーを100に、フィルターを初期（グレースケール）に戻す
    function resetFilters() {
      slider.value = 100;
      sliderValue.textContent = "1.00";
      currentFilterIndex = 0;
      updateFilterName();
      if (originalImageData) {
        ctx.putImageData(originalImageData, 0, 0);
      }
    }

    // Shake検出によるリセット機能
    let shakeThreshold = 15; // 加速度の閾値
    let lastShakeTime = 0;
    function handleMotion(event) {
      const acc = event.accelerationIncludingGravity;
      const accMagnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      if (accMagnitude > shakeThreshold) {
        const currentTime = new Date().getTime();
        if (currentTime - lastShakeTime > 1000) { // 1秒以上間隔を空ける
          resetFilters();
          lastShakeTime = currentTime;
        }
      }
    }

    // Shake検出有効化ボタンの処理（iOS13+ではユーザー操作による許可が必要）
    shakeButton.addEventListener('click', async () => {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const response = await DeviceMotionEvent.requestPermission();
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            alert("Shakeリセットが有効になりました");
          } else {
            alert("デバイスモーションの許可が得られませんでした");
          }
        } catch (error) {
          alert("デバイスモーションのリクエスト中にエラーが発生しました");
        }
      } else {
        window.addEventListener('devicemotion', handleMotion);
        alert("Shakeリセットが有効になりました");
      }
    });

    // 画面回転時に全画面モードへ（オプション）
    window.addEventListener('orientationchange', () => {
      if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });

    // 共有機能：Web Share API を使用
    shareButton.addEventListener('click', async () => {
      if (!navigator.share || !navigator.canShare) {
        alert("このブラウザは共有機能をサポートしていません");
        return;
      }
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert("画像の変換に失敗しました");
          return;
        }
        const file = new File([blob], "processed-image.png", { type: "image/png" });
        try {
          await navigator.share({
            files: [file],
            title: '加工済み画像',
            text: 'この画像を共有します',
          });
        } catch (err) {
          console.error("共有に失敗しました", err);
        }
      }, 'image/png');
    });
  </script>
</body>
</html>`, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
  return new Response("Not Found", { status: 404 });
});
