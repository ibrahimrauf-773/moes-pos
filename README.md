# Moe's Hot Chicken POS (v1)

This is an offline-first PWA point of sale. All data is stored in IndexedDB on each device. Sync is optional, so the app keeps working with no internet.

## Run on the laptop (Windows Chrome)
1. Install Node 18 or newer.
2. Run `node tools/build.mjs`. This builds the app into `dist/`. You can also open the hosted site: https://moes-pos.onrender.com
3. **Easy way (Windows):** download https://moes-pos.onrender.com/downloads/moes-print-helper.zip, extract it, and run `install.bat` as administrator (see `print-helper/windows/GUIDE.md`). Manual way: start the print helper with `node print-helper/server.cjs --share BlackCopper`. It listens on 127.0.0.1:9123 and sends 80mm ESC/POS output to the USB printer called "Black Copper". Use `--preview-only` to test without the printer.
4. In Chrome, open the site and choose **Install app**.
5. If the helper is not running, the app falls back to browser printing. Failed prints wait in a retry queue, and you can reprint from Orders.

## iPad (Safari)
Open the site, tap **Share**, then **Add to Home Screen**. Printing is hidden on iPad. If Safari refuses persistent storage, the app shows a warning, so take regular backups.

## Staff and PINs
The PINs below are placeholders. Change them in Settings.

| Name | Role | PIN |
|---|---|---|
| Shaheer | Owner | 1111 |
| Ibrahim | Owner | 2222 |
| Ruqaiya | Owner | 3333 |
| Waqar | Cashier | 4444 |
| Shan | Kitchen | 5555 |
| Amir | Kitchen | 6666 |

Give each device its own **device prefix** in Settings. This stops two devices from creating clashing IDs. Order numbers start at 1606, and you can change that in Settings.

## Recipes (owner only)
Recipes are never part of the code or the deployed site. To load them, sign in as an owner and go to Settings → Import recipes, then choose the private JSON file. Recipes are encrypted with the owner PIN (AES-GCM) and kept only on that device.

## Backups
- A backup is taken automatically every day and again at each shift close.
- You can export a backup or restore one from Settings.
- Backups never contain recipes.
- To import the old order backlog, use Settings → Import backlog. The import is idempotent, so running it twice does not create duplicates.

## Optional Supabase sync
1. Run `supabase/schema.sql` on a free project.
2. In Settings, enter the project URL, the anon key and the shop key.
3. Sync uses last-writer-wins. Sales are never blocked by sync.

## Tests
These need Chrome at /usr/bin/google-chrome.
- `node test/logic.test.mjs`
- `node test/e2e.mjs`: writes the results to `test/e2e-results.md`
- `node test/screens.mjs`

## Business date
A shift runs 7PM–3AM (Asia/Karachi). Sales made after midnight count toward the previous date.
