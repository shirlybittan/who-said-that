Start-Job -ScriptBlock {
    npm --prefix "C:\Users\shirl\Documents\workspace\who-said-that\client" run dev
}

Start-Sleep -Seconds 2

node "C:\Users\shirl\Documents\workspace\who-said-that\server\index.js"