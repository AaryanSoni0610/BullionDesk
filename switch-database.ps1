# BullionDesk Database Switcher
# This script helps you switch between AsyncStorage and Realm implementations

Write-Host "BullionDesk Database Switcher" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$asyncStorageBackup = "src\services\database.asyncstorage.ts.bak"
$realmImplementation = "src\services\database.realm.ts"
$currentDatabase = "src\services\database.ts"

# Check which version is currently active
$currentContent = Get-Content $currentDatabase -Raw
if ($currentContent -match "AsyncStorage") {
    $currentVersion = "AsyncStorage"
} elseif ($currentContent -match "Realm") {
    $currentVersion = "Realm"
} else {
    $currentVersion = "Unknown"
}

Write-Host "Current database: " -NoNewline
Write-Host $currentVersion -ForegroundColor Yellow
Write-Host ""

Write-Host "Options:" -ForegroundColor Green
Write-Host "  1. Switch to Realm"
Write-Host "  2. Switch to AsyncStorage"
Write-Host "  3. Show current version"
Write-Host "  4. Exit"
Write-Host ""

$choice = Read-Host "Enter your choice (1-4)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Switching to Realm..." -ForegroundColor Yellow
    
    # Backup current if not already backed up
    if (!(Test-Path $asyncStorageBackup)) {
        Copy-Item $currentDatabase $asyncStorageBackup -Force
        Write-Host "[OK] Created backup of AsyncStorage version" -ForegroundColor Green
    }
    
    # Copy Realm implementation
    Copy-Item $realmImplementation $currentDatabase -Force
    Write-Host "[OK] Switched to Realm database" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart your Expo development server"
    Write-Host "  2. Test all features thoroughly"
    Write-Host "  3. If issues occur, run this script again and switch back"
    Write-Host ""
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "Switching to AsyncStorage..." -ForegroundColor Yellow
    
    if (Test-Path $asyncStorageBackup) {
        Copy-Item $asyncStorageBackup $currentDatabase -Force
        Write-Host "[OK] Switched to AsyncStorage database" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] AsyncStorage backup not found!" -ForegroundColor Red
        Write-Host "  Cannot switch back. Please restore manually." -ForegroundColor Red
    }
    Write-Host ""
} elseif ($choice -eq "3") {
    Write-Host ""
    Write-Host "Current version: " -NoNewline
    Write-Host $currentVersion -ForegroundColor Yellow
    Write-Host ""
    Write-Host "File locations:" -ForegroundColor Cyan
    Write-Host "  Current: $currentDatabase"
    Write-Host "  AsyncStorage backup: $asyncStorageBackup"
    Write-Host "  Realm implementation: $realmImplementation"
    Write-Host ""
} elseif ($choice -eq "4") {
    Write-Host "Exiting..." -ForegroundColor Gray
    exit
} else {
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = [Console]::ReadKey($true)