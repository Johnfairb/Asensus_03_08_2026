$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -ErrorAction SilentlyContinue
# script lives in .../scripts — repo root is parent
$repo = Split-Path $PSScriptRoot -Parent
$catalogPath = Join-Path $repo 'src\domain\exercise-catalog.js'
$seedPath = Join-Path $repo 'data\seed-database.json'

$src = Get-Content -Raw -Path $catalogPath
$exercises = New-Object System.Collections.Generic.List[object]

# Multi-line catalog entries: 'Name': ex({ ... })
$pattern = "'([^']+)':\s*ex\(\{([\s\S]*?)\}\)"
$matches = [regex]::Matches($src, $pattern)
foreach ($m in $matches) {
    $name = $m.Groups[1].Value
    $body = $m.Groups[2].Value
    $domainMatch = [regex]::Match($body, "domain:\s*'([^']+)'")
    $muscleMatch = [regex]::Match($body, "muscle_group:\s*'([^']+)'")
    $domain = if ($domainMatch.Success) { $domainMatch.Groups[1].Value } else { 'lifting' }
    $muscle = if ($muscleMatch.Success) { $muscleMatch.Groups[1].Value } else { 'full' }
    $exercises.Add([pscustomobject]@{ name = $name; domain = $domain; muscle_group = $muscle }) | Out-Null
}

$keep = @(
    @{ name = 'Squat Jumps'; domain = 'power'; muscle_group = 'quad' },
    @{ name = 'Single Leg Broad Jumps'; domain = 'power'; muscle_group = 'quad' },
    @{ name = 'Med Ball Throws'; domain = 'power'; muscle_group = 'core' },
    @{ name = 'Clap Pushups'; domain = 'power'; muscle_group = 'upper_chest' },
    @{ name = 'Side-to-Side Shuffle'; domain = 'power'; muscle_group = 'groin' },
    @{ name = 'Face Pulls'; domain = 'lifting'; muscle_group = 'rotator_cuff' },
    @{ name = 'Cable Abduction/Adduction'; domain = 'lifting'; muscle_group = 'rotator_cuff' },
    @{ name = 'DB Wrist Flexion'; domain = 'lifting'; muscle_group = 'grip' },
    @{ name = 'Cable Adductor'; domain = 'lifting'; muscle_group = 'groin' },
    @{ name = 'Cable Abduction'; domain = 'lifting'; muscle_group = 'glute' },
    @{ name = '3-Way Ankle (Controlled Eccentric)'; domain = 'lifting'; muscle_group = 'ankle' },
    @{ name = 'Wobble Board Proprioception'; domain = 'lifting'; muscle_group = 'ankle' },
    @{ name = 'Neck Resistance (Isometric)'; domain = 'lifting'; muscle_group = 'neck' },
    @{ name = 'Steady State Cardio'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Easy Run'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Jog'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Bike'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Spin Bike'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Rowing Machine'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Swim'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Elliptical'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Incline Walk'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Ski Erg'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Cross Trainer'; domain = 'cardio'; muscle_group = 'full' },
    @{ name = 'Sprints (30s on/off)'; domain = 'cardio'; muscle_group = 'full' }
)

$map = [ordered]@{}
foreach ($e in $exercises) { $map[$e.name] = $e }
foreach ($e in $keep) { $map[$e.name] = [pscustomobject]$e }

$seed = Get-Content -Raw -Path $seedPath | ConvertFrom-Json
$seed.exercises = @($map.Values)
$json = $seed | ConvertTo-Json -Depth 100
# ConvertTo-Json may escape differently; write UTF8
[System.IO.File]::WriteAllText($seedPath, $json + "`n")
Write-Host ("Wrote {0} exercises (catalog matches: {1})" -f $seed.exercises.Count, $matches.Count)
