/**
 * Contains utilities for interacting with Exposit's URL ingestion APIs.
 */

import { URL } from 'url';
import axios from 'axios';

const NO_FETCH_DOMAINS = new Set([
    "www.linkedin.com",
    "www.threads.net",
    "www.documentcloud.org",
    "www.woot.com",
    "www.facebook.com",
    "x.com",
    "nodejs.org",
    "rstyle.me",
    "www.thrillist.com",
    "zdcs.link",
    "news.ycombinator.com",
    "www.msn.com",
    "ycharts.com",
    "docs.github.com",
    "stockcharts.com",
    "web.archive.org",
    "twitter.com",
    "bscscan.com",
    "substackcdn.com",
    "orcid.org",
    "www.ncbi.nlm.nih.gov",
    "doi.org",
    "www.slashgear.com",
    "www.mdpi.com",
    "www.youtube.com",
    "cooking.nytimes.com",
    "www.instagram.com",
    "www.producthunt.com",
    "www.tiktok.com",
    "scholar.google.com",
    "www.google.com",
    "www.amazon.com",
    "amazon.com",
    "www.amazon.co.uk",
    "amzn.to",
    "www.reddit.com",
    "reddit.com",
    "www.stackoverflow.com",
    "stackoverflow.com",
    "apps.apple.com",
    "docs.google.com",
    "etherscan.io",
    "store.steampowered.com",
    "t.me",
    "www.etsy.com",
    "www.pinterest.com",
    "www.ebay.com",
    "pypi.org",
    "github.com",
    "www.news18.com",
    "knowyourmeme.com",
    "t.co",
    "www.goodreads.com",
    "www.barnesandnoble.com",
    "en.wiktionary.org",
]);

const NO_INDEX_PREFIXES = [
    "https://support.",
    "https://docs.",
    "https://www.dailymail.co.uk/tvshowbiz",
    "https://www.foxnews.com/video/",
    "https://www.dailymail.co.uk/femail/",
    "https://www.dailymail.co.uk/sport/",
    "https://www.dailymail.co.uk/video/",
    "https://www.cnbc.com/quotes/",
    "https://apnews.com/hub/",
    "https://www.nytimes.com/by/",
    "https://www.wsj.com/coupons/",
    "https://www.wsj.com/livecoverage/",
    "https://www.reuters.com/markets/companies/",
    "https://www.wsj.com/news/",
    "https://www.youtube.com/channel",
    "https://www.coindesk.com/price/",
    "https://en.wikipedia.org/wiki/User_talk:",
    "https://en.wikipedia.org/wiki/User:",
];

function shouldFetch(url) {
    const parsedUrl = new URL(url);
    const netloc = parsedUrl.hostname.toLowerCase();

    if (NO_FETCH_DOMAINS.has(netloc)) {
        return false;
    }

    for (const prefix of NO_INDEX_PREFIXES) {
        if (url.startsWith(prefix)) {
            return false;
        }
    }

    const path = parsedUrl.pathname;
    if (path.startsWith('/register') ||
        path.startsWith('/login') ||
        path.startsWith('/signin') ||
        path.startsWith('/chat') ||
        path.startsWith('/signup') ||
        path.startsWith('/subscribe') ||
        path.startsWith('/join') ||
        path.startsWith('/donate') ||
        path.startsWith('/tag/') ||
        path.startsWith('/tags/') ||
        path.startsWith('/category/') ||
        path.startsWith('/categories/')) {
        return false;
    }

    const fileExtensions = ['.gz', '.mp4', '.tgz', '.pkg', '.zip', '.tar', '.xz'];
    if (fileExtensions.some(ext => path.endsWith(ext))) {
        return false;
    }

    return true;
}

// Send a list of URLs to Exposit for writing a story. Returns the post response.
async function sendUrlsToExposit(urls) {
    return await axios.post('https://oci-api-qsfcfdx2eq-uw.a.run.app/private/v1/write_news_story',
        { urls },
        {
            headers: {
                'Content-Type': 'application/json',
            }
        });
}

export { shouldFetch, sendUrlsToExposit };
