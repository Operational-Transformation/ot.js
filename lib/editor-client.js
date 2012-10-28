/*global ot */

ot.EditorClient = (function () {
  var Client = ot.Client;
  var Cursor = ot.Cursor;
  var UndoManager = ot.UndoManager;
  var TextOperation = ot.TextOperation;
  var WrappedOperation = ot.WrappedOperation;


  function SelfMeta (cursorBefore, cursorAfter) {
    this.cursorBefore = cursorBefore;
    this.cursorAfter  = cursorAfter;
  }

  SelfMeta.prototype.invert = function () {
    return new SelfMeta(this.cursorAfter, this.cursorBefore);
  };

  SelfMeta.prototype.compose = function (other) {
    return new SelfMeta(this.cursorBefore, other.cursorAfter);
  };

  SelfMeta.prototype.transform = function (operation) {
    return new SelfMeta(
      this.cursorBefore.transform(operation),
      this.cursorAfter.transform(operation)
    );
  };


  function OtherMeta (clientId, cursor) {
    this.clientId = clientId;
    this.cursor   = cursor;
  }

  OtherMeta.fromJSON = function (obj) {
    return new OtherMeta(obj.clientId, Cursor.fromJSON(obj.cursor));
  };

  OtherMeta.prototype.transform = function (operation) {
    return new OtherMeta(this.clientId, this.cursor.transform(operation));
  };


  function OtherClient (id, listEl, editorAdapter, name, cursor) {
    this.id = id;
    this.listEl = listEl;
    this.editorAdapter = editorAdapter;
    this.name = name;

    this.li = document.createElement('li');
    if (name) {
      this.li.textContent = name;
      this.listEl.appendChild(this.li);
    }

    if (cursor) { this.updateCursor(cursor); }
    this.setColor(name ? hueFromName(name) : Math.random());
  }

  OtherClient.prototype.setColor = function (hue) {
    this.hue = hue;
    this.color = hsl2hex(hue, 0.75, 0.5);
    this.lightColor = hsl2hex(hue, 0.5, 0.9);
    if (this.li) { this.li.style.color = this.color; }
  };

  OtherClient.prototype.setName = function (name) {
    this.name = name;

    this.li.textContent = name;
    if (!this.li.parentNode) {
      this.listEl.appendChild(this.li);
    }

    this.setColor(hueFromName(name));
  };

  OtherClient.prototype.updateCursor = function (cursor) {
    this.cursor = cursor;
    if (this.mark) { this.mark.clear(); }
    this.mark = this.editorAdapter.setOtherCursor(
      cursor,
      cursor.position === cursor.selectionEnd ? this.color : this.lightColor
    );
  };

  OtherClient.prototype.remove = function () {
    if (this.li) { removeElement(this.li); }
    if (this.mark) { this.mark.clear(); }
  };


  function EditorClient (revision, clients, serverAdapter, editorAdapter) {
    Client.call(this, revision);
    this.serverAdapter = serverAdapter;
    this.editorAdapter = editorAdapter;
    this.undoManager = new UndoManager();

    this.initializeClientList();
    this.initializeClients(clients);

    var self = this;

    this.editorAdapter.registerCallbacks({
      change: function (oldValue, operation) { self.onChange(oldValue, operation); },
      cursorActivity: function () { self.onCursorActivity(); }
    });
    this.editorAdapter.registerUndo(function () { self.undo(); });
    this.editorAdapter.registerRedo(function () { self.redo(); });

    this.serverAdapter.registerCallbacks({
      client_left: function (clientId) { self.onClientLeft(clientId); },
      set_name: function (clientId, name) { self.getClientObject(clientId).setName(name); },
      ack: function () { self.serverAck(); },
      operation: function (obj) {
        self.applyServer(new WrappedOperation(
          TextOperation.fromJSON(obj.operation),
          OtherMeta.fromJSON(obj.meta)
        ));
      },
      cursor: function (clientId, cursor) {
        self.getClientObject(clientId).updateCursor(Cursor.fromJSON(cursor));
      }
    });
  }

  inherit(EditorClient, Client);

  EditorClient.prototype.initializeClients = function (clients) {
    this.clients = {};
    for (var clientId in clients) {
      if (clients.hasOwnProperty(clientId)) {
        var client = clients[clientId];
        client.clientId = clientId;
        this.clients[clientId] = new OtherClient(
          client.clientId,
          this.clientListEl,
          this.editorAdapter,
          client.name,
          client.cursor ? Cursor.fromJSON(client.cursor) : null
        );
      }
    }
  };

  EditorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    return this.clients[clientId] = new OtherClient(
      clientId,
      this.clientListEl,
      this.editorAdapter
    );
  };

  EditorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    client.remove();
    delete this.clients[clientId];
  };

  EditorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
  };

  EditorClient.prototype.applyUnredo = function (operation) {
    this.undoManager.add(operation.invert(this.editorAdapter.getValue()));
    this.editorAdapter.applyOperation(operation.wrapped);
    this.cursor = operation.meta.cursorAfter;
    this.editorAdapter.setCursor(this.cursor);
    this.applyClient(operation);
  };

  EditorClient.prototype.undo = function () {
    var self = this;
    this.undoManager.performUndo(function (o) { self.applyUnredo(o); });
  };

  EditorClient.prototype.redo = function () {
    var self = this;
    this.undoManager.performRedo(function (o) { self.applyUnredo(o); });
  };

  EditorClient.prototype.onChange = function (oldValue, textOperation) {
    var cursorBefore = this.cursor;
    this.updateCursor();
    var meta = new SelfMeta(cursorBefore, this.cursor);
    var operation = new WrappedOperation(textOperation, meta);
    var compose = this.undoManager.undoStack.length > 0 &&
      !this.undoManager.dontCompose &&
      last(this.undoManager.undoStack).wrapped
        .invert(oldValue)
        .shouldBeComposedWith(textOperation);
    this.undoManager.add(operation.invert(oldValue), compose);
    this.applyClient(operation);
  };

  EditorClient.prototype.updateCursor = function () {
    this.cursor = this.editorAdapter.getCursor();
  };

  EditorClient.prototype.onCursorActivity = function () {
    var oldCursor = this.cursor;
    this.updateCursor();
    if (oldCursor && this.cursor.equals(oldCursor)) { return; }

    if (this.state instanceof Client.AwaitingWithBuffer) {
      this.state.buffer.meta.cursorAfter = this.cursor;
    } else {
      var self = this;
      this.serverAdapter.sendCursor(this.cursor);
    }
  };

  EditorClient.prototype.sendOperation = function (revision, operation) {
    this.serverAdapter.sendOperation(revision, {
      meta: { cursor: operation.meta.cursorAfter },
      operation: operation.wrapped.toJSON()
    });
  };

  EditorClient.prototype.applyOperation = function (operation) {
    this.editorAdapter.applyOperation(operation.wrapped);
    this.updateCursor();
    var client = this.getClientObject(operation.meta.clientId);
    client.updateCursor(operation.meta.cursor);
    this.undoManager.transform(operation);
  };

  function rgb2hex (r, g, b) {
    function digits (n) {
      var m = Math.round(255*n).toString(16);
      return m.length === 1 ? '0'+m : m;
    }
    return '#' + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex (h, s, l) {
    if (s === 0) { return rgb2hex(l, l, l); }
    var var2 = l < 0.5 ? l * (1+s) : (l+s) - (s*l);
    var var1 = 2 * l - var2;
    var hue2rgb = function (hue) {
      if (hue < 0) { hue += 1; }
      if (hue > 1) { hue -= 1; }
      if (6*hue < 1) { return var1 + (var2-var1)*6*hue; }
      if (2*hue < 1) { return var2; }
      if (3*hue < 2) { return var1 + (var2-var1)*6*(2/3 - hue); }
      return var1;
    };
    return rgb2hex(hue2rgb(h+1/3), hue2rgb(h), hue2rgb(h-1/3));
  }

  function hueFromName (name) {
    var a = 1;
    for (var i = 0; i < name.length; i++) {
      a = 17 * (a+name.charCodeAt(i)) % 360;
    }
    return a/360;
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function last (arr) { return arr[arr.length - 1]; }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  return EditorClient;
}());
