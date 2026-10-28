| # | Area | Test | Result | Note |
|---|---|---|---|---|
| 1 | Login | Login tiles show name and role on separate lines | PASS |  |
| 2 | Login | Wrong PIN rejected | PASS |  |
| 3 | Login | Each placeholder PIN logs in with correct role views | PASS |  |
| 4 | Login | Placeholder-PIN banner shown to owner | PASS |  |
| 5 | Orders | Takeaway order: price, number starts at 1606 | PASS |  |
| 6 | Orders | Dine-in order saved as dine_in, numbers increment | PASS |  |
| 7 | Orders | Heat levels: in-store has all 5 incl Reaper | PASS |  |
| 8 | Orders | Add-ons, qty and notes flow to order and kitchen ticket | PASS |  |
| 9 | Orders | Cart qty +/-, delete and clear | PASS |  |
| 10 | WhatsApp | Zone A: charge Rs 200 = rider fare, recorded separately | PASS |  |
| 11 | WhatsApp | Zone B: charge Rs 300 = rider fare, recorded separately | PASS |  |
| 12 | WhatsApp | Zone C: charge Rs 360 = rider fare, recorded separately | PASS |  |
| 13 | WhatsApp | Zone D: charge Rs 460 = rider fare, recorded separately | PASS |  |
| 14 | WhatsApp | Zone E: charge Rs 560 = rider fare, recorded separately | PASS |  |
| 15 | WhatsApp | Zone F: charge Rs 660 = rider fare, recorded separately | PASS |  |
| 16 | WhatsApp | Zone G: charge Rs 760 = rider fare, recorded separately | PASS |  |
| 17 | WhatsApp | Zone H: charge Rs 860 = rider fare, recorded separately | PASS |  |
| 18 | WhatsApp | Zone I: charge Rs 960 = rider fare, recorded separately | PASS |  |
| 19 | WhatsApp | Editable zone charge vs rider fare: report shows both and difference | PASS |  |
| 20 | WhatsApp | Copy for Speedway: one field per line, COD amount, iPad fallback modal | PASS |  |
| 21 | WhatsApp | Validation: missing phone/zone and bad phone blocked | PASS |  |
| 22 | WhatsApp | Returning customer auto-filled with zone; customer list | PASS |  |
| 23 | WhatsApp | COD unpaid, then payment added later | PASS |  |
| 24 | Foodpanda | FP price list used, no Reaper, FP total authoritative | PASS |  |
| 25 | Foodpanda | Duplicate FP order ID blocked; missing ID/total blocked | PASS |  |
| 26 | Foodpanda | Switching price list clears cart; sold-out FP items blocked | PASS |  |
| 27 | Foodpanda | FP commission 23% estimate and payout in report | PASS |  |
| 28 | Payments | Split payment cash + HBL + BAH + card | PASS |  |
| 29 | Payments | Payments not adding up are rejected | PASS |  |
| 30 | Payments | Cash tendered gives change; non-integer rejected | PASS |  |
| 31 | Discounts | Staff meal 30% by cashier without owner | PASS |  |
| 32 | Discounts | Cashier 10% customer discount allowed | PASS |  |
| 33 | Discounts | Cashier 15% needs owner PIN: wrong PIN refused, owner PIN approves | PASS |  |
| 34 | Discounts | Comp needs owner and reason; total 0 | PASS |  |
| 35 | Discounts | Discounts appear in report adjustments | PASS |  |
| 36 | Void/Refund | Cashier void needs owner PIN + reason; stock returned | PASS |  |
| 37 | Void/Refund | Cashier refund needs owner PIN + reason; over-refund blocked | PASS |  |
| 38 | Void/Refund | Voided orders excluded from report totals | PASS |  |
| 39 | Kitchen | KDS shows ticket, no prices; late turns red at 20m; bump clears | PASS |  |
| 40 | Kitchen | Kitchen staff: late timer; view-only by default; Ready (setting on) clears | PASS |  |
| 41 | Menu | Owner marks item sold out; cashier cannot add | PASS |  |
| 42 | Menu | Owner edits price; new price used | PASS |  |
| 43 | Business date | Sale at 01:30 PKT counts toward previous date | PASS |  |
| 44 | Inventory | Stock ledger operations | PASS |  |
| 45 | Inventory | Sale auto-deducts stock at Main; low-stock alert | PASS |  |
| 46 | Inventory | Kitchen staff: wastage only, no delivery/cost | PASS |  |
| 47 | Till | Float + cash sales − expenses(DRAW, LOAN-IB) − refunds = expected; over/short; backup at close | PASS |  |
| 48 | Till | Expense validation (amount, note) | PASS |  |
| 49 | Reports | Report math by channel/item and CSV export | PASS |  |
| 50 | Reports | GST off by default; when on, added to total | PASS |  |
| 51 | Bazaar | Mashion stall: pending prices, Rs0 samples, separate report with Donut Slider line, separate stock | PASS |  |
| 52 | Backlog | Import 187 backlog orders = Rs 362,116; re-import idempotent; next no after max | PASS |  |
| 53 | Recipes | Owner imports (encrypted), unlock with PIN, wrong PIN refused | PASS |  |
| 54 | Recipes | Deployed bundle (dist) contains no recipe data | PASS |  |
| 55 | Recipes | Cashier cannot open recipes view | PASS |  |
| 56 | Offline | Orders persist across reload; draft cart recovered | PASS |  |
| 57 | Offline | App loads and sells fully offline (service worker) | PASS |  |
| 58 | Offline | Persistent-storage denied shows warning banner | PASS |  |
| 59 | Failure | Storage quota full: clear error, no partial order | PASS |  |
| 60 | Failure | commitOrder idempotent (double submit) | PASS |  |
| 61 | Failure | Input validation: qty 0/100 and non-numeric refused | PASS |  |
| 62 | Backup | Export backup, wipe, restore brings orders back; excludes recipes | PASS |  |
| 63 | Backup | Bad restore file rejected | PASS |  |
| 64 | Backup | Daily backup created automatically | PASS |  |
| 65 | Settings | Configurable start number and device prefix | PASS |  |
| 66 | Settings | Activity log records login, order, discount | PASS |  |
| 67 | Sync | Two devices sync via Supabase mock; distinct numbers; recipes never synced | PASS |  |
| 68 | Sync | Sync server down: sale still succeeds, error recorded, retried later | PASS |  |
| 69 | Sync | Bad/expired session rejected by server, local data intact | PASS |  |
| 70 | Printing | Laptop: receipt + kitchen ticket printed via helper (ESC/POS bytes), no recipe | PASS |  |
| 71 | Printing | No helper: browser print fallback is ON by default (receipt + kitchen in one dialog) | PASS |  |
| 72 | Printing | Printer offline: sale not blocked, job queued, retry prints later | PASS |  |
| 73 | Printing | iPad: printing hidden, no print jobs | PASS |  |
| 74 | Printing | iPad: Reprint receipt/kitchen on order row and detail use browser print dialog | PASS |  |
| 75 | Charge screen | One-tap cash tender places order with change; bank/card one tap; split still works; screenshots | PASS |  |
| 76 | Modals | Order detail closes via Close, ✕, Esc and click-outside; confirm modal too | PASS |  |
| 77 | Orders view | Pills, filters, sort, search, owner CSV, row click detail, dining change; 1366 + iPad screenshots | PASS |  |
| 78 | Charge screen | Split row: cash 100 + HBL remaining auto-fills, change on cash part, till counts each method; receipt + detail list parts | PASS |  |
| 79 | Top bar | Printer dot red without helper, sync pill, mute toggle (off by default) silences alert; proof button in detail | PASS |  |
| 80 | Payments | Rider COD: one clean payment line; #1607 bad data repaired on load | PASS |  |
| 81 | Printing | Laptop without helper: reprint falls back to browser print | PASS |  |
| 82 | Customers | Phone search (+92 normalised) matches; prefs, usual heat default, repeat last order | PASS |  |
| 83 | Customers | Quick add customer, dedupe by phone, profile edit and history | PASS |  |
| 84 | Pay Later | Requires customer; unpaid not drawer cash; partial then full settle; dues in report | PASS |  |
| 85 | Printing | Receipt and kitchen ticket show customer name; delivery receipt shows phone + address | PASS |  |
| 86 | Log Inventory | Ayesha (PIN 7777) lands on Log Inventory; no POS/dashboard access | PASS |  |
| 87 | Log Inventory | Waqar + Ayesha counts: mismatch flagged, duplicate blocked without owner, closing sets next stock, variance | PASS |  |
| 88 | Log Inventory | Owner-approved edit keeps history | PASS |  |
| 89 | Migration | Older device gets Ayesha, new sheet items and timers on upgrade | PASS |  |
| 90 | Waste | Waste log deducts stock, shows reason/by; cost owner-only | PASS |  |
| 91 | FOC | Item FOC by Waqar: Rs 0, stock deducted, listed separately | PASS |  |
| 92 | FOC | Whole-order FOC needs owner/Waqar approval; others rejected | PASS |  |
| 93 | KDS | Ticket timer turns amber at 12 min and red at 20 min; thresholds editable | PASS |  |
| 94 | Dashboard | Owner dashboard: totals, AOV, hourly, top items, payment & channel split, previous days; cashier blocked | PASS |  |
| 95 | Reports | Low-stock list for Supply in nightly report (reorder levels + Reorder flags from closing checklist) | PASS |  |
| 96 | Layout | No horizontal overflow on any view at 1366x768 | PASS |  |
| 97 | Layout | No horizontal overflow on any view at 1024x768 | PASS |  |
| 98 | Layout | No horizontal overflow on any view at 768x1024 | PASS |  |
| 99 | Orders | Row actions: 2 print icons + ⋯ in one line, Pay only when due, none on void; refund/void in detail | PASS |  |

**99/99 passed**
