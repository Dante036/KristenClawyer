@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
if "%WECHAT_SYNC_PORT%"=="" set "WECHAT_SYNC_PORT=4318"
if "%WECHAT_SYNC_LOCAL_ENV%"=="" set "WECHAT_SYNC_LOCAL_ENV=%CD%\wechat-sync.local.env"

if exist "%WECHAT_SYNC_LOCAL_ENV%" (
  for /f "usebackq tokens=* delims=" %%L in ("%WECHAT_SYNC_LOCAL_ENV%") do (
    set "LINE=%%L"
    if not "!LINE!"=="" if /I not "!LINE:~0,1!"=="#" (
      if /I "!LINE:~0,7!"=="export " set "LINE=!LINE:~7!"
      for /f "tokens=1,* delims==" %%A in ("!LINE!") do (
        if not "%%B"=="" set "%%A=%%B"
      )
    )
  )
)

start "" "http://127.0.0.1:%WECHAT_SYNC_PORT%/tool/"
node tools\wechat-sync\server.js
