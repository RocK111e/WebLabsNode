const fs = require('fs');

// Custom logger setup
const logFile = 'app.log';
const logStream = fs.createWriteStream(logFile, { flags: 'a' }); // Append mode

// Custom logger object
const customLogger = {
  log: (...args) => {
    const message = args.join(' ');
    const timestamp = new Date().toLocaleString(); // Use local time
    const logMessage = `[${timestamp}] LOG: ${message}\n`;
    logStream.write(logMessage); // Write to file
  },
  error: (...args) => {
    const message = args.join(' ');
    const timestamp = new Date().toLocaleString(); // Use local time
    const logMessage = `[${timestamp}] ERROR: ${message}\n`;
    logStream.write(logMessage); // Write to file
  }
};

// Override console methods
console.log = customLogger.log;
console.error = customLogger.error;

// Handle process exit to close the log stream
process.on('exit', () => {
  logStream.end();
});

// Export the logger for manual use (optional)
module.exports = customLogger;