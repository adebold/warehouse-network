const bcrypt = require('bcrypt');
const { logger } = require('./utils/logger');

async function testPasswordHashing() {
  logger.info('Testing password hashing...\n');

  const plainPassword = 'password';
  const wrongPassword = 'wrongpassword';

  // Test hashing
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  logger.info('Plain password:', plainPassword);
  logger.info('Hashed password:', hashedPassword);
  logger.info('Hash length:', hashedPassword.length);

  // Test correct password
  const isValidPassword = await bcrypt.compare(plainPassword, hashedPassword);
  logger.info('\nComparing correct password:', isValidPassword ? '✅ PASS' : '❌ FAIL');

  // Test wrong password
  const isInvalidPassword = await bcrypt.compare(wrongPassword, hashedPassword);
  logger.info('Comparing wrong password:', !isInvalidPassword ? '✅ PASS' : '❌ FAIL');

  // Test that same password generates different hashes
  const hashedPassword2 = await bcrypt.hash(plainPassword, 10);
  logger.info(
    '\nSame password, different hash:',
    hashedPassword !== hashedPassword2 ? '✅ PASS' : '❌ FAIL'
  );
  logger.info('Hash 1:', hashedPassword);
  logger.info('Hash 2:', hashedPassword2);

  // But both hashes should validate the same password
  const isValid1 = await bcrypt.compare(plainPassword, hashedPassword);
  const isValid2 = await bcrypt.compare(plainPassword, hashedPassword2);
  logger.info(
    '\nBoth hashes validate same password:',
    isValid1 && isValid2 ? '✅ PASS' : '❌ FAIL'
  );
}

testPasswordHashing().catch(console.error);
