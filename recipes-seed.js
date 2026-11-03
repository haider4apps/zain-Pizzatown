// Stock v2: owner ki di hui recipes (Nov 2026). Aik hi baar chalta hai (setting: stock_v2_done).
// Recipe ki miqdar yahan gram / ml / piece mein hai; database mein stock item ki unit (kg / litre / piece) mein jati hai.
const G = 'Raw saman', P = 'Packing';
// [naam, unit, chhoti unit, 1 unit mein kitni chhoti, group]
// [naam, unit, chhoti unit, 1 unit mein kitni chhoti, group, 1 pack = itni unit, pack ka naam]
const ITEMS = [
  ['Top Cow Cheese', 'kg', 'g', 1000, G, 1.96, 'Pack 2kg'], ['Shredded 70/30 Cheese', 'kg', 'g', 1000, G, 1.96, 'Pack 2kg'],
  ['Pizza Chicken', 'kg', 'g', 1000, G, 0.95, 'Pack 1kg'], ['Sausage', 'kg', 'g', 1000, G, 1, 'Pack'],
  ['Real Wardha', 'kg', 'g', 1000, G, 3.9, 'Pack'], ["Young's Creme Mayo", 'kg', 'g', 1000, G, 0.95, 'Pack'],
  ['Olive', 'kg', 'g', 1000, G, 0.9, 'Can'], ['Sweet Corn', 'kg', 'g', 1000, G, 0.95, 'Pack 1kg'], ['Fries', 'kg', 'g', 1000, G, 2.5, 'Pack'],
  ['Macaroni', 'kg', 'g', 1000, G, 1, 'Pack'], ['Maida', 'kg', 'g', 1000, G, 50, 'Thela 50kg'], ['Eka Powder', 'kg', 'g', 1000, G, 0.5, 'Pack'],
  ['Saf Instant', 'kg', 'g', 1000, G, 0.5, 'Pack'], ['Iodine Salt', 'kg', 'g', 1000, G, 0.5, 'Pack'], ['Sugar', 'kg', 'g', 1000, G, 1, 'Pack'],
  ['Everyday Milk Powder', 'kg', 'g', 1000, G, 0.75, 'Pack'], ['Vanilla Powder', 'kg', 'g', 1000, G, 0.5, 'Pack'],
  ['Oil', 'kg', 'g', 1000, G, 1, 'Pouch 1kg'], ['Olper Milk', 'litre', 'g', 1030, G, 1, 'Pack 1 litre'],
  ['Anda', 'piece', '', 0, G, 30, 'Tray'], ['Seekh Kabab', 'piece', '', 0, G, 20, 'Pack'], ['Hot Shot', 'piece', '', 0, G, 40, 'Pack'],
  ['Wings', 'piece', '', 0, G, 50, 'Pack 2kg'], ['Nuggets', 'piece', '', 0, G, 35, 'Pack'],
  ['Boneless Thai', 'piece', '', 0, G, 20, 'Pack 2kg'], ['Chicken Patty', 'piece', '', 0, G, 12, 'Pack'], ['Chapli Patty', 'piece', '', 0, G, 12, 'Pack'],
  ['Zestful Chicken Strips', 'piece', '', 0, G, 16, 'Pack'], ['Burger Bun', 'piece', '', 0, G, 2, 'Pack'], ['Tortilla Bread', 'piece', '', 0, G, 8, 'Pack'],
  ['Shawarma Bread', 'piece', '', 0, G, 4, 'Pack'], ['Plain Paratha', 'piece', '', 0, G, 30, 'Pack'],
  ['Lazania Strip', 'piece', '', 0, G, 16, 'Pack'], ['Burger Cheese Slice', 'piece', '', 0, G, 30, 'Pack'],
  ['Foil', 'kg', 'g', 1000, P, 2, 'Pack 2kg'], ['Butter Paper', 'piece', '', 0, P, 200, 'Pack'], ['Food Bag', 'piece', '', 0, P, 50, 'Pack'],
  ['Pizza Box L', 'piece', '', 0, P, 50, 'Pack'], ['Pizza Box M', 'piece', '', 0, P, 50, 'Pack'], ['Pizza Box S', 'piece', '', 0, P, 50, 'Pack'],
  ['F1 Packing', 'piece', '', 0, P, 1, 'Piece'], ['F2 Packing', 'piece', '', 0, P, 1, 'Piece'], ['Ketchup Sachet', 'piece', '', 0, P, 100, 'Pack'],
];
// Dough: khud banta hai. 1 kg maida ka batch ~1652g (pani bhi wazan mein, stock mein nahi)
const DOUGH = { name: 'Dough', yield: 1652, rows: { Maida: 1000, Oil: 50, 'Olper Milk': 30, 'Eka Powder': 12, 'Saf Instant': 15,
  'Iodine Salt': 12, Sugar: 12, 'Everyday Milk Powder': 15, 'Vanilla Powder': 6, Anda: 1 } };

const DOUGH_G = { L: 480, M: 280, S: 160 }, BOX = { L: 'Pizza Box L', M: 'Pizza Box M', S: 'Pizza Box S' }, KETCHUP = { L: 8, M: 6, S: 4 };
const WARDHA = { L: 80, M: 60 };
// pizza: c=cheese ch=chicken s=kul sauce sg=sausage k=kabab hs=hot shot f=fries
const PREMIUM = {
  'Star Pizza': { L: { c: 140, ch: 260, s: 160, sg: 20 }, M: { c: 90, ch: 240, s: 120, sg: 20 } },
  'Drone Pizza': { L: { c: 160, ch: 260, f: 80, s: 160, sg: 10 }, M: { c: 160, ch: 170, f: 50, s: 120 } },
  'Royal Twisto': { L: { c: 140, ch: 260, s: 170, k: 4, sg: 10 }, M: { c: 140, ch: 140, s: 120, k: 4, sg: 20 } },
  'Premium Special': { L: { c: 180, ch: 300, s: 160, sg: 20 }, M: { c: 180, ch: 260, s: 120, sg: 10 } },
  'Zinger Booster': { L: { c: 180, hs: 12, s: 180, sg: 20 }, M: { c: 140, hs: 12, s: 180, sg: 30 } },
  'Lazania Pizza': { L: { c: 180, ch: 280, s: 160, sg: 20 }, M: { c: 120, ch: 240, s: 170, sg: 10 } },
  'Creamy Booster': { L: { c: 160, ch: 190, s: 120, sg: 10 }, M: { c: 180, ch: 160, s: 180 } },
  'Nawabi': { L: { c: 160, ch: 190, s: 120, sg: 10 }, M: { c: 160, ch: 160, s: 160, sg: 10 } },
  'Cheese Lover': { L: { c: 160, ch: 190, s: 120 }, M: { c: 100, ch: 160, s: 120 } },
  'Malai Boti': { L: { c: 160, ch: 190, s: 120, sg: 25 }, M: { c: 90, ch: 160, s: 140 } },
  'Kabab Flower': { L: { k: 4, ch: 190, c: 160, s: 130, sg: 20 }, M: { k: 4, ch: 160, c: 100, s: 120 } },
  'Crown Crust': { L: { c: 160, ch: 190, s: 130, sg: 10 }, M: { c: 160, ch: 160, s: 130 } },
  'Kabab Crown': { L: { c: 160, ch: 180, k: 4, s: 120 }, M: { k: 4, c: 160, ch: 160, s: 120 } },
  'Prime Kabab Crust': { L: { c: 160, ch: 180, k: 4, s: 120, sg: 20 }, M: { k: 4, c: 100, ch: 160, s: 130 } },
  'Stuff Crust': { L: { c: 160, ch: 280, s: 160, sg: 10 }, M: { c: 180, ch: 260, s: 120, sg: 10 } },
};
const PURE = { L: { c: 160, ch: 180, s: 80 }, M: { c: 100, ch: 140, s: 60 }, S: { c: 60, ch: 65, s: 20 } };

function pizzaRows(size, x, pure) {
  const r = { Dough: DOUGH_G[size], Cheese: x.c, Chicken: x.ch, Sausage: x.sg, 'Seekh Kabab': x.k, 'Hot Shot': x.hs, Fries: x.f, Olive: 6, 'Sweet Corn': 6 };
  if (pure) r['Real Wardha'] = x.s;
  else { r['Real Wardha'] = WARDHA[size]; r["Young's Creme Mayo"] = x.s - WARDHA[size]; }
  return { rows: r, away: { [BOX[size]]: 1, 'Ketchup Sachet': KETCHUP[size] } };
}

// [menu item naam, variant label] -> { rows: har order, away: sirf takeaway/delivery }
function recipes() {
  const out = [];
  const add = (name, label, rows, away) => out.push({ name, label, rows, away: away || {} });
  Object.entries(PREMIUM).forEach(([n, s]) => Object.entries(s).forEach(([sz, x]) => { const p = pizzaRows(sz, x, false); add(n, sz, p.rows, p.away); }));
  ['Fajita', 'Tikka', 'Bonfire', 'Supreme', 'B.B.Q'].forEach(n => Object.entries(PURE).forEach(([sz, x]) => {
    const p = pizzaRows(sz, n === 'Bonfire' && sz === 'S' ? { ...x, ch: 60 } : x, true); add(n, sz, p.rows, p.away);
  }));
  const pasta = (n, extra) => {
    add(n, 'Small', { Macaroni: 70, Cheese: 50, Chicken: 60, 'Real Wardha': 70, 'F1 Packing': 1, ...(extra.S || {}) }, { 'Ketchup Sachet': 2 });
    add(n, 'Large', { Macaroni: 120, Cheese: 70, Chicken: 100, 'Real Wardha': 120, 'F2 Packing': 1, ...(extra.L || {}) }, { 'Ketchup Sachet': 4 });
  };
  pasta('Macaroni Pasta', {}); pasta('Crunchy Pasta', { L: { 'Hot Shot': 4 } }); pasta('Kababish Pasta', { S: { 'Seekh Kabab': 1 }, L: { 'Seekh Kabab': 1 } });
  add('Lazania', 'Large', { 'Lazania Strip': 3, Cheese: 80, Chicken: 120, 'Real Wardha': 120, 'F2 Packing': 1 }, { 'Ketchup Sachet': 4 });
  const wrapAway = { 'Food Bag': 1, 'Ketchup Sachet': 2 };
  add('Premium Wrap', '', { 'Boneless Thai': 1, Fries: 20, 'Burger Cheese Slice': 1, 'Tortilla Bread': 1, "Young's Creme Mayo": 70, Foil: 8 }, { ...wrapAway, 'Pizza Box S': 1 });
  add('Seekh Kabab Wrap', '', { 'Seekh Kabab': 3, Fries: 20, 'Burger Cheese Slice': 1, 'Tortilla Bread': 1, "Young's Creme Mayo": 70, Foil: 8 }, wrapAway);
  add('Crunchy Wrap', '', { 'Hot Shot': 8, Fries: 20, 'Burger Cheese Slice': 1, 'Tortilla Bread': 1, "Young's Creme Mayo": 70, Foil: 8 }, wrapAway);
  add('Shawarma Roll', '', { Chicken: 60, 'Shawarma Bread': 1, "Young's Creme Mayo": 20, 'Butter Paper': 1 }, wrapAway);
  add('Crunchy Shawarma Roll', '', { 'Hot Shot': 5, 'Shawarma Bread': 1, "Young's Creme Mayo": 40, 'Butter Paper': 1 }, wrapAway);
  add('Paratha Roll', '', { 'Plain Paratha': 1, 'Hot Shot': 6, "Young's Creme Mayo": 50, 'Butter Paper': 1 }, wrapAway);
  const boxAway = { 'Pizza Box S': 1, 'Ketchup Sachet': 2 };
  add('Stuff Roll', '', { Chicken: 150, "Young's Creme Mayo": 120, Cheese: 30 }, boxAway);
  add('Behari Roll', '', { Chicken: 150, "Young's Creme Mayo": 120, Cheese: 50, Dough: 120 }, boxAway);
  add('Shawarma Platter', '', { Chicken: 60, 'Shawarma Bread': 2, "Young's Creme Mayo": 30 }, boxAway);
  [['Masala Fries', {}], ['Creamy Fries', { "Young's Creme Mayo": 50 }], ['Loaded Fries', { 'Burger Cheese Slice': 1 }]].forEach(([n, x]) => {
    add(n, 'S', { Fries: 200, ...x }, { 'Food Bag': 1, 'Ketchup Sachet': 2 });
    add(n, 'L', { Fries: 320, ...x }, { 'Food Bag': 1, 'Ketchup Sachet': 4 });
  });
  [['Hot Wings', 'Wings'], ['Oven Baked Wings', 'Wings'], ['Nuggets', 'Nuggets'], ['Hot Shot', 'Hot Shot']].forEach(([n, s]) => {
    add(n, '5 pcs', { [s]: 5 }, { 'Ketchup Sachet': 2 }); add(n, '10 pcs', { [s]: 10 }, { 'Ketchup Sachet': 4 });
  });
  const bAway = { 'Food Bag': 1, 'Ketchup Sachet': 2 };
  add('Zinger', '', { 'Burger Bun': 1, 'Boneless Thai': 1, "Young's Creme Mayo": 50, Foil: 8 }, bAway);
  add('Double Decker', '', { 'Burger Bun': 1, 'Boneless Thai': 2, 'Burger Cheese Slice': 1, "Young's Creme Mayo": 60, Foil: 8 }, bAway);
  add('Mega Stack', '', { 'Burger Bun': 1, 'Boneless Thai': 1, 'Chicken Patty': 1, "Young's Creme Mayo": 50, Foil: 8 }, bAway);
  add('Patty Burger', '', { 'Burger Bun': 1, 'Chicken Patty': 1, "Young's Creme Mayo": 50, 'Butter Paper': 1 }, bAway);
  add('Chapli Burger', '', { 'Burger Bun': 1, 'Chapli Patty': 1, "Young's Creme Mayo": 50, 'Butter Paper': 1 }, bAway);
  add('Tender Burger', '', { 'Burger Bun': 1, 'Zestful Chicken Strips': 1, "Young's Creme Mayo": 50, 'Butter Paper': 1 }, bAway);
  return out;
}
const RENAMES = [['Oven Backed Wings', 'Oven Baked Wings'], ['Double Deckar', 'Double Decker'], ['Pratha Roll', 'Paratha Roll']];

// Coating ka maida (owner: roz ~10 kg, sale ke hisaab se wazan par taqseem): 1 wing 100 g, 1 Boneless Thai 250 g
const COAT = { Wings: 100, 'Boneless Thai': 250 };
function coat(r) { Object.entries(COAT).forEach(([n, g]) => { if (r[n]) r.Maida = (r.Maida || 0) + r[n] * g; }); }
// "Cheese" = Top Cow + Shredded 70/30 aadha aadha; "Chicken" = Pizza Chicken
function finalRecipes() {
  const fix = o => { const r = {}; Object.entries(o).forEach(([n, q]) => { if (!q) return;
    if (n === 'Cheese') { r['Top Cow Cheese'] = (r['Top Cow Cheese'] || 0) + q / 2; r['Shredded 70/30 Cheese'] = (r['Shredded 70/30 Cheese'] || 0) + q / 2; }
    else if (n === 'Chicken') r['Pizza Chicken'] = (r['Pizza Chicken'] || 0) + q; else r[n] = (r[n] || 0) + q; }); return r; };
  return recipes().map(x => { const r = fix(x.rows); coat(r); return { ...x, rows: r, away: fix(x.away) }; });
}
// Extra topping (Rs -> gram). "Cheese" bhi aadha Top Cow, aadha Shredded
const TOPPING = { 100: { 'Top Cow Cheese': 15, 'Shredded 70/30 Cheese': 15, 'Pizza Chicken': 30 },
  200: { 'Top Cow Cheese': 30, 'Shredded 70/30 Cheese': 30, 'Pizza Chicken': 60 },
  300: { 'Top Cow Cheese': 40, 'Shredded 70/30 Cheese': 40, 'Pizza Chicken': 80 } };
module.exports = { ITEMS, DOUGH, recipes: finalRecipes, RENAMES, TOPPING, COAT };
