//Search.js: Client for the zendesk API.


var util        = require('util'),
    Client      = require('./client').Client,
    defaultgroups = require('./helpers').defaultgroups;


var Search = exports.Search = function (options) {
  this.jsonAPIName = 'results';
  Client.call(this, options);
};

// Inherit from Client base object
util.inherits(Search, Client);

// ######################################################## Search
// ====================================== Listing Search

/**
 * Run a zendesk query
 * @param {string} searchTerm
 * @param {number} [numberRecords] Optional. Num records to retrieve. If not specified, returns first page
 * @param {function()} cb
 */
Search.prototype.query = function (searchTerm, numberRecords, cb) {
  if (arguments.length === 3) {
    this.requestN('GET', ['search', {query: searchTerm}], numberRecords, cb); // Get N records
  } else {
    this.request('GET', ['search', {query: searchTerm}], numberRecords); // Get the first page (cb is numberRecords)
  }
};

Search.prototype.queryAll = function (searchTerm, cb) {
  this.requestAll('GET', ['search', {query: searchTerm}], cb);//all?
};

Search.prototype.queryAnonymous  = function (searchTerm, cb) {
  this.request('GET', ['portal', 'search', {query: searchTerm}], cb);
};


Search.prototype.queryAnonymousAll  = function (searchTerm, cb) {
  this.requestAll('GET', ['portal', 'search', {query: searchTerm}], cb);//all?
};

