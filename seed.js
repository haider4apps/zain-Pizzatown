// Menu ki tasveer se saara data. Prices admin panel se badal sakte hain.
module.exports = function seed(db) {
  const addCat = db.prepare('insert into categories(name,name_ur,sort) values(?,?,?)');
  const addItem = db.prepare('insert into items(category_id,name,grp,details,sort) values(?,?,?,?,?)');
  const addVar = db.prepare('insert into variants(item_id,label,price,sort) values(?,?,?,?)');

  const S = (name, prices, grp = '', details = '') => ({ name, grp, details, v: prices });
  const pizza = (names, grp, prices) => names.map(n => S(n, prices, grp));

  const cats = [
    { name: 'Deals', ur: 'ڈیلز', items: [
      S('Deal Rs 1850', [['', 1850]], 'Deal Bar', '1 Large Pizza, 1 Small Pizza, 1 Ltr Drink'),
      S('Deal Rs 1700', [['', 1700]], 'Deal Bar', '1 Medium Pizza, 2 Zinger Burger, 1 Ltr Drink'),
      S('Deal Rs 1900', [['', 1900]], 'Deal Bar', '1 Large Pizza, 10 Hot Wings, 1.5 Ltr Drink'),
      S('Deal Rs 2400', [['', 2400]], 'Deal Bar', '1 Large Pizza, 1 Medium Pizza, 1.5 Ltr Drink'),
      S('Deal Rs 2750', [['', 2750]], 'Deal Bar', '2 Large Pizza, 1.5 Ltr Drink'),
      S('Student Deal Rs 950', [['', 950]], 'Student Deal', '1 Zinger, 5 Hot Wings, 5 Nuggets, 330ml Drink'),
      S('Student Deal Rs 850', [['', 850]], 'Student Deal', '1 Small Pizza, 1 Zinger, 330ml Drink'),
    ] },
    { name: 'Pizza', ur: 'پیزا', items: [
      ...pizza(['Fajita', 'Tikka', 'Bonfire', 'Supreme', 'B.B.Q'], 'Pure Flavours', [['S', 550], ['M', 1050], ['L', 1400]]),
      ...pizza(['Stuff Crust', 'Creamy Booster', 'Nawabi', 'Cheese Lover', 'Malai Boti', 'Kabab Flower',
        'Crown Crust', 'Kabab Crown', 'Prime Kabab Crust'], 'Elite Flavours', [['M', 1150], ['L', 1500]]),
      ...pizza(['Premium Special', 'Zinger Booster', 'Lazania Pizza', 'Star Pizza', 'Drone Pizza', 'Royal Twisto'],
        'Premium Flavours', [['M', 1250], ['L', 1700]]),
    ] },
    { name: 'Burgers', ur: 'برگر', items: [
      S('Zinger', [['', 350]]), S('Double Deckar', [['', 550]]), S('Mega Stack', [['', 500]]),
      S('Patty Burger', [['', 250]]), S('Chapli Burger', [['', 250]]), S('Tender Burger', [['', 300]]),
    ] },
    { name: 'Wraps & Rolls', ur: 'ریپس اور رولز', items: [
      S('Premium Wrap', [['', 500]], 'Wraps'), S('Seekh Kabab Wrap', [['', 500]], 'Wraps'), S('Crunchy Wrap', [['', 550]], 'Wraps'),
      S('Behari Roll', [['', 700]], 'Rolls'), S('Pratha Roll', [['', 350]], 'Rolls'), S('Stuff Roll', [['', 550]], 'Rolls'),
      S('Shawarma Roll', [['', 180]], 'Rolls'), S('Crunchy Shawarma Roll', [['', 300]], 'Rolls'),
      S('Shawarma Platter', [['', 250]], 'Rolls'),
    ] },
    { name: 'Fries', ur: 'فرائز', items: [
      S('Masala Fries', [['S', 200], ['L', 400]]), S('Creamy Fries', [['S', 250], ['L', 500]]),
      S('Loaded Fries', [['S', 300], ['L', 600]]),
    ] },
    { name: 'Mini Bites', ur: 'منی بائٹس', items: [
      S('Hot Wings', [['5 pcs', 300], ['10 pcs', 550]]), S('Oven Backed Wings', [['5 pcs', 300], ['10 pcs', 550]]),
      S('Nuggets', [['5 pcs', 250], ['10 pcs', 500]]), S('Hot Shot', [['5 pcs', 250], ['10 pcs', 450]]),
    ] },
    { name: 'Pasta & Salad', ur: 'پاستا اور سلاد', items: [
      S('Macaroni Pasta', [['Small', 450], ['Large', 700]], 'Pasta'), S('Crunchy Pasta', [['Small', 550], ['Large', 750]], 'Pasta'),
      S('Kababish Pasta', [['Small', 550], ['Large', 800]], 'Pasta'), S('Lazania', [['Large', 900]], 'Pasta'),
      S('Russian Salad', [['M', 300], ['L', 500]], 'Salad'),
    ] },
    // Drinks ki qeematein abhi 0 hain; admin panel se daal dein. Brand/flavour bhi wahin se add honge.
    { name: 'Cold Drinks & Water', ur: 'کولڈ ڈرنک اور پانی', items: [
      S('Cold Drink', [['250ml', 0], ['500ml', 0], ['1 Ltr', 0], ['1.5 Ltr', 0]], 'Cold Drinks'),
      S('Water', [['250ml', 0], ['1.5 Ltr', 0]], 'Water'),
    ] },
  ];

  db.transaction(() => {
    cats.forEach((c, ci) => {
      const cid = addCat.run(c.name, c.ur, ci).lastInsertRowid;
      c.items.forEach((it, ii) => {
        const iid = addItem.run(cid, it.name, it.grp, it.details, ii).lastInsertRowid;
        it.v.forEach((v, vi) => addVar.run(iid, v[0], v[1], vi));
      });
    });
  })();
};
