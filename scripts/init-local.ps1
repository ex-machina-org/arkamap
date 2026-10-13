param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\14\bin')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cluster = [IO.Path]::GetFullPath((Join-Path $repoRoot '.runtime\postgres'))
if (-not $cluster.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cluster harus berada dalam repo Arkamap.' }
foreach ($exe in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $exe))) { throw "Tidak ada $exe pada $PostgresBin. Pasang PostgreSQL dengan PostGIS atau gunakan -PostgresBin." }
}
New-Item -ItemType Directory -Path (Join-Path $repoRoot '.runtime') -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) {
    & (Join-Path $PostgresBin 'initdb.exe') -D $cluster -U arkamap -A trust --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'initdb gagal.' }
}
& (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster status | Out-Null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -l (Join-Path $repoRoot '.runtime\postgres.log') -o '-p 55432 -h 127.0.0.1' -w start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL lokal gagal berjalan; periksa .runtime/postgres.log.' }
}
$exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p 55432 -U arkamap -d postgres -tA -c "SELECT 1 FROM pg_database WHERE datname = 'arkamap'"
if ($LASTEXITCODE -ne 0) { throw 'Koneksi database gagal.' }
if ($exists -ne '1') {
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U arkamap arkamap
    if ($LASTEXITCODE -ne 0) { throw 'Pembuatan database gagal.' }
}
$envPath = Join-Path $repoRoot '.env.local'
if (-not (Test-Path -LiteralPath $envPath)) {
    $random = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($random)
    $generator.Dispose()
    $secret = [Convert]::ToBase64String($random)
    $template = [IO.File]::ReadAllText((Join-Path $repoRoot '.env.example')).Replace('replace-with-local-random-secret', $secret)
    [IO.File]::WriteAllText($envPath, $template)
}
Write-Output 'Database lokal siap di 127.0.0.1:55432. File .env.local tersedia; secret tidak ditampilkan.'
