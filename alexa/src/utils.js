const http = require(`https`);

const JSONstringify = (json) => {
  console.log(JSON.stringify(json, undefined, 2));
}

const httpRequest = (host, port, path, method, query) => {
  return new Promise((resolve, reject) => {
    const encodedData = JSON.stringify(query);
    const options = {
      host,
      port,
      path,
      method, 
    };
    
    options.headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(encodedData)
    };
    
    let data = '';
    
    const req = http.request(options, (res) => {
      res.on('data', function (chunk) {
        data += chunk;
      });
      
      res.on('end', function() {
        if (host === process.env.RMP_SERVER) {
          const parsed = JSON.parse(data);
          JSONstringify(parsed);
          if (parsed.status !== 200) {
            reject(parsed);
          } else {
            resolve(parsed);
          }
        } else {
          resolve(data);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log('http error', e);
      reject(e.message);
    });
    
    // send the request
    req.write(encodedData);
    req.end();
  });
};


module.exports = {
  JSONstringify,
  httpRequest,
};
