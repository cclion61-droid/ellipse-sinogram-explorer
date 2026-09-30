# Radon Geometry Lab

目前主線依序是[單凸體基礎](single/index.html)、[雙凸體延伸](tutorial/index.html)、[SIRT／TV 數值對照](sirt/index.html)、[方法比較](results/index.html)與[分離線搜尋驗證](separator/index.html)。L 型切法研究保留為獨立工具。

## 單凸體重建

開啟 **[single/index.html](single/index.html)**。八步展示有限離散 Radon 資料如何形成初始內外包絡，並由弦長外點排除反覆收縮 `P`、擴張 `Q`，最後輸出中點體與 Hausdorff 上界。頁面不冒稱完整 Algorithm E。

## 雙凸體重建

開啟 **[tutorial/index.html](tutorial/index.html)**，從同一張雙凸體總 sinogram 出發，以 10 步展示端點、可分離初始化、弦長上下界、內外包絡與輸出。重建端不知道個別 component sinogram 或橢圓參數。這是帶初始化條件的雙體延伸，不是 1989 論文已提出的雙體演算法。演算法細節與測試見[教學 README](tutorial/README.md)。

## SIRT 與 TV 方法介紹

開啟 **[sirt/index.html](sirt/index.html)**。由離散系統 `Ax=g` 開始，說明 SIRT 的正投影、殘差與正規化回投影，以及 TV 的資料擬合加總變差模型。本研究固定使用 SIRT 500 輪與 TV-PDHG 1500 輪、`λ=0.1`；兩法共享 `[0,1]` 限制、endpoint 外包絡、0.5 level set 與凸化流程。頁面區分方法本身、求解器與網站的比較協定。

## 重建方法比較

開啟 **[results/index.html](results/index.html)**。單凸體與雙凸體都使用反覆更新的內外包絡，並與 FBP、SIRT、指定 TV 比較。單凸體只保留 8 角度的三個案例。

## 分離線搜尋驗證

開啟 **[separator/index.html](separator/index.html)**。在總 sinogram 沒有可見零間隙時，以未知分離線假設產生兩體包絡，透過量測矛盾排除不相容分支。四個既有失敗例都能產生二維內種子；但最低殘差分支不一定包含真值，因此目前只能宣稱可行初始化。理論認證必須保留所有未被安全排除的分離線參數盒，再計算跨分支誤差界。

## 其他研究：L 型切法最佳化

開啟 **[concave/optimization.html](concave/optimization.html)**。這頁從單一總 sinogram 枚舉固定網格上的 1,560 條切線；在資料誤差接近網格最低值的候選中，選兩片周長和最小者。這是**固定網格與指定重建器輸出的最優性**，不是連續平面的全域最優。另用參數盒的必要弦長條件排除整塊切線範圍。

六個無雜訊開發案例包含 L、平移 L、旋轉 L、T、平移 T 與 U。對齊的 L/T 有候選；平移 T 即使真能切成兩凸片，固定網格仍找不到候選；U 超出兩片模型。平移／旋轉 L 的高 IoU 也未通過真實切後凸性檢查。因此本頁呈現的是研究方法與失敗邊界，**尚未顯示優於舊搜尋或主流重建的精度／速度**。定義、證明、原始結果和限制見 [研究筆記](concave/OPTIMIZATION_NOTE.md)。

## 其他研究：L 型初步搜尋

開啟 **[concave/index.html](concave/index.html)**：從單一總 sinogram 搜尋切線、查看兩片包絡更新、重新投影核對，並比較四個實測案例。新版使用固定粗網格、多起點矛盾引導細化與子集起點全資料重驗；16 角度已找到候選，8 角度 L 型網格 IoU 約 99.990%。未旋轉案例有網格對齊優勢；旋轉案例仍未通過真體凸性檢查，不能套用原來的包絡誤差保證。保留舊版搜尋與新舊比較，不宣稱全域最優。可在瀏覽器重算、檢視候選與搜尋階段、匯出紀錄；詳見 [實驗說明](concave/README.md)。

## 本機執行

這是無相依套件的靜態網站。在此資料夾啟動任一靜態檔案伺服器即可，例如：

```bash
python -m http.server 4173
```

然後開啟 `http://localhost:4173`。

## GitHub Pages

將本資料夾作為 repository 根目錄推送至 GitHub。附帶的 workflow 會在 `main` 分支更新時自動部署 GitHub Pages；第一次使用時，請在 repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。
