# Exports every slide of a .pptx to PNG via PowerPoint (read-only). Usage: export-slides.ps1 <pptx> <outDir> [width]
param([string]$Path, [string]$OutDir, [int]$Width = 1600)
$full = (Resolve-Path $Path).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path $OutDir).Path
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open($full, $true, $false, $false)
  $h = [int]($Width * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  foreach ($s in $pres.Slides) { $s.Export((Join-Path $out ("slide{0:D2}.png" -f $s.SlideIndex)), 'PNG', $Width, $h) }
  "exported $($pres.Slides.Count) slides to $out"
  $pres.Close()
} finally { $app.Quit() | Out-Null; [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null }
