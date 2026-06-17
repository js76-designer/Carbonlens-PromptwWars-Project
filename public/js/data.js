// ─────────────────────────────────────────
//  data.js — App constants & helpers
// ─────────────────────────────────────────

const CATEGORIES = [
  { id:"travel", label:"Travel",   icon:"✈️", color:"#1A5C44", bg:"#D8F3DC", kgPer:0.21, unit:"km",    options:["Car ride","Flight","Train","Bus","Motorcycle","Taxi/Uber"] },
  { id:"food",   label:"Food",     icon:"🥗", color:"#7C4A1E", bg:"#FEF3C7", kgPer:8,    unit:"meals",  options:["Beef meal","Lamb meal","Pork meal","Chicken meal","Fish meal","Vegetarian","Vegan"] },
  { id:"energy", label:"Energy",   icon:"⚡", color:"#1E4D7C", bg:"#DBEAFE", kgPer:0.5,  unit:"kWh",   options:["Heating","AC","Washing machine","Dryer","Dishwasher","Lighting","Hot water"] },
  { id:"goods",  label:"Shopping", icon:"🛍️", color:"#5B2D7C", bg:"#EDE9FE", kgPer:5,    unit:"items",  options:["Clothing","Electronics","Furniture","Cosmetics","Books","Appliances","Toys"] },
];

const ACTIONS = [
  { id:"a1", title:"Switch to plant-based 3×/week",    saving:420, category:"food",   difficulty:"Easy"   },
  { id:"a2", title:"Take train instead of flying",      saving:890, category:"travel", difficulty:"Medium" },
  { id:"a3", title:"Lower thermostat by 2°C",           saving:210, category:"energy", difficulty:"Easy"   },
  { id:"a4", title:"Buy secondhand clothing",            saving:145, category:"goods",  difficulty:"Easy"   },
  { id:"a5", title:"Cycle or walk for short trips",      saving:380, category:"travel", difficulty:"Easy"   },
  { id:"a6", title:"Use cold water for laundry",         saving:95,  category:"energy", difficulty:"Easy"   },
  { id:"a7", title:"Cut one transatlantic flight/yr",    saving:1600,category:"travel", difficulty:"Hard"   },
  { id:"a8", title:"Switch to renewable energy tariff",  saving:730, category:"energy", difficulty:"Medium" },
];

const QUIZ_QUESTIONS = [
  { id:"q1", category:"🥗 Food",     q:"How often do you eat meat?",             opts:[{l:"Daily",i:"🍖"},{l:"A few times/week",i:"🥩"},{l:"Rarely",i:"🥗"},{l:"Never",i:"🌱"}],          scores:[3,2,1,0] },
  { id:"q2", category:"✈️ Travel",   q:"How do you usually commute?",             opts:[{l:"Drive alone",i:"🚗"},{l:"Carpool/bus",i:"🚌"},{l:"Train/metro",i:"🚆"},{l:"Cycle/walk",i:"🚶"}], scores:[3,2,1,0] },
  { id:"q3", category:"✈️ Travel",   q:"How often do you fly per year?",          opts:[{l:"Monthly+",i:"✈️"},{l:"A few times",i:"🛫"},{l:"Once/year",i:"🗓️"},{l:"Never",i:"🚫"}],         scores:[3,2,1,0] },
  { id:"q4", category:"⚡ Energy",   q:"What powers your home?",                  opts:[{l:"Coal/gas",i:"🏭"},{l:"Mixed grid",i:"🔌"},{l:"Partly renewable",i:"☀️"},{l:"Fully renewable",i:"💚"}], scores:[3,2,1,0] },
  { id:"q5", category:"🛍️ Shopping", q:"How often do you buy new clothes?",       opts:[{l:"Weekly",i:"🛍️"},{l:"Monthly",i:"📦"},{l:"Seasonally",i:"🍂"},{l:"Rarely/secondhand",i:"♻️"}], scores:[3,2,1,0] },
];

// Compute annual footprint from quiz score array
function calcAnnual(scores) {
  const total = scores.reduce((a,b) => a+b, 0);
  return 2200 + total * 950;
}

// Rating from annual kg
function getRating(kg) {
  if (kg < 3000) return { label:"Low impact",  color:"#52B788", bg:"#D8F3DC" };
  if (kg < 7000) return { label:"Average",     color:"#D4712A", bg:"#FEF3C7" };
  return               { label:"High impact", color:"#B5381E", bg:"#FEE2E2" };
}

// Get category object by id
function getCat(id) { return CATEGORIES.find(c => c.id === id); }

// Compute estimated CO2 from qty and category
function estimateCO2(catId, qty) {
  const cat = getCat(catId);
  return cat ? Math.round(qty * cat.kgPer) : 0;
}

// Date label
function todayLabel() {
  return new Date().toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

// Format date nicely
function fmtDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
