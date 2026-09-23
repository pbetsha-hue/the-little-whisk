'use strict';
/* Seeds The Little Whisk with its starting menu and shop settings.
   Run:  npm run seed        (fills in anything missing)
         npm run reset       (wipes menu + orders and re-seeds) */
const { db, getSetting, setSetting, hashPassword } = require('./db');

const RESET = process.argv.includes('--reset');

const DEFAULT_SETTINGS = {
  shop_name: 'The Little Whisk',
  tagline: 'Simple bakes. Made with love.',
  intro:
    'Everything is baked fresh for your date — nothing sits on a shelf. Choose your treats, pick a day, and we will have them ready.',
  phone: '(876) 000-0000',
  email: 'hello@thelittlewhisk.com',
  address: 'Kingston, Jamaica',
  instagram: '@thelittlewhisk',
  currency_symbol: 'J$',
  min_lead_days: '2',
  pickup_hours: 'Pickup Tue–Sat, 9:00am – 5:00pm',
  delivery_enabled: '1',
  delivery_fee: '800',
  delivery_note: 'Delivery available within Kingston & St. Andrew.',
  bank_details:
    'Bank: [your bank]\nAccount name: The Little Whisk\nAccount number: [your account number]\nBranch / type: [branch, chequing or savings]\n\nPlease use your order number as the payment reference and send the receipt to hello@thelittlewhisk.com.',
  announcement: '',
  order_confirmation_note:
    'Thank you! We will confirm your order by phone or email within 24 hours.'
};

const MENU = [
  {
    category: 'Breakfast & Brunch',
    blurb: 'Warm, buttery things best eaten before noon.',
    items: [
      { name: 'Classic Quiche Lorraine', img: '/images/quiche-lorraine.jpg', emoji: '🥧', price: 4500, unit: 'per quiche', lead: 2,
        desc: 'Flaky all-butter crust, smoky bacon, sweet onion and Gruyère in a silky custard.',
        optionLabel: 'Size', options: [['9 inch', 0], ['11 inch (party size)', 1800]] },
      { name: 'Classic Coffee Cake', img: '/images/coffee-cake.jpg', emoji: '☕', price: 3500, unit: 'per cake', lead: 2,
        desc: 'Tender sour cream cake layered with cinnamon streusel and a vanilla drizzle.' },
      { name: 'Soft Gooey Cinnamon Rolls', img: '/images/cinnamon-rolls.jpg', emoji: '🍥', price: 2400, unit: 'per half dozen', lead: 2,
        desc: 'Pillowy overnight dough, brown sugar cinnamon swirl, cream cheese frosting.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', 0], ['Dozen (12)', 2000]] },
      { name: 'Ham & Cheese Croissants', img: '/images/ham-cheese-croissants.jpg', emoji: '🥐', price: 650, unit: 'each', lead: 2,
        desc: 'Laminated croissants filled with honey ham and melting cheese, baked golden.',
        optionLabel: 'Quantity', options: [['Single', 0], ['Half dozen (6)', 3000], ['Dozen (12)', 6200]] },
      { name: 'Banana Loaf or Muffins', img: '/images/banana-loaf.jpg', emoji: '🍌', price: 2200, unit: 'per loaf', lead: 2,
        desc: 'Deeply ripe bananas, brown butter and a crackly sugar top. Loaf or muffins, your call.',
        optionLabel: 'Style', options: [['Loaf', 0], ['Muffins (6)', -400], ['Muffins (12)', 1400]] },
      { name: 'Bakery-Style Blueberry Muffins', img: '/images/blueberry-muffins.jpg', emoji: '🫐', price: 2100, unit: 'per half dozen', lead: 2,
        desc: 'Tall domed tops, loaded with blueberries and finished with coarse sugar.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', 0], ['Dozen (12)', 1800]] }
    ]
  },
  {
    category: 'Savoury Bites',
    blurb: 'Party trays and snacks for when sweet is not the point.',
    items: [
      { name: 'Bacon & Cheese Twists', img: '/images/bacon-cheese-twists.jpg', emoji: '🥓', price: 1900, unit: 'per half dozen', lead: 2,
        desc: 'Puff pastry twisted with bacon and sharp cheddar, baked crisp and flaky.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', 0], ['Dozen (12)', 1700]] },
      { name: 'Savoury Puff Pastry Pinwheels', img: '/images/pinwheels.jpg', emoji: '🌀', price: 2600, unit: 'per dozen', lead: 2,
        desc: 'Buttery spirals of pesto, cheese and herbs — the first thing to disappear off a tray.',
        optionLabel: 'Quantity', options: [['Dozen (12)', 0], ['Two dozen (24)', 2400]] },
      { name: 'Baked Brie in Puff Pastry', img: '/images/baked-brie.jpg', emoji: '🧀', price: 4800, unit: 'per wheel', lead: 3,
        desc: 'A whole wheel of brie wrapped in pastry with fig jam and toasted nuts. Serves 8–10.' },
      { name: 'Sausage in Sweet-Spicy Sauce', img: '/images/sausage-sweet-spicy.jpg', emoji: '🌶️', price: 3200, unit: 'per tray', lead: 2,
        desc: 'Cocktail sausages simmered in a sticky sweet-heat glaze. Served warm in a foil tray.',
        optionLabel: 'Tray size', options: [['Small (serves 8)', 0], ['Large (serves 16)', 2600]] }
    ]
  },
  {
    category: 'Cookies & Bars',
    blurb: 'Boxed by the dozen, still warm if you time it right.',
    items: [
      { name: 'Chocolate Chunk Cookies', img: '/images/chocolate-chunk-cookies.jpg', emoji: '🍪', price: 2000, unit: 'per dozen', lead: 1,
        desc: 'Brown-butter dough, puddles of dark chocolate, flaky sea salt on top.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', -900], ['Dozen (12)', 0], ['Two dozen (24)', 1800]] },
      { name: 'Chewy Oatmeal Cookies', img: '/images/oatmeal-cookies.jpg', emoji: '🍪', price: 1900, unit: 'per dozen', lead: 1,
        desc: 'Soft centres, cinnamon and oats. Raisins in, or chocolate instead — just ask.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', -850], ['Dozen (12)', 0], ['Two dozen (24)', 1700]] },
      { name: 'Snickerdoodles', img: '/images/snickerdoodles.jpg', emoji: '🍪', price: 1900, unit: 'per dozen', lead: 1,
        desc: 'Cinnamon-sugar crackled tops, tangy soft middles.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', -850], ['Dozen (12)', 0], ['Two dozen (24)', 1700]] },
      { name: 'Fudgy Brownies', img: '/images/fudgy-brownies.jpg', emoji: '🍫', price: 2400, unit: 'per pan of 9', lead: 1,
        desc: 'Dense, glossy-topped and unapologetically fudgy. Cut into nine generous squares.',
        optionLabel: 'Pan size', options: [['9 squares', 0], ['16 squares', 1600]] },
      { name: 'Classic Lemon Bars', img: '/images/lemon-bars.jpg', emoji: '🍋', price: 2500, unit: 'per pan of 9', lead: 2,
        desc: 'Shortbread base, sharp lemon curd, a snowfall of icing sugar.',
        optionLabel: 'Pan size', options: [['9 squares', 0], ['16 squares', 1700]] }
    ]
  },
  {
    category: 'Cakes & Cheesecakes',
    blurb: 'Centrepieces. Order these a few days ahead.',
    items: [
      { name: 'Mini Biscoff Cheesecakes', img: '/images/mini-biscoff-cheesecakes.jpg', emoji: '🍮', price: 3000, unit: 'per half dozen', lead: 3,
        desc: 'Individual baked cheesecakes on a Biscoff crust, topped with warm cookie butter.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', 0], ['Dozen (12)', 2700]] },
      { name: 'Mini Plain Cheesecakes', img: '/images/mini-plain-cheesecakes.jpg', emoji: '🍰', price: 2700, unit: 'per half dozen', lead: 3,
        desc: 'Vanilla bean cheesecakes on a graham crust. Add fruit or sauce on request.',
        optionLabel: 'Quantity', options: [['Half dozen (6)', 0], ['Dozen (12)', 2400]] },
      { name: 'Rum Cake', img: '/images/rum-cake.jpg', emoji: '🥃', price: 4200, unit: 'per cake', lead: 4,
        desc: 'Soaked long and slow in good Jamaican rum. Gift-wrapped on request.',
        optionLabel: 'Size', options: [['6 inch', 0], ['8 inch', 1300], ['10 inch', 3000]] },
      { name: 'Coconut Cake', img: '/images/coconut-cake.jpg', emoji: '🥥', price: 5200, unit: 'per cake', lead: 4,
        desc: 'Layers of soft vanilla cake, coconut cream and a thick blanket of toasted coconut.',
        optionLabel: 'Size', options: [['6 inch', 0], ['8 inch', 1600]] },
      { name: 'Pumpkin Roulade', img: '/images/pumpkin-roulade.jpg', emoji: '🎃', price: 4200, unit: 'per roll', lead: 3,
        desc: 'Spiced pumpkin sponge rolled around cream cheese filling, dusted with icing sugar.' }
    ]
  },
  {
    category: 'Special Desserts',
    blurb: 'Showpieces and gifts — best ordered with a little notice.',
    items: [
      { name: 'Crisp-Outside, Soft-Center Pavlova', img: '/images/pavlova.jpg', emoji: '🍓', price: 4500, unit: 'per pavlova', lead: 3,
        desc: 'Shattering meringue shell, marshmallow centre, softly whipped cream and fresh fruit.',
        optionLabel: 'Size', options: [['8 inch (serves 6)', 0], ['10 inch (serves 10)', 1500]] },
      { name: 'French Macarons', img: '/images/french-macarons.jpg', emoji: '🌈', price: 3600, unit: 'per dozen', lead: 4,
        desc: 'Smooth shells, ruffled feet, ganache or buttercream fillings. Tell us your colours.',
        optionLabel: 'Quantity', options: [['Dozen (12)', 0], ['Two dozen (24)', 3200]] },
      { name: 'Chocolate Bark', img: '', emoji: '🍫', price: 1500, unit: 'per bag', lead: 2,
        desc: 'Tempered chocolate scattered with nuts, dried fruit and sea salt. Snaps beautifully.',
        optionLabel: 'Packaging', options: [['Bag', 0], ['Gift box', 1200]] }
    ]
  }
];

function seed() {
  if (RESET) {
    db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM item_options; DELETE FROM items; DELETE FROM categories;');
    console.log('Cleared existing menu and orders.');
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (RESET || !getSetting(key)) setSetting(key, value);
  }

  if (!getSetting('admin_password')) {
    const initial = process.env.LW_ADMIN_PASSWORD || 'whisk-admin';
    setSetting('admin_password', hashPassword(initial));
    console.log(`Admin password set to: ${initial}   <-- change this after your first login`);
  }

  const existing = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  if (existing > 0) {
    console.log(`Menu already has ${existing} items — leaving it alone. Use "npm run reset" to start over.`);
    return;
  }

  const insCat = db.prepare('INSERT INTO categories (name, blurb, sort_order) VALUES (?, ?, ?)');
  const insItem = db.prepare(`INSERT INTO items
    (category_id, name, description, base_price, unit, emoji, image_url, option_label, lead_time_days, is_available, is_featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const insOpt = db.prepare('INSERT INTO item_options (item_id, label, price_delta, sort_order) VALUES (?, ?, ?, ?)');

  let catOrder = 0, featured = 0;
  for (const group of MENU) {
    const catId = insCat.run(group.category, group.blurb, catOrder++).lastInsertRowid;
    let i = 0;
    for (const it of group.items) {
      const isFeatured = featured < 4 && i === 0 ? 1 : 0;
      if (isFeatured) featured++;
      const itemId = insItem.run(
        catId, it.name, it.desc || '', it.price, it.unit || '', it.emoji || '', it.img || '',
        it.optionLabel || '', it.lead ?? 2, isFeatured, i++
      ).lastInsertRowid;
      (it.options || []).forEach((o, idx) => insOpt.run(itemId, o[0], o[1], idx));
    }
  }
  console.log(`Seeded ${MENU.length} categories and ${db.prepare('SELECT COUNT(*) AS n FROM items').get().n} items.`);
}

seed();
