/**
 * Email Configuration Setup Script
 * 
 * This script helps users set up their email configuration for the application.
 * It guides them through the process of creating an App Password for Gmail.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { testEmailConnection } = require('./utils/emailService');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Print header
console.log('\n=========================================');
console.log('         EMAIL CONFIGURATION SETUP       ');
console.log('=========================================\n');

console.log('Current configuration:');
console.log('EMAIL_USER:', process.env.EMAIL_USER || 'Not set');
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '**********' : 'Not set');
console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE || 'Not set');
console.log('SMTP_HOST:', process.env.SMTP_HOST || 'Not set');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 'Not set');
console.log('\n');

console.log('For Gmail accounts, you need to:');
console.log('1. Enable 2-Step Verification on your Google account');
console.log('2. Generate an App Password specifically for this application');
console.log('   → Go to: https://myaccount.google.com/apppasswords\n');

const promptForAppPassword = () => {
  rl.question('Enter your Gmail App Password (16 characters, no spaces): ', async (appPassword) => {
    if (!appPassword || appPassword.length !== 16) {
      console.log('⚠️ App Password should be exactly 16 characters without spaces.');
      console.log('Please try again or press Ctrl+C to exit.');
      return promptForAppPassword();
    }
    
    // Update .env file
    try {
      const envPath = path.join(__dirname, '.env');
      let envContent = '';
      
      // Read existing .env file if it exists
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        
        // Update EMAIL_PASSWORD
        if (envContent.includes('EMAIL_PASSWORD=')) {
          envContent = envContent.replace(/EMAIL_PASSWORD=.*$/m, `EMAIL_PASSWORD=${appPassword}`);
        } else {
          envContent += `\nEMAIL_PASSWORD=${appPassword}\n`;
        }
      } else {
        // Create a basic .env file
        envContent = `# Email Configuration
EMAIL_USER=${process.env.EMAIL_USER || 'your_email@gmail.com'}
EMAIL_PASSWORD=${appPassword}
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
FROM_EMAIL=${process.env.EMAIL_USER || 'your_email@gmail.com'}
`;
      }
      
      // Write updated content back to .env file
      fs.writeFileSync(envPath, envContent);
      console.log('✅ .env file updated successfully with your App Password!');
      
      // Test the connection
      console.log('\nTesting email connection with new credentials...');
      process.env.EMAIL_PASSWORD = appPassword;
      const isConnected = await testEmailConnection();
      
      if (isConnected) {
        console.log('\n✅ Email configuration is working correctly!');
        console.log('You can now use the email features of the application.');
      } else {
        console.log('\n❌ Email configuration is still not working.');
        console.log('Please check your credentials and try again, or contact support.');
      }
      
      rl.close();
    } catch (error) {
      console.error('Error updating .env file:', error);
      rl.close();
    }
  });
};

// Start the prompt
promptForAppPassword(); 