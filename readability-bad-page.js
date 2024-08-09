// Testing using Mozilla Readability on a bad HTML page

// Read the contents of bad_website.html into a string
import fs from 'fs';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('bad_website.html', 'utf8');

// Use JSDOM and Readability to extract the text of the page
const dom = new JSDOM(html);
const reader = new Readability(dom.window.document);
const article = reader.parse();

// Log the extracted text to the console
console.log(article);
