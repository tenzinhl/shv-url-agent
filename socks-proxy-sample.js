// Small sample that shows how to send Axios requests through a SOCKS4 proxy.
import axios from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import jsdom from 'jsdom';
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
    switch (proxyOptions.protocol) {
        case 'http':
            return new HttpProxyAgent(`http://${proxyOptions.host}:${proxyOptions.port}`);
        case 'https':
            return new HttpsProxyAgent(`https://${proxyOptions.host}:${proxyOptions.port}`);
        case 'socks4':
            return new SocksProxyAgent(`socks4://${proxyOptions.host}:${proxyOptions.port}`);
        case 'socks5':
            return new SocksProxyAgent(`socks5://${proxyOptions.host}:${proxyOptions.port}`);
        default:
            throw new Error(`Invalid proxy protocol: ${proxyOptions.protocol}`);
    }
}

// ========
// MAIN LOGIC
// ========

// SOCKS5 proxy configuration
const proxyOptions = {
    host: '31.206.38.40',
    port: 15924,
    protocol: 'socks4',
    // If the proxy requires authentication, uncomment and fill in the following:
    // userId: 'username',
};

const agent = getHttpAgent(proxyOptions);

// Create an Axios instance with the SOCKS proxy configuration
const axiosInstance = axios.create({
  httpsAgent: agent,
  proxy: false, // Disable any proxy settings in Axios itself
});

// Example HTTPS request
async function makeRequest() {
  try {
    console.log('Making request...');
    const response = await axiosInstance.get('https://www.whatsmyip.org');
    console.log('Got a response:', response.data);
    const dom = new JSDOM(response.data);
    console.log(dom.window.document.querySelector('#ip').textContent);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Call the function to make the request
makeRequest();
