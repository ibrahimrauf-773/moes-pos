// Default (non-confidential) data. Everything here is editable in the app. NO RECIPES HERE.
export const HEATS = ['Mild','Medium','Hot','Extra Hot','Reaper'];
export const FP_HEATS = ['Mild','Medium','Hot','Extra Hot'];
export const PAY_METHODS = [
  {id:'cash',name:'Cash'},{id:'hbl',name:'HBL ••6903 (transfer/Raast)'},{id:'bah',name:'Bank Al Habib ••5901'},
  {id:'card',name:'Card'},{id:'fp_online',name:'Foodpanda online'}];
const m=(id,name,cat,price,o={})=>({id,name,cat,price,on:true,heat:false,cost:0,allergens:'',...o});
// menu: 'store' = in-store + WhatsApp; 'fp' = Foodpanda price list; 'mashion' = bazaar stall (PENDING prices)
export const MENUS = {
 store:[
  m('combo1','Combo 1 (2 tenders)','Mains',1099,{heat:true}), m('combo2','Combo 2 (2 sliders)','Mains',1249,{heat:true}),
  m('combo3','Combo 3 (1 tender + 1 slider)','Mains',1199,{heat:true}), m('loaded_fries','Loaded Fries','Mains',749,{heat:true}),
  m('mozz','Mozzarella Sticks (3)','Mains',899,{heat:true}), m('mac',"Moe's Mac n Cheese",'Mains',1499,{heat:true}),
  m('dinner_roll','Extra Dinner Roll','Extras',40), m('moes_sauce',"Extra Sauce (Moe's)",'Extras',120), m('white_sauce','White Sauce','Extras',120),
  m('hot_honey','Hot Honey','Extras',100), m('curly_fries','Curly Fries upgrade','Extras',150),
  m('baja','Baja Blast','Drinks',199), m('lemonade','Lemonade','Drinks',199), m('arizona','Arizona Ice Tea','Drinks',249),
  m('donut','Glazed Donut','Dessert',399)],
 fp:[
  m('combo1','Combo 1','Combos',1199,{heat:true}), m('combo2','Combo 2','Combos',1349,{heat:true,on:false}), m('combo3','Combo 3','Combos',1299,{heat:true,on:false}),
  m('loaded_fries','Loaded Fries','Mains',749,{heat:true}), m('mozz','Mozzarella Sticks','Mains',899,{heat:true}), m('mac','Nashville Mac N Cheese','Mains',1499,{heat:true}),
  m('dinner_roll','Dinner Roll','Extras',40,{on:false}), m('moes_sauce',"Moe's Sauce",'Extras',120), m('hot_honey','Hot Honey','Extras',100), m('white_sauce','White Sauce','Extras',120),
  m('curly_fries','Curly Fries (modifier)','Extras',150),
  m('baja','Baja Blast','Beverages',199), m('lemonade','Lemonade','Beverages',199,{on:false}), m('arizona','Arizona','Beverages',249,{on:false}),
  ...[['matcha_straw','Strawberry Matcha',850],['matcha_lav','Lavender Matcha',900],['matcha_hib','Hibiscus Matcha',900],
      ['tea_peach','Peach Ice Tea',550],['tea_rasp','Raspberry Ice Tea',600],['tea_hib','Hibiscus Ice Tea',600],['tea_pass','Passionfruit Ice Tea',550],['tea_yuzu','Yuzu Ice Tea',500],
      ['cool_yuzu','Yuzu Cooler',680],['cool_pass','Passionfruit Cooler',500],['cool_cc','Cotton Candy Cooler',600],['cool_straw','Strawberry Cooler',520],['cool_pine','Pineapple Cooler',650]]
     .map(([i,n,p])=>m(i,n,'Beverages',p,{on:false}))],
 mashion:[
  m('combo3','Combo 3','Stall',1500,{heat:true,pending:true}), m('mozz','Mozzarella Sticks','Stall',1100,{heat:true,pending:true}),
  m('donut_slider','Donut Slider (Elles collab)','Stall',1200,{heat:true,pending:true}), m('mac','Mac n Cheese','Stall',1600,{heat:true,pending:true}),
  m('baja','Baja Blast','Stall',250,{pending:true}),
  m('sample_tender','SAMPLE tender piece','Samples',0,{sample:true}), m('sample_munchkin','SAMPLE munchkin donut slider','Samples',0,{sample:true})],
};
// add-ons offered as modifiers on mains (price per add-on). FP modifiers: drink prices differ.
export const ADDONS = {
 store:[{id:'dinner_roll',name:'+ Dinner Roll',price:40},{id:'moes_sauce',name:"+ Moe's Sauce",price:120},{id:'white_sauce',name:'+ White Sauce',price:120},{id:'hot_honey',name:'+ Hot Honey',price:100},{id:'curly_fries',name:'Curly Fries',price:150},{id:'baja',name:'+ Baja Blast',price:199}],
 fp:[{id:'dinner_roll',name:'+ Dinner Roll',price:40},{id:'moes_sauce',name:"+ Moe's Sauce",price:120},{id:'hot_honey',name:'+ Hot Honey',price:100},{id:'curly_fries',name:'Curly Fries',price:150},{id:'baja',name:'Drink: Baja',price:200},{id:'lemonade',name:'Drink: Lemonade',price:170},{id:'arizona',name:'Drink: Arizona',price:200}],
 mashion:[],
};
// Speedway zones (owner-confirmed Oct 28): customer charge = rider fare, both editable.
const Z=(id,fare,areas)=>({id,name:'Zone '+id,customerCharge:fare,riderFare:fare,areas});
export const ZONES=[
 Z('A',200,'DHA all, Clifton all, Frere Town, Bath Island, Civil Lines, Cantt'),
 Z('B',300,'Creek Vista, Emaar Towers, Jinnah Hospital, Lalazar, Defence View, Kashif Centre, Hotel Mehran, Shireen Jinnah Colony'),
 Z('C',360,'II Chundrigar Rd, Lucky Star, Faisal House, Mehmoodabad, Saddar'),
 Z('D',460,'Sindhi Muslim Soc, PECHS, Kashmir Rd, Jamshed Rd, Garden East, Bahadurabad, Sharfabad, M Ali Soc, KDA Scheme 1, Shahrah-e-Faisal to Karsaz, Kharadar, West Wharf, Kemari'),
 Z('E',560,'Korangi, NHS Karsaz, Aga Khan Hosp, Liaquat National Hosp, Askari 4, Gulshan-e-Jamal, Garden West, PIB Colony'),
 Z('F',660,'Gulshan-e-Iqbal, Gulistan-e-Johar'),
 Z('G',760,'Nazimabad, North Nazimabad, Shah Faisal, FB Area, Liaquatabad'),
 Z('H',860,'Scheme 33, Landhi, Malir, Safoora'),
 Z('I',960,'North Karachi, SITE Area, Naya Nazimabad')];
// Placeholder PINs - owner must change them in Settings > Staff on first use.
export const STAFF=[
 {id:'shaheer',name:'Shaheer',role:'owner',pin:'1111'},{id:'ibrahim',name:'Ibrahim',role:'owner',pin:'2222'},{id:'ruqaiya',name:'Ruqaiya',role:'owner',pin:'3333'},
 {id:'waqar',name:'Waqar',role:'cashier',pin:'4444'},{id:'shan',name:'Shan',role:'kitchen',pin:'5555'},{id:'amir',name:'Amir',role:'kitchen',pin:'6666'},
 {id:'ayesha',name:'Ayesha',role:'stock',pin:'7777'}];
export const POLICY={kdsButtons:false,staffMealPct:30,cashierMaxDiscountPct:10,cashierCanRefund:true,amberMinutes:12,lateMinutes:20,focApprovers:['waqar'],fpCommissionPct:23,gstOn:false,gstPct:0};
export const EXPENSE_CODES=[
 ['5000','Chicken/Poultry'],['5010','Produce'],['5020','Dry Goods'],['5030','Dairy'],['5040','Bread & Bakery'],['5050','Oil & Spices'],['5100','Beverage Cost'],['5200','Packaging & To-Go'],
 ['6000','Payroll'],['6100','Rent'],['6200','Electric'],['6210','Gas'],['6220','Water'],['6230','Internet & Phone'],['6300','Delivery App Fees'],['6320','Bank Fees'],['6330','Delivery & Transport'],
 ['6400','Equipment & Repairs'],['6410','Cleaning'],['6430','Smallwares'],['6500','Marketing'],['6510','Mashion Event'],['6800','POS & Software'],['6820','Office Supplies'],['6990','Misc'],
 ['DRAW','Partner Drawings (non-expense)'],['LOAN-IB','Ibrahim Loan (non-expense)']].map(([code,name])=>({code,name}));
export const LOCATIONS=[{id:'home',name:'Home'},{id:'main',name:'Main Branch'},{id:'mashion',name:'Mashion stall'}];
const I=(id,name,unit,pack,packUnit,reorder,supplier='',o={})=>({id,name,unit,packSize:pack,packLabel:packUnit,reorderLevel:reorder,supplier,costPerUnit:0,reorderFlag:false,...o});
// Sections mirror the shop's paper sheets ("Home Daily Inventory Log" and "Main Branch Daily Inventory Log").
export const SHEET_SECTIONS={
 home:['Raw – Chicken & dairy','Raw – Dry goods & bread','Raw – Sauces & liquids','Frozen','Raw – Spices','Ready items (made at Home, not yet sent)'],
 main:['Ready items from Home','Fries','Drinks, desserts & bread','Kitchen','Packaging','Supplies checklist']};
// home/main: [section index, name on that sheet if different]. countUnit/countFactor: unit written on the sheet vs. internal unit
// (e.g. fries counted in kg, stored in g because sales deduct grams). check:'ok' = OK/Reorder tick only; status:'FHL' = gas cylinder.
const H=(sec,name)=>({sec,name}), M=H;
// Home raw ingredients & spices are NOT shipped (they would reveal recipes); they come with the owner's private import file.
const CK=(id,name,o={})=>I(id,name,'pc',1,'',0,'',{cat:'Supplies',main:M(5),check:'ok',...o});
export const INVENTORY=[
 // Home 1. Raw – Chicken & dairy
 I('chicken','Raw chicken breast','g',1000,'kg',0,'Ali Chicken',{cat:'Raw',home:H(0),countUnit:'kg',countFactor:1000,aliases:['Chicken breast (boneless)']}),
 // Home 2. Raw – Dry goods & bread
 I('slider_buns','Slider buns – Khawar','pcs',4,'pkt of 4',8,'Khawar (Rs170/pkt)',{cat:'Bread',home:H(1),main:M(0),aliases:['Slider buns']}),
 // Home 3. Raw – Sauces & liquids (sheet says "write unit": default bottle, editable)
 // Home 4. Frozen  (+ Main 2. Fries)
 I('fries','FrozenHub straight fries','g',1000,'kg',2000,'FrozenHub',{cat:'Frozen',home:H(3),main:M(1,'Straight fries'),countUnit:'kg',countFactor:1000,aliases:['Fries (straight)']}),
 I('curly_fries','FrozenHub curly fries','g',1000,'kg',2000,'FrozenHub',{cat:'Frozen',home:H(3),main:M(1,'Curly fries'),countUnit:'kg',countFactor:1000}),
 // Home 5. Raw – Spices (all grams)
 // Home 6. Ready items  = Main 1. Ready items from Home
 I('ready_tenders','Ready chicken tenders','pcs',90,'batch',30,'Home prep',{cat:'Ready',home:H(5),main:M(0),aliases:['Ready tenders']}),
 I('ready_mozz','Mozzarella sticks','pcs',35,'batch',15,'Home prep',{cat:'Ready',home:H(5),main:M(0),aliases:['Ready mozzarella sticks']}),
 I('moes_sauce_g',"Moe's sauce",'g',1000,'batch',1000,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('white_sauce_g','White sauce','g',1000,'batch',1000,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('pickle_water','Pickle water','ml',1000,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('mac_portion','Mac n cheese – macaroni','portions',6,'batch',6,'Home prep',{cat:'Ready',home:H(5),main:M(0),aliases:['Mac portion (sauce+pasta)']}),
 I('mac_sauce','Mac n cheese – cheese sauce','portions',6,'batch',6,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('hot_honey_g',"Moe's Hot Honey",'2 oz cups',1,'2 oz cup',20,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('mix_mild','Spice mix – Mild','g',1000,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('mix_medium','Spice mix – Medium','g',1000,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('mix_hot','Spice mix – Hot','g',1000,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('mix_xhot','Spice mix – Extra Hot','g',1000,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('reaper_powder','Reaper powder','g',100,'batch',0,'Home prep',{cat:'Ready',home:H(5),main:M(0)}),
 I('pickles','Bought pickles','g',1000,'jar',500,'Kamran Bhai',{cat:'Ready',main:M(0),countUnit:'jar',countFactor:1000,aliases:['Pickles']}),
 // Main 3. Drinks, desserts & bread (drinks reorder at 1 bottle)
 I('dew340','Mountain Dew 340 ml','bottles',1,'bottle',1,'',{cat:'Drinks',main:M(2)}),
 I('sevenup250','7up 250 ml','bottles',1,'bottle',1,'',{cat:'Drinks',main:M(2)}),
 I('gatorade500','Gatorade 500 ml','bottles',1,'bottle',1,'',{cat:'Drinks',main:M(2)}),
 I('donuts','Glazed donuts','pcs',1,'pc',0,'',{cat:'Desserts',main:M(2)}),
 I('dinner_rolls','Dinner rolls – NECOS','pcs',12,'pack of 12',12,'NECOS (order by 5PM)',{cat:'Bread',main:M(2),aliases:['NECOS dinner rolls']}),
 // Main 4. Kitchen
 I('oil','Frying oil','L',10,'can',10,'Branch',{cat:'Kitchen',main:M(3),reorderFlag:false}),
 I('gas','Gas cylinder','pc',1,'cylinder',1,'Branch',{cat:'Kitchen',main:M(3),status:'FHL'}),
 // Main 5. Packaging (reorder levels from the sheet)
 I('takeaway_bags','Takeaway bags','pcs',100,'pack of 100 (~Rs2500)',25,'Abdul Bari',{cat:'Packaging',main:M(4)}),
 I('lp24','LP24 boxes','pcs',50,'pack',25,'Abdul Bari',{cat:'Packaging',main:M(4)}),
 I('dip2oz','2 oz dip cups','pcs',100,'pack',50,'Zia / Delhi Colony',{cat:'Packaging',main:M(4),aliases:['2oz dip cups']}),
 I('round500','500 ml round box with lid','pcs',50,'pack',10,'Zia Plastic Market',{cat:'Packaging',main:M(4),aliases:['500ml round boxes']}),
 I('cup12','12 oz cup/glass','pcs',50,'sleeve',20,'Zia Plastic Market',{cat:'Packaging',main:M(4),aliases:['12oz cups']}),
 // Main 6. Supplies checklist (OK / Reorder only)
 CK('napkins','Napkins'), CK('forks','Forks'), CK('spoons','Spoons'),
 I('butter_paper','Butter paper','pc',100,'pack',20,'Abdul Bari',{cat:'Supplies',main:M(5),check:'ok'}),
 CK('sanitizer','Sanitizer'), CK('surf','Surf'), CK('soap','Soap'), CK('garbage_bags','Garbage bags'), CK('cleaning_wire','Cleaning wire'),
 CK('sponge','Sponge'), CK('cloths','Cloths'), CK('black_gloves','Black gloves'), CK('disposable_gloves','Disposable gloves'), CK('room_spray','Room spray'), CK('mortein','Mortein'),
 I('straws','Straws (packets of 100)','pc',100,'pack',50,'Zia / Abdul Bari',{cat:'Supplies',main:M(5),check:'ok',aliases:['Straws']}),
 I('drink_bags','Drink bags','pc',100,'pack',20,'Zia / Abdul Bari',{cat:'Supplies',main:M(5),check:'ok'}),
 // Not on the paper sheets (kept for automatic deduction of Baja Blast)
 I('baja_mix','Baja Blast mix (40% Dew/40% 7up/20% Gatorade)','ml',1500,'bottle',2000,'Branch',{cat:'Drinks'}),
];
// ASSUMPTION (sheet counts sauces in grams; POS sells 2 oz dip cups): ~55 g per 2 oz cup. Owner can edit in Settings.
export const SAUCE_G_PER_DIP=55;
// Per-item usage (Supply, non-confidential): consumables per unit sold. takeaway:true = only for takeaway/delivery.
export const USAGE={
 baja:[['cup12',1],['straws',1],['baja_mix',230],['drink_bags',1,true],['butter_paper',1,true]],
 moes_sauce:[['dip2oz',1],['moes_sauce_g',SAUCE_G_PER_DIP]], white_sauce:[['dip2oz',1],['white_sauce_g',SAUCE_G_PER_DIP]], hot_honey:[['dip2oz',1],['hot_honey_g',1]],
 dinner_roll:[['dinner_rolls',2]], mac:[['round500',1,true],['mac_sauce',1]],
 combo1:[['lp24',1,true],['dinner_rolls',1]], combo2:[['lp24',1,true]], combo3:[['lp24',1,true]], mozz:[['lp24',1,true]], loaded_fries:[['lp24',1,true]],
 _order:[['takeaway_bags',1,true]],
};

// ---- Online orders (Supabase project moes-online-orders). URL + anon key are PUBLIC (same as the website);
// access to orders requires signing in as the POS auth user (password entered once in Settings, never bundled).
export const ONLINE_DEFAULT={url:'https://qviqafndnhwpwnaqhfya.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aXFhZm5kbmh3cHduYXFoZnlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODYzMTEsImV4cCI6MjEwODc2MjMxMX0.CUXZlvl2IXCj7DARIsDdgBXqJVRf_pG8X7FBtHCHC1s',email:'pos@moes.local',pollMs:20000};
// Website item_id -> POS store menu id
export const WEB_ITEM_MAP={combo_1:'combo1',combo_2:'combo2',combo_3:'combo3',loaded_fries:'loaded_fries',mozzarella_sticks_3:'mozz',mac_n_cheese:'mac',
  addon_dinner_roll:'dinner_roll',addon_extra_sauce:'moes_sauce',addon_hot_honey:'hot_honey',drink_baja_blast:'baja',drink_lemonade:'lemonade',drink_arizona_iced_tea:'arizona',dessert_glazed_donut:'donut'};
export const POS_TO_WEB=Object.fromEntries(Object.entries(WEB_ITEM_MAP).map(([w,p])=>[p,w]));
export const EXTRA_PAY_NAMES={rider_fare:'Delivery charge (passed to Speedway)',speedway_due:'Speedway owes (pays later)',pay_later:'Pay Later'};
