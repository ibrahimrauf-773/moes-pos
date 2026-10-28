# Printer setup on the shop laptop (Windows) — one page

This lets the POS print receipts and kitchen tickets on the 80mm **Black Copper** USB printer.

**You need:** the Windows laptop, the printer plugged in by USB and switched on, and internet for the first setup.

1. **Install the printer driver.** Windows usually does this by itself when you plug in the printer. In *Settings → Bluetooth & devices → Printers*, the printer must be named exactly **Black Copper**. If it has a different name, rename it there.
2. **Download the helper.** Open https://moes-pos.onrender.com/downloads/moes-print-helper.zip, then right-click the file → **Extract All**.
3. **Run the setup.** In the extracted folder, right-click **install.bat** → **Run as administrator** → **Yes**.
   - It installs Node.js if needed, copies the helper, shares the printer, and sets it to start every time you log in.
   - At the end it shows `{"ok":true,...}`. That means it is working.
4. **Test.** Open the POS, log in as an owner → **Settings** → **Test print**. A small receipt should come out.

**If nothing prints**
- Check that the printer is on, has paper, and the USB cable is in.
- Restart the laptop. The helper starts by itself after login.
- Visit http://127.0.0.1:9123/health in Chrome. If the page does not open, run install.bat again.
- If setup said it "could not share printer", open *Printers → Black Copper → Printer properties → Sharing*. Tick **Share this printer** and type the share name **BlackCopper**.
- Sales are never blocked. Missed tickets wait in the queue (🖨 number at the top). Press **Retry**, or reprint from **Orders**.
- Printing stays hidden on the iPad. Only the laptop prints.

**To remove:** run **uninstall.bat**.
