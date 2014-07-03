'use strict';

var events = require('events');
var util = require('util');

// Event emitter with some context.
var Emitter = function(name) {
  this.prefix = name;
  events.EventEmitter.call(this);
};

util.inherits(Emitter, events.EventEmitter);

// Signals an event for given type and optional value.
Emitter.prototype.signal = function(type, value, arg) {
  var msg = this.prefix;
  if (value) {
    msg += '.' + value;
  }
  this.emit(type, msg, arg);
};

// Emitter index and factory.
var Index = function() {
  this.emitters = {};
};

util.inherits(Index, events.EventEmitter);

// Creates a new emitter for given name.
Index.prototype.create = function(name) {
  var emitter = (this.emitters[name] = new Emitter(name));
  this.emit('create', name);
  return emitter;
};

// Returns a valid emitter for given name. Reuses previously created emitters.
Index.prototype.get = function(name) {
  return this.emitters[name] || this.create(name);
};

// Ad-hoc signaling for given emitter name, event type and optional value.
Index.prototype.signal = function(name, type, value) {
  this.get(name).signal(type, value);
};

module.exports = new Index();
