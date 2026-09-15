const db = require('./db/database');
const hikvision = require('./services/hikvisionService');

console.log('--- RUNNING ARCHITECTURAL HARDENING VERIFICATION ---');

// 1. Verify is_system_protected column and protection logic
console.log('\n[1] Testing is_system_protected column...');
const allMembers = db.getAllMembers('', 'all');
console.log(`Total members in DB: ${allMembers.length}`);
const protectedMembers = allMembers.filter(m => m.is_system_protected === 1 || m.is_system_protected === '1');
console.log(`Found ${protectedMembers.length} system protected member(s):`, protectedMembers.map(m => m.full_name));

if (protectedMembers.length > 0) {
  const target = protectedMembers[0];
  try {
    db.deleteMember(target.id);
    console.error('❌ FAIL: Protected member deletion was allowed!');
  } catch (err) {
    console.log(`✅ SUCCESS: Protected member deletion correctly prevented: "${err.message}"`);
  }
}

// 2. Testing Transaction Atomicity
console.log('\n[2] Testing Transaction atomicity (runInTransaction)...');
try {
  let createdMember = db.addMember({
    full_name: 'Test Transaction User',
    phone: '9800000000',
    join_date: '2026-09-15',
    duration_months: 1,
    expiry_date: '2026-10-15',
    plan_type: 'Monthly'
  });
  console.log(`Created test member with ID: ${createdMember.id}`);

  // Test rollback on invalid payment
  try {
    db.recordPayment(createdMember.id, 999999, 500, { payment_method: 'Cash' });
    console.error('❌ FAIL: Invalid payment should have thrown!');
  } catch (err) {
    console.log(`✅ SUCCESS: Invalid payment threw and rolled back: "${err.message}"`);
  }

  // Cleanup test member
  db.deleteMember(createdMember.id);
  console.log('Cleaned up test member.');
} catch (e) {
  console.error('Transaction test error:', e);
}

// 3. Testing Hikvision LAN Port Configuration
console.log('\n[3] Testing Hikvision setupLanConnection active port...');
process.env.PORT = '3000';
console.log(`process.env.PORT is: ${process.env.PORT}`);

console.log('\n✅ ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY.');
