# ocr-frames.ps1 — dev-only harness (TASK-328): run Windows OCR over extracted
# recording frames and emit one JSON line per frame in the parser's item shape
# ({ text, x, y, w, h } with normalized top-left-origin boxes, like Vision).
#
# Windows OCR garbles differently than iOS Vision — that is the point: the
# corpus stress-tests parser tolerance against a real fast draft with known
# ground truth (see test-draft-replay.mjs).
#
# Requires Windows PowerShell 5.1 (WinRT projection). Run via:
#   powershell.exe -ExecutionPolicy Bypass -File scripts/ocr-frames.ps1 `
#     -FramesDir <dir of f_NNNN.jpg> -OutFile docs/task-328-evidence/frames-ocr.jsonl
#
# Frames are produced from the checked-in recording with:
#   ffmpeg -i "docs/live_draft_recording/<recording>.mp4" -vf fps=1 -q:v 2 f_%04d.jpg
param(
  [Parameter(Mandatory = $true)][string]$FramesDir,
  [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -eq 'Core') {
  Write-Error 'WinRT OCR needs Windows PowerShell 5.1 — run with powershell.exe, not pwsh.'
  exit 1
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Error 'No OCR language pack available.'; exit 1 }

$frames = Get-ChildItem -Path $FramesDir -Filter 'f_*.jpg' | Sort-Object Name
if (-not $frames) { Write-Error "No f_*.jpg frames in $FramesDir"; exit 1 }

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
$writer = [System.IO.StreamWriter]::new($OutFile, $false, [System.Text.UTF8Encoding]::new($false))

$n = 0
foreach ($frame in $frames) {
  $n++
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($frame.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $imgW = [double]$bitmap.PixelWidth
  $imgH = [double]$bitmap.PixelHeight
  $items = @()
  foreach ($line in $result.Lines) {
    $x0 = [double]::MaxValue; $y0 = [double]::MaxValue; $x1 = 0.0; $y1 = 0.0
    foreach ($word in $line.Words) {
      $r = $word.BoundingRect
      if ($r.X -lt $x0) { $x0 = $r.X }
      if ($r.Y -lt $y0) { $y0 = $r.Y }
      if (($r.X + $r.Width) -gt $x1) { $x1 = $r.X + $r.Width }
      if (($r.Y + $r.Height) -gt $y1) { $y1 = $r.Y + $r.Height }
    }
    $items += [ordered]@{
      text = $line.Text
      x    = [math]::Round($x0 / $imgW, 4)
      y    = [math]::Round($y0 / $imgH, 4)
      w    = [math]::Round(($x1 - $x0) / $imgW, 4)
      h    = [math]::Round(($y1 - $y0) / $imgH, 4)
    }
  }
  $bitmap.Dispose(); $stream.Dispose()

  $writer.WriteLine((ConvertTo-Json -Compress -Depth 4 ([ordered]@{
    frame = [int]($frame.BaseName -replace '\D', '')
    items = $items
  })))
  if ($n % 50 -eq 0) { Write-Host "  $n / $($frames.Count) frames OCR'd" }
}
$writer.Close()
Write-Host "Wrote $n frames to $OutFile"
