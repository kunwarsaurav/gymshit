const db = require('./src/db/database');

const membersData = [
  { full_name: 'John Doe', phone: '9812345678', email: 'john@example.com', plan_type: 'Monthly', status: 'active', duration_months: 1, price: 3000 },
  { full_name: 'Jane Smith', phone: '9823456789', email: 'jane@example.com', plan_type: 'Quarterly', status: 'active', duration_months: 3, price: 8000 },
  { full_name: 'Alice Johnson', phone: '9834567890', email: 'alice@example.com', plan_type: 'Yearly', status: 'active', duration_months: 12, price: 25000 },
  { full_name: 'Bob Brown', phone: '9845678901', email: 'bob@example.com', plan_type: 'Monthly', status: 'expired', duration_months: 1, price: 3000 },
  { full_name: 'Charlie Davis', phone: '9856789012', email: 'charlie@example.com', plan_type: 'Half-Yearly', status: 'active', duration_months: 6, price: 15000 },
  { full_name: 'Diana Evans', phone: '9867890123', email: 'diana@example.com', plan_type: 'Monthly', status: 'active', duration_months: 1, price: 3000 },
  { full_name: 'Ethan Fox', phone: '9878901234', email: 'ethan@example.com', plan_type: 'Yearly', status: 'active', duration_months: 12, price: 25000 },
  { full_name: 'Fiona Green', phone: '9889012345', email: 'fiona@example.com', plan_type: 'Quarterly', status: 'expired', duration_months: 3, price: 8000 },
  { full_name: 'George Harris', phone: '9890123456', email: 'george@example.com', plan_type: 'Monthly', status: 'active', duration_months: 1, price: 3000 },
  { full_name: 'Hannah Miller', phone: '9801234567', email: 'hannah@example.com', plan_type: 'Half-Yearly', status: 'active', duration_months: 6, price: 15000 }
];

console.log('Seeding members, memberships, and payments...');
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

// Insert default plans
console.log('Seeding plans...');
try {
  db.db.prepare("INSERT OR IGNORE INTO plans (plan_name, duration_value, duration_type, regular_price) VALUES ('Monthly', 1, 'MONTH', 3000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (plan_name, duration_value, duration_type, regular_price) VALUES ('Quarterly', 3, 'MONTH', 8000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (plan_name, duration_value, duration_type, regular_price) VALUES ('Half-Yearly', 6, 'MONTH', 15000)").run();
  db.db.prepare("INSERT OR IGNORE INTO plans (plan_name, duration_value, duration_type, regular_price) VALUES ('Yearly', 12, 'MONTH', 25000)").run();
} catch (e) {
  console.log('Plans already exist or error:', e.message);
}

const memberIds = [];
const today = new Date();

let receiptCounter = 1000;

for (const m of membersData) {
  const joinDate = new Date(today);
  
  if (m.status === 'expired') {
    joinDate.setMonth(today.getMonth() - m.duration_months - 1);
  } else {
    joinDate.setDate(today.getDate() - Math.floor(Math.random() * 20)); // random join date in last 20 days
  }

  const expiryDate = new Date(joinDate);
  expiryDate.setMonth(joinDate.getMonth() + m.duration_months);

  const joinDateStr = joinDate.toISOString().split('T')[0];
  const expiryDateStr = expiryDate.toISOString().split('T')[0];

  const info = insertMember.run(m.full_name, m.phone, m.email, joinDateStr, m.duration_months, expiryDateStr, m.plan_type, m.status);
  const memberId = info.lastInsertRowid;
  memberIds.push(memberId);
  
  // Membership
  let planId = 1;
  if (m.plan_type === 'Quarterly') planId = 2;
  else if (m.plan_type === 'Half-Yearly') planId = 3;
  else if (m.plan_type === 'Yearly') planId = 4;
  
  const paymentStatus = (Math.random() > 0.3) ? 'PAID' : 'UNPAID';
  
  const msInfo = insertMembership.run(
    memberId, planId, m.plan_type, joinDateStr, expiryDateStr, 
    m.price, m.price, joinDateStr, 
    m.status === 'expired' ? 'EXPIRED' : 'ACTIVE', 
    paymentStatus
  );
  
  const membershipId = msInfo.lastInsertRowid;
  
  // Payment
  if (paymentStatus === 'PAID') {
    const paymentDateStr = joinDateStr + ' 10:00:00';
    insertPayment.run(memberId, membershipId, m.price, 'Cash', paymentDateStr, 'RCPT-' + (receiptCounter++), 'COMPLETED');
  }
}

console.log('Seeding attendance...');
const insertAttendance = db.db.prepare(`
  INSERT INTO attendance (member_id, check_in_time, date, shift)
  VALUES (?, ?, ?, ?)
`);

// Generate attendance for last 7 days
for (let i = 0; i < 7; i++) {
  const date = new Date(today);
  date.setDate(today.getDate() - i);
  const dateStr = date.toISOString().split('T')[0];

  // Pick random members to attend
  const attendingMembers = memberIds.filter(() => Math.random() > 0.3); // 70% chance to attend
  
  for (const memberId of attendingMembers) {
    const shift = Math.random() > 0.5 ? 'morning' : 'day';
    let hour, minute;
    if (shift === 'morning') {
      hour = 6 + Math.floor(Math.random() * 4); // 6 AM to 9 AM
    } else {
      hour = 16 + Math.floor(Math.random() * 4); // 4 PM to 7 PM
    }
    minute = Math.floor(Math.random() * 60);
    
    const checkInTime = new Date(date);
    checkInTime.setHours(hour, minute, 0, 0);
    
    const pad = (n) => n.toString().padStart(2, '0');
    const checkInTimeStr = checkInTime.getFullYear() + '-' + pad(checkInTime.getMonth() + 1) + '-' + pad(checkInTime.getDate()) + ' ' + pad(checkInTime.getHours()) + ':' + pad(checkInTime.getMinutes()) + ':' + pad(checkInTime.getSeconds());

    insertAttendance.run(memberId, checkInTimeStr, dateStr, shift);
  }
}

console.log('Updating statuses...');
try {
  db.updateMembershipStatuses();
} catch (e) {
  console.log('Status update error ignored:', e.message);
}

console.log('✅ Dummy data seeded successfully!');
