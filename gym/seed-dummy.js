const db = require('./src/db/database');

console.log('Clearing existing dummy data...');
// Clear existing data (optional, but good for a fresh 1-year seed)
try {
  db.db.exec("DELETE FROM attendance");
  db.db.exec("DELETE FROM payments");
  db.db.exec("DELETE FROM memberships");
  db.db.exec("DELETE FROM members");
  // reset sqlite sequence for clean IDs
  db.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('attendance', 'payments', 'memberships', 'members')");
} catch (e) {
  console.log('Error clearing data:', e.message);
}

// 1. Seed Plans
console.log('Seeding plans...');
try {
  db.db.prepare("INSERT OR IGNORE INTO plans (id, plan_name, duration_value, duration_type, regular_price) VALUES (1, 'Monthly', 1, 'MONTH', 3000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (id, plan_name, duration_value, duration_type, regular_price) VALUES (2, 'Quarterly', 3, 'MONTH', 8000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (id, plan_name, duration_value, duration_type, regular_price) VALUES (3, 'Half-Yearly', 6, 'MONTH', 15000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (id, plan_name, duration_value, duration_type, regular_price) VALUES (4, 'Yearly', 12, 'MONTH', 25000)").run();
} catch (e) {
  console.log('Plans already exist or error:', e.message);
}

const plans = [
  { id: 1, name: 'Monthly', price: 3000, months: 1 },
  { id: 2, name: 'Quarterly', price: 8000, months: 3 },
  { id: 3, name: 'Half-Yearly', price: 15000, months: 6 },
  { id: 4, name: 'Yearly', price: 25000, months: 12 }
];

const insertMember = db.db.prepare(`
  INSERT INTO members (full_name, phone, email, join_date, duration_months, expiry_date, plan_type, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMembership = db.db.prepare(`
  INSERT INTO memberships (member_id, plan_id, plan_name_snapshot, start_date, end_date, original_price, final_payable_amount, payment_due_date, membership_status, payment_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPayment = db.db.prepare(`
  INSERT INTO payments (member_id, membership_id, amount, payment_method, payment_date, receipt_number, payment_status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertAttendance = db.db.prepare(`
  INSERT INTO attendance (member_id, check_in_time, date, shift)
  VALUES (?, ?, ?, ?)
`);

const firstNames = ['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia', 'Kevin', 'Lily', 'Mason', 'Nora', 'Oliver', 'Penny', 'Quinn', 'Rachel', 'Sam', 'Tina', 'Ursula', 'Victor', 'Wendy', 'Xander', 'Yvonne', 'Zack', 'Ram', 'Sita', 'Hari', 'Gita', 'Shyam', 'Radha', 'Kiran', 'Pooja', 'Ravi', 'Sunita', 'Amit', 'Anju', 'Nitin', 'Nisha', 'Rahul', 'Riya', 'Vikram', 'Vandana', 'Deepak', 'Divya', 'Suresh', 'Sushma'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Thapa', 'Karki', 'Magar', 'Gurung', 'Tamang', 'Rai', 'Limbu', 'Shrestha', 'Maharjan', 'Sherpa', 'Lama', 'Yadav', 'Chaudhary', 'Giri', 'Puri', 'Joshi', 'Bhattarai', 'Adhikari', 'Nepal', 'Poudel', 'Dahal', 'Bista'];
const paymentMethods = ['Cash', 'QR', 'Card', 'Bank Transfer'];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDateStr(d) {
  const pad = (n) => n.toString().padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatDateTimeStr(d) {
  const pad = (n) => n.toString().padStart(2, '0');
  return formatDateStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

const today = new Date();
const oneYearAgo = new Date();
oneYearAgo.setFullYear(today.getFullYear() - 1);

console.log('Generating 50+ members over 1 year...');

let receiptCounter = 10000;
const memberIds = [];

for (let i = 0; i < 60; i++) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const fullName = firstName + ' ' + lastName;
  const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const email = firstName.toLowerCase() + '.' + lastName.toLowerCase() + '@example.com';
  
  // Pick a join date sometime in the last year
  const joinDate = randomDate(oneYearAgo, today);
  
  // They will have a history of memberships starting from joinDate
  let currentStart = new Date(joinDate);
  let status = 'active';
  let memberId = null;
  let finalExpiry = new Date(currentStart);
  let lastPlan = plans[0];
  
  // Generate memberships loop until we reach 'today' or they churn
  let isFirst = true;
  while (currentStart <= today) {
    const plan = plans[Math.floor(Math.random() * plans.length)];
    lastPlan = plan;
    
    let currentEnd = new Date(currentStart);
    currentEnd.setMonth(currentStart.getMonth() + plan.months);
    finalExpiry = new Date(currentEnd);
    
    if (isFirst) {
      // Create member record first time
      const mInfo = insertMember.run(fullName, phone, email, formatDateStr(joinDate), plan.months, formatDateStr(currentEnd), plan.name, 'active');
      memberId = mInfo.lastInsertRowid;
      memberIds.push(memberId);
      isFirst = false;
    }
    
    // Membership Status
    let msStatus = 'EXPIRED';
    if (currentEnd > today) msStatus = 'ACTIVE';
    
    // Payment Status
    const isPaid = Math.random() > 0.1; // 90% chance to pay
    const payStatus = isPaid ? 'PAID' : 'UNPAID';
    
    const msInfo = insertMembership.run(
      memberId, plan.id, plan.name, 
      formatDateStr(currentStart), formatDateStr(currentEnd), 
      plan.price, plan.price, formatDateStr(currentStart), 
      msStatus, payStatus
    );
    
    // Payment
    if (isPaid) {
      const pm = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const pDate = new Date(currentStart);
      pDate.setHours(10 + Math.floor(Math.random() * 6));
      insertPayment.run(memberId, msInfo.lastInsertRowid, plan.price, pm, formatDateTimeStr(pDate), 'RCPT-' + (receiptCounter++), 'COMPLETED');
    }
    
    // Random chance to churn (30% chance they don't renew if it's past expiry)
    if (currentEnd < today && Math.random() < 0.3) {
      status = 'expired';
      break; 
    }
    
    // Advance to next term (maybe they renewed exactly on end date, or a few days late)
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + Math.floor(Math.random() * 5));
  }
  
  // Update member final status and expiry
  if (finalExpiry < today) status = 'expired';
  db.db.prepare('UPDATE members SET expiry_date = ?, status = ?, duration_months = ?, plan_type = ? WHERE id = ?').run(
    formatDateStr(finalExpiry), status, lastPlan.months, lastPlan.name, memberId
  );
}

console.log('Generating 1 year of attendance logs...');
// Generate attendance for the last 365 days
for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
  const dateStr = formatDateStr(d);
  
  // Pick 5 to 15 random members to attend this day
  const attendersCount = 5 + Math.floor(Math.random() * 11);
  const shuffled = [...memberIds].sort(() => 0.5 - Math.random());
  const todaysAttenders = shuffled.slice(0, attendersCount);
  
  for (const memberId of todaysAttenders) {
    const shift = Math.random() > 0.4 ? 'morning' : 'day';
    let hour = shift === 'morning' ? 6 + Math.floor(Math.random() * 4) : 16 + Math.floor(Math.random() * 4);
    let min = Math.floor(Math.random() * 60);
    
    const checkIn = new Date(d);
    checkIn.setHours(hour, min, 0, 0);
    
    // Only insert if member actually joined before this date
    const member = db.db.prepare("SELECT join_date FROM members WHERE id = ?").get(memberId);
    if (new Date(member.join_date) <= d) {
      insertAttendance.run(memberId, formatDateTimeStr(checkIn), dateStr, shift);
    }
  }
}

console.log('Updating statuses internally...');
try {
  db.updateMembershipStatuses();
} catch (e) {
  // ignore
}

console.log('✅ Realistic 1-Year Data Seeded Successfully!');
