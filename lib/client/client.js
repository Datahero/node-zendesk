// client.js - main client file that does most of the processing
'use strict';

var fs           = require('fs'),
    constants    = require('constants'),
    https        = require('https'),
    request      = require('request'),
    util         = require('util'),
    EventEmitter = require('events').EventEmitter,
    Client       = require('./client').Client,
    qs           = require('querystring'),
    async        = require('async'),
    path         = require('path'),
    flatten      = require('flatten'),
    throttler    = require('./throttle'),
    pjson        = require('./../../package.json'),
    failCodes = {
      400: 'Bad Request',
      401: 'Not Authorized',
      403: 'Forbidden',
      404: 'Item not found',
      405: 'Method not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Entity',   // zendesk sends this one back when you re-use an organization name
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      503: 'Service Unavailable'
    };


var zendeskAgent = new https.Agent({
  /**
   * On Node 4.1, zendesk seems to "socket hang up" often on default maxSockets: Infinity.  Create a dedicated
   * agent singleton for all zendesk connections with a reasonable socket limit
   */
  maxSockets: 10,

  /**
   * Optimization (currently turned off... having it on seems to make Socket Hangup's on node 4, experiment with it off
   * for a little bit).
   *
   * Note that sockets are destroyed if not in use.  From the HTTP docs:
   *   "The HTTP Agent also defaults client requests to using Connection:keep-alive. If no pending HTTP requests are
   *    waiting on a socket to become free the socket is closed. This means that Node.js's pool has the benefit of
   *    keep-alive when under load but still does not require developers to manually close the HTTP clients
   *    using KeepAlive."
   *   - https://nodejs.org/api/http.html#http_class_http_agent
   */
  keepAlive: false,
});


var Client = exports.Client = function (options) {
  this.options = options;
  this.userAgent = 'node-zendesk/' + pjson.version + ' (node/' + process.versions.node + ')';
  // Each client has its own cookies to isolate authentication between clients
  this._request = request.defaults({
    jar:      this.options.get('no-cookies') ? false : request.jar(),
    encoding: this.options.get('encoding') || null,
    timeout:  this.options.get('timeout')  || 240000,
    proxy:    this.options.get('proxy')    || null,
    secureOptions: constants.SSL_OP_NO_TLSv1_2,
    agent: zendeskAgent
  });

  if (!this.jsonAPIName) {
    this.jsonAPIName = null;
  }
  if (!this.jsonAPIName2) {
    this.jsonAPIName2 = null;
  }
  if (!this.jsonAPIName3) {
    this.jsonAPIName3 = null;
  }

  if ('function' !== typeof this.options.get) {
    this.options.get = function (key) {
      return this[key];
    };
  }

};

util.inherits(Client, EventEmitter);

Client.prototype.request = function (method, uri) {
  var options, url, self = this, res, args = Array.prototype.slice.call(arguments),
      callback = args.pop(),
      body     = 'object' === typeof args[args.length - 1] && !Array.isArray(args[args.length - 1]) && args.pop(),
      auth     = this.options.get('password') ? ':' + this.options.get('password') : '/token:' + this.options.get('token'),
      encoded  = new Buffer(this.options.get('username') + auth).toString('base64'),
      proxy    = this.options.get('proxy'),
      useOAuth = this.options.get('oauth'),
      token    = this.options.get('token');

  url = assembleUrl(self, uri);

  if (options) { // is this ever used?
    self.options.headers = options;
  } else {
    self.options.headers = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      'User-Agent':   self.userAgent
    };
  }

  if (useOAuth) {// token is an oauth token obtained from OAuth2
    self.options.headers.Authorization = 'Bearer ' + token;
  } else {// token is an API token obtained from the Zendesk Settings UI
    self.options.headers.Authorization = 'Basic ' + encoded;
  }

  self.options.uri = url;
  self.options.method = method || 'GET';

  if (body) {
    self.options.body = JSON.stringify(body);
  } else if ('GET' !== method && 'application/json' === self.options.headers['Content-Type']) {
    self.options.body = '{}';
  }

  if (proxy) {
    self.options.proxy = proxy;
  }

  self.emit('debug::request', self.options);

  return this._request(self.options, function (err, response, result) {
    if (err) {
      self.emit('error', err, self.options);
    }
    requestCallback(self, err, response, result, callback);
  });
};

/**
 * Convenience alias for requestAll
 * @param {string} method
 * @param {string} uri
 * @param {number} [maxNumRecords] Optional max number of records to retrieve.  Defaults Infinity (all records)
 * @param {function(error, statusList, records, responseList, resultList)}
 */
Client.prototype.requestN = function(method, uri, maxNumRecords, callback) {
  this.requestAll.apply(this, arguments);
};

Client.prototype.requestAll = function (method, uri, maxNumRecords, callback) {
  var nextPage     = 'Not Null!',
      bodyList     = [],
      statusList   = [],
      responseList = [],
      resultList   = [],
      self         = this,
      throttle     = this.options.get('throttle'),
      __request = Client.prototype.request;

  if (Object.prototype.toString.call(maxNumRecords) == '[object Function]') { // _.isFunction(maxNumRecords)
    callback = maxNumRecords;
    maxNumRecords = Infinity;
  }

  if ( throttle ) {
     __request = throttler( this, Client.prototype.request, throttle );
  }

  return __request.call(this, method, uri, function (error, status, body, response, result) {
    if (error) {
      return callback(error);
    }

    statusList.push(status);

    bodyList.push(body);
    var numRecords = body.length;

    self.emit('progress', {method: method, uri: uri, numRecords: numRecords});

    responseList.push(response);
    resultList.push(result);

    if (result === null || result === undefined) {
      self.emit('debug::error', {exception: 'No result to specify next page', method: method, uri: uri,
        statusList: statusList, bodyList: bodyList, responseList: responseList, resultList: resultList});
      return callback(new Error('Bad request? No result to specify next page. (Status code: ' + status + ')'));
    }
    nextPage = result.next_page;

    async.whilst(
      function () {
        return numRecords < maxNumRecords && !!nextPage;
      },
      function (cb) {
        __request.apply(self, ['GET', nextPage, function (error, status, body, response, result) {
          if (error) {
            return cb(error);
          }

          statusList.push(status);

          bodyList.push(body);
          numRecords += body.length;

          self.emit('progress', {method: 'GET', uri: nextPage, numRecords: numRecords});

          responseList.push(response);
          resultList.push(result);

          if (result === null || result === undefined) {
            self.emit('debug::error', {exception: 'No result to specify next page', method: method, uri: uri,
              statusList: statusList, bodyList: bodyList, responseList: responseList, resultList: resultList});
            return cb(new Error('Bad request? No result to specify next page. (Status code: ' + status + ')'));
          }
          nextPage = result.next_page;

          cb(null);
        }]);
      },
      function (err) {
        if (err) {
          return callback(err);
        }

        var records = flatten(bodyList);
        if (maxNumRecords !== Infinity) {
          records = records.slice(0, maxNumRecords);
        }
        callback(null, statusList, records, responseList, resultList);
      }
      );
  });
};

Client.prototype.requestUpload = function (uri, file, callback) {
  var self     = this,
      out,
      auth     = this.options.get('password') ? ':' + this.options.get('password') : '/token:' + this.options.get('token'),
      encoded  = new Buffer(this.options.get('username') + auth).toString('base64'),
      useOAuth = this.options.get('oauth'),
      token    = this.options.get('token'),
      uploadOptions = self.options;

  self.options.uri = assembleUrl(self, uri);
  self.options.method = 'POST';

  self.options.headers = {};

  if (useOAuth) {
    self.options.headers.Authorization = 'Bearer ' + token;
  } else {
    self.options.headers.Authorization = 'Basic ' + encoded;
  }

  out = this._request(self.options, function (err, response, result) {
    requestCallback(self, err, response, result, callback);
  });

  fs.createReadStream(file).pipe(out); // pipe the file!

};

function checkRequestResponse(self, response, result, callback) {
  var statusCode, error, retryAfter, res;

  if (!result) { // should this really be an error?
    error = new Error('Zendesk returned an empty result');
    error.statusCode = 204;
    return callback(error);
  }
  try {
    statusCode = response.statusCode;
    res = JSON.parse(result);
  }
  catch (ex) {
     // Emit Errors
    // This result object often goes to loggers, which log an indecipherable JSON stringification of a byte array.
    // If result is a byte array, transform it back to text (which is often an HTML response, hence JSON.parse() error)
    var resultStr;
    if ( result instanceof Buffer) {
      resultStr = String.fromCharCode.apply(null, result);
    }

    self.emit('debug::error', {exception: ex, code: statusCode, request: self.options, result: resultStr || result});
  }

  self.emit('debug::response', {statusCode: statusCode, result: result});

  retryAfter = response.headers['retry-after'];
  if (retryAfter) {
    error = new Error('Zendesk rate limits 200 requests per minute');
    error.statusCode = 429;
    error.result = result;
    error.retryAfter = retryAfter;
    return callback(error);
  }

  if (failCodes[statusCode]) {
    error = new Error('Zendesk Error (' + statusCode + '): ' + failCodes[statusCode]);
    error.statusCode = statusCode;
    error.result = result;
    error.retryAfter = null;
    return callback(error);
  }

  return callback(null, res);
}

function requestCallback(self, err, response, result, callback) {
  if (err) {
    return callback(err);
  }

  checkRequestResponse(self, response, result, function(err, res) {
    if (err) {
      return callback(err);
    }
    var body = null;
    if (res) {
      if (!body && null !== self.jsonAPIName) {
        body = res[(self.jsonAPIName.toString())];
      }
      if (!body && null !== self.jsonAPIName2) {
        body = res[(self.jsonAPIName2.toString())];
      }
      if (!body && null !== self.jsonAPIName3) {
        body = res[(self.jsonAPIName3.toString())];
      }

      if (!body) {
        body = res;
      }
    } else {
      body = '';
    }

    return callback(null, response.statusCode, body, response, res);
  });

}

function assembleUrl(self, uri) {
  var lastElement,
      params = '';

  if ('object' === typeof uri && Array.isArray(uri)) {
    lastElement = uri.pop();
    if (lastElement) {
      // we have received an object ex. {"sort_by":"id","sort_order":"desc"}
      if ('object' === typeof lastElement) {
        params = '?' + qs.stringify(lastElement);
      }
      // we have received a query string ex. '?sort_by=id&sort_order=desc'
      else if (0 === lastElement.toString().indexOf('?')) {
        params = lastElement;
      }
      else {
        uri.push(lastElement);
      }
    }
    return self.options.get('remoteUri') + '/' + uri.join('/') + '.json' + params;
  }
  else if ('string' === typeof uri && uri.indexOf(self.options.get('remoteUri')) === -1) {
    return self.options.get('remoteUri') + uri;
  }
  else {
    return uri;
  }
}
