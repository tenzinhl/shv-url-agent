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
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import pLimit from 'p-limit';
puppeteer.use(StealthPlugin());

import Anthropic from '@anthropic-ai/sdk';
import { Readability } from '@mozilla/readability';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

import { shouldFetch, sendUrlsToExposit } from './exposit-api.js';

// Setup a JSDOM virtual console for masking CSS errors.
const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => {
    // No-op to skip console errors.
    log("JSDOM Error, disable custom virtual console to see full error messages.")
});

// =====================
// Script Constants
//
// - Top-level constants for modifying script behavior.
// =====================

const __dirname = import.meta.dirname;

// Prompt for getting the top-level results.
const GOOGLE_PROMPT = "Astera Labs Q2 Earnings 2024"

// Whether to use the text of the page as well as the image for determining relevance.
// Allowed values are "img", "text", or "imgtext". Each one includes the things that it lists.
const QUERY_MODE = "imgtext";

// Number of Google results to show per page. Should match one of Google's allowed values: https://stackoverflow.com/a/30879675
// Although some brief testing with small numbers like 1,2,3 suggest they work as well.
const NUM_RESULTS_PER_PAGE = 100;

// Total number of URLs to pull from Google.
const TOTAL_RESULTS = 2;

// Whether to run Puppeteer in Headless mode.
const HEADLESS = true;

// Sourced from https://www.useragents.me/
const USER_AGENTS = [{ "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.1", "pct": 40.65 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 14.95 }, { "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 8.88 }, { "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.3", "pct": 8.41 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3", "pct": 6.54 }, { "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.3", "pct": 4.67 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.3", "pct": 3.74 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/100.7.6266.6", "pct": 3.74 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.", "pct": 1.87 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.", "pct": 1.87 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.", "pct": 0.93 }, { "ua": "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.3", "pct": 0.93 }, { "ua": "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.", "pct": 0.93 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.192 Safari/537.3", "pct": 0.93 }, { "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.", "pct": 0.93 }];

// If true then the script will send the sourced URLs to exposit at the end.
const SEND_TO_EXPOSIT = true;

// Whether URLs sent to exposit should be filtered by their shouldFetch function.
const SHOULD_FETCH_ENABLED = false;

const DATALOG_PATH = `${__dirname}/run_results/`

// =====================
// Helper functions
// =====================

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

// Use Mozilla's Readability library to extract the text of a webpage and filter out
// excessive whitespace.
// page should be a Puppeteer Page object.
// url should be the string url of the page.
async function getWebpageText(page, url) {
    // Extract the text of the page using readability and log it to the console.
    const pageText = await page.content();
    const dom = new JSDOM(pageText, { url, virtualConsole });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
        // Some pages don't have any ext that can be parsed out by Readability. In these cases we just return an empty string.
        return "";
    }

    // Use regex to replace unnecessary whitespace.
    let text = article.textContent.replace(/\n\s+/g, '\n');
    text = text.replace(/ {2,}/g, ' ');
    return text;
}

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

// Create a Clause User Input JSON Message
// Input can have the following fields:
// - prompt
// - imageBase64
function makeUserMessage(input) {
    return {
        role: "user",
        content: [
            ...(input.prompt ? [{ type: "text", text: input.prompt }] : []),
            ...(input.imageBase64 ? [{
                type: "image", source: {
                    type: "base64",
                    media_type: "image/png",
                    data: input.imageBase64
                }
            }] : [])
        ]
    }
}

// Query Claude with the provided "input" object. Supports the following fields:
async function queryClaude(input) {
    var payload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 1024,
        messages: [
            makeUserMessage(input)
        ]
    };

    // DEBUG: can remove.
    // log(`Query Claude with message: ${JSON.stringify(payload)}`);

    return await axios.post('https://api.anthropic.com/v1/messages',
        payload,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env['ANTHROPIC_API_KEY'],
                'anthropic-version': '2023-06-01'
            }
        });
}

// Given a Puppeteer Page object, return a prompt that asks Claude about the relevance of the page to the Google prompt.
// Can return an empty string if the page doesn't have any content to query.
async function getRelevancePrompt(page, url) {
    if (!url) {
        throw new Error("No URL provided to getRelevancePrompt");
    }

    let page_text = "";
    switch (QUERY_MODE) {
        case "img":
            return getRelevancePromptImg();
        case "text":
            page_text = await getWebpageText(page, url);
            return page_text ? getRelevancePromptText(page_text) : "";
        case "imgtext":
            page_text = await getWebpageText(page, url);
            return page_text ? getRelevancePromptImgText(page_text) : getRelevancePromptImg();
        default:
            throw new Error(`Invalid query mode: ${QUERY_MODE}`);
    }
}

// Prompt that's sent to Claude along with the image of the website to extract information from the site.
function getRelevancePromptImg() {
    return `Attached to this message is a screenshot of an article. \
Your task is to evaluate the relevance of the attached article to the prompt: '${GOOGLE_PROMPT}'. \
Your response should be a number from 1 to 5 with 1 being the least relevant and 5 being the most relevant. \
Only respond with a number and nothing else.

How relevant is the article to the prompt?`;
}

// Text only prompt.
function getRelevancePromptText(pageText) {
    return `The text of an article is included between triple quotes below:
"""
${pageText}
"""

Your task is to evaluate the relevance of the article to the prompt: '${GOOGLE_PROMPT}'. \
Your response should be a number from 1 to 5 with 1 being the least relevant and 5 being the most relevant. \
Only respond with a number and nothing else.

How relevant is the article to the prompt?`;
}

// Returns a prompt asking Claude about webpage relevance that includes both the text of the page and a screenshot of the page.
function getRelevancePromptImgText(pageText) {
    return `Attached to this message is a screenshot of an article. \
For your convenience, the text of the webpage is included between triple quotes below:
"""
${pageText}
"""

Your task is to evaluate the relevance of the attached article to the prompt: '${GOOGLE_PROMPT}'. \
Your response should be a number from 1 to 5 with 1 being the least relevant and 5 being the most relevant. \
Only respond with a number and nothing else.

How relevant is the article to the prompt?`;
}

// Takes a source POJO with a "url" field and slaps Claude's relevance score onto the object.
async function getSourceRelevance(source) {
    const resultPage = await browser.newPage();
    await resultPage.setExtraHTTPHeaders(get_non_sus_headers());
    try {
        await resultPage.goto(source.url, { waitUntil: ['networkidle2', 'domcontentloaded'], timeout: 20000 });
    } catch (error) {
        await log(`ERROR: Failed to goto(${source.url}), message: ${error.message}`);
        await resultPage.close();
        return;
    }

    // Produce a relevance query prompt for the page. Will include page text if it needs to.
    const relevancePrompt = await getRelevancePrompt(resultPage, source.url);

    // Take a screenshot of the page if necessary.
    if (QUERY_MODE === "img" || QUERY_MODE === "imgtext") {
        const resultDims = await resultPage.evaluate(() => {
            return {
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
            };
        })

        // Seems like tuning this actually matters which is crazy. Running theory is that when the image is too long the model can forget about
        // things that were earlier in the article.
        const screenshotBuffer = await resultPage.screenshot({
            clip: { x: 0, y: 0, width: Math.min(resultDims.width, 4000), height: Math.min(resultDims.height, 4000) }
        });

        // Save the screenshot temporarily
        var tempFilePath = `imgs/temp_screenshot_${resultCount}.png`;
        await fs.writeFile(tempFilePath, screenshotBuffer);

        // Re-read as a base64 image.
        var imageBase64 = await fs.readFile(tempFilePath, { encoding: 'base64' });
    }

    if (relevancePrompt) {
        // Ask Claude about the page if we have a prompt.
        try {
            const response = await queryClaude({
                prompt: relevancePrompt,
                imageBase64: imageBase64 // can be undefined
            });

            // Log the response from Claude. We assume that first object in list is the right one.
            const claudeResponse = response.data.content[0];
            await log(`claudeResponse is: ${JSON.stringify(claudeResponse)}`);
            if (claudeResponse.type !== "text") {
                await log(`ERROR: Claude's response was not text: ${JSON.stringify(response.data.content)}`);
                source.relevance = "UNKNOWN";
            } else {
                source.relevance = claudeResponse.text;
            }
            await log(`Result: ${JSON.stringify(source)}`);
        } catch (error) {
            await log(`ERROR calling Claude API: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        }
    } else {
        source.relevance = "UNKNOWN";
    }

    // Close the result tab we opened.
    await resultPage.close();

    // Return the source object with its new relevance score.
    return source;
}


// =====================
// Main Logic
// =====================

dotenv.config()

await log("==================================================================")
await log("====================== New run of script! ======================")
await log("==================================================================")

const start = Date.now();

const client = new Anthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'], // This is the default and can be omitted
});

const browser = await puppeteer.launch({
    headless: HEADLESS,
});
const mainPage = await browser.newPage();
await mainPage.setExtraHTTPHeaders(get_non_sus_headers());

// Which page of Google search results we are on.
let googlePage = 0;
let resultCount = 0;

let pageResultList = [];
let pageResultIdx = 0;

let relevancePromises = [];

// Max number of outstanding webpage relevance workers.
const requestLimit = pLimit(50);

while (resultCount < TOTAL_RESULTS) {

    // If we've exhausted the current page of results, load the next page.
    if (pageResultIdx >= pageResultList.length) {
        googlePage = googlePage + 1;
        pageResultIdx = 0;

        // Load a page of Google results.
        await mainPage.goto(`https://www.google.com/search?q=${encodeURIComponent(GOOGLE_PROMPT)}&num=${NUM_RESULTS_PER_PAGE.toString()}&start=${(googlePage * NUM_RESULTS_PER_PAGE).toString()}`,
            { waitUntil: ['networkidle2', 'domcontentloaded'] });

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

        // If we've navigated to a new Google page and there's still no new results, abort.
        if (pageResultList.length == 0) {
            await log(`ERROR: No new results found on page ${googlePage}.`);
            break;
        }
    }

    // Investigate next result.
    const source = pageResultList[pageResultIdx];
    // Regardless of if we succeed to visit the page, we want the next page we look at to be different.
    pageResultIdx++;

    // Get the relevance score for the page.
    relevancePromises.push(requestLimit(getSourceRelevance, source));

    // We're onto next result.
    resultCount++;
}

// Await any final outstanding relevance requests.
let resultList = await Promise.all(relevancePromises);

// Filter out any undefined results.
resultList = resultList.filter(item => item !== undefined);

const end = Date.now();
console.log(`Execution time: ${end - start} ms`);

await log(`resultList.length() = ${resultList.length}`);
await log(`Final results: ${JSON.stringify(resultList)}`);

// Now we can filter if we want.
const resultUrls = resultList.map(item => item.url);
const highlyRelevantResults = resultList.filter(item => item.relevance === "5");
const expositShouldFetchUrls = resultList.filter(item => shouldFetch(item.url)).map(item => item.url);

await log(`Highly relevant results: ${JSON.stringify(highlyRelevantResults)}`);
await log(`Highly relevant URLs: ${JSON.stringify(highlyRelevantResults.map(item => item.url))}`);
await log(`All URLs: ${JSON.stringify(resultList.map(item => item.url))}`);
await log(`All exposit fetchable URLs: ${JSON.stringify(expositShouldFetchUrls)}`);

// Write the resultList to a file.
await fs.writeFile(DATALOG_PATH + `${new Date().toISOString().replace(":", "-")}.json`, JSON.stringify(resultList));

if (SEND_TO_EXPOSIT) {
    log("Sending URLs to Exposit");
    const exposit_response = await sendUrlsToExposit(SHOULD_FETCH_ENABLED ? expositShouldFetchUrls : resultUrls);
    log(`Exposit response: ${JSON.stringify(exposit_response.data)}`);
}

await browser.close();
