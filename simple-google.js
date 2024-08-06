/**
 * Original script from https://stackoverflow.com/questions/67515088/scraping-google-search-result-links-with-puppeteer
 * Now modified.
 */

// Setup env vars.
import dotenv from 'dotenv'
import fs from 'fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import puppeteer from 'puppeteer';
import Anthropic from '@anthropic-ai/sdk';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("__filename is: ", __filename);

dotenv.config()


// Function to log messages
async function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;

    // Append the message to the log file
    await fs.appendFile('agent.log', logMessage, (err) => {
        if (err) {
           console.error('Error writing to log file:', err);
        }
    });

    // Also log to console for immediate visibility
    console.log(logMessage);
}

// Headers to attach to all Puppeteer requests to get past bot flags.
const non_suspicious_headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36',
    'upgrade-insecure-requests': '1',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9,en;q=0.8'
};

await log("==================================================================")
await log("====================== New run of script! ======================")
await log("==================================================================")


const client = new Anthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'], // This is the default and can be omitted
  });

const searchQuery = "Restaurants in my area";

const browser = await puppeteer.launch({
    headless: false,
});
const mainPage = await browser.newPage();
await mainPage.setExtraHTTPHeaders(non_suspicious_headers);
await mainPage.goto("https://www.google.com/");
await mainPage.type('[aria-label="Search"]', searchQuery);
await mainPage.keyboard.press("Enter");

/** Wait for page to load */
await mainPage.waitForNavigation();

// Get a list of title + url objects for the search results.
const list = await mainPage.evaluate(() => {
    let data = [];
    /** This can be changed for other website. */
    const list = document.querySelectorAll("a");
    for (const a of list) {
        const header = a.querySelector("h3");
        if (!header) {
            console.log("here");
            continue;
        }
        const obj = {
            title: header.innerText.trim().replace(/(\r\n|\n|\r)/gm, " "),
            url: a.href,
        };
        data.push(obj);
    }
    return data;
});

// Investigate all of the URLs we pulled from the search results.
var seq_num = 1;
for (const item of list) {
    // Open a new tab for the URL.
    const resultPage = await browser.newPage();
    await resultPage.goto(item.url, {waitUntil: 'domcontentloaded'});
    
    // Take a screenshot
    const resultDims = await resultPage.evaluate(() => {
        return {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
        };
    })
    const screenshotBuffer = await resultPage.screenshot({ 
        clip: { x: 0, y: 0, width: Math.min(resultDims.width, 8000), height: Math.min(resultDims.height, 8000) } });

    // Save the screenshot temporarily
    const tempFilePath = `imgs/temp_screenshot_${seq_num}.png`;
    await fs.writeFile(tempFilePath, screenshotBuffer);
    seq_num = seq_num + 1;

    // Prepare the form data
    const formData = new FormData();
    formData.append('file', await fs.readFile(tempFilePath));
    formData.append('model', 'claude-3-sonnet-20240229');
    formData.append('prompt', 'List the top 3 most recommended restaurants in this image. If there are less than 3, list all of them.');

    // Send the API request to Claude
    // Inside your loop
    try {
        const imageBase64 = await fs.readFile(tempFilePath, { encoding: 'base64' });
        
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-sonnet-20240229",
        max_tokens: 1024,
        messages: [
            {
            role: "user",
            content: [
                {
                type: "text",
                text: "List the top 3 most recommended restaurants in this image as a comma-separated list. Include ONLY the names of the restaurants and commas. If there are less than 3 restaurants, list all of them."
                },
                {
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/png",
                    data: imageBase64
                }
                }
            ]
            }
        ]
        }, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env['ANTHROPIC_API_KEY'],
            'anthropic-version': '2023-06-01'
        }
        });
    
        // Log the response from Claude
        await log(`Claude's response: ${JSON.stringify(response.data.content)}`);
    
  } catch (error) {
    await log(`ERROR calling Claude API: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
  }

    // Close the result tab we opened.
    await resultPage.close();

    // Remove the temporary screenshot file
    // await fs.unlink(tempFilePath);
}

console.log(list);

await browser.close();
