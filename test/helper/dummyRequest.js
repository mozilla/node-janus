'use strict';

var DummyRequest = function(url) {
  this.headers = { path: url };
  this.url = url;
};

DummyRequest.prototype.log = function() {};

module.exports = DummyRequest;
