# The Little Whisk

A made-to-order bakery shop: customers browse the menu, pick sizes and dates, and
place an order. You get a private "kitchen desk" where you manage orders, prices,
photos and settings.

Nothing to install beyond Node.js — no npm packages, no build step, no database
server. Orders live in a single file (`data/little-whisk.db`) on your own computer.

---

## 1. Start it up

1. Install **Node.js version 22 or newer** from <https://nodejs.org> (take the LTS
   download and click through the installer).
2. Double-click **`start-windows.bat`** (or `start-mac-linux.command` on a Mac).
3. Your browser opens at <http://localhost:3000>.

Keep that black window open while the shop is running — closing it stops the shop.

The first time it runs it prints your starting admin password:

```
Admin password set to: whisk-admin   <-- change this after your first login
```

## 2. The two doors

| Address | Who it's for |
|---|---|
| `http://localhost:3000` | The shop — what customers see |
| `http://localhost:3000/admin` | **Your kitchen desk** — password protected |
| `http://localhost:3000/order-status` | Customers check an order with their number + email |

**Change the password immediately:** kitchen desk → *Shop settings* → *Change your
password*.

You can also move the admin page somewhere less guessable. Start the shop with
`LW_ADMIN_PATH=kitchen-1987` set and the desk lives at `/kitchen-1987` instead.

## 3. What the kitchen desk does

**Dashboard** — new orders waiting, orders and revenue over 7/30/90 days, money
still to collect, a day-by-day chart, best sellers, and what's due out of the
kitchen next.

**Orders** — every order with search and filters (status, payment, date wanted).
Click a row to open it: what they ordered, their contact details, their notes.
Change the status (New → Confirmed → In the kitchen → Ready → Completed) and mark
payments as paid. Add a private note customers never see. **Export CSV** hands you
the whole order book for your accounts.

**Menu & prices** — edit any item's name, description, price, unit ("per dozen"),
and how many days' notice it needs. Upload a photo by dragging it onto the item.
Add size or quantity choices (e.g. *6 inch / 8 inch / 10 inch*) with the extra
amount each one adds to the base price. Untick **Available** to hide something for
a week without deleting it. Add new items and new menu sections at any time.

**Shop settings** — shop name, tagline, intro text, contact details, the
announcement bar across the top, currency symbol, minimum notice, pickup hours,
delivery on/off and its fee, your bank transfer details, and the message customers
see after ordering.

## 4. How ordering works for customers

They fill a basket, choose pickup or delivery, pick a date (the site refuses dates
sooner than the notice an item needs), and choose **pay before pickup** or **bank
transfer**. No card is charged online. Bank transfer customers see the details you
saved in settings, with their order number to use as the reference.

Prices are always recalculated on the server from your menu, so a customer can't
alter what they are charged.

## 5. Things worth knowing

**Back up your orders.** Everything lives in `data/little-whisk.db`. Copy that file
somewhere safe now and then — that is your whole order book. The CSV export is a
second copy in a form Excel opens.

**Your logo** lives in `public/images/` as five files: `logo-full.png` (the whole
lockup, used on the admin sign-in screen), `logo-full-light.png` (white version, in
the footer), `logo-word.png` / `logo-word-light.png` (just the words, in the site
header and admin sidebar), `logo-mark.png` / `logo-mark-light.png` (just the whisk
and bowl) and `favicon.png` (the browser tab icon). Replace a file with one of the
same name and the site picks it up.

**Photos** you upload land in `public/images/uploads/`. Keep them under about 2MB
each so the shop stays quick.

**Start over with the menu:** `npm run reset` wipes the menu *and all orders* and
puts the starting menu back. Only use it before you go live.

**Putting it on the internet.** Right now it runs on your computer, so only you can
reach it. To let customers order from anywhere you need a host that runs Node.js —
Render, Railway, Fly.io and DigitalOcean all work, and cost a few dollars a month.
Upload the folder, set the start command to `npm start`, and make sure the `data`
folder is on storage that persists between restarts. Then set two things:

- `LW_SECURE_COOKIE=1` (your login cookie is then only sent over HTTPS)
- `LW_ADMIN_PASSWORD` before first run, or change the password straight after

**Email.** Nothing is emailed automatically — you confirm orders yourself by phone
or email. Every order shows the customer's address as a clickable mailto link.

## 6. What's in the box

```
start-windows.bat        double-click to run (Windows)
start-mac-linux.command  double-click to run (Mac/Linux)
package.json             npm start / npm run seed / npm run reset
src/db.js                database tables and password hashing
src/seed.js              the starting menu and settings
src/server.js            the web server and all the API routes
public/index.html        the shop
public/status.html       order status lookup
public/admin.html        the kitchen desk
public/css/              styles
public/js/               shop.js and admin.js
public/images/           your item photos
data/                    little-whisk.db lives here (created on first run)
```
