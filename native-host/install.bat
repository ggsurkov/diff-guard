@echo off
rem Double-click installer for Windows: registers native-host/index.js as a
rem Chrome Native Messaging host. Drag-and-drop or pass the extension ID as
rem an argument the first time; after that install.js bakes it in as the
rem default, so a plain double-click (no argument) works too.
setlocal
cd /d "%~dp0"

node install.js %1

echo.
echo ------------------------------------------------------------
if errorlevel 1 (
  echo [diff-guard] Установка НЕ удалась - см. сообщение об ошибке выше.
) else (
  echo [diff-guard] Установка завершена успешно.
)
echo ------------------------------------------------------------
pause
