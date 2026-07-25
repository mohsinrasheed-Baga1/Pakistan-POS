$ErrorActionPreference = "Stop"
$parts = @("part_00","part_01","part_02","part_03","part_04","part_05","part_06","part_07","part_08","part_09","part_10")
$tempDir = Join-Path $env:TEMP "ShopPOSDownload"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$i = 0
foreach ($part in $parts) {
    $i++
    Write-Host "[$i/$($parts.Count)] $part" -NoNewline
    try {
        (New-Object System.Net.WebClient).DownloadFile("https://raw.githubusercontent.com/mohsinrasheed-Baga1/shop-pos-system/main/dist/$part", (Join-Path $tempDir $part))
        Write-Host " OK" -ForegroundColor Green
    } catch {
        Write-Host " FAILED!" -ForegroundColor Red
        exit 1
    }
}
$out = Join-Path $tempDir "Shop-POS-System-Setup-2.7.14.exe"
$stream = [System.IO.File]::Create($out)
foreach ($part in $parts) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $tempDir $part))
    $stream.Write($bytes, 0, $bytes.Length)
}
$stream.Close()
$desktopPath = Join-Path $env:USERPROFILE "Desktop\Shop-POS-System-Setup-2.7.14.exe"
Copy-Item $out $desktopPath -Force
Write-Host "Saved to Desktop" -ForegroundColor Green
Start-Process $desktopPath
