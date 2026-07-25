@echo off
title Shop POS System - Downloader
echo.
echo ============================================
echo   Shop POS System v2.7.13 - Auto Downloader
echo ============================================
echo.
powershell -ExecutionPolicy Bypass -Command "& { $ErrorActionPreference='Stop'; $tempDir=Join-Path $env:TEMP 'ShopPOSDownload'; if(Test-Path $tempDir){Remove-Item $tempDir -Recurse -Force}; New-Item -ItemType Directory -Path $tempDir -Force|Out-Null; $parts=@('part_00','part_01','part_02','part_03','part_04','part_05','part_06','part_07','part_08','part_09','part_10'); $total=$parts.Count; $i=0; foreach($p in $parts){ $i++; Write-Host \"[$i/$total] $p\" -NoNewline; try{ (New-Object Net.WebClient).DownloadFile(\"https://raw.githubusercontent.com/mohsinrasheed-Baga1/shop-pos-system/main/dist/$p\",(Join-Path $tempDir $p)); Write-Host ' OK' -ForegroundColor Green }catch{ Write-Host ' FAILED' -ForegroundColor Red; exit 1 } }; $out=Join-Path $tempDir 'Shop-POS-System-Setup-2.7.13.exe'; $fs=[IO.File]::Create($out); foreach($p in $parts){ $b=[IO.File]::ReadAllBytes((Join-Path $tempDir $p)); $fs.Write($b,0,$b.Length) }; $fs.Close(); $desktop=Join-Path $env:USERPROFILE 'Desktop\Shop-POS-System-Setup-2.7.13.exe'; Copy-Item $out $desktop -Force; Write-Host ''; Write-Host 'Saved to Desktop' -ForegroundColor Green; Start-Process $desktop }"
if errorlevel 1 pause
