// Extracting the text of a webpage in puppeteer using Mozilla Readability library

import puppeteer from 'puppeteer';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

// ==== CONSTANTS ====
const url = 'https://developer.chrome.com/';


// Launch the browser and open a new blank page
const browser = await puppeteer.launch({headless: false});
const page = await browser.newPage();

// Navigate the page to a URL.
await page.goto(url, {waitUntil: ['networkidle2', 'domcontentloaded']});

// Extract the text of the page using readability and log it to the console.
const pageText = await page.content();
const dom = new JSDOM(pageText, {url});
const reader = new Readability(dom.window.document);
const article = reader.parse();
// At this point all HTML tags have been removed however there's a lot of strange whitespace.

// We regex this to fix it.
let text = article.textContent.replace(/\n\s+/g, '\n');

// For the second regex
text = text.replace(/ {2,}/g, ' ');
console.log(text);

// You need to directly expose functions to the page in order for them to be called within the page's
// execution context.
// page.exposeFunction('Readability', Readability);

// const text = await page.evaluate(() => {
//   const reader = new Readability(document);
//   // https://github.com/mozilla/readability?tab=readme-ov-file#parse
//   const article = reader.parse();
//   return article.textContent;
// });
// console.log(text);

await browser.close();
