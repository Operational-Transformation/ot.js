/*global ot, $ */

ot.AjaxAdapter = (function () {
  'use strict';

  function AjaxAdapter (path, ownUserName, revision) {
    if (path[path.length - 1] !== '/') { path += '/'; }
    this.path = path;
    this.ownUserName = ownUserName;
    this.majorRevision = revision.major || 0;
    this.minorRevision = revision.minor || 0;
    this.poll();
  }

  AjaxAdapter.prototype.renderRevisionPath = function () {
    return 'revision/' + this.majorRevision + '-' + this.minorRevision;
  };

  AjaxAdapter.prototype.handleResponse = function (data) {
    var i;
    var operations = data.operations;
    for (i = 0; i < operations.length; i++) {
      if (operations[i].user === this.ownUserName) {
        this.trigger('ack');
      } else {
        this.trigger('operation', operations[i].operation);
      }
    }
    if (operations.length > 0) {
      this.majorRevision += operations.length;
      this.minorRevision = 0;
    }

    var events = data.events;
    if (events) {
      for (i = 0; i < events.length; i++) {
        var user = events[i].user;
        if (user === this.ownUserName) { continue; }
        switch (events[i].event) {
          case 'joined': this.trigger('set_name', user, user); break;
          case 'left':   this.trigger('client_left', user); break;
          case 'cursor': this.trigger('cursor', user, events[i].cursor); break;
        }
      }
      this.minorRevision += events.length;
    }

    var users = data.users;
    if (users) {
      delete users[this.ownUserName];
      this.trigger('clients', users);
    }

    if (data.revision) {
      this.majorRevision = data.revision.major;
      this.minorRevision = data.revision.minor;
    }
  };

  AjaxAdapter.prototype.poll = function () {
    var self = this;
    $.ajax({
      url: this.path + this.renderRevisionPath(),
      type: 'GET',
      dataType: 'json',
      timeout: 5000,
      success: function (data) {
        self.handleResponse(data);
        self.poll();
      },
      error: function () {
        setTimeout(function () { self.poll(); }, 500);
      }
    });
  };

  AjaxAdapter.prototype.sendOperation = function (revision, operation, cursor) {
    if (revision !== this.majorRevision) { throw new Error("Revision numbers out of sync"); }
    var self = this;
    $.ajax({
      url: this.path + this.renderRevisionPath(),
      type: 'POST',
      data: JSON.stringify({ operation: operation, cursor: cursor }),
      contentType: 'application/json',
      processData: false,
      success: function (data) {},
      error: function () {
        setTimeout(function () { self.sendOperation(revision, operation, cursor); }, 500);
      }
    });
  };

  AjaxAdapter.prototype.sendCursor = function (obj) {
    $.ajax({
      url: this.path + this.renderRevisionPath() + '/cursor',
      type: 'POST',
      data: JSON.stringify(obj),
      contentType: 'application/json',
      processData: false,
      timeout: 1000
    });
  };

  AjaxAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  AjaxAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  return AjaxAdapter;

})();