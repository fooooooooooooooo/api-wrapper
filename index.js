var passport = require('@dadi/passport');
var request = require('request-promise');
var querystring = require('query-string');

var DadiAPI = function (options) {
  this.options = options;
  
  this.options.extractResults = (options.extractResults === true);
  this.options.port = this.options.port || 80;
  this.options.tokenUrl = this.options.tokenUrl || '/token';

  this.passportOptions = {
    issuer: {
      uri: options.uri,
      port: options.port,
      endpoint: options.tokenUrl
    },
    credentials: options.credentials,
    wallet: 'file',
    walletOptions: {
      path: __dirname + '/token.json'
    }
  };
};

/**
 * Add a Mongo query expression to the save query
 *
 * @param {String} field
 * @param {String} operator
 * @param {String} value
 * @return undefined
 * @api private
 */
DadiAPI.prototype._addToQuery = function (field, operator, value) {
  if (this.query === undefined) {
    this.query = {};
  }

  if (this.query[field] === undefined) {
    this.query[field] = {};
  }

  if (value === undefined) {
    this.query[field] = operator;
  } else {
    this.query[field][operator] = value;  
  }
};

/**
 * Build an API URL
 *
 * @param {Object} options
 * @return String
 * @api private
 */
DadiAPI.prototype._buildURL = function (options) {
  options = options || {};

  var url = '';

  url += this.options.uri;
  url += ':' + this.options.port;
  url += '/' + ((this.customVersion !== undefined) ? this.customVersion : this.options.version);
  url += '/' + ((this.customDatabase !== undefined) ? this.customDatabase : this.options.database);
  url += '/' + this.collection;

  if (options.useParams) {
    var params = {};

    if (this.query) {
      params.filter = JSON.stringify(this.query);
    }

    if (this.fields) {
      params.fields = this.fields;
    }

    if (this.limit) {
      params.count = this.limit;
    }

    if (this.page) {
      params.page = this.page;
    }

    if (this.sortField) {
      params.sort = this.sortField;
      params.sortOrder = this.sortOrder;
    }

    if (paramsStr = querystring.stringify(params, {strict: false})) {
      url += '?' + paramsStr;
    }
  }

  if (options.id) {
    url += '/' + options.id;
  }

  return url;
};

/**
 * Return the results array from a response
 *
 * @return Array
 * @api private
 */
DadiAPI.prototype._extractResults = function (response) {
  if (this.extractResults) {
    return response.results;
  }
  
  return response;
};

/**
 * Clear any saved options and parameters
 *
 * @return undefined
 * @api private
 */
DadiAPI.prototype._reset = function () {
  this.params = {};
  this.customVersion = undefined;
  this.customDatabase = undefined;
};

/**
 * Create one or multiple documents
 *
 * @param {Object} documents
 * @return Promise
 * @api public
 */
DadiAPI.prototype.create = function (documents) {
  return passport(this.passportOptions, request).then((function (request) {
    return request({
      body: documents,
      json: true,
      method: 'POST',
      uri: this._buildURL()
    });
  }).bind(this));
};

/**
 * Delete the documents affected by the saved query
 *
 * @return Promise
 * @api public
 */
DadiAPI.prototype.delete = function () {
  var api = this;

  if (this.query === undefined) {
    throw new Error('Unable to find query for delete');
  }

  return passport(this.passportOptions, request).then((function (request) {
    // Getting a list of the affected documents
    return request({
      json: true,
      method: 'GET',
      uri: api._buildURL({
        useParams: true
      })
    }).then(function (response) {
      var deleteRequests = [];

      response.results.forEach(function (document) {
        // Deleting documents
        deleteRequests.push(request({
          json: true,
          method: 'DELETE',
          uri: api._buildURL({
            id: document._id
          })
        }));
      });

      return Promise.all(deleteRequests).then(function () {
        return true;
      });
    });
  }));
};

/**
 * Set whether results array will be return rather than entire response
 *
 * @param {Boolean} value
 * @return Promise
 * @api public
 */
DadiAPI.prototype.extractResults = function (value) {
  this.extractResults = (value !== false);

  return this;
};

/**
 * Get the documents affected by the saved query
 *
 * @return Promise
 * @api public
 */
DadiAPI.prototype.find = function () {
  return this.get();
};

/**
 * Select a collection
 *
 * @param {String} collection
 * @return API
 * @api public
 */
DadiAPI.prototype.in = function (collection) {
  this.collection = collection;

  return this;
};

/**
 * Get response from API
 *
 * @return Promise
 * @api public
 */
DadiAPI.prototype.get = function () {
  return passport(this.passportOptions, request).then((function (request) {
    return request({
      json: true,
      method: 'GET',
      uri: this._buildURL({
        useParams: true
      })
    });
  }).bind(this)).then((function (response) {
    return this._extractResults(response);
  }).bind(this));
};

/**
 * Select a page
 *
 * @param {Number} page
 * @return API
 * @api public
 */
DadiAPI.prototype.goToPage = function (page) {
  this.page = page;

  return this;
};

/**
 * Select a document limit
 *
 * @param {Number} limit
 * @return API
 * @api public
 */
DadiAPI.prototype.limitTo = function (limit) {
  this.limit = limit;

  return this;
};

/**
 * Apply the callback to the documents affected by the saved
 * query and update them
 *
 * @param {Function} callback
 * @return API
 * @api public
 */
DadiAPI.prototype.map = function (callback) {
  if (this.query === undefined) {
    throw new Error('Unable to find query for map');
  }

  if (typeof callback !== 'function') {
    throw new Error('Invalid callback for map');
  }

  var api = this;

  return passport(this.passportOptions, request).then(function (request) {
    // Getting a list of the affected documents
    return request({
      json: true,
      method: 'GET',
      uri: api._buildURL({
        useParams: true
      })
    }).then(function (response) {
      var updateRequests = [];
      var updatedDocuments = [];

      response.results.forEach(function (document) {
        newDocument = callback(document);

        // Updating document
        updateRequests.push(request({
          body: newDocument,
          json: true,
          method: 'PUT',
          uri: api._buildURL({
            id: document._id
          })
        }));
      });

      return Promise.all(updateRequests).then(function () {
        return updatedDocuments;
      });
    });
  });
};

/**
 * Select a field to sort on and the sort direction
 *
 * @param {String} sortField
 * @param {String} sortOrder
 * @return API
 * @api public
 */
DadiAPI.prototype.sortBy = function (sortField, sortOrder) {
  this.sortOrder = (sortOrder === 'desc') ? sortOrder : 'asc';
  this.sortField = sortField;

  return this;
};

/**
 * Update the documents affect by the saved query
 *
 * @param {Object} update
 * @return Promise
 * @api public
 */
DadiAPI.prototype.update = function (update) {
  if (this.query === undefined) {
    throw new Error('Unable to find query for update');
  }

  return passport(this.passportOptions, request).then((function (request) {
    return request({
      body: {
        query: this.query,
        update: update
      },
      json: true,
      method: 'PUT',
      uri: this._buildURL()
    });
  }).bind(this));
};

/**
 * Select the fields to retrieve
 *
 * @param {Array} fields
 * @return API
 * @api public
 */
DadiAPI.prototype.useFields = function (fields) {
  if (fields !== undefined) {
    var fieldsObj = {};

    fields.forEach(function (field) {
      fieldsObj[field] = 1;
    });

    this.fields = JSON.stringify(fieldsObj);  
  }

  return this;
};

/**
 * Set the saved query to a Mongo query expression
 *
 * @param {Object} query
 * @return API
 * @api public
 */
DadiAPI.prototype.where = function (query) {
  this.query = query;

  return this;
};

/**
 * Add a $regex expression to the saved query
 *
 * @param {String} field
 * @param {String} text
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldContains = function (field, text) {
  this._addToQuery(field, '$regex', text);

  return this;
};

/**
 * Add a {$exists: false} expression to the saved query
 *
 * @param {String} field
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldDoesNotExist = function (field) {
  this._addToQuery(field, '$exists', false);

  return this;
};

/**
 * Add a {$exists: true} expression to the saved query
 *
 * @param {String} field
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldExists = function (field) {
  this._addToQuery(field, '$exists', true);

  return this;
};

/**
 * Add an exact match expression to the saved query
 *
 * @param {String} field
 * @param {String} value
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsEqualTo = function (field, value) {
  this._addToQuery(field, value);

  return this;
};

/**
 * Add a $gt expression to the saved query
 *
 * @param {String} field
 * @param {Number} value
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsGreaterThan = function (field, value) {
  this._addToQuery(field, '$gt', value);

  return this;
};

/**
 * Add a $gte expression to the saved query
 *
 * @param {String} field
 * @param {Number} value
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsGreaterThanOrEqualTo = function (field, value) {
  this._addToQuery(field, '$gte', value);

  return this;
};

/**
 * Add a $lt expression to the saved query
 *
 * @param {String} field
 * @param {Number} value
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsLessThan = function (field, value) {
  this._addToQuery(field, '$lt', value);

  return this;
};

/**
 * Add a $lte expression to the saved query
 *
 * @param {String} field
 * @param {Number} value
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsLessThanOrEqualTo = function (field, value) {
  this._addToQuery(field, '$lte', value);

  return this;
};

/**
 * Add a $nin expression to the saved query
 *
 * @param {String} field
 * @param {Array} matches
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsNotOneOf = function (field, matches) {
  this._addToQuery(field, '$nin', matches);

  return this;
};

/**
 * Add a $in expression to the saved query
 *
 * @param {String} field
 * @param {Array} matches
 * @return API
 * @api public
 */
DadiAPI.prototype.whereFieldIsOneOf = function (field, matches) {
  this._addToQuery(field, '$in', matches);

  return this;
};

/**
 * Select the database to be used
 *
 * @param {String} database
 * @return API
 * @api public
 */
DadiAPI.prototype.withDatabase = function (database) {
  this.customDatabase = database;

  return this;
};

/**
 * Select the version to be used
 *
 * @param {String} version
 * @return API
 * @api public
 */
DadiAPI.prototype.withVersion = function (version) {
  this.customVersion = version;

  return this;
};

module.exports = DadiAPI;