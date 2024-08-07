/**
 * Original script from https://stackoverflow.com/questions/67515088/scraping-google-search-result-links-with-puppeteer
 * Now modified.
 * 
 * This version is intended to target the Q2 Axios Earnings Query and find a list of URLs related to that query like Luke
 * suggested prototyping.
 */

// Setup env vars.
import dotenv from 'dotenv'
import fs from 'fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

import Anthropic from '@anthropic-ai/sdk';

// Prompt for getting the top-level results.
const GOOGLE_PROMPT = "Restaurants in my area"
// Prompt that's sent to Claude along with the image of the website to extract information from the site.
const RESULT_PROMPT = `Your task is to evaluate the relevance of the provided webpage to the prompt: '${GOOGLE_PROMPT}'. \
Your response must be one of the following: "HIGHLY RELEVANT", "SOMEWHAT RELEVANT", "SOMEWHAT IRRELEVANT", or "HIGHLY IRRELEVANT". \
Do not include anything else in your response besides the provided response options.`;
// Number of Google results to show per page. Should match one of Google's allowed values: https://stackoverflow.com/a/30879675
// Although some brief testing with small numbers like 1,2,3 suggest they work as well.
const NUM_RESULTS_PER_PAGE = 3;

// Total number of URLs to pull from Google.
const TOTAL_RESULTS = 7;

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

// Create a Clause User Input JSON Message
// Input can have the following fields:
// - prompt
// - imageBase64
function makeUserMessage(input) {
    return {
        role: "user",
        content: [
            ...(input.prompt ? [{type: "text", text: input.prompt}] : []),
            {
                type: "text",
                text: "List the top 3 most recommended restaurants in this image as a comma-separated list. Include ONLY the names of the restaurants and commas. If there are less than 3 restaurants, list all of them."
            },
            ...(input.imageBase64 ? [{type: "image", source: {
                type: "base64",
                media_type: "image/png",
                data: input.imageBase64
            }}] : [])
        ]
    }
}

// Query Claude with the provided "input" object. Supports the following fields:
async function queryClaude(input) {
    return await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-sonnet-20240229",
        max_tokens: 1024,
        messages: [
            makeUserMessage(input)
        ]
        }, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env['ANTHROPIC_API_KEY'],
            'anthropic-version': '2023-06-01'
        }
    });
}

// Sourced from https://www.useragents.me/
const USER_AGENTS = [{"ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.1", "pct": 40.65}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 14.95}, {"ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 8.88}, {"ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.3", "pct": 8.41}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3", "pct": 6.54}, {"ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3", "pct": 4.67}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.3", "pct": 3.74}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/100.7.6266.6", "pct": 3.74}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.", "pct": 1.87}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.", "pct": 1.87}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.", "pct": 0.93}, {"ua": "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 0.93}, {"ua": "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.", "pct": 0.93}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.192 Safari/537.3", "pct": 0.93}, {"ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.", "pct": 0.93}];

// Returns a good set of headers to reduce suspicion of bot activity.
function get_non_sus_headers() {
    return {
        'user-agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)].ua,
        'upgrade-insecure-requests': '1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9,en;q=0.8'
    };
}

await log("==================================================================")
await log("====================== New run of script! ======================")
await log("==================================================================")


const client = new Anthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'], // This is the default and can be omitted
  });

const browser = await puppeteer.launch({
    headless: false,
});
const mainPage = await browser.newPage();
await mainPage.setExtraHTTPHeaders(get_non_sus_headers());

// Which page of Google search results we are on.
var googlePage = 0;
var resultCount = 0;
var resultList = [];

var pageResultList = [];
var pageResultIdx = 0;

while (resultCount < TOTAL_RESULTS) {

    // If we've exhausted the current page of results, load the next page.
    if (pageResultIdx >= pageResultList.length) {
        googlePage = googlePage + 1;
        pageResultIdx = 0;

        // Load a page of Google results.
        await mainPage.goto(`https://www.google.com/search?q=${encodeURIComponent(GOOGLE_PROMPT)}&num=${NUM_RESULTS_PER_PAGE.toString()}&start=${(googlePage * NUM_RESULTS_PER_PAGE).toString()}`);
        await mainPage.waitForNavigation();

        // Extract a list of URLs and Titles from the page of search results.
        // Each result is a JS object with a "title" and "url" property.
        pageResultList = await mainPage.evaluate(() => {
            let data = [];
            /** This can be changed for other website. */
            const list = document.querySelectorAll("a");
            for (const a of list) {
                const header = a.querySelector("h3");
                if (!header) {
                    // Links without an h3 sub-header are not search results. Ignore.
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
    }

    // If we've navigated to a new Google page and there's still no new results, abort.
    if (pageResultIdx >= pageResultList.length) {
        await log(`ERROR: No new results found on page ${googlePage}.`);
        break;
    }

    // Otherwise investigate next result.
    const item = pageResultList[pageResultIdx];

    // Open a new tab for the URL and navigate to it.
    resultPage = await browser.newPage();
    await resultPage.setExtraHTTPHeaders(get_non_sus_headers());
    try {
        await resultPage.goto(item.url, {waitUntil: ['networkidle2', 'domcontentloaded']});
    } catch (error) {
        await log(`ERROR: Failed to goto(${item.url}), message: ${error.message}`);
        await resultPage.close();
        continue;
    }

    // Take a screenshot of the page.
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

    // Ask Claude about the page.
    try {   
        const imageBase64 = await fs.readFile(tempFilePath, { encoding: 'base64' });
        
        const response = await queryClaude({
            prompt: RESULT_PROMPT,
            imageBase64: imageBase64
        });
    
        // Log the response from Claude.
        const claudeResponse = JSON.stringify(response.data.content);
        await log(`Claude's response: ${claudeResponse}`);
        item.relevance = claudeReponse;

    } catch (error) {
        await log(`ERROR calling Claude API: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }

    // Close the result tab we opened.
    await resultPage.close();

    // We're onto next result.
    resultCount++;
    pageResultIdx++;
}

console.log(list);

await browser.close();
