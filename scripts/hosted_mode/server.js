// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const fs = require('fs');
const https = require('https');
const path = require('path');
const parseURL = require('url').parse;
const promisify = require('util').promisify;
const WebSocketServer = require('ws').Server;


const remoteDebuggingPort = parseInt(process.env.REMOTE_DEBUGGING_PORT, 10) || 9222;
const port = parseInt(process.env.PORT, 10);
const requestedPort = port || port === 0 ? port : 8090;
const readFile = promisify(fs.readFile);
const exists = promisify(fs.exists);

let pathToOutTargetDir = __dirname;
/**
 * If we are in the gen directory, we need to find the out/Default folder to use
 * as our base to find files from. We could do this with path.join(x, '..',
 * '..') until we get the right folder, but that's brittle. It's better to
 * search up for the directory containing args.gn to be robust to any folder structures.
 */
const fileSystemRootDirectory = path.parse(process.cwd()).root;
while (!fs.existsSync(path.join(pathToOutTargetDir, 'args.gn'))) {
  pathToOutTargetDir = path.resolve(pathToOutTargetDir, '..');
  if (pathToOutTargetDir === fileSystemRootDirectory) {
    console.error(
        'Could not find the build root directory. You must run the hosted server from within the build root directory containing the args.gn file for it to work. The hosted mode server only works on the built output from DevTools, not from the source input.');
    process.exit(1);
  }
}
// We care about everything in the gen/ directory.
const devtoolsFolder = path.resolve(path.join(pathToOutTargetDir, 'gen'));

// The certificate is taken from
// https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/tools/apache_config/webkit-httpd.pem
const options = {
  key: fs.readFileSync(__dirname + '/key.pem'),
  cert: fs.readFileSync(__dirname + '/cert.pem'),
};

const server = https.createServer(options, requestHandler);
server.once('error', error => {
  if (process.send) {
    process.send('ERROR');
  }
  throw error;
});
server.once('listening', () => {
  // If port 0 was used, then requested and actual port will be different.
  const actualPort = server.address().port;
  if (process.send) {
    process.send(actualPort);
  }
  console.log(`Started hosted mode server at http://localhost:${actualPort}\n`);
  console.log('For info on using the hosted mode server, see our contributing docs:');
  console.log('https://bit.ly/devtools-contribution-guide');
  console.log('Tip: Look for the \'Development server options\' section\n');
});
const wss = new WebSocketServer({server});

wss.on('connection', ws => {
  ws.on('message', (message, binary) => {
    ws.send(message, {binary});
  });
});

server.listen(requestedPort);

async function requestHandler(request, response) {
  const filePath = unescape(parseURL(request.url).pathname);
  if (filePath === '/') {
    const landingURL = `http://localhost:${remoteDebuggingPort}#custom=true`;
    sendResponse(200, `<html>Please go to <a href="${landingURL}">${landingURL}</a></html>`, 'utf8');
    return;
  }

  const absoluteFilePath = path.join(devtoolsFolder, filePath);
  if (!path.resolve(absoluteFilePath).startsWith(path.join(devtoolsFolder, '..'))) {
    console.log(`File requested (${absoluteFilePath}) is outside of devtools folder: ${devtoolsFolder}`);
    sendResponse(403, `403 - Access denied. File requested is outside of devtools folder: ${devtoolsFolder}`, 'utf8');
    return;
  }

  const fileExists = await exists(absoluteFilePath);
  if (!fileExists) {
    console.log(`Cannot find file ${absoluteFilePath}. Requested URL: ${filePath}`);
    sendResponse(404, '404 - File not found', 'utf8');
    return;
  }

  let statusCode, data, headers;
  const headersFileExists = await exists(absoluteFilePath + '.headers');
  if (headersFileExists) {
    try {
      const headersFile = await readFile(absoluteFilePath + '.headers', 'utf8');
      ({statusCode, headers} = parseRawResponse(headersFile));
    } catch (err) {
      console.log(`Unable to read local file ${absoluteFilePath}.headers:`, err);
      sendResponse(500, '500 - Internal Server Error', 'utf8');
    }
  }

  let encoding = 'utf8';
  if (absoluteFilePath.endsWith('.wasm') || absoluteFilePath.endsWith('.png') || absoluteFilePath.endsWith('.jpg') ||
      absoluteFilePath.endsWith('.avif') || absoluteFilePath.endsWith('.wbn')) {
    encoding = 'binary';
  }

  try {
    data = await readFile(absoluteFilePath, encoding);
    if (absoluteFilePath.endsWith('.rawresponse')) {
      ({statusCode, data, headers} = parseRawResponse(data));
    }
    sendResponse(statusCode || 200, data, encoding, headers);
  } catch (err) {
    console.log(`Unable to read local file ${absoluteFilePath}:`, err);
    sendResponse(500, '500 - Internal Server Error', 'utf8');
  }

  function inferContentType(url) {
    const path = parseURL(url).pathname;

    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      return 'text/javascript; charset=utf-8';
    }
    if (path.endsWith('.css')) {
      return 'text/css; charset=utf-8';
    }
    if (path.endsWith('.wasm')) {
      return 'application/wasm';
    }
    if (path.endsWith('.svg')) {
      return 'image/svg+xml; charset=utf-8';
    }
    if (path.endsWith('.png')) {
      return 'image/png';
    }
    if (path.endsWith('.jpg')) {
      return 'image/jpg';
    }
    if (path.endsWith('.avif')) {
      return 'image/avif';
    }
    return null;
  }

  function sendResponse(statusCode, data, encoding, headers) {
    if (!headers) {
      headers = new Map();
    }
    if (!headers.get('Content-Type')) {
      const inferredContentType = inferContentType(request.url);
      if (inferredContentType) {
        headers.set('Content-Type', inferredContentType);
      }
    }
    headers.forEach((value, header) => {
      response.setHeader(header, value);
    });

    response.writeHead(statusCode);
    if (data && encoding) {
      response.write(data, encoding);
    }
    response.end();
  }

  function parseRawResponse(rawResponse) {
    const lines = rawResponse.split('\n');

    let isHeader = true;
    let line = lines.shift();
    const statusCode = parseInt(line, 10);

    const headers = new Map();
    let data = '';

    while ((line = lines.shift()) !== undefined) {
      if (line.trim() === '') {
        isHeader = false;
        if (request.headers['if-none-match'] && response.getHeader('ETag') === request.headers['if-none-match']) {
          return {statusCode: 304};
        }
        continue;
      }

      if (isHeader) {
        const firstColon = line.indexOf(':');
        let headerValue = line.substring(firstColon + 1).trim();
        headerValue = headerValue.replace('$host_port', `${server.address().port}`);
        headers.set(line.substring(0, firstColon), headerValue);
      } else {
        data += line;
      }
    }

    return {statusCode, data, headers};
  }
}
