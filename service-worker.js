/* eslint-env serviceworker */
/* globals LightningFS git GitHttp */

importScripts('./src/libs/isomorphicgit.js');
importScripts('./src/libs/LightningFS.js');
importScripts('./src/libs/GitHttp.js');

let username = '';
let password = '';
let dir = '/';
let depth = 1;
let remote = 'origin';
let ref = 'main';
let corsProxy = 'http://localhost:3000' //'https://cors-proxy-temp.liara.run/'
let cache = {};
let settingsFileAddresses = {};
const http = GitHttp;
const useCacheForRepo = 0;
let broadcastChannel;
let fs = new LightningFS('fs');
let noMainErrorCounts = {
  cloneCount: 0,
  pushCount: 0,
  pullCount: 0,
  fetchCount: 0,
  ffCount: 0
};

const CACHE_NAME = 'cache-v1';
//const OFFLINE_URL = '/offline.html';
const URLS_TO_CACHE = [
  './src/libs/GitHttp.js',
  './src/libs/isomorphicgit.js',
  './src/libs/LightningFS.js',
  './src/libs/MagicPortal.js',
  './src/libs/require.js',
  './src/libs/gitWorker.js'
];

const basePath = new URL(self.registration.scope).pathname.split('/')[1];
const scopePath = basePath ? `/${basePath}/` : '/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(URLS_TO_CACHE);
    }).catch((error) => {
      console.error('Failed to cache', error);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.broadcastChannelInitialized = false;

if (!self.broadcastChannelInitialized) {
  broadcastChannel = new BroadcastChannel('worker-channel');

  broadcastChannel.onmessage = async function (event) {
    const message = event.data;
    console.log(message);

    try {
      switch (message.operation) {
        case 'setAuthParams':
          await handleSetAuthParams(message.data);
          break;
        case 'setDir':
          await handleSetDir(message.data);
          break;
        case 'setRepoDir':
          await handleSetRepoDir(message.data);
          break;
        case 'setDepth':
          await handleSetDepth(message.data);
          break;
        case 'setRemote':
          await handleSetRemote(message.data);
          break;
        case 'setRef':
          await handleSetRef(message.data);
          break;
        case 'setSettingsAddresses':
          await handleSetSettingsFileAddresses(message.data);
          break;
        case 'passFsArgs':
          await handlePassFsArgs(message.data);
          break;
        default:
          await exceptionHandler(message);
          break;
      }
    } catch (error) {
      console.error(`${message.operation} failed`, error);
      throw new Error(error.message);
    }
  };

  self.broadcastChannelInitialized = true;
}

async function exceptionHandler(message) {
  console.error('Unhandled message operation:', message.operation);
}

async function handleSetAuthParams(data) {
  if (username !== data.username || password !== data.password) {
    username = data.username || '';
    password = data.password || '';
    broadcastChannel.postMessage({ operation: 'setAuthParams', success: true });
  } else{
    broadcastChannel.postMessage({ operation: 'setAuthParams', success: true });
  }
}

async function handleSetDir(data) {
  if (dir !== data) {
    dir = data;
    broadcastChannel.postMessage({ operation: 'setDir', success: true });
  } else {
    broadcastChannel.postMessage({ operation: 'setDir', success: true });
  }
}

async function handleSetRef(data) {
  if (ref !== data) {
    ref = data;
    broadcastChannel.postMessage({ operation: 'setRef', success: true });
  } else {
    broadcastChannel.postMessage({ operation: 'setRef', success: true });
  }
}

async function handleSetRepoDir(data) {
  if (dir !== data) {
    dir = data;
    broadcastChannel.postMessage({ operation: 'setRepoDir', success: true });
  } else {
    broadcastChannel.postMessage({ operation: 'setRepoDir', success: true });
  }
}

async function handleSetDepth(data) {
  if (depth !== data) {
    depth = data;
    broadcastChannel.postMessage({ operation: 'setDepth', success: true });
  } else{
    broadcastChannel.postMessage({ operation: 'setDepth', success: true });
  }
}

async function handleSetRemote(data) {
  if (remote !== data) {
    remote = data;
    broadcastChannel.postMessage({ operation: 'setRemote', success: true });
  } else{
    broadcastChannel.postMessage({ operation: 'setRemote', success: true });
  }
}

async function handleSetSettingsFileAddresses(data) {
  if (settingsFileAddresses !== data) {
    settingsFileAddresses = data;
    broadcastChannel.postMessage({ operation: 'setSettingsAddresses', success: true });
  } else{
    broadcastChannel.postMessage({ operation: 'setSettingsAddresses', success: true });
  };
}

async function handlePassFsArgs(data) {
  try {
    databaseManager.setFs(data);
    broadcastChannel.postMessage({ operation: 'passFsArgs', success: true });
  } catch(error) {
    console.error('some error happened in passFsArgs: ', error);
  }
}

async function fetchSettingsFileContent(pathname) {
  try {
    console.log('pathname',pathname)
    const content = await fs.promises.readFile(pathname, 'utf8');
    if (content) {
      console.log('fetch content', content)
      return content;
    }
  } catch (error) {
    throw new Error('Unable to fetch file content: ' + error.message);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  console.log(`Fetching: ${url.pathname}`);

  // If the request is for `/git`, handle it specifically
  if (url.pathname === '/git') {
    event.respondWith(handleGitRequest(event.request));
    return; // Ensure no further processing happens for this request
  }

  // Extract the scopePath and check if it matches any settings file address
  const extractedPath = scopePath && url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length - 1) // Retain the leading `/`
    : url.pathname;

  console.log(`Extracted path: ${extractedPath}`);

  if (settingsFileAddresses[extractedPath]) {
    console.log('Matched settings file path:', extractedPath);

    event.respondWith(
      fetchSettingsFileContent(extractedPath)
        .then((content) =>
          new Response(content, {
            headers: { 'Content-Type': 'application/json' }, // Adjust content type as needed
          })
        )
        .catch((error) => {
          console.error('Error reading file:', error);
          return new Response(JSON.stringify({ error: 'File not found or inaccessible' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return; // Ensure no further processing happens for this request
  }

  // Fallback to default fetch for other requests
  event.respondWith(fetch(event.request));
});

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  async lock() {
    return new Promise((resolve) => {
      const execute = () => {
        this.locked = true;
        resolve();
      };

      if (this.locked) {
        this.queue.push(execute);
      } else {
        execute();
      }
    });
  }

  unlock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}

const mutex = new Mutex();

async function handleGitRequest(request) {
    const requestData = await request.json();
    const { operation, args } = requestData;

    let response;

    switch (operation) {
      case 'clone':
        response = await clone(args);
        break;
      case 'pull':
        response = await pull(args);
        break;
      case 'push':
        response = await push(args);
        break;
      case 'fetch':
        response = await doFetch(args);
        break;
        case 'fastForward':
          response = await fastForward(args);
          break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid operation' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
 
}

class DatabaseManager {
  constructor(fs) {
    this.repoFileSystems = {};
    this.currentFs = null;
  }

  async setFs({ url, databaseName }) {
    try {
      const repoName = databaseName || await this.extractRepoAddress(url);

      if (!this.repoFileSystems[repoName]) {
        await this.initializeStore(repoName);
      }

      this.currentFs = this.repoFileSystems[repoName];
      fs = this.currentFs;
      console.log('File system set for repo:', repoName);
      return this.currentFs;
    } catch (error) {
      console.error('Error setting FS:', error);
    }
  }

  async initializeStore(repoName) {
    if (!this.repoFileSystems[repoName]) {
      this.repoFileSystems[repoName] = new LightningFS(repoName, {
        fileStoreName: `fs_${repoName}`,
        wipe: false,
      });
      console.log(`Initialized file system for ${repoName}`);
    }
  }

  async extractRepoAddress(url) {
    const regex = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)\/(.+)/;
    const match = url?.match(regex);
    if (match) {
      let domain = match[1].replace('/', '-');
      let repoName = match[2].replace('/', '-');;
      return `${domain}-${repoName}`;
    }
    return null;
  }

  //wipes fs
  async wipeFs({url, databaseName}) {
    try {
      const databaseName = this.getDatabaseName({ url, databaseName });
      consoleDotLog('wiping garbage fs ...')
      this.repoFileSystems[databaseName] = new LightningFS(databaseName, {
        fileStoreName: `fs_${databaseName}`,
        wipe: true,
      });
      consoleDotLog('Fs successfully wiped out ...')
    } catch (error) {
        console.error("Error wiping file system:", error);
        throw error; 
    }
  }

  async getDatabaseName({ url, databaseName }) {
    try {
      const repoName = databaseName || await this.extractRepoAddress(url);
      return repoName;
    } catch(error) {
      console.error('some error happend: ', error);
    }
  }
}

const databaseManager = new DatabaseManager(fs);


async function deleteIndexedDB(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => {
      console.log(`Deleted database ${dbName} successfully`);
      resolve();
    };
    request.onerror = (event) => {
      console.error(`Error deleting database ${dbName}:`, event);
      reject(event);
    };
    request.onblocked = () => {
      console.warn(`Delete database ${dbName} blocked`);
    };
  });
}

async function generateCacheKey(url) {
  const { domain, path } = await databaseManager.getDatabaseName(url);
  if (domain && path) {
    return `${domain}|${path}`;
  }
  return null;
}

async function gitReset({dir, ref, branch}) {
  var re = /^HEAD~([0-9]+)$/
  var m = ref.match(re);
  if (m) {
      var count = +m[1];
      var commits = await git.log({fs, dir, depth: count + 1});
      var commit = commits.pop().oid;
      return new Promise((resolve, reject) => {
          fs.writeFile(dir + `/.git/refs/heads/${branch}`, commit, (err) => {
              if (err) {
                  return reject(err);
              }
              // clear the index (if any)
              fs.unlink(dir + '/.git/index', (err) => {
                  if (err) {
                      return reject(err);
                  }
                  // checkout the branch into the working tree
                  git.checkout({ dir, fs, ref: branch, force: true }).then(resolve);
              });
          });
      });
  }
  return Promise.reject(`Wrong ref ${ref}`);
}


async function regenerateIdxFiles() {
  const packDir = `${dir}/.git/objects/pack`;
  let packfiles = await fs.promises.readdir(packDir);
  packfiles = packfiles.filter(name => name.endsWith('.idx'));

  for (const packfile of packfiles) {
      await fs.promises.unlink(`${packDir}/${packfile}`);
      console.log(`Deleted .idx file: ${packfile}`);
  }

  // **Regenerate .idx files**
  packfiles = await fs.promises.readdir(packDir);
  packfiles = packfiles.filter(name => name.endsWith('.pack'));

  for (const packfile of packfiles) {
      const packFilePath = `${packDir}/${packfile}`;
      try {
          const relativePackFilePath = packFilePath.replace(`${dir}/`, '');
          console.log('Attempting to generate .idx file for:', packFilePath);
          const { oids } = await git.indexPack({
              fs,
              dir,
              filepath: relativePackFilePath,
              async onProgress(evt) {
                  console.log(`${evt.phase}: ${evt.loaded} / ${evt.total}`);
              }
          });
          console.log('Generated .idx file for:', relativePackFilePath, 'OIDs:', oids);
      } catch (err) {
          console.error(`Error regenerating .idx files for ${packfile}:`, err);
      }
  }
}

async function retryOperation(operation, args, maxRetries = 2) {
  let retryCount = 0;
  let delay = 1000;

  while (retryCount <= maxRetries) {
    try {
      return await operation(args);
    } catch (error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('HTTP Error')) {
        retryCount++;
        if (retryCount > maxRetries) throw new Error('Max retries reached for operation.');
        
        console.log(`Network error, Retrying operation in ${delay / 1000} seconds... (Attempt ${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}


async function clone(args) {
  return await retryOperation(async (args) => {
    console.log('Entering clone function with arguments:', args);

    noMainErrorCounts.cloneCount ++;
    let cloneResult = {};
    let repoName = await databaseManager.getDatabaseName(args);
    await mutex.lock();
    try {
        console.log('ref', ref)
        if (!databaseManager.repoFileSystems[repoName]) {
            await databaseManager.setFs(args);
        }

        fs = databaseManager.repoFileSystems[repoName];
        cloneResult = await fetchCachedFileList(repoName);
        if (!cloneResult) {
            const result = await git.clone({
                ...args,
                fs,
                cache,
                http,
                dir,
                remote,
                ref,
                corsProxy,
                depth,
                onAuth() {
                    return authenticate.fill();
                },
                onAuthFailure() {
                    return authenticate.rejected();
                },
            });

            console.log('Clone successful', result);
            if (useCacheForRepo){
              //await regenerateIdxFiles();
              const fileList = await listFiles();
              await cacheFileList(repoName, fileList);
            }
            cloneResult = { isCacheUsed: false, ref: ref};

            await logToCache('clone', { repoName, result });
        } else {
            await writeFilesToIndexedDB(cloneResult);
            await gitReset({ dir, ref: 'HEAD~1', branch: ref });
            await logToCache('clone (from cache)', { repoName });
            console.log('log', await retrieveLogFromCache());
            cloneResult = { isCacheUsed: true, ref: ref };
        }

        return { success: true, message: 'The repo has successfully cloned', data: cloneResult };
    } catch (error) {
        console.error('Clone failed with error:', error);
        if (error?.message?.includes('Could not find') && error?.code === 'NotFoundError') {
              let isHandled = await handleNoMainError(clone, args, noMainErrorCounts.cloneCount);
              if (!isHandled) {
                  throw error;
              }
              noMainErrorCounts.cloneCount = 0;
              cloneResult = { isCacheUsed: false, ref: ref};
              return { success: true, message: 'The repo has successfully cloned', data: cloneResult };
        } else if (error?.response?.status === 500) {
            console.error('Server responded with 500 Internal Server Error');
            throw new Error('Internal Server Error: The server encountered an error.');
        } else if (typeof error === 'object') {
            console.error('Error properties:', Object.keys(error));
            throw new Error(error.message || 'An unknown error occurred during the clone operation');
        } else {
            console.error('Unknown error:', error);
            throw new Error('An unknown error occurred during the clone operation');
        }
    } finally {
        mutex.unlock();
      }
    }, args);
}

async function cacheFileList(cacheKey, fileList) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const filesWithContent = {};
    console.log('fl', fileList);

    for (const [fileName, filePath] of Object.entries(fileList)) {
      console.log('fn, fp', fileName, filePath);
      const stats = await fs.promises.stat(filePath);
      
      if (stats.isDirectory()) {
        // Store an empty string for directories
        filesWithContent[filePath] = '';
      } else if (stats.isFile()) {
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        filesWithContent[filePath] = fileContent;
      }
    }

    console.log('filesWithContent', filesWithContent);

    const response = new Response(JSON.stringify(filesWithContent), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(cacheKey, response);
    console.log('File list and contents cached successfully', response);
  } catch (error) {
    console.error('Error caching file list and contents:', error);
  }
}

async function listFiles(filePath = dir) {
  try {
    let path = filePath;
    let files = await fs.promises.readdir(filePath);
    let result = {};
    console.log('files',files)
    result[filePath] = filePath;

    for (const file of files) {
      console.log('file',file)
      let fullPath = path !== '/' ? `${path}/${file}` : `${path}${file}`;
      const stat = await fs.promises.lstat(fullPath);

      if (stat.isDirectory()) {
        console.log('fullPath',fullPath)
        result = { ...result, ...await listFiles(fullPath) };
      } else {
        console.log('result',result)
        result[fullPath] = fullPath;
      }
    }
    return result;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

async function fetchCachedFileList(cacheKey) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const filesWithContent = await cachedResponse.json();
      console.log('Files and contents fetched from cache:', filesWithContent);
      return filesWithContent;
    } else {
      console.log('No cached file list found');
      return null;
    }
  } catch (error) {
    console.error('Error fetching cached file list and contents:', error);
    return null;
  }
}

async function writeFilesToIndexedDB(filesWithContents) {
  for (const [filePath, fileContent] of Object.entries(filesWithContents)) {
    const directories = filePath.split('/').slice(0, -1).join('/');

    // Create directories if they don't exist
    if (directories) {
      await ensureDirectoryExists(fs, directories);
    }

    if (fileContent === '') {
      // If fileContent is an empty string, create the directory
      await fs.promises.mkdir(filePath, { recursive: true });
      console.log(`Directory created: ${filePath}`);
    } else {
      // Write file content to the appropriate path
      await fs.promises.writeFile(filePath, fileContent);
    }
  }
  console.log('All files and contents have been written to IndexedDB using LightningFS.');
}

async function ensureDirectoryExists(fs, dirPath) {
  const parts = dirPath.split('/').filter(part => part);
  let currentPath = '';

  for (const part of parts) {
    currentPath += `/${part}`;
    try {
      await fs.promises.mkdir(currentPath);
      console.log(`Directory created: ${currentPath}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`Error creating directory: ${currentPath}`, error);
        throw error;
      }
    }
  }
}

async function writeFilesToIndexedDB(filesWithContents) {
  try {
    for (const [filePath, fileContent] of Object.entries(filesWithContents)) {
      const directories = filePath.split('/').slice(0, -1).join('/');
      console.log(filePath);

      try {
        // Create directories if they don't exist
        if (directories) {
          await ensureDirectoryExists(fs, directories);
        }
      } catch (dirError) {
        console.error(`Error creating directories for path: ${directories}. Error: ${dirError.message}`);
        throw dirError; // Re-throw to exit the loop or handle it outside this function
      }

      try {
        // Write file content to the appropriate path
        await fs.promises.writeFile(filePath, fileContent);
      } catch (writeError) {
        console.error(`Error writing file at path: ${filePath}. Error: ${writeError.message}`);
        throw writeError; 
      }
    }
    console.log('All files and contents have been written to IndexedDB using LightningFS.');
  } catch (error) {
    console.error('An error occurred during the write operation:', error);
    throw error; 
  }
}



function mapErrorToStatusCode(message) {
  if (message.includes('400')) return 400;
  if (message.includes('401')) return 401;
  if (message.includes('403')) return 403;
  if (message.includes('404')) return 404;
  if (message.includes('409')) return 409;
  if (message.includes('422')) return 422;
  if (message.includes('429')) return 429;
  if (message.includes('500')) return 500;
  if (message.includes('501')) return 501;
  if (message.includes('502')) return 502;
  if (message.includes('503')) return 503;
  if (message.includes('504')) return 504;
  return 500; // Default
}

function getErrorMessage(statusCode) {
  const messages = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return messages[statusCode] || 'Internal Server Error';
}

// Auth object
const authenticate = {
  async fill() {
    return { username: username, password: password };
  },
  async rejected() {
    console.log("Authentication rejected");
    return;
  }
};

async function pull(args) {
  return await retryOperation(async (args) => {

    noMainErrorCounts.pullCount ++;
    let pullResult = {};
    await mutex.lock();
    try {
      await databaseManager.setFs(args);
      console.log('Entering pull function with arguments:', args);

      if (!ref) {
        throw new Error('Reference (ref) is not defined.');
      }

      console.log('Using reference (ref):', ref);

      const result = await git.pull({
        ...args,
        fs,
        http,
        dir,
        corsProxy,
        remote,
        remoteRef: ref,
        fastForward: true,
        forced: true,
        singleBranch: true,
        onAuth() {
          return authenticate.fill();
        },
        onAuthFailure() {
          return authenticate.rejected();
        },
      });
      pullResult = { ref: ref}
      console.log('Pull successful. Result:', result);
      return { success: true, message: result, data: pullResult };
    } catch (error) {
      if (error?.message?.includes('Could not find') && error?.code === 'NotFoundError') {
        let isHandled = await handleNoMainError(pull, args, noMainErrorCounts.pullCount);
        if (!isHandled) {
            throw error;
        }
        noMainErrorCounts.pullCount = 0;
        pullResult = { ref: ref};
        return { success: true, message: 'pull was successful', data: pullResult };
      } 
      console.error('Error occurred during pull operation:', {
        message: error.message,
        stack: error.stack,
        args
      });

      throw new Error(`Pull failed: ${error.message}`);
    } finally {
      console.log('Exiting pull function.');
      mutex.unlock();
    }
  }, args);
}
    
async function fastForward(args) {
  return await retryOperation(async (args) => {

    noMainErrorCounts.ffCount ++;
    let ffResult = {};
    await mutex.lock();
    try {
      await databaseManager.setFs(args);
      console.log('Entering fastForward function with arguments:', args);

      if (!ref) {
        throw new Error('Reference (ref) is not defined.');
      }
      console.log('Using reference (ref):', ref);

      const result = await  git.fastForward({
        ...args,
        fs,
        cache,
        http,
        dir,
        remote,
        corsProxy,
        ref,
        remoteref: ref,
        forced: true,
        singleBranch: false,
        onAuth() {
          return authenticate.fill();
        },
        onAuthFailure() {
          return authenticate.rejected();
        },
      });

      ffResult = { ref: ref}
      console.log('FastForward pull successful. Result:', result);
      return { success: true, message: result, data: ffResult };
    } catch (error) {
      //handling main and master errors
      if (error?.message?.includes('Could not find') && error?.code === 'NotFoundError') {
        let isHandled = await handleNoMainError(fastForward, args, noMainErrorCounts.ffCount);
        if (!isHandled) {
            throw error;
        }
        noMainErrorCounts.ffCount = 0;
        ffResult = { ref: ref};
        return { success: true, message: 'FastForward was successful', data: ffResult };
      } 
      console.error('Error occurred during fastForward operation:', {
        message: error.message,
        stack: error.stack,
        args
      });

      throw new Error(`FastForward pull failed: ${error.message}`);
    } finally {
      console.log('Exiting fastForward function.');
      mutex.unlock();
    }
  }, args);
}

async function push(args) {
  return await retryOperation(async (args) => {

    noMainErrorCounts.pushCount ++;
    let pushResult = {};
    await mutex.lock();
    try {
      await databaseManager.setFs(args);
      console.log('Entering push function with arguments:', args);

      if (!ref) {
        throw new Error('Reference (ref) is not defined.');
      }
      console.log('Using reference (ref):', ref);

      const result = await git.push({
        ...args,
        fs,
        http,
        dir,
        corsProxy,
        remote,
        ref,
        force: true,
        onAuth() {
          return authenticate.fill();
        },
        onAuthFailure() {
          return authenticate.rejected();
        },
      });

      pushResult = { ref: ref};
      console.log('Push successful. Result:', result);
      return { success: true, message: 'Push was successful', data: pushResult };
    } catch (error) {
      //handling main and master errors
      if (error?.message?.includes('Could not find') && error?.code === 'NotFoundError') {
        let isHandled = await handleNoMainError(push, args, noMainErrorCounts.pushCount);
        if (!isHandled) {
            throw error;
        }
        noMainErrorCounts.pushCount = 0;
        pushResult = { ref: ref};
        return { success: true, message: 'Push was successful', data: pushResult };
      } 
      console.error('Error occurred during push operation:', {
        message: error.message,
        stack: error.stack,
        args
      });
    } finally {
      console.log('Exiting push function.');
      mutex.unlock();
    }
  }, args);
}

async function doFetch(args) {
  return await retryOperation(async (args) => {

    noMainErrorCounts.fetchCount ++;
    let fetchResult = {};
    await mutex.lock();
    try {
      await databaseManager.setFs(args);
      console.log('Entering doFetch function with arguments:', args);

      if (!ref) {
        throw new Error('Reference (ref) is not defined.');
      }

      console.log('Using reference (ref):', ref);

      const result = await git.fetch({
        ...args,
        fs,
        http,
        dir,
        corsProxy,
        ref,
        remote,
        depth,
        singleBranch: false,
        tags: false,
        onAuth() {
          return authenticate.fill();
        },
        onAuthFailure() {
          return authenticate.rejected();
        },
      });

      fetchResult = { ref: ref };
      console.log('Fetch successful. Result:', result);
      return { success: true, message: 'Fetch was successful', data: fetchResult};
    } catch (error) {
      if (error?.message?.includes('Could not find') && error?.code === 'NotFoundError') {
        let isHandled = await handleNoMainError(doFetch, args, noMainErrorCounts.fetchCount);
        if (isHandled === false){
          throw error;
        }
        noMainErrorCounts.fetchCount = 0;
        fetchResult = { ref: ref};
        return { success: true, message: 'The repo has successfully cloned', data: fetchResult };
      }
      console.error('Error occurred during fetch operation:', {
        message: error.message,
        stack: error.stack,
        args
      });
      throw new Error(`Fetch failed: ${error.message}`);
    } finally {
      // Log exit from the function
      console.log('Exiting doFetch function.');
      mutex.unlock();
    };
  }, args);
}

async function createBranch(args) {
  //console.log('object', args.object);
  return await git.branch({
    ...args,
    fs,
    dir
  })
}

async function logToCache(action, data) {
  try {
    const cache = await caches.open(CACHE_NAME);

    // Retrieve existing logs
    let response = await caches.match('log');
    let logs = response ? await response.json() : [];

    // Add new log entry with a timestamp
    const timestamp = new Date().toISOString();
    const newLogEntry = { action, data, timestamp };
    logs.push(newLogEntry);

    // Check if logs exceed 5 KB limit
    let logSize = new Blob([JSON.stringify(logs)]).size;
    const maxSize = 5 * 1024; // 5 KB

    // Remove oldest logs if necessary
    while (logSize > maxSize) {
      logs.shift(); // Remove the oldest log entry
      logSize = new Blob([JSON.stringify(logs)]).size;
    }

    // Save updated logs back to cache
    const updatedResponse = new Response(JSON.stringify(logs), { headers: { 'Content-Type': 'application/json' } });
    await cache.put('log', updatedResponse);

    console.log(`Logged action: ${action} at ${timestamp}`, newLogEntry);
  } catch (error) {
    console.error('Error logging data to cache:', error);
  }
}


async function retrieveLogFromCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('log');
    
    if (response) {
      const logs = await response.json();
      console.log('Retrieved logs from cache:', logs);
      return logs;
    } else {
      console.log('No logs found in cache.');
      return [];
    }
  } catch (error) {
    console.error('Error retrieving logs from cache:', error);
    return [];
  }
}

async function handleNoMainError(operation, args, count) {
}