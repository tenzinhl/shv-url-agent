// Scrape the spys.me/socks.txt proxy list into JS variables that we can use for configuring agents.

import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import jsdom from 'jsdom';
import pLimit from 'p-limit';

const { JSDOM } = jsdom;

// Returns a HTTP agent given a proxy configuration. Proxy configurations should be JS objects
// with the following properties:
// - host: string, the host of the proxy server (IP or host name).
// - port: number, the port of the proxy server (Port number).  
// - protocol: string, the protocol of the proxy server ('http', 'https', 'socks4', 'socks5').
function getHttpAgent(proxyOptions) {
    if (!proxyOptions.host || !proxyOptions.port || !proxyOptions.protocol) {
        throw new Error('Invalid proxy options');
    }

    // Standard options for all HTTP agents.
    const standardOptions = {
        // Some proxies seem to cause SSL errors when reaching out to other websites (primarily out of date SSL certs).
        // We don't care about this though as we aren't revealing any personal information. Disabling caring about SSL
        // lets us use more proxies successfully.
        rejectUnauthorized: false,
        // Limit how long we wait for a proxy to connect.
        timeout: 5000,
    };

    switch (proxyOptions.protocol) {
        case 'http':
            return new HttpProxyAgent(`http://${proxyOptions.host}:${proxyOptions.port}`, standardOptions);
        case 'https':
            return new HttpsProxyAgent(`https://${proxyOptions.host}:${proxyOptions.port}`, standardOptions);
        case 'socks4':
            return new SocksProxyAgent(`socks4://${proxyOptions.host}:${proxyOptions.port}`, standardOptions);
        case 'socks5':
            return new SocksProxyAgent(`socks5://${proxyOptions.host}:${proxyOptions.port}`, standardOptions);
        default:
            throw new Error(`Invalid proxy protocol: ${proxyOptions.protocol}`);
    }
}

// ========
// MAIN LOGIC
// ========

// Fetch https://spys.me/socks.txt using axios
const response = await axios.get('https://spys.me/socks.txt');

const lines = response.data.split('\n');
// console.log(lines);

const proxyConfigs = lines.map(line => {
    // host:port is everything before first space.
    const hostport = line.substring(0, line.indexOf(' '));

    const rest = line.substring(line.indexOf(' ') + 1);
    // First two characters are country code.
    const countryCode = rest.substring(0, 2);

    // There's some more information in the txt file including whether SSL is supported, although
    // the format gets kind of wonky and unexplained. For example there's occasionally exclamation
    // marks for no clear reason, and the number of dashes in a line varies with no clear pattern.
    // Ah wait, I think the last - is actually a negative google pass! Jeez that's confusing.
    // Still don't know what the exclamation marks are though.

    return {
        host: hostport.substring(0, hostport.indexOf(':')),
        port: Number(hostport.substring(hostport.indexOf(':') + 1)),
        countryCode: countryCode,
        anonymityLevel: rest.substring(3, 4),
        googlePassed: rest.includes('+'),
        protocol: 'socks5',
    }
});

// filteredProxies only contains high anonymity proxies that passed Google.
const filteredProxies = proxyConfigs.filter(proxy => proxy.anonymityLevel === 'H' && proxy.googlePassed);
// console.log(filteredProxies);

const limit = pLimit(32);
const proxyResultPromises = filteredProxies.map(proxy => {
    limit(async () => {
        try {
            const agent = getHttpAgent(proxy);
            const axiosInstance = axios.create({
                httpsAgent: agent,
                proxy: false, // Disable any proxy settings in Axios itself
            });
            const response = await axiosInstance.get('https://www.whatsmyip.org', { timeout: 5000 });
            const dom = new JSDOM(response.data);
            console.log(`${proxy.host}:${proxy.port} Success: ${dom.window.document.querySelector('#ip').textContent}`);
        } catch (error) {
            console.error(`${proxy.host}:${proxy.port} Error:`, error.message);
        }
    });
});

await Promise.all(proxyResultPromises);
