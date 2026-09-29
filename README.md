# Radon Geometry Lab

目前主線是[雙凸體重建](tutorial/index.html)與[方法比較](results/index.html)。L 型切法研究保留為獨立工具。

## 雙凸體重建

開啟 **[tutorial/index.html](tutorial/index.html)**，從同一張雙凸體總 sinogram 出發，以 10 步展示端點、內外包絡與輸出。重建端不知道橢圓參數。演算法細節與測試見[教學 README](tutorial/README.md)。

## 重建方法比較

開啟 **[results/index.html](results/index.html)**。同份資料比較幾何法、FBP、SIRT 與指定 TV，並附四個初始化失敗案例的真值形狀和實測剖面圖。真值只供事後評估；失敗案例不併入成功誤差統計。圖由本機保存的實驗資料產生。

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
