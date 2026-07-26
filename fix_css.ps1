$files = Get-ChildItem -Filter *.html
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $target = "      .dropdown-menu {`r`n        position: static;`r`n        transform: none;`r`n        box-shadow: none;`r`n        border: none;`r`n        background: var(--bg);`r`n        display: none;`r`n      }"
    $targetLF = "      .dropdown-menu {`n        position: static;`n        transform: none;`n        box-shadow: none;`n        border: none;`n        background: var(--bg);`n        display: none;`n      }"

    $replacement = "      .dropdown-menu {`n        position: static;`n        transform: none !important;`n        box-shadow: none;`n        border: none;`n        background: var(--bg);`n        display: none;`n      }`n`n      .dropdown-menu a {`n        justify-content: center;`n      }"

    if ($content -match \[regex]::Escape($target)) {
        $content = $content -replace \[regex]::Escape($target), $replacement
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Updated $($file.Name) (CRLF)"
    } elseif ($content -match \[regex]::Escape($targetLF)) {
        $content = $content -replace \[regex]::Escape($targetLF), $replacement
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Updated $($file.Name) (LF)"
    } else {
        Write-Host "No match found in $($file.Name)"
    }
}
