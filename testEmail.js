require('dotenv').config();
const { testEmailConnection } = require('./utils/emailService');

console.log('Email environment variables (sanitized):');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '**********' : 'Not set');
console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);

// Test the email connection
(async () => {
  console.log('Testing email connection...');
  const isConnected = await testEmailConnection();
  
  if (isConnected) {
    console.log('✅ Email service is configured correctly!');
  } else {
    console.log('❌ Email service configuration failed.');
    console.log('\nTroubleshooting tips:');
    console.log('1. For Gmail, you need to use an App Password, not your regular password.');
    console.log('   - Go to https://myaccount.google.com/apppasswords');
    console.log('   - Generate a new App Password for "Mail" and "Other" (name it "WerTigo")');
    console.log('   - Copy the 16-character password to your .env file');
    console.log('2. Make sure 2-Step Verification is enabled on your Google account.');
    console.log('3. Check that your EMAIL_USER is correctly set to your full Gmail address.');
    console.log('4. Verify that all environment variables are properly loaded.');
  }
})(); 