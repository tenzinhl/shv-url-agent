// Script for sending logged URL lists to Exposit.

import { sendUrlsToExposit } from './exposit-api.js';
import fs from 'fs/promises';

if (process.argv.length < 3) {
    console.log("Usage: node send-urls-to-exposit.js <path to JSON file>");
    process.exit(1);
}

const jsonPath = process.argv[2];

async function main() {
    const json = await fs.readFile(jsonPath);
    const urls = JSON.parse(json).map(item => item.url);
    const response = await sendUrlsToExposit(urls);
    console.log(response.data);
}

main();
