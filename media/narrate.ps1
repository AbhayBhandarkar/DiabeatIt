param([string]$DataPath = "$PSScriptRoot/lesson_data.json", [string]$OutputPath = "$PSScriptRoot/build/audio")
$ErrorActionPreference = 'Stop'
$null = New-Item -ItemType Directory -Force -Path $OutputPath
$OutputPath = (Resolve-Path $OutputPath).Path
$voice = New-Object -ComObject SAPI.SpVoice
$voices = @($voice.GetVoices())
$selected = $voices | Where-Object { $_.GetDescription() -eq 'Microsoft Zira Desktop - English (United States)' } | Select-Object -First 1
if (-not $selected) { throw 'Required offline Microsoft Zira voice is not installed.' }
$voice.Voice = $selected
$voice.Rate = 1
$voice.Volume = 100
foreach ($lesson in (Get-Content $DataPath -Raw | ConvertFrom-Json)) {
    for ($i = 0; $i -lt $lesson.narration.Count; $i++) {
        $stream = New-Object -ComObject SAPI.SpFileStream
        try {
            $stream.Format.Type = 22 # 22.05 kHz, 16-bit mono PCM
            $stream.Open((Join-Path $OutputPath "$($lesson.id)-$i.wav"), 3, $false)
            $voice.AudioOutputStream = $stream
            $null = $voice.Speak($lesson.narration[$i])
        } finally { $stream.Close() }
    }
}
Write-Output "Offline synthetic narration: $($selected.GetDescription())"