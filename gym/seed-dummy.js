const db = require('./src/db/database');

console.log('🚀 Starting Comprehensive 2-Year Database Seed...');
console.log('Target: ~250 Active Members, Monthly fee NPR 2000, Admission fee NPR 500, Adjusted Quarterly/Yearly plans, 2 full years of daily data.\n');

// ─── 1. Reset Database ──────────────────────────────────────
try {
  db.db.exec("BEGIN TRANSACTION;");
  db.db.exec("DELETE FROM attendance;");
  db.db.exec("DELETE FROM payments;");
  db.db.exec("DELETE FROM payment_adjustments;");
  db.db.exec("DELETE FROM membership_status_history;");
  db.db.exec("DELETE FROM memberships;");
  db.db.exec("DELETE FROM logistics_transactions;");
  db.db.exec("DELETE FROM logistics;");
  db.db.exec("DELETE FROM notifications;");
  db.db.exec("DELETE FROM packages;");
  db.db.exec("DELETE FROM plans;");
  db.db.exec("DELETE FROM members;");
  db.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('attendance', 'payments', 'memberships', 'members', 'logistics', 'logistics_transactions', 'packages', 'plans', 'notifications');");
  db.db.exec("COMMIT;");
  console.log('✓ Cleared old tables and reset auto-increment counters.');
} catch (e) {
  try { db.db.exec("ROLLBACK;"); } catch(_) {}
  console.error('Error clearing data:', e.message);
}

// ─── 2. Seed Plans & Packages with User's Pricing ────────────
console.log('✓ Seeding plans with requested pricing...');
const plans = [
  { id: 1, name: 'Monthly', months: 1, type: 'MONTH', price: 2000, desc: 'Standard 1-month fitness access' },
  { id: 2, name: 'Quarterly', months: 3, type: 'MONTH', price: 5500, desc: '3-month saver membership (save NPR 500)' },
  { id: 3, name: 'Half-Yearly', months: 6, type: 'MONTH', price: 10000, desc: '6-month semi-annual membership (save NPR 2,000)' },
  { id: 4, name: 'Yearly', months: 12, type: 'MONTH', price: 18000, desc: '12-month VIP annual membership (save NPR 6,000)' }
];

const ADMISSION_FEE = 500;

try {
  db.db.exec("BEGIN TRANSACTION;");
  for (const p of plans) {
    db.db.prepare("INSERT INTO plans (id, plan_name, description, duration_value, duration_type, regular_price, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)")
      .run(p.id, p.name, p.desc, p.months, p.type, p.price);
    db.db.prepare("INSERT INTO packages (id, name, duration_months, price) VALUES (?, ?, ?, ?)")
      .run(p.id, p.name, p.months, p.price);
  }
  db.db.exec("COMMIT;");
} catch (e) {
  try { db.db.exec("ROLLBACK;"); } catch(_) {}
  console.error('Error inserting plans:', e.message);
}

// ─── 3. Seed Logistics Products ──────────────────────────────
console.log('✓ Seeding gym logistics & supplement inventory...');
const logisticsItems = [
  { name: 'Optimum Nutrition Gold Whey (2kg)', price: 8500, quantity: 24, image: '/images/products/whey.png' },
  { name: 'MuscleTech Platinum Creatine (300g)', price: 2800, quantity: 35, image: '/images/products/creatine.png' },
  { name: 'C4 Original Pre-Workout (30 Servings)', price: 3600, quantity: 18, image: '/images/products/preworkout.png' },
  { name: 'Scivation Xtend BCAA (30 Servings)', price: 3200, quantity: 20, image: '/images/products/bcaa.png' },
  { name: 'Fitness Hub Heavy Duty Lifting Straps', price: 650, quantity: 45, image: '/images/products/straps.png' },
  { name: 'Fitness Hub Steel Shaker Bottle (750ml)', price: 750, quantity: 50, image: '/images/products/shaker.png' },
  { name: 'Quick-Dry Gym Microfiber Towel', price: 450, quantity: 60, image: '/images/products/towel.png' }
];

try {
  db.db.exec("BEGIN TRANSACTION;");
  const insertLogistics = db.db.prepare("INSERT INTO logistics (name, price, quantity, image_path) VALUES (?, ?, ?, ?)");
  for (const item of logisticsItems) {
    insertLogistics.run(item.name, item.price, item.quantity, item.image);
  }
  db.db.exec("COMMIT;");
} catch (e) {
  try { db.db.exec("ROLLBACK;"); } catch(_) {}
}

// ─── Prepared Statements ────────────────────────────────────
const insertMember = db.db.prepare(`
  INSERT INTO members (member_code, full_name, phone, email, address, gender, date_of_birth, first_joining_date, emergency_contact_name, emergency_contact_phone, join_date, duration_months, expiry_date, plan_type, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMembership = db.db.prepare(`
  INSERT INTO memberships (member_id, plan_id, plan_name_snapshot, start_date, end_date, original_price, discount_type, discount_amount, final_payable_amount, payment_due_date, membership_status, payment_status, renewed_from_membership_id, notes, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPayment = db.db.prepare(`
  INSERT INTO payments (member_id, membership_id, amount, payment_method, payment_date, transaction_reference, receipt_number, notes, payment_status, recorded_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAttendance = db.db.prepare(`
  INSERT INTO attendance (member_id, check_in_time, date, shift)
  VALUES (?, ?, ?, ?)
`);

const insertLogisticsTx = db.db.prepare(`
  INSERT INTO logistics_transactions (product_id, type, quantity, price, notes, date)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// ─── Name and Address Pools ─────────────────────────────────
const firstNamesMale = [
  'Aarav', 'Bikash', 'Saurav', 'Rohan', 'Kiran', 'Suman', 'Bipin', 'Roshan', 'Manish', 'Nabin',
  'Prakash', 'Dipesh', 'Ashish', 'Suraj', 'Anil', 'Subash', 'Sunil', 'Rajesh', 'Bibek', 'Prabesh',
  'Sandesh', 'Sagar', 'Umesh', 'Ramesh', 'Ganesh', 'Mahesh', 'Santosh', 'Dinesh', 'Kushal', 'Bijay',
  'Alex', 'David', 'James', 'Michael', 'Daniel', 'Chris', 'Kevin', 'Robert', 'Ryan', 'Jason',
  'Amit', 'Rahul', 'Deepak', 'Vikram', 'Suresh', 'Kunal', 'Abhishek', 'Nitin', 'Alok', 'Prashant'
];

const firstNamesFemale = [
  'Aayusha', 'Puja', 'Sita', 'Gita', 'Rita', 'Anita', 'Sunita', 'Manju', 'Samikshya', 'Prakriti',
  'Shristi', 'Sneha', 'Pratima', 'Bandana', 'Susmita', 'Anjali', 'Rashmi', 'Kritika', 'Nisha', 'Alisha',
  'Srijana', 'Sabina', 'Sarita', 'Bimla', 'Kalpana', 'Rekha', 'Pooja', 'Menuka', 'Rejina', 'Sujata',
  'Sarah', 'Emma', 'Jessica', 'Emily', 'Rachel', 'Laura', 'Ashley', 'Olivia', 'Hannah', 'Sophia',
  'Priya', 'Riya', 'Neha', 'Divya', 'Ananya', 'Kavita', 'Swati', 'Archana', 'Meera', 'Roshni'
];

const lastNames = [
  'Adhikari', 'Bhandari', 'Bhattarai', 'Chaudhary', 'Dahal', 'Giri', 'Gurung', 'Joshi', 'Karki', 'Khadka',
  'Lama', 'Limbu', 'Magar', 'Maharjan', 'Nepal', 'Pandey', 'Poudel', 'Puri', 'Rai', 'Rana',
  'Rijal', 'Sapkota', 'Sharma', 'Shrestha', 'Silwal', 'Tamang', 'Thapa', 'Upadhyay', 'Yadav', 'Bista',
  'Acharya', 'Gautam', 'Koirala', 'Regmi', 'Basnet', 'Subedi', 'Ghimire', 'Neupane', 'Kattel', 'Bhatia'
];

const addresses = [
  'Kathmandu, Baneshwor', 'Kathmandu, Koteshwor', 'Kathmandu, Thamel', 'Kathmandu, Putalisadak',
  'Kathmandu, Chabahil', 'Kathmandu, Kalanki', 'Kathmandu, Maharajgunj', 'Kathmandu, Baluwatar',
  'Lalitpur, Jhamsikhel', 'Lalitpur, Kumaripati', 'Lalitpur, Pulchowk', 'Lalitpur, Satdobato',
  'Bhaktapur, Sallaghari', 'Bhaktapur, Suryabinayak', 'Bhaktapur, Durbar Square', 'Pokhara, Lakeside',
  'Kathmandu, Sinamangal', 'Kathmandu, Maitidevi', 'Kathmandu, Dhumbarahi', 'Lalitpur, Sanepa'
];

const paymentMethods = ['Cash', 'QR', 'Bank Transfer', 'Card'];

// ─── Helpers ────────────────────────────────────────────────
function pad(n) { return n.toString().padStart(2, '0'); }
function formatDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function formatDateTime(d) { return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(start, end) { return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())); }

const today = new Date('2026-09-17T12:00:00Z');
const twoYearsAgo = new Date('2024-09-17T00:00:00Z');

// ─── 4. Seed Members, Memberships & Payments ─────────────────
console.log('✓ Generating 330 members across 2 years (~250 actively active, ~80 historical)...');

let receiptCounter = 10001;
const allMembers = []; // store { id, joinDate, memberships: [{ start, end, status }] }

db.db.exec("BEGIN TRANSACTION;");

const TOTAL_MEMBERS = 330; // ~255 active, ~75 expired
const TARGET_ACTIVE = 252;

for (let i = 1; i <= TOTAL_MEMBERS; i++) {
  const isTargetActive = i <= TARGET_ACTIVE;
  const isMale = Math.random() > 0.45;
  const firstName = isMale ? randomItem(firstNamesMale) : randomItem(firstNamesFemale);
  const lastName = randomItem(lastNames);
  const fullName = `${firstName} ${lastName}`;
  const phone = '98' + randomInt(10000000, 99999999);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 99)}@example.com`;
  const address = randomItem(addresses);
  const gender = isMale ? 'male' : 'female';
  
  // Date of birth (18 to 45 years old)
  const dobYear = 2026 - randomInt(18, 48);
  const dob = `${dobYear}-${pad(randomInt(1, 12))}-${pad(randomInt(1, 28))}`;
  
  // Join Date: spread over the past 2 years
  // Active members might have joined anytime between 2 years ago and this week
  // Expired members joined between 24 and 6 months ago
  let joinDate;
  if (isTargetActive) {
    joinDate = randomDate(twoYearsAgo, new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000));
  } else {
    const maxExpireJoin = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000);
    joinDate = randomDate(twoYearsAgo, maxExpireJoin);
  }

  const memberCode = `FH-${String(i).padStart(6, '0')}`;
  const emergencyName = isMale ? `${randomItem(firstNamesFemale)} ${lastName} (Mother/Wife)` : `${randomItem(firstNamesMale)} ${lastName} (Father/Husband)`;
  const emergencyPhone = '98' + randomInt(10000000, 99999999);

  // Insert initial member row
  const mRes = insertMember.run(
    memberCode, fullName, phone, email, address, gender, dob,
    formatDate(joinDate), emergencyName, emergencyPhone,
    formatDate(joinDate), 1, formatDate(joinDate), 'Monthly', 'active', 'Standard member'
  );
  const memberId = mRes.lastInsertRowid;

  // Build membership renewal history from joinDate up to today
  let currentStart = new Date(joinDate);
  let prevMembershipId = null;
  const memberHistory = [];
  let isFirstTerm = true;
  let finalExpiry = new Date(currentStart);
  let finalPlan = plans[0];

  while (true) {
    // Choose plan (weighted towards Monthly 55%, Quarterly 25%, Half-Yearly 12%, Yearly 8%)
    const roll = Math.random();
    let plan = plans[0];
    if (roll > 0.92) plan = plans[3]; // Yearly
    else if (roll > 0.80) plan = plans[2]; // Half-Yearly
    else if (roll > 0.55) plan = plans[1]; // Quarterly

    finalPlan = plan;
    let currentEnd = new Date(currentStart);
    currentEnd.setMonth(currentEnd.getMonth() + plan.months);

    // If this is an active target member and currentEnd would be before today on the last iteration,
    // ensure their current membership extends into the future!
    if (isTargetActive && currentEnd <= today && Math.random() < 0.25 && (today.getTime() - currentStart.getTime() < 60 * 24 * 60 * 60 * 1000)) {
      // Push end date into future
      currentEnd = new Date(today.getTime() + randomInt(10, 180) * 24 * 60 * 60 * 1000);
    }

    finalExpiry = new Date(currentEnd);

    // Membership Status
    let mStatus = 'EXPIRED';
    if (currentEnd > today) {
      mStatus = 'ACTIVE';
    }

    // Pricing & Admission fee for first term
    let originalPrice = plan.price;
    let payablePrice = plan.price;
    let noteText = '';
    if (isFirstTerm) {
      payablePrice += ADMISSION_FEE;
      noteText = `Includes NPR ${ADMISSION_FEE} New Admission Fee.`;
    }

    // Payment Status
    // 88% Fully Paid, 7% Partial, 5% Unpaid
    const payRoll = Math.random();
    let pStatus = 'PAID';
    let paidAmount = payablePrice;
    let dueDate = formatDate(currentStart);

    if (mStatus === 'ACTIVE') {
      if (payRoll > 0.93) {
        pStatus = 'UNPAID';
        paidAmount = 0;
        dueDate = formatDate(new Date(currentStart.getTime() + 7 * 24 * 60 * 60 * 1000));
      } else if (payRoll > 0.85) {
        pStatus = 'PARTIALLY_PAID';
        paidAmount = Math.round(payablePrice * 0.5); // 50% paid
        dueDate = formatDate(new Date(currentStart.getTime() + 14 * 24 * 60 * 60 * 1000));
      }
    }

    const msRes = insertMembership.run(
      memberId, plan.id, plan.name,
      formatDate(currentStart), formatDate(currentEnd),
      originalPrice, 'NONE', 0, payablePrice,
      dueDate, mStatus, pStatus,
      prevMembershipId, noteText, 'Admin'
    );
    const membershipId = msRes.lastInsertRowid;
    prevMembershipId = membershipId;

    memberHistory.push({
      start: new Date(currentStart),
      end: new Date(currentEnd),
      status: mStatus
    });

    // Record Payment transaction
    if (paidAmount > 0) {
      const pm = randomItem(paymentMethods);
      const pDate = new Date(currentStart);
      pDate.setHours(randomInt(7, 20), randomInt(0, 59), randomInt(0, 59));
      const ref = pm === 'Cash' ? 'CASH-' + randomInt(1000, 9999) : 'TXN-' + randomInt(100000, 999999);
      
      insertPayment.run(
        memberId, membershipId, paidAmount, pm,
        formatDateTime(pDate), ref, `RCPT-${receiptCounter++}`,
        isFirstTerm ? 'Initial Admission & Membership Fee' : 'Renewal Payment',
        'COMPLETED', 'Admin'
      );
    }

    isFirstTerm = false;

    // Check if we should stop looping:
    // If target is active, we loop until currentEnd > today
    if (isTargetActive) {
      if (currentEnd > today) break;
      // Advance to next renewal
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + randomInt(0, 3));
    } else {
      // If target is expired, we stop if currentEnd > some past date or random churn
      if (currentEnd > new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) || Math.random() < 0.4) {
        break;
      }
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + randomInt(1, 10));
      if (currentStart > new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000)) break;
    }
  }

  // Final member table status update
  const finalMemberStatus = finalExpiry > today ? 'active' : 'expired';
  db.db.prepare(`
    UPDATE members 
    SET expiry_date = ?, status = ?, duration_months = ?, plan_type = ?
    WHERE id = ?
  `).run(formatDate(finalExpiry), finalMemberStatus, finalPlan.months, finalPlan.name, memberId);

  allMembers.push({
    id: memberId,
    joinDate: joinDate,
    finalExpiry: finalExpiry,
    history: memberHistory
  });
}

db.db.exec("COMMIT;");
console.log(`✓ Seeded ${allMembers.length} members with multi-term payment histories.`);

// ─── 5. Seed 2 Years of Daily Attendance ─────────────────────
console.log('✓ Generating 2 full years (730 days) of realistic daily attendance logs...');

db.db.exec("BEGIN TRANSACTION;");

let totalAttendanceCount = 0;
const curDate = new Date(twoYearsAgo);

while (curDate <= today) {
  const dateStr = formatDate(curDate);
  const dayOfWeek = curDate.getDay(); // 0 = Sun, 6 = Sat
  
  // Find which members were active on curDate
  const eligibleMemberIds = [];
  for (const m of allMembers) {
    if (m.joinDate <= curDate && m.finalExpiry >= curDate) {
      eligibleMemberIds.push(m.id);
    }
  }

  // Attendance volume: weekdays 55-95 check-ins, Saturdays 30-55 check-ins
  let targetCheckins = dayOfWeek === 6 ? randomInt(25, 45) : randomInt(55, 95);
  targetCheckins = Math.min(targetCheckins, eligibleMemberIds.length);

  // Pick random subset of eligible members for today
  // Shuffle array slice
  for (let j = eligibleMemberIds.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [eligibleMemberIds[j], eligibleMemberIds[k]] = [eligibleMemberIds[k], eligibleMemberIds[j]];
  }

  const todaysAttendees = eligibleMemberIds.slice(0, targetCheckins);

  for (const mid of todaysAttendees) {
    // 60% Morning shift (6:00 AM - 10:30 AM), 40% Day/Evening shift (4:00 PM - 8:30 PM)
    const isMorning = Math.random() < 0.60;
    const shift = isMorning ? 'morning' : 'day';
    
    let hour, min;
    if (isMorning) {
      hour = randomInt(6, 9);
      min = randomInt(0, 59);
    } else {
      hour = randomInt(16, 20);
      min = randomInt(0, 59);
    }

    const checkInTime = new Date(curDate);
    checkInTime.setHours(hour, min, randomInt(0, 59), 0);

    insertAttendance.run(mid, formatDateTime(checkInTime), dateStr, shift);
    totalAttendanceCount++;
  }

  // Advance by 1 day
  curDate.setDate(curDate.getDate() + 1);
}

db.db.exec("COMMIT;");
console.log(`✓ Seeded ${totalAttendanceCount.toLocaleString()} attendance check-ins across 730 days.`);

// ─── 6. Seed 2 Years of Product Sales Transactions ───────────
console.log('✓ Seeding 2 years of supplement/product sales transactions...');
db.db.exec("BEGIN TRANSACTION;");

const sampleProducts = db.db.prepare("SELECT id, name, price FROM logistics").all();
let txDate = new Date(twoYearsAgo);

while (txDate <= today) {
  // 35% chance of product sale on any given day
  if (Math.random() < 0.35 && sampleProducts.length > 0) {
    const prod = randomItem(sampleProducts);
    const qty = randomInt(1, 3);
    const totalPrice = prod.price * qty;
    const isMemberSale = Math.random() > 0.3;
    const buyerId = isMemberSale ? randomItem(allMembers).id : null;
    const notes = isMemberSale ? `Sold to member ID #${buyerId}` : 'Walk-in customer purchase';
    
    const saleTime = new Date(txDate);
    saleTime.setHours(randomInt(9, 19), randomInt(0, 59), randomInt(0, 59));
    
    insertLogisticsTx.run(prod.id, 'sale', qty, totalPrice, notes, formatDateTime(saleTime));
  }

  // Monthly restock transaction
  if (txDate.getDate() === 1) {
    for (const prod of sampleProducts) {
      const restockQty = randomInt(5, 15);
      insertLogisticsTx.run(prod.id, 'restock', restockQty, prod.price * restockQty * 0.7, 'Bulk vendor restock', formatDateTime(txDate));
    }
  }

  txDate.setDate(txDate.getDate() + 1);
}

db.db.exec("COMMIT;");

// ─── 7. Final Sanity & Status Verification ───────────────────
try {
  db.updateMembershipStatuses();
} catch (e) {}

const finalStats = db.getDashboardStats();
const duesStats = db.getOutstandingDues();

console.log('\n═══════════════════════════════════════════════════════════');
console.log('🎉 2-YEAR DATABASE SEEDING COMPLETED SUCCESSFULLY!');
console.log('═══════════════════════════════════════════════════════════');
console.log(`👥 Total Members:           ${finalStats.total}`);
console.log(`✅ Active Members:          ${finalStats.active} (Target: ~250)`);
console.log(`⏰ Expiring Soon (<7 days):  ${finalStats.expiringSoon}`);
console.log(`❌ Expired Members:         ${finalStats.expired}`);
console.log(`📊 Total Attendance (2 yrs): ${totalAttendanceCount.toLocaleString()} check-ins`);
console.log(`💰 Total Outstanding Dues:  NPR ${duesStats.stats.totalOutstandingAmount.toLocaleString()}`);
console.log('═══════════════════════════════════════════════════════════\n');
