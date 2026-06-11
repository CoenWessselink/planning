// Prints where the Playwright HTML report is located.
import fs from 'fs';
import path from 'path';

const reportIndex = path.join('playwright', 'reports', 'html', 'index.html');
if (fs.existsSync(reportIndex)) {
  console.log('\nPlaywright HTML report: ' + reportIndex);
  console.log('Open it in your browser after the run.\n');
} else {
  console.log('\nNo HTML report found (playwright/reports/html).\n');
}
