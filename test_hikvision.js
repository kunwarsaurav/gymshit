const db = require('./gym/db/database');
const hikvision = require('./gym/services/hikvisionService');

async function test() {
  console.log("Testing fetchHikvisionEvents...");
  const result = await hikvision.fetchHikvisionEvents();
  console.log("Result:", JSON.stringify(result, null, 2));
}

test();
