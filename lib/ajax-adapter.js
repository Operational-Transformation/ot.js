/*global ot, $ */

ot.AjaxAdapter = (function () {

  function AjaxAdapter (path, revision) {
    if (path[path.length - 1] !== '/') { path += '/'; }
    this.path = path;
    this.revision = revision;
    this.poll();
  }

  AjaxAdapter.prototype.poll = function () {
    var self = this;
    this.xhr = $.ajax({
      url: this.path + 'revision/' + this.revision,
      type: 'GET',
      dataType: 'json',
      success: function (data) {
        var operations = data.operations;
        for (var i = 0; i < operations.length; i++) {
          self.trigger('operation', operations[i]);
        }
        self.revision += operations.length;
        self.poll();
      },
      error: function (xhr, reason) {
        if (reason !== 'abort') {
          setTimeout(function () { self.poll(); }, 500);
        }
      }
    });
  };

  AjaxAdapter.prototype.sendOperation = function (revision, operation, cursor) {
    if (this.xhr) { this.xhr.abort(); }
    if (revision !== this.revision) { throw new Error("Revision numbers out of sync"); }
    var self = this;
    this.xhr = $.ajax({
      url: this.path + 'revision/' + revision,
      type: 'POST',
      data: JSON.stringify({ operation: operation, cursor: cursor }),
      contentType: 'application/json',
      processData: false,
      success: function (data) {
        var operations = data.operations;
        for (var i = 0; i < operations.length - 1; i++) {
          self.trigger('operation', operations[i]);
        }
        self.revision += operations.length;
        self.trigger('ack');
        self.poll();
      },
      error: function (xhr, status) {
        //if (reason !== '_cancelled') {}
        setTimeout(function () { self.sendOperation(revision, operation, cursor); }, 500);
      }
    });
  };

  AjaxAdapter.prototype.sendCursor = function (obj) {
    $.ajax({
      url: this.path + 'cursor',
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

/*
class NeopreneAdapter
  constructor: (@renderUrl, @revision) ->
    _.bindAll(@)
    @operationToSend = null
    @listen()

  ajax: (options) ->
    @xhr?.abort()
    dfltOptions =
      url: @renderUrl(@revision)
      accept: 'json'
      dataType: 'json'
    @xhr = $.ajax _.extend dfltOptions, options

  listen: ->
    @ajax
      type: 'GET'
      success: (data) =>
        @parseOperations(data)
        @listen()
      error: (jqXhr, reason) =>
        return if reason is 'abort'
        @retry @listen

  retry: (fn) -> setTimeout fn, 500

  sendOperation: (revision, obj) ->
    if @revision != revision
      throw new Error("Revision numbers out of sync.")
    @ajax
      type: 'POST'
      contentType: 'application/json'
      data: JSON.stringify(obj.operation)
      success: (operations) =>
        @parseOperations(_.initial(operations))
        @revision += 1
        @trigger 'ack'
        @listen()
      error: (jqXhr, reason) =>
        @retry =>
          @sendOperation(revision, obj)

  parseOperations: (operations) ->
    @revision += operations.length

    for operation in operations
      @trigger 'operation',
        meta:
          clientId: 'lorem'
          cursor:
            position: 0
            selectionEnd: 0
        operation: operation
*/