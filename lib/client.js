// client.js - node-zendesk client initialization
'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var parts = [
      'Users', 'Tickets', 'TicketAudits', 'TicketFields', 'TicketMetrics', 'TicketImport', 'TicketExport',
      'Views', 'Requests', 'UserIdentities', 'Groups', 'GroupMemberships',
      'CustomAgentRoles', 'Organizations', 'Search', 'Tags', 'Forums',
      'ForumSubscriptions', 'Categories', 'Topics', 'TopicComments',
      'TopicSubscriptions', 'TopicVotes', 'AccountSettings',
      'ActivityStream', 'Attachments', 'JobStatuses', 'Locales',
      'Macros', 'SatisfactionRatings', 'SuspendedTickets', 'UserFields',
      'OrganizationFields', 'OauthTokens', 'Triggers', 'SharingAgreement',
      'Brand', 'OrganizationMemberships', 'DynamicContent'
    ],
    helpcenterParts = [
      'Articles', 'Sections', 'Categories', 'Translations',
      'ArticleComments', 'ArticleLabels', 'ArticleAttachments',
      'Votes', 'Search', 'AccessPolicies'
    ],
    voiceParts = [
      'PhoneNumbers', 'GreetingCategories', 'Greetings', 'CurrentQueueActivity',
      'HistoricalQueueActivity', 'AgentActivity', 'Availabilities'
    ];


var Client = function() {};
util.inherits(Client, EventEmitter);


exports.createClient = function (options) {
  var nconf = require('nconf'),
      store = new nconf.Provider();
  nconf.use('memory');
  if (true !== options.disableGlobalState) {
    nconf.env().argv({
      's': {
        alias: 'subdomain'
      },
      'u': {
        alias: 'username'
      },
      'p': {
        alias: 'password'
      },
      't': {
        alias: 'token'
      },
      'r': {
        alias: 'remoteUri'
      },
      'hc': {
        alias: 'helpcenter'
      },
      'v': {
        alias: 'voice'
      }
    });
  }

  options = store.defaults(options);

  if (nconf.get('subdomain')) {
    var endpoint;
    if (options.stores.defaults.store.helpcenter) {
      endpoint = '.zendesk.com/api/v2/help_center';
    } else if (options.stores.defaults.store.voice){
      endpoint = '.zendesk.com/api/v2/channels/voice';
    } else {
      endpoint = '.zendesk.com/api/v2';
    }
    options.stores.defaults.store.remoteUri = 'https://' + nconf.get('subdomain') + endpoint;
  }

  var client = new Client(), partsToAdd, clientPath;

  if (options.stores.defaults.store.helpcenter) {
    partsToAdd = helpcenterParts;
    clientPath = './client/helpcenter/';
  } else if (options.stores.defaults.store.voice) {
    partsToAdd = voiceParts;
    clientPath = './client/voice/';
  } else {
    partsToAdd = parts;
    clientPath = './client/';
  }


  partsToAdd.forEach(function (k) {
    exports[k] = require(clientPath + k.toLowerCase())[k];
  });

  partsToAdd.forEach(function (k) {
    client[k.toLowerCase()] = new exports[k](options);
    client[k.toLowerCase()].on('debug::request',  debug);
    client[k.toLowerCase()].on('debug::response', debug);

    client[k.toLowerCase()].on('error', function(err, meta) {
      var e = new Error('node-zendesk error: ' + err.message);
      e.prevError = err;
      client.emit('error', e, meta);
    });

    // About to make a request
    client[k.toLowerCase()].on('debug::request', function(requestOptions) {
      client.emit('debug::request', requestOptions);
    });

    // Progress of a requestAll() endpoint.
    // Like debug::request, contains request params, but also contains the total number of records retrieved
    client[k.toLowerCase()].on('progress', function(requestOptions) {
      client.emit('progress', requestOptions);
    });

  });

  function debug(args) {
    if (options.get('debug')) {
      console.log(args);
    }
  }

  // Attach a default error handler to client EventEmitter so lib doesn't crash if user doesn't attach one
  client.on('error', debug);

  return client;
};
