//Views.js: Client for the zendesk API.


var util        = require('util'),
    Client      = require('./client').Client,
    defaultUser = require('./helpers').defaultUser;


var Views = exports.Views = function (options) {
  this.jsonAPIName = 'views';
  this.jsonAPIName2 = 'view';
  this.jsonAPIName3 = 'tickets'; //Used to retrieve tickets array from GET /api/v2/views/{id}/tickets.json response 
  Client.call(this, options);
};

// Inherit from Client base object
util.inherits(Views, Client);

// ######################################################## Views
// ====================================== Listing Views

/**
 * List views
 * @param {number} [numberRecords] Optional. Default is get all
 * @param {function()} cb
 */
Views.prototype.list = function (numberRecords, cb) {
  if (arguments.length === 2) {
    this.requestN('GET', ['tickets'], numberRecords, cb); // Get N records
  } else {;
    this.requestAll('GET', ['tickets'], numberRecords);// all
  }
};

// ====================================== Listing Active Views
Views.prototype.listActive = function (cb) {
  this.requestAll('GET', ['views', 'active'], cb);//all
};

// GET /api/v2/views/compact.json
// A compacted list of shared and personal views available to the current user
Views.prototype.listCompact = function (cb) {
  this.requestAll('GET', ['views', 'compact'], cb);//all
};

// ====================================== Viewing Views
Views.prototype.show = function (viewID, cb) {
  this.request('GET', ['views', viewID], cb);
};

// Create View
// POST /api/v2/views.json
Views.prototype.create = function (view, cb) {
  this.request('POST', ['views'], view, cb);
};

// Update View
// PUT /api/v2/views/{id}.json
Views.prototype.update = function (viewID, cb) {
  this.request('PUT', ['views', viewID], cb);
};

// Executing Views
// GET /api/v2/views/{id}/execute.json
// :params can be http://developer.zendesk.com/documentation/rest_api/views.html#previewing-views
Views.prototype.execute = function (viewID, params, cb) {
  this.requestAll('GET', ['views', viewID, 'execute', params], cb);
};

// Getting Tickets from a view
// GET /api/v2/views/{id}/tickets.json
Views.prototype.tickets = function (viewID, numberRecords, cb) {
  if (arguments.length === 3) {
    this.requestN('GET', ['views', viewID, 'tickets'], numberRecords, cb); // Get N records
  } else {
    this.requestAll('GET', ['views', viewID, 'tickets'], numberRecords);
  }
};

// Previewing Views
// POST /api/v2/views/preview.json
// :params can be http://developer.zendesk.com/documentation/rest_api/views.html#previewing-views
Views.prototype.preview = function (params, cb) {
  this.requestAll('POST', ['views', 'preview'], params, cb);
};

Views.prototype.showCount = function (viewID, cb) {
  this.request('GET', ['views', viewID, 'count'], cb);
};

Views.prototype.showCounts = function (viewIDs, cb) {
  this.request('GET', ['views', 'count_many', {ids: viewIDs}], cb);
};

// Exporting Views
// GET /api/v2/views/{id}/export.json
Views.prototype.export = function (viewID, cb) {
  this.request('GET', ['views', viewID, 'export'], cb);
};
