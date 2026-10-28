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
 {id:'waqar',name:'Waqar',role:'cashier',pin:'4444'},{id:'shan',name:'Shan',role:'kitchen',pin:'5555'},{id:'amir',name:'Amir',role:'kitchen',pin:'6666'}];
export const POLICY={staffMealPct:30,cashierMaxDiscountPct:10,cashierCanRefund:true,lateMinutes:15,fpCommissionPct:23,gstOn:false,gstPct:0};
export const EXPENSE_CODES=[
 ['5000','Chicken/Poultry'],['5010','Produce'],['5020','Dry Goods'],['5030','Dairy'],['5040','Bread & Bakery'],['5050','Oil & Spices'],['5100','Beverage Cost'],['5200','Packaging & To-Go'],
 ['6000','Payroll'],['6100','Rent'],['6200','Electric'],['6210','Gas'],['6220','Water'],['6230','Internet & Phone'],['6300','Delivery App Fees'],['6320','Bank Fees'],['6330','Delivery & Transport'],
 ['6400','Equipment & Repairs'],['6410','Cleaning'],['6430','Smallwares'],['6500','Marketing'],['6510','Mashion Event'],['6800','POS & Software'],['6820','Office Supplies'],['6990','Misc'],
 ['DRAW','Partner Drawings (non-expense)'],['LOAN-IB','Ibrahim Loan (non-expense)']].map(([code,name])=>({code,name}));
export const LOCATIONS=[{id:'home',name:'Home'},{id:'main',name:'Main Branch'},{id:'mashion',name:'Mashion stall'}];
const I=(id,name,unit,pack,packUnit,reorder,supplier='',o={})=>({id,name,unit,packSize:pack,packLabel:packUnit,reorderLevel:reorder,supplier,costPerUnit:0,reorderFlag:false,...o});
export const INVENTORY=[
 I('chicken','Chicken breast (boneless)','g',1000,'kg',0,'Ali Chicken'),
 I('ready_tenders','Ready tenders','pc',90,'batch',30,'Home prep'),
 I('ready_mozz','Ready mozzarella sticks','pc',35,'batch',15,'Home prep'),
 I('mac_portion','Mac portion (sauce+pasta)','portion',6,'batch',6,'Home prep'),
 I('slider_buns','Slider buns','pc',4,'pkt of 4',8,'Khawar (Rs170/pkt)'),
 I('dinner_rolls','NECOS dinner rolls','pc',12,'pack of 12',12,'NECOS (order by 5PM)'),
 I('pickles','Pickles','g',1000,'kg',500,'Kamran Bhai'),
 I('fries','Fries (straight)','g',1000,'kg',2000,'Branch'),
 I('moes_sauce_g',"Moe's sauce (ready)",'cup',1,'2oz cup',20,'Home prep'),
 I('white_sauce_g','White sauce (ready)','cup',1,'2oz cup',20,'Home prep'),
 I('hot_honey_g','Hot honey (ready)','cup',1,'2oz cup',20,'Home prep'),
 I('baja_mix','Baja Blast mix (40% Dew/40% 7up/20% Gatorade)','ml',1500,'bottle',2000,'Branch'),
 I('cup12','12oz cups','pc',50,'sleeve',20,'Zia / Abdul Bari'),
 I('straws','Straws','pc',100,'pack',50,'Zia / Abdul Bari'),
 I('drink_bags','Drink bags','pc',100,'pack',20,'Zia / Abdul Bari'),
 I('butter_paper','Butter paper','pc',100,'pack',20,'Abdul Bari'),
 I('dip2oz','2oz dip cups','pc',100,'pack',50,'Zia / Delhi Colony'),
 I('lp24','LP24 boxes','pc',50,'pack',25,'Abdul Bari'),
 I('round500','500ml round boxes','pc',50,'pack',10,'Abdul Bari'),
 I('takeaway_bags','Takeaway bags','pc',100,'pack of 100 (~Rs2500)',25,'Abdul Bari'),
 I('oil','Cooking oil','L',10,'can',10,'Branch',{reorderFlag:true}),
 I('gas','Gas cylinder','pc',1,'cylinder',1,'Branch',{reorderFlag:true}),
];
// Per-item usage (Supply, non-confidential): consumables per unit sold. takeaway:true = only for takeaway/delivery.
export const USAGE={
 baja:[['cup12',1],['straws',1],['baja_mix',230],['drink_bags',1,true],['butter_paper',1,true]],
 moes_sauce:[['dip2oz',1],['moes_sauce_g',1]], white_sauce:[['dip2oz',1],['white_sauce_g',1]], hot_honey:[['dip2oz',1],['hot_honey_g',1]],
 dinner_roll:[['dinner_rolls',2]], mac:[['round500',1,true]],
 combo1:[['lp24',1,true],['dinner_rolls',1]], combo2:[['lp24',1,true]], combo3:[['lp24',1,true]], mozz:[['lp24',1,true]], loaded_fries:[['lp24',1,true]],
 _order:[['takeaway_bags',1,true]],
};
