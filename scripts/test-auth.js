const bcrypt = require('bcrypt');

async function testPasswordHashing() {
  console.log('Testing password hashing...\n');

  const plainPassword = 'password';
  const wrongPassword = 'wrongpassword';

  // Test hashing
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  console.log('Plain password:', plainPassword);
  console.log('Hashed password:', hashedPassword);
  console.log('Hash length:', hashedPassword.length);

  // Test correct password
  const isValidPassword = await bcrypt.compare(plainPassword, hashedPassword);
  console.log('\nComparing correct password:', isValidPassword ? '✅ PASS' : '❌ FAIL');

  // Test wrong password
  const isInvalidPassword = await bcrypt.compare(wrongPassword, hashedPassword);
  console.log('Comparing wrong password:', !isInvalidPassword ? '✅ PASS' : '❌ FAIL');

  // Test that same password generates different hashes
  const hashedPassword2 = await bcrypt.hash(plainPassword, 10);
  console.log(
    '\nSame password, different hash:',
    hashedPassword !== hashedPassword2 ? '✅ PASS' : '❌ FAIL'
  );
  console.log('Hash 1:', hashedPassword);
  console.log('Hash 2:', hashedPassword2);

  // But both hashes should validate the same password
  const isValid1 = await bcrypt.compare(plainPassword, hashedPassword);
  const isValid2 = await bcrypt.compare(plainPassword, hashedPassword2);
  console.log(
    '\nBoth hashes validate same password:',
    isValid1 && isValid2 ? '✅ PASS' : '❌ FAIL'
  );
}

testPasswordHashing().catch(console.error);
